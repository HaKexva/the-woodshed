// main.js — UI wiring: song list, transport, session mode, inspire mode.

import { SONGS } from "./songs.js";
import { Band, SOLOISTS } from "./band.js";
import { soloScale } from "./theory.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  mode: "session", // session | inspire
  songIndex: 0,
  playing: false,
  loading: false,
  ready: false,
  soloist: "trumpet",
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

let soloNoteTimer = null;

function handleSoloNote(pc, durSec) {
  $$(".solo-note").forEach((el) => el.classList.toggle("live", Number(el.dataset.pc) === pc));
  clearTimeout(soloNoteTimer);
  soloNoteTimer = setTimeout(() => $$(".solo-note.live").forEach((el) => el.classList.remove("live")), Math.max(120, durSec * 900));
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
}

function setStatus(msg) {
  $("#status").textContent = msg;
}

// ------------------------------------------------------------------ band events

function handleBeat(bar, beatInBar) {
  $$(".beat-light").forEach((el, i) => el.classList.toggle("on", i === beatInBar));
  if (beatInBar === 0) highlightBar(bar);
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

function setMode(mode) {
  state.mode = mode;
  $$(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#inspire-panel").hidden = mode !== "inspire";
  band.setSolo(mode === "inspire");
  if (mode === "inspire") setSoloist(state.soloist);
}

async function setSoloist(name) {
  state.soloist = name;
  $$(".soloist").forEach((b) => b.classList.toggle("active", b.dataset.solo === name));
  const label = SOLOISTS[name].label;
  setStatus(band.soloInsts?.[name] ? "" : `loading ${label}…`);
  await band.setSoloInstrument(name);
  if (state.soloist === name) setStatus("");
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

$$(".soloist").forEach((b) => b.addEventListener("click", () => setSoloist(b.dataset.solo)));

$("#density").addEventListener("change", (e) => band.setSoloDensity(Number(e.target.value) / 100));

$$(".mute").forEach((b) =>
  b.addEventListener("click", () => {
    const inst = b.dataset.inst;
    const nowMuted = !b.classList.contains("off");
    b.classList.toggle("off", nowMuted);
    band.setMuted(inst, nowMuted);
  })
);

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") {
    e.preventDefault();
    state.playing ? stop() : play();
  }
  if (state.mode === "inspire" && /^[1-5]$/.test(e.key)) {
    const btn = $$(".soloist")[Number(e.key) - 1];
    if (btn) btn.click();
  }
});

// ------------------------------------------------------------------ boot

renderTracklist();
selectSong(0);
setMode("session");
