// main.js — UI wiring: song list, transport, session mode, quiz (play) mode.

import { SONGS } from "./songs.js";
import { Band } from "./band.js";
import { parseChord, flatName, soloScale } from "./theory.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  mode: "session", // session | quiz
  songIndex: 0,
  playing: false,
  loading: false,
  ready: false,
  quiz: { prompt: null, answered: false, correct: 0, total: 0, missed: 0, streak: 0, best: Number(localStorage.getItem("woodshed-best") ?? 0) },
};

const band = new Band({
  onChord: handleChord,
  onBeat: handleBeat,
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

// ------------------------------------------------------------------ leadsheet

function renderSources(song) {
  const box = $("#song-source");
  box.innerHTML = (song.source ?? [])
    .map((url) => `<a href="${url}" target="_blank" rel="noopener">${new URL(url).hostname.replace(/^www\./, "")}</a>`)
    .join(" · ");
  $("#song-source-line").hidden = !song.source?.length;
  $("#song-note").textContent = song.note ?? "";
  $("#song-note").hidden = !song.note;
}

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
  const { label, notes } = soloScale(info);
  $("#solo-scale").textContent = label;
  $("#solo-notes").innerHTML = notes
    .map((n, i) => `<span class="solo-note${i === 0 || i === notes.length - 1 ? " root" : ""}">${n}</span>`)
    .join("");
  $("#solo-strip").hidden = state.mode !== "session";
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
  clearQuizPrompt();
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
  if (state.mode === "session") {
    const el = $("#chord-now");
    el.textContent = chord.symbol;
    el.classList.remove("pop");
    void el.offsetWidth; // restart animation
    el.classList.add("pop");
    renderSoloStrip(chord.info);
  } else {
    $("#chord-now").textContent = "?";
    $("#chord-next").textContent = "";
    newQuizPrompt(chord);
  }
}

// ------------------------------------------------------------------ quiz mode

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle("quiz-mode", mode === "quiz");
  $$(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  clearQuizPrompt();
  if (mode === "session" && state.playing) $("#chord-now").textContent = "…";
  if (mode === "quiz") {
    $("#chord-now").textContent = "?";
    $("#chord-next").textContent = "";
    $("#solo-strip").hidden = true;
  }
  renderScore();
}

function newQuizPrompt(chord) {
  const q = state.quiz;
  // same symbol still ringing → keep existing prompt alive
  if (q.prompt && !q.answered && q.prompt.symbol === chord.symbol) return;
  // unanswered previous prompt → missed (tracked separately, doesn't hit accuracy)
  if (q.prompt && !q.answered) {
    q.missed += 1;
    q.streak = 0;
  }
  q.prompt = chord;
  q.answered = false;
  renderScore();

  const options = buildOptions(chord.symbol);
  const box = $("#quiz-options");
  box.innerHTML = "";
  options.forEach((sym, i) => {
    const btn = document.createElement("button");
    btn.className = "quiz-opt";
    btn.innerHTML = `<span class="key-hint">${i + 1}</span>${sym}`;
    btn.addEventListener("click", () => answer(btn, sym));
    box.appendChild(btn);
  });
  $("#quiz-panel").classList.add("live");
}

function buildOptions(correct) {
  const song = SONGS[state.songIndex];
  const uniq = [...new Set(song.progression.flat().map((c) => c.chord))].filter((s) => s !== correct);
  shuffle(uniq);
  const options = uniq.slice(0, 3);
  // thin songbook chord pool → invent lookalike distractors
  const info = parseChord(correct);
  const quality = correct.replace(/^[A-G][b#]?/, "");
  let shift = 2;
  while (options.length < 3) {
    const fake = flatName(info.rootPc + shift) + quality;
    if (fake !== correct && !options.includes(fake)) options.push(fake);
    shift += 3;
  }
  options.push(correct);
  return shuffle(options);
}

function answer(btn, sym) {
  const q = state.quiz;
  if (q.answered || !q.prompt) return;
  q.answered = true;
  q.total += 1;
  const correct = sym === q.prompt.symbol;
  if (correct) {
    q.correct += 1;
    q.streak += 1;
    if (q.streak > q.best) {
      q.best = q.streak;
      localStorage.setItem("woodshed-best", q.best);
    }
    btn.classList.add("right");
  } else {
    q.streak = 0;
    btn.classList.add("wrong");
    $$(".quiz-opt").forEach((b) => {
      if (b.textContent.replace(/^\d/, "") === q.prompt.symbol) b.classList.add("right");
    });
  }
  $$(".quiz-opt").forEach((b) => (b.disabled = true));
  renderScore();
}

function clearQuizPrompt() {
  state.quiz.prompt = null;
  state.quiz.answered = false;
  $("#quiz-options").innerHTML = "";
  $("#quiz-panel").classList.remove("live");
}

function renderScore() {
  const q = state.quiz;
  $("#score-streak").textContent = q.streak;
  $("#score-hits").textContent = `${q.correct}/${q.total}`;
  $("#score-acc").textContent = q.total ? `${Math.round((q.correct / q.total) * 100)}%` : "—";
  $("#score-missed").textContent = q.missed;
  $("#score-best").textContent = q.best;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  if (state.mode === "quiz" && /^[1-4]$/.test(e.key)) {
    const btn = $$(".quiz-opt")[Number(e.key) - 1];
    if (btn && !btn.disabled) btn.click();
  }
});

// ------------------------------------------------------------------ boot

renderTracklist();
selectSong(0);
setMode("session");
renderScore();
