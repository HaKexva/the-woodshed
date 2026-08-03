// main.js — UI wiring: song list, transport, session mode, inspire mode.

import { SONGS } from "./songs.js";
import { Band } from "./band.js";
import { parseChord, parseWarnings, soloScale, flatName } from "./theory.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  mode: "session", // session | inspire
  songIndex: 0,
  customSong: null, // song loaded from the editor instead of the songbook
  playing: false,
  loading: false,
  ready: false,
};

const band = new Band({
  onChord: handleChord,
  onBeat: handleBeat,
  onSoloNote: handleSoloNote,
  onProgress: (n, total) => setStatus(`loading instruments… ${n}/${total}`),
  onReady: () => {
    state.ready = true;
    setStatus("");
  },
});

// ------------------------------------------------------------------ tracklist

function renderTracklist() {
  const ol = $("#tracklist");
  ol.innerHTML = "";
  SONGS.forEach((song, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button class="track" data-i="${i}">
        <span class="track-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="track-title">${song.title}</span>
        <span class="track-meta">${song.key} · ${song.bpm} bpm · ${song.style}</span>
      </button>`;
    ol.appendChild(li);
  });
  ol.addEventListener("click", (e) => {
    const btn = e.target.closest(".track");
    if (btn) selectSong(Number(btn.dataset.i));
  });
}

function selectSong(i) {
  const wasPlaying = state.playing;
  if (wasPlaying) stop();
  state.songIndex = i;
  state.customSong = null;
  $$(".track").forEach((el, j) => el.classList.toggle("active", j === i));
  const song = SONGS[i];
  $("#song-title").textContent = song.title;
  $("#song-detail").textContent = `${song.composer} — ${song.key} · ${song.form} · ${song.style}`;
  $("#tempo").value = song.bpm;
  $("#tempo-val").textContent = song.bpm;
  band.bpmOverride = null;
  band.loadSong(song);
  renderLeadsheet(song);
  renderSources(song);
  resetChordDisplay();
  if (wasPlaying) play();
}

function renderSources(song) {
  const box = $("#song-source");
  box.innerHTML = (song.source ?? [])
    .map((url) => `<a href="${url}" target="_blank" rel="noopener">${new URL(url).hostname.replace(/^www\./, "")}</a>`)
    .join(" · ");
  $("#song-source-line").hidden = !song.source?.length;
  $("#song-note").textContent = song.note ?? "";
  $("#song-note").hidden = !song.note;
}

// ------------------------------------------------------------------ leadsheet

function renderLeadsheet(song) {
  const grid = $("#leadsheet");
  grid.innerHTML = "";
  song.progression.forEach((bar, i) => {
    const cell = document.createElement("div");
    cell.className = "bar";
    cell.dataset.bar = i;
    cell.innerHTML = bar
      .map((c) => `<span class="bar-chord" data-beat="${c.beats}">${c.chord}</span>`)
      .join("");
    grid.appendChild(cell);
  });
}

function highlightBar(barIdx) {
  $$(".bar").forEach((el) => el.classList.toggle("current", Number(el.dataset.bar) === barIdx));
}

function resetChordDisplay() {
  $("#chord-now").textContent = "—";
  $("#chord-next").textContent = "";
  $("#solo-strip").hidden = true;
  highlightBar(-1);
}

function renderSoloStrip(info) {
  const { label, notes, pcs } = soloScale(info);
  $("#solo-scale").textContent = label;
  $("#solo-notes").innerHTML = notes
    .map((n, i) => `<span class="solo-note${i === 0 || i === notes.length - 1 ? " root" : ""}" data-pc="${pcs[i]}">${n}</span>`)
    .join("");
  $("#solo-strip").hidden = false;
}

// rolling feed of solo notes, grouped by bar — previous bar + the ongoing one
const soloFeed = [];
const FEED_BARS = 4;

function renderSoloFeed() {
  $("#solo-feed").innerHTML =
    `<span class="feed-label">played</span>` +
    soloFeed
      .map((bar) => `<span class="feed-bar">${bar.join(" ")}</span>`)
      .join(`<span class="feed-sep">|</span>`);
}

function clearSoloFeed() {
  soloFeed.length = 0;
  renderSoloFeed();
}

function handleSoloNote(pc) {
  if (state.mode !== "inspire") return;
  if (!soloFeed.length) soloFeed.push([]);
  soloFeed[soloFeed.length - 1].push(flatName(pc));
  renderSoloFeed();
}

// ------------------------------------------------------------------ transport

async function play() {
  if (state.loading) return;
  if (!state.ready) {
    state.loading = true;
    setStatus("loading instruments…");
    try {
      await band.setup();
    } finally {
      state.loading = false;
    }
  }
  await band.play();
  state.playing = true;
  document.body.classList.add("playing");
  $("#play").classList.add("on");
  $("#play-label").textContent = "stop";
}

function stop() {
  band.stop();
  state.playing = false;
  document.body.classList.remove("playing");
  $("#play").classList.remove("on");
  $("#play-label").textContent = "play";
  resetChordDisplay();
  clearSoloFeed();
}

function setStatus(msg) {
  $("#status").textContent = msg;
}

// ------------------------------------------------------------------ band events

function handleBeat(bar, beatInBar) {
  $$(".beat-light").forEach((el, i) => el.classList.toggle("on", i === beatInBar));
  if (beatInBar === 0) {
    highlightBar(bar);
    if (state.mode === "inspire") {
      soloFeed.push([]);
      while (soloFeed.length > FEED_BARS) soloFeed.shift();
      renderSoloFeed();
    }
  }
}

function handleChord(chord) {
  $("#chord-next").textContent = `next · ${chord.next.symbol}`;
  const el = $("#chord-now");
  el.textContent = chord.symbol;
  el.classList.remove("pop");
  void el.offsetWidth; // restart animation
  el.classList.add("pop");
  renderSoloStrip(chord.info);
}

// ------------------------------------------------------------------ inspire mode

async function setMode(mode) {
  state.mode = mode;
  $$(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#inspire-panel").hidden = mode !== "inspire";
  $("#solo-feed").hidden = mode !== "inspire";
  clearSoloFeed();
  band.setSolo(mode === "inspire");
  if (mode === "inspire" && !band.soloInst) {
    setStatus("loading solo piano…");
    await band.loadSoloist();
    setStatus("");
  }
}

// ------------------------------------------------------------------ controls

$("#play").addEventListener("click", () => (state.playing ? stop() : play()));

$("#tempo").addEventListener("input", (e) => {
  const bpm = Number(e.target.value);
  $("#tempo-val").textContent = bpm;
  band.bpmOverride = bpm;
  band.setBpm(bpm);
});

$$(".mode-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

$("#feel-crowd").addEventListener("change", (e) => band.setSoloFeel("crowd", Number(e.target.value) / 100));
$("#feel-heat").addEventListener("change", (e) => band.setSoloFeel("heat", Number(e.target.value) / 100));

$$(".mute").forEach((b) =>
  b.addEventListener("click", () => {
    const inst = b.dataset.inst;
    const nowMuted = !b.classList.contains("off");
    b.classList.toggle("off", nowMuted);
    band.setMuted(inst, nowMuted);
  })
);

document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  if (e.code === "Space") {
    e.preventDefault();
    state.playing ? stop() : play();
  }
});

// ------------------------------------------------------------------ editor

function parseProgressionText(text, ts) {
  const errors = [];
  const warnings = [];
  const bars = text.split("|").map((s) => s.trim()).filter(Boolean);
  if (!bars.length) errors.push("no bars found — separate bars with |");
  const progression = bars.map((barText, i) => {
    const tokens = barText.split(/\s+/);
    const bar = tokens.map((tok) => {
      const [sym, beatsStr] = tok.split(":");
      if (!/^[A-G][b#]?/.test(sym)) errors.push(`bar ${i + 1}: "${sym}" doesn't look like a chord`);
      const beats = beatsStr ? Number(beatsStr) : ts / tokens.length;
      if (!(beats > 0) || (beats * 2) % 1 !== 0) {
        errors.push(`bar ${i + 1}: bad beat count in "${tok}" (whole or half beats only)`);
      }
      const before = parseWarnings.length;
      parseChord(sym);
      if (parseWarnings.length > before) warnings.push(`bar ${i + 1}: ${parseWarnings[parseWarnings.length - 1]}`);
      return { chord: sym, beats };
    });
    const sum = bar.reduce((a, x) => a + x.beats, 0);
    if (Math.abs(sum - ts) > 0.001) {
      errors.push(`bar ${i + 1}: beats sum to ${sum}, need ${ts} — use chord:beats for uneven splits`);
    }
    return bar;
  });
  return { progression, errors, warnings };
}

function buildEditorSong() {
  const ts = Number($("#ed-ts").value);
  const { progression, errors, warnings } = parseProgressionText($("#ed-prog").value, ts);
  const title = $("#ed-title").value.trim();
  if (!title) errors.unshift("title is required");
  const song = {
    title,
    composer: $("#ed-composer").value.trim() || "unknown",
    key: $("#ed-key").value.trim() || "—",
    bpm: Number($("#ed-bpm").value) || 120,
    style: $("#ed-style").value,
    timeSignature: ts,
    form: $("#ed-form").value.trim() || `${progression.length}-bar`,
    progression,
  };
  const src = $("#ed-source").value.trim();
  if (src) song.source = [src];
  return { song, errors, warnings };
}

function showEditorIssues(errors, warnings) {
  $("#ed-errors").textContent = [...errors, ...warnings.map((w) => `⚠ ${w}`)].join("\n");
  return errors.length > 0;
}

$("#open-editor").addEventListener("click", () => ($("#editor-overlay").hidden = false));
$("#ed-close").addEventListener("click", () => ($("#editor-overlay").hidden = true));
$("#editor-overlay").addEventListener("click", (e) => {
  if (e.target === $("#editor-overlay")) $("#editor-overlay").hidden = true;
});

$("#ed-preview").addEventListener("click", () => {
  const { song, errors, warnings } = buildEditorSong();
  if (showEditorIssues(errors, warnings)) return;
  const wasPlaying = state.playing;
  if (wasPlaying) stop();
  state.customSong = song;
  $$(".track").forEach((el) => el.classList.remove("active"));
  $("#song-title").textContent = `${song.title} (preview)`;
  $("#song-detail").textContent = `${song.composer} — ${song.key} · ${song.form} · ${song.style}`;
  $("#tempo").value = song.bpm;
  $("#tempo-val").textContent = song.bpm;
  band.bpmOverride = null;
  band.loadSong(song);
  renderLeadsheet(song);
  renderSources(song);
  resetChordDisplay();
  $("#editor-overlay").hidden = true;
  play();
});

$("#ed-export").addEventListener("click", () => {
  const { song, errors, warnings } = buildEditorSong();
  if (showEditorIssues(errors, warnings)) return;
  $("#ed-json").value = JSON.stringify(song, null, 2);
  $("#ed-output").hidden = false;
});

$("#ed-copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#ed-json").value);
  $("#ed-copy").textContent = "copied ✓";
  setTimeout(() => ($("#ed-copy").textContent = "copy"), 1500);
});

// ------------------------------------------------------------------ boot

renderTracklist();
selectSong(0);
setMode("session");
