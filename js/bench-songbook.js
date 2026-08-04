// bench-songbook.js — how the tunes list behaves as the songbook grows.
//
// Compares the app's current approach (a DOM node per song, every keystroke
// walking all of them) against rendering only the rows on screen. Same data,
// same markup, same page — so the difference is the approach, not the machine.

import { SONGS as REAL } from "./songs.js";

const $ = (s) => document.querySelector(s);
const PAGE_SIZE = 10;
const SIZES = [23, 100, 500, 1000, 1460];

// ---------------------------------------------------------------- test data

const KEYS = ["C", "F", "Bb", "Eb", "Ab", "Db", "G", "D", "A", "E", "B minor", "G minor", "D minor"];
const STYLES = ["swing", "bossa", "latin", "funk", "ballad", "blues", "modal"];
const WORDS = ["Autumn", "Blue", "Night", "Moon", "Love", "Sweet", "Round", "Lady", "Green", "Stella", "Body", "Misty", "Days", "Wine", "Solar", "Bye"];

function makeSongs(n) {
  return Array.from({ length: n }, (_, i) => {
    const model = REAL[i % REAL.length];
    return {
      title: `${WORDS[i % WORDS.length]} ${WORDS[(i * 7 + 3) % WORDS.length]} ${i}`,
      composer: `Composer ${i % 400}`,
      key: KEYS[i % KEYS.length],
      bpm: 90 + (i % 12) * 10,
      style: STYLES[i % STYLES.length],
      progression: model.progression,
    };
  });
}

// ---------------------------------------------------- the two approaches

const rowHtml = (song, i) =>
  `<button class="track" data-i="${i}">
    <span class="track-num">${String(i + 1).padStart(2, "0")}</span>
    <span class="track-title">${song.title}</span>
    <span class="track-meta">${song.key} · ${song.bpm} bpm · ${song.style}</span>
  </button>`;

// What the app does today: every song becomes a node up front, and filtering
// toggles `hidden` on all of them.
const renderAll = {
  name: "render all",
  build(ol, songs) {
    ol.innerHTML = "";
    songs.forEach((song, i) => {
      const li = document.createElement("li");
      li.innerHTML = rowHtml(song, i);
      ol.appendChild(li);
    });
  },
  update(ol, songs, query, page) {
    const q = query.trim().toLowerCase();
    let shown = 0;
    ol.querySelectorAll("li").forEach((li, i) => {
      const s = songs[i];
      const hit = q
        ? `${s.title} ${s.composer} ${s.key} ${s.style}`.toLowerCase().includes(q)
        : Math.floor(i / PAGE_SIZE) === page;
      li.hidden = !hit;
      if (hit) shown++;
    });
    return shown;
  },
};

// Only what is on screen exists. Filtering is a data operation; the DOM is
// rebuilt from the (small) result slice.
const windowed = {
  name: "windowed",
  build(ol, songs) {
    this.update(ol, songs, "", 0);
  },
  update(ol, songs, query, page) {
    const q = query.trim().toLowerCase();
    let visible;
    if (q) {
      visible = [];
      for (let i = 0; i < songs.length && visible.length < PAGE_SIZE * 3; i++) {
        const s = songs[i];
        if (`${s.title} ${s.composer} ${s.key} ${s.style}`.toLowerCase().includes(q)) visible.push([s, i]);
      }
    } else {
      visible = songs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((s, j) => [s, page * PAGE_SIZE + j]);
    }
    ol.innerHTML = visible.map(([s, i]) => `<li>${rowHtml(s, i)}</li>`).join("");
    return visible.length;
  },
};

// ---------------------------------------------------------------- timing

/** Median of `runs` timings, with layout forced so the browser can't defer. */
function timeIt(runs, fn) {
  const times = [];
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    fn(r);
    void document.body.offsetHeight; // force layout/style so the cost is real
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1];
}

const QUERIES = ["b", "bl", "blu", "blue", "blue ", "blue m", "blue mo", "blue moo"];

async function runOne(approach, songs, ol) {
  const build = timeIt(3, () => approach.build(ol, songs));
  approach.build(ol, songs);
  const one = timeIt(9, (r) => approach.update(ol, songs, QUERIES[r % QUERIES.length], 0));
  const twenty = timeIt(3, () => {
    for (let k = 0; k < 20; k++) approach.update(ol, songs, QUERIES[k % QUERIES.length], 0);
  });
  const page = timeIt(9, (r) => approach.update(ol, songs, "", r % Math.max(1, Math.ceil(songs.length / PAGE_SIZE))));
  approach.update(ol, songs, "", 0);
  const nodes = ol.querySelectorAll("*").length;
  return { build, one, twenty, page, nodes };
}

const fmt = (ms) => (ms < 1 ? ms.toFixed(2) : ms.toFixed(1)) + " ms";

async function run() {
  $("#run").disabled = true;
  $("#results").querySelector("tbody").innerHTML = "";
  $("#verdict").textContent = "";
  const ol = $("#tracklist");
  const worst = {};

  for (const n of SIZES) {
    const songs = makeSongs(n);
    for (const approach of [renderAll, windowed]) {
      $("#status").textContent = `${approach.name} · ${n} songs…`;
      await new Promise((r) => setTimeout(r, 20)); // let the status paint
      const r = await runOne(approach, songs, ol);
      if (approach === renderAll && n === 1460) worst.all = r;
      if (approach === windowed && n === 1460) worst.win = r;
      const tr = document.createElement("tr");
      tr.className = approach === renderAll ? "render-all" : "windowed";
      tr.innerHTML = `<td class="label">${approach.name}</td><td>${n}</td>
        <td>${fmt(r.build)}</td><td>${fmt(r.one)}</td><td>${fmt(r.twenty)}</td>
        <td>${fmt(r.page)}</td><td>${r.nodes.toLocaleString()}</td>`;
      $("#results").querySelector("tbody").appendChild(tr);
    }
  }

  $("#status").textContent = "";
  $("#run").disabled = false;
  if (worst.all && worst.win) {
    const x = (a, b) => (b > 0 ? (a / b).toFixed(0) : "—");
    $("#verdict").innerHTML =
      `At 1460 songs, rendering every row costs <strong>${fmt(worst.all.build)}</strong> to build the list and
       <strong>${fmt(worst.all.one)}</strong> per keystroke, holding ${worst.all.nodes.toLocaleString()} DOM nodes.
       Windowing costs <strong>${fmt(worst.win.build)}</strong> and <strong>${fmt(worst.win.one)}</strong>,
       holding ${worst.win.nodes.toLocaleString()} — about
       <strong>${x(worst.all.build, worst.win.build)}× faster to build</strong> and
       <strong>${x(worst.all.one, worst.win.one)}× faster per keystroke</strong>.
       Windowed cost is flat as the songbook grows; render-all is linear in it.`;
  }
}

$("#run").addEventListener("click", run);
$("#clear").addEventListener("click", () => {
  $("#results").querySelector("tbody").innerHTML = "";
  $("#tracklist").innerHTML = "";
  $("#verdict").textContent = "";
});
