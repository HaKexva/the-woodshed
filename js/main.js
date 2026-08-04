// main.js — UI wiring: song list, transport, session mode, inspire mode.

import { SONGS } from "./songs.js";
import { Band, SOLO_STYLES } from "./band.js";
import { parseChord, parseWarnings, soloScale, flatName } from "./theory.js";
import { t, getLang, setLang, applyStatic } from "./i18n.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const SEARCH_LIMIT = 60; // enough to scroll through; keeps a broad query cheap
const LETTER_FROM = 20; // below this the whole book fits one scroll; no need to slice it
const ALL_CAP = 120; // rows rendered for "all tunes" before you have to pick a letter
const ALPHA = Array.from({ length: 26 }, (_, k) => String.fromCharCode(65 + k));

/** Bucket a title: A–Z, or "#" for anything starting with a digit or symbol. */
function letterOf(title) {
  const ch = title.trim().charAt(0).toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}

const state = {
  mode: "session", // session | inspire
  songIndex: 0,
  letter: "ALL", // "ALL", "#", or A-Z — which slice of the book the list shows
  customSong: null, // song loaded from the editor instead of the songbook
  playing: false,
  loading: false,
  ready: false,
};

const band = new Band({
  onChord: handleChord,
  onBeat: handleBeat,
  onSoloNote: handleSoloNote,
  onProgress: (n, total) => setStatus(t("status.loading", { n, total })),
  onReady: () => {
    state.ready = true;
    setStatus("");
  },
});

// ------------------------------------------------------------------ tracklist

function renderTracklist() {
  // one delegated listener for the life of the page — the rows themselves come
  // and go as you switch letters or search
  $("#tracklist").addEventListener("click", (e) => {
    const btn = e.target.closest(".track");
    if (btn) selectSong(Number(btn.dataset.i));
  });
  buildLetterSheet();
  updateListView();
}

/** The letter grid. Letters with no tunes are shown but not selectable, so the
 *  alphabet stays in the same place as the songbook grows. */
function buildLetterSheet() {
  if (SONGS.length < LETTER_FROM) return; // trigger stays hidden; list shows everything
  const have = new Set(SONGS.map((s) => letterOf(s.title)));
  const letters = have.has("#") ? ["#", ...ALPHA] : ALPHA;
  $("#letter-sheet").innerHTML =
    `<button type="button" class="all" data-l="ALL">${t("allTunes")}</button>` +
    letters
      .map((L) => `<button type="button" data-l="${L}"${have.has(L) ? "" : " disabled"}>${L}</button>`)
      .join("");
  $("#letter-trigger").hidden = false;

  $("#letter-trigger").addEventListener("click", () => {
    const open = $("#letter-sheet").hidden;
    $("#letter-sheet").hidden = !open;
    $("#letter-trigger").setAttribute("aria-expanded", String(open));
  });

  $("#letter-sheet").addEventListener("click", (e) => {
    const btn = e.target.closest("button:not([disabled])");
    if (!btn) return;
    state.letter = btn.dataset.l;
    $("#song-search").value = ""; // picking a letter is a browse move, not a search
    $("#letter-sheet").hidden = true;
    $("#letter-trigger").setAttribute("aria-expanded", "false");
    updateListView();
  });
}

/** Songbook indices to show right now: search hits, or the chosen letter. */
function visibleIndices(query) {
  const q = query.trim().toLowerCase();
  if (q) {
    const hits = [];
    for (let i = 0; i < SONGS.length && hits.length < SEARCH_LIMIT; i++) {
      const s = SONGS[i];
      if (`${s.title} ${s.composer} ${s.key} ${s.style}`.toLowerCase().includes(q)) hits.push(i);
    }
    return hits;
  }
  if (SONGS.length < LETTER_FROM || state.letter === "ALL") {
    return SONGS.slice(0, ALL_CAP).map((_, i) => i);
  }
  const out = [];
  for (let i = 0; i < SONGS.length; i++) if (letterOf(SONGS[i].title) === state.letter) out.push(i);
  return out;
}

function selectSong(i) {
  const wasPlaying = state.playing;
  if (wasPlaying) stop();
  state.songIndex = i;
  state.customSong = null;
  if (SONGS.length >= LETTER_FROM && state.letter !== "ALL") state.letter = letterOf(SONGS[i].title);
  updateListView();
  const song = SONGS[i];
  state.currentSong = song;
  $("#edit-preview").hidden = true;
  $("#song-title").textContent = song.title;
  $("#song-detail").textContent = `${song.composer} — ${song.key} · ${song.form} · ${song.style}`;
  $("#tempo").value = song.bpm;
  $("#tempo-val").textContent = song.bpm;
  band.bpmOverride = null;
  band.loadSong(song);
  renderLeadsheet(song);
  renderSources(song);
  resetChordDisplay();
  collapseSleeve();
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
  renderSystemView(-1);
  // a waltz gets three beat lights, not four
  const ts = state.currentSong?.timeSignature ?? 4;
  $$(".beat-light").forEach((el, i) => (el.hidden = i >= ts));
}

// mobile "system view": previous / live / next 4-bar lines of the chart
const SYS_BARS = 4;

function renderSystemView(curBar) {
  const song = state.currentSong;
  if (!song) return;
  const total = song.progression.length;
  const lines = Math.ceil(total / SYS_BARS);
  const lineIdx = curBar >= 0 ? Math.floor(curBar / SYS_BARS) : 0;
  const row = (li) => {
    let html = "";
    for (let b = li * SYS_BARS; b < li * SYS_BARS + SYS_BARS; b++) {
      const bar = song.progression[b];
      if (!bar) {
        html += `<span class="sys-cell"></span>`;
        continue;
      }
      const cls = `sys-cell${bar.length > 1 ? " multi" : ""}${b === curBar ? " on" : ""}`;
      html += `<span class="${cls}">${bar.map((x) => x.chord).join(" ")}</span>`;
    }
    return html;
  };
  $("#sys-live").innerHTML = row(lineIdx);
  $("#sys-prev").hidden = lines < 2;
  $("#sys-next").hidden = lines < 2;
  if (lines >= 2) {
    $("#sys-prev").innerHTML = row((lineIdx - 1 + lines) % lines);
    $("#sys-next").innerHTML = row((lineIdx + 1) % lines);
  }
  const from = lineIdx * SYS_BARS + 1;
  $("#sys-pos").textContent = t("bars", { from, to: Math.min(total, from + SYS_BARS - 1), total });
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
    `<span class="feed-label">${t("played")}</span>` +
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
    setStatus(t("status.loading", { n: 0, total: 3 }));
    $("#play").classList.add("loading");
    try {
      await band.setup();
    } finally {
      state.loading = false;
      $("#play").classList.remove("loading");
    }
  }
  await band.play();
  state.playing = true;
  document.body.classList.add("playing");
  $("#play").classList.add("on");
  $("#play-label").textContent = t("stop");
}

function stop() {
  band.stop();
  state.playing = false;
  document.body.classList.remove("playing");
  $("#play").classList.remove("on");
  $("#play-label").textContent = t("play");
  resetChordDisplay();
  clearSoloFeed();
}

function setStatus(msg) {
  $("#status").textContent = msg;
}

// ------------------------------------------------------------------ band events

function handleBeat(bar, beatInBar) {
  $$(".beat-light").forEach((el, i) => el.classList.toggle("on", i === beatInBar));
  if (bar < 0) return; // count-in: pulse the lights, touch nothing else
  if (beatInBar === 0) {
    highlightBar(bar);
    renderSystemView(bar);
    if (state.mode === "inspire") {
      soloFeed.push([]);
      while (soloFeed.length > FEED_BARS) soloFeed.shift();
      renderSoloFeed();
    }
  }
}

function handleChord(chord) {
  $("#chord-next").textContent = t("next", { chord: chord.next.symbol });
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
    setStatus(t("status.loadingSolo"));
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

$("#bg-vol").addEventListener("input", (e) => band.setBgVolume(Number(e.target.value) / 100));

$$(".mode-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

$("#feel-crowd").addEventListener("change", (e) => band.setSoloFeel("crowd", Number(e.target.value) / 100));
$("#feel-heat").addEventListener("change", (e) => band.setSoloFeel("heat", Number(e.target.value) / 100));

// soloist style chips, straight from the presets; the active style's
// character reads inline next to the label
$("#style-picker").innerHTML = Object.entries(SOLO_STYLES)
  .map(([key, s]) => `<button class="style-chip${key === band.soloStyleName ? " active" : ""}" data-style="${key}">${s.label}</button>`)
  .join("");

function renderStyleBlurb() {
  $("#style-blurb").textContent = t(`blurb.${band.soloStyleName}`);
}
renderStyleBlurb();

$$(".voice-chip").forEach((b) =>
  b.addEventListener("click", () => {
    band.setSoloVoicing(b.dataset.voice);
    $$(".voice-chip").forEach((x) => x.classList.toggle("active", x === b));
  })
);

$$(".style-chip").forEach((b) =>
  b.addEventListener("click", () => {
    band.setSoloStyle(b.dataset.style);
    $$(".style-chip").forEach((x) => x.classList.toggle("active", x === b));
    renderStyleBlurb();
  })
);

document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  if (state.mode === "inspire" && /^[1-8]$/.test(e.key)) {
    $$(".style-chip")[Number(e.key) - 1]?.click();
  }
});

// ---- Real sample pack: on by default, switchable any time, choice persisted.
// While loading, the status pill shows progress plus a "skip" escape hatch.
function setHqUi(on) {
  $("#hq-toggle").checked = on;
  localStorage.setItem("woodshed-hq", on ? "1" : "0");
}

function hqPill(n, total) {
  if (!band.hqOn) return; // skipped mid-load — leave the pill alone
  if (n === total) {
    setStatus("");
    return;
  }
  $("#status").innerHTML =
    `${t("status.loadingHq", { n, total })} <button id="hq-skip" class="linklike">${t("hqSkip")}</button>`;
  $("#hq-skip").onclick = () => {
    band.setHq(false);
    setHqUi(false);
    setStatus("");
  };
}

$("#hq-toggle").addEventListener("change", (e) => {
  const enable = e.target.checked;
  setHqUi(enable);
  if (enable) band.setHq(true, hqPill);
  else {
    band.setHq(false);
    setStatus("");
  }
});

if (localStorage.getItem("woodshed-hq") !== "0") {
  band.hqOn = true; // _setup kicks off the pack load at first play
  setHqUi(true);
  band.cb.onHqProgress = hqPill;
}

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

// ------------------------------------------------- search & pagination

// search looks across the whole book; otherwise the list shows one
// 10-track "side" at a time
function updateListView() {
  const q = $("#song-search").value;
  const shownIdx = visibleIndices(q);
  const active = state.customSong ? -1 : state.songIndex;
  $("#tracklist").innerHTML = shownIdx
    .map((i) => {
      const song = SONGS[i];
      return `<li><button class="track${i === active ? " active" : ""}" data-i="${i}">
        <span class="track-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="track-title">${song.title}</span>
        <span class="track-meta">${song.key} · ${song.bpm} bpm · ${song.style}</span>
      </button></li>`;
    })
    .join("");
  const shown = shownIdx.length;
  $("#search-empty").hidden = shown > 0;
  $("#sleeve-label").textContent = t("sleeveCount", { n: SONGS.length });
  if (!$("#letter-trigger").hidden) {
    $("#letter-current").textContent = state.letter === "ALL" ? t("allTunes") : state.letter;
    $$("#letter-sheet button").forEach((b) => b.classList.toggle("on", b.dataset.l === state.letter));
  }
}

$("#song-search").addEventListener("input", updateListView);

// mobile: songs live behind a collapsible toggle (chevron rotates via CSS)
const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

$("#sleeve-toggle").addEventListener("click", () => {
  const open = $(".sleeve").classList.toggle("open");
  $("#sleeve-toggle").setAttribute("aria-expanded", open);
});

function collapseSleeve() {
  if (!isMobile()) return;
  $(".sleeve").classList.remove("open");
  $("#sleeve-toggle").setAttribute("aria-expanded", "false");
}

// "/" focuses search from anywhere
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
    e.preventDefault();
    $("#song-search").focus();
  }
});

// ------------------------------------------------------------------ editor

function parseProgressionText(text, ts) {
  const errors = [];
  const warnings = [];
  const bars = text.split("|").map((s) => s.trim()).filter(Boolean);
  if (!bars.length) errors.push(t("err.noBars"));
  const progression = bars.map((barText, i) => {
    const tokens = barText.split(/\s+/);
    const bar = tokens.map((tok) => {
      const [sym, beatsStr] = tok.split(":");
      if (!/^[A-G][b#]?/.test(sym)) errors.push(t("err.badChord", { n: i + 1, sym }));
      const beats = beatsStr ? Number(beatsStr) : ts / tokens.length;
      if (!(beats > 0) || (beats * 2) % 1 !== 0) {
        errors.push(t("err.badBeats", { n: i + 1, tok }));
      }
      const before = parseWarnings.length;
      parseChord(sym);
      if (parseWarnings.length > before) warnings.push(`bar ${i + 1}: ${parseWarnings[parseWarnings.length - 1]}`);
      return { chord: sym, beats };
    });
    const sum = bar.reduce((a, x) => a + x.beats, 0);
    if (Math.abs(sum - ts) > 0.001) {
      errors.push(t("err.sumMismatch", { n: i + 1, sum, ts }));
    }
    return bar;
  });
  return { progression, errors, warnings };
}

function buildEditorSong() {
  const ts = Number($("#ed-ts").value);
  const { progression, errors, warnings } = parseProgressionText($("#ed-prog").value, ts);
  const title = $("#ed-title").value.trim();
  if (!title) errors.unshift(t("err.titleRequired"));
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

const ALERT_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function showEditorIssues(errors, warnings) {
  $("#ed-errors").innerHTML = [
    ...errors.map(esc),
    ...warnings.map((w) => `${ALERT_ICON} ${esc(w)}`),
  ].join("<br>");
  // warnings block too — an unrecognized chord quality would play as the
  // wrong chord, so don't let it be previewed or exported
  return errors.length > 0 || warnings.length > 0;
}

$("#open-editor").addEventListener("click", () => ($("#editor-overlay").hidden = false));
$("#edit-preview").addEventListener("click", () => ($("#editor-overlay").hidden = false));
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
  state.currentSong = song;
  updateListView(); // nothing in the songbook is the current tune any more
  $("#song-title").textContent = `${song.title} (preview)`;
  $("#edit-preview").hidden = false;
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

// dice: an idiomatic progression in a random key — blues, minor blues, or
// 32-bar AABA — built from real cells (ii-V-I, turnarounds, rhythm bridge)
function randomChanges() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const keyPc = Math.floor(Math.random() * 12);
  const d = (semis, quality) => flatName((keyPc + semis) % 12) + quality;
  const minor = Math.random() < 0.35;
  let key, form, bars;

  if (minor) {
    key = `${flatName(keyPc)} minor`;
    form = "12-bar minor blues";
    bars = [
      d(0, "m7"), d(0, "m7"), d(0, "m7"), d(0, "m7"),
      d(5, "m7"), d(5, "m7"), d(0, "m7"), d(0, "m7"),
      d(8, "7"), d(7, "7b9"), d(0, "m7"),
      pick([d(7, "7b9"), `${d(2, "m7b5")}:2 ${d(7, "7b9")}:2`]),
    ];
  } else if (Math.random() < 0.4) {
    key = `${flatName(keyPc)} major`;
    form = "12-bar blues";
    bars = [
      d(0, "7"), pick([d(5, "7"), d(0, "7")]), d(0, "7"), d(0, "7"),
      d(5, "7"), pick([d(6, "dim7"), d(5, "7")]), d(0, "7"), d(9, "7"),
      d(2, "m7"), d(7, "7"),
      `${d(0, "7")}:2 ${d(9, "7")}:2`, `${d(2, "m7")}:2 ${d(7, "7")}:2`,
    ];
  } else {
    key = `${flatName(keyPc)} major`;
    form = "32-bar AABA";
    const A = [
      d(0, "Maj7"), pick([d(9, "m7"), d(9, "7")]), d(2, "m7"), d(7, "7"),
      pick([`${d(4, "m7")}:2 ${d(9, "7")}:2`, d(0, "Maj7")]),
      `${d(2, "m7")}:2 ${d(7, "7")}:2`, d(0, "Maj7"), `${d(2, "m7")}:2 ${d(7, "7")}:2`,
    ];
    const B = pick([
      [d(4, "7"), d(4, "7"), d(9, "7"), d(9, "7"), d(2, "7"), d(2, "7"), d(7, "7"), d(7, "7")], // rhythm bridge
      [d(5, "Maj7"), d(5, "m6"), d(0, "Maj7"), d(9, "7"), d(2, "m7"), d(7, "7"), d(0, "Maj7"), d(7, "7#5")],
    ]);
    bars = [...A, ...A, ...B, ...A.slice(0, 6), d(0, "Maj7"), d(0, "Maj7")];
  }

  return {
    key,
    form,
    bars,
    style: pick(minor ? ["swing", "swing", "bossa", "funk"] : ["swing", "swing", "bossa", "latin"]),
    bpm: 90 + Math.floor(Math.random() * 80),
  };
}

$("#ed-random").addEventListener("click", () => {
  const gen = randomChanges();
  $("#ed-prog").value = gen.bars.join(" | ");
  $("#ed-key").value = gen.key;
  $("#ed-form").value = gen.form;
  $("#ed-style").value = gen.style;
  $("#ed-bpm").value = gen.bpm;
  if (!$("#ed-title").value.trim()) $("#ed-title").value = `Dice in ${gen.key}`;
  if (!$("#ed-composer").value.trim()) $("#ed-composer").value = "the woodshed dice";
  $("#ed-errors").textContent = "";
});

function progressionToText(progression, ts) {
  return progression
    .map((bar) => {
      const even = bar.every((c) => c.beats === ts / bar.length);
      return bar.map((c) => (even ? c.chord : `${c.chord}:${c.beats}`)).join(" ");
    })
    .join(" | ");
}

$("#ed-load").addEventListener("click", () => {
  try {
    const song = JSON.parse($("#ed-import-json").value);
    if (!song.title || !Array.isArray(song.progression)) throw new Error(t("err.needTitleProg"));
    const ts = song.timeSignature === 3 ? 3 : 4;
    $("#ed-title").value = song.title;
    $("#ed-composer").value = song.composer ?? "";
    $("#ed-key").value = song.key ?? "";
    $("#ed-bpm").value = song.bpm ?? 120;
    $("#ed-style").value = [...$("#ed-style").options].some((o) => o.value === song.style) ? song.style : "swing";
    $("#ed-ts").value = String(ts);
    $("#ed-form").value = song.form ?? "";
    $("#ed-source").value = song.source?.[0] ?? "";
    $("#ed-prog").value = progressionToText(song.progression, ts);
    $("#ed-errors").textContent = "";
  } catch (err) {
    $("#ed-errors").textContent = t("err.loadJson", { msg: err.message });
  }
});

const CHECK_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

$("#ed-copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#ed-json").value);
  $("#ed-copy").innerHTML = `${t("ed.copied")} ${CHECK_ICON}`;
  setTimeout(() => ($("#ed-copy").textContent = t("ed.copy")), 1500);
});

// ------------------------------------------------------------------ language

function renderLangToggle() {
  $("#lang-toggle").textContent = getLang() === "zh" ? "EN" : "中文";
}

$("#lang-toggle").addEventListener("click", () => {
  setLang(getLang() === "zh" ? "en" : "zh");
  renderLangToggle();
  // re-render everything dynamic in the new language
  updateListView();
  renderStyleBlurb();
  renderSoloFeed();
  renderSystemView(-1);
  $("#play-label").textContent = state.playing ? t("stop") : t("play");
});

// ------------------------------------------------------------------ boot

applyStatic();
renderLangToggle();

renderTracklist();
selectSong(0);
updateListView();
setMode("session");
