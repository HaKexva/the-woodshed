// main.js — UI wiring: song list, transport, session mode, inspire mode.

import { SONGS } from "./songs.js";
import { Band, SOLO_STYLES } from "./band.js";
import { parseChord, parseWarnings, soloScale, flatName } from "./theory.js";
import { classify, chordAt } from "./solo-metrics.js";
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
  paused: false, // playing && paused = held on the bar, position kept
  loading: false,
  ready: false,
};

const band = new Band({
  onChord: handleChord,
  onBeat: handleBeat,
  onSoloNote: handleSoloNote,
  onSoloLine: renderSoloLine,
  onTempo: (bpm) => {
    $("#tempo").value = bpm;
    $("#tempo-val").textContent = bpm;
  },
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
  // clear any shrink left over from a long symbol before the dash goes back
  $("#chord-now").style.fontSize = "";
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

// The solo, written out. A rolling list of note *names* used to live here —
// four bars of letters that scrolled away — which told a student nothing the
// chord symbol hadn't already. The generator knows the harmonic function of
// every note it plays, so show that instead: the whole chorus against the
// chart, coloured by role, with each note's degree over its own chord.
let soloLine = null; // { events, chords, totalBeats, bpb }

function renderSoloLine(events, ctx) {
  soloLine = { events, ...ctx };
  if (state.mode !== "inspire") return;
  const bars = ctx.totalBeats / ctx.bpb;
  const html = [];
  for (let bar = 0; bar < bars; bar++) {
    const inBar = events.filter((e) => e.beat >= bar * ctx.bpb && e.beat < (bar + 1) * ctx.bpb);
    const symbols = ctx.chords.filter((c) => c.bar === bar).map((c) => c.symbol).join(" ");
    const notes = inBar.length
      ? inBar
          .map((e) => {
            const c = classify(e.midi, chordAt(ctx.chords, e.beat, ctx.totalBeats));
            const strong = Math.abs(e.beat - Math.round(e.beat)) < 0.02 ? " downbeat" : "";
            const held = e.dur >= 1 ? " held" : "";
            return `<span class="n ${c.role}${strong}${held}" data-beat="${e.beat.toFixed(3)}" title="${e.atom ?? ""}">${flatName(e.midi % 12)}<i>${c.deg}</i></span>`;
          })
          .join("")
      : `<span class="rest">·</span>`;
    html.push(
      `<div class="sbar" data-bar="${bar}"><div class="sbar-head">${symbols || "&nbsp;"}</div><div class="sbar-notes">${notes}</div></div>`
    );
  }
  $("#solo-score").innerHTML = html.join("");
  $("#solo-line").hidden = false;
}

function markLineBar(bar) {
  $$("#solo-score .sbar").forEach((el) => el.classList.toggle("on", Number(el.dataset.bar) === bar));
}

function clearSoloLine() {
  $("#solo-score").innerHTML = "";
}

// follow the sounding note, and keep it on screen — the line is a whole chorus
// now, which is more than fits
let lastLit = null;
function handleSoloNote(note) {
  if (state.mode !== "inspire" || !soloLine) return;
  lastLit?.classList.remove("now");
  const el = $(`#solo-score .n[data-beat="${note.beat.toFixed(3)}"]`);
  if (!el) return;
  el.classList.add("now");
  lastLit = el;
  const box = $("#solo-score");
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top || r.bottom > b.bottom) el.scrollIntoView({ block: "nearest" });
}

// ------------------------------------------------------------------ transport

async function play() {
  if (state.loading) return;
  focusStage(); // before the load wait, so the tap moves something right away
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
  state.paused = false;
  renderTransport();
}

// pause holds the bar you are on; stop goes back to the top of the form
function pause() {
  band.pause();
  state.paused = true;
  renderTransport();
}

function resume() {
  band.resume();
  state.paused = false;
  renderTransport();
}

function stop() {
  band.stop();
  state.playing = false;
  state.paused = false;
  renderTransport();
  resetChordDisplay();
  clearSoloLine();
}

// the round button plays what it shows: a triangle to start or pick up, two
// bars to hold. Stop is its own button because it throws the position away.
function renderTransport() {
  const running = state.playing && !state.paused;
  document.body.classList.toggle("playing", state.playing);
  document.body.classList.toggle("paused", state.paused);
  $("#play").classList.toggle("on", running);
  $("#play").setAttribute("aria-label", running ? t("pause") : t("play"));
  $("#stop").disabled = !state.playing;
  $("#play-label").textContent = running ? t("pause") : state.paused ? t("resume") : t("play");
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
    if (state.mode === "inspire") markLineBar(bar);
  }
}

// The chord card is a fixed width so the columns beside it never reflow, which
// means a long symbol has to come down to meet the card rather than bleed past
// its edge — "Gbm7b5" overflowed where "Cmaj7" fit. Measured rather than
// derived from the character count, because Anton's glyphs are far from equal
// width. offsetWidth/clientWidth are layout values, so the card's rotation
// doesn't skew them. Cached per symbol and card width; chords change often.
const chordFit = new Map();

function setChordText(el, text) {
  el.textContent = text;
  const card = el.parentElement;
  const room = card.clientWidth - 2 * parseFloat(getComputedStyle(card).paddingLeft);
  if (room <= 0) return; // card hidden at this breakpoint — nothing to fit to
  const key = `${text}@${card.clientWidth}`;
  if (chordFit.has(key)) {
    el.style.fontSize = chordFit.get(key);
    return;
  }
  el.style.fontSize = ""; // measure at the size the stylesheet asks for
  const base = parseFloat(getComputedStyle(el).fontSize);
  const wide = el.offsetWidth;
  const size = wide > room ? `${Math.floor(base * (room / wide) * 100) / 100}px` : "";
  el.style.fontSize = size;
  chordFit.set(key, size);
}

function refitChord() {
  chordFit.clear();
  const el = $("#chord-now");
  el.style.fontSize = "";
  if (el.textContent && el.textContent !== "—") setChordText(el, el.textContent);
}

// Anton is loaded with display=swap, so anything measured before it arrives is
// measured in the fallback face and fits to the wrong metrics
document.fonts?.ready.then(refitChord);

// the base size is viewport-relative, so a resize invalidates every fit
let refitPending = false;
addEventListener("resize", () => {
  if (refitPending) return;
  refitPending = true;
  requestAnimationFrame(() => {
    refitPending = false;
    refitChord();
  });
});

function handleChord(chord) {
  $("#chord-next").textContent = t("next", { chord: chord.next.symbol });
  const el = $("#chord-now");
  setChordText(el, chord.symbol);
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
  $("#solo-line").hidden = mode !== "inspire";
  if (mode !== "inspire") {
    clearSoloLine();
  } else if (soloLine) {
    // Draw what the band already has. The line exists from the moment the song
    // loaded — it is generated whether or not anyone is listening to it — and
    // only the band rebuilding republished it, so switching mode mid-tune left
    // the panel empty until the next time the form came round.
    renderSoloLine(soloLine.events, soloLine);
  } else {
    $("#solo-score").innerHTML = `<p class="score-wait">${t("lineWait")}</p>`;
  }
  band.setSolo(mode === "inspire");
  if (mode === "inspire" && !band.soloInst) {
    // the samples take a moment, and a silent soloist over a drawn line reads
    // as broken rather than as loading
    $("#solo-line").dataset.loading = t("lineLoading");
    $("#solo-line").classList.add("loading");
    setStatus(t("status.loadingSolo"));
    await band.loadSoloist();
    $("#solo-line").classList.remove("loading");
    setStatus("");
  }
}

// ------------------------------------------------------------------ controls

// the transport is fixed to the bottom and wraps to two or three rows on a
// phone; publish its real height so the page can reserve that much padding.
// Without it the tail of the credits — the report-a-problem link — sits under
// the transport with nothing left to scroll.
(function trackTransportHeight() {
  const bar = $(".transport");
  const publish = () =>
    document.documentElement.style.setProperty("--transport-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  publish();
  if (window.ResizeObserver) new ResizeObserver(publish).observe(bar);
  else window.addEventListener("resize", publish);
})();

$("#play").addEventListener("click", () => {
  if (!state.playing) play();
  else if (state.paused) resume();
  else pause();
});

$("#stop").addEventListener("click", stop);

$("#tempo").addEventListener("input", (e) => {
  const bpm = Number(e.target.value);
  $("#tempo-val").textContent = bpm;
  band.bpmOverride = bpm;
  band.setBpm(bpm);
});

$("#bg-vol").addEventListener("input", (e) => band.setBgVolume(Number(e.target.value) / 100));

$$(".mode-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

$("#feel-crowd").addEventListener("change", (e) => band.setSoloFeel("crowd", Number(e.target.value) / 100));
$("#feel-phrase").addEventListener("change", (e) => band.setSoloFeel("phrase", Number(e.target.value) / 100));

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

// take controls: every line is a seeded improvisation, so a take you liked can
// be written down and played again instead of being lost to the next roll
$("#take-seed").value = band.takeId;
$("#new-take").addEventListener("click", () => {
  $("#take-seed").value = band.newTake();
});
// the seed needs a word of explanation, and a bare number in a box gets none
$("#take-help").addEventListener("click", () => {
  const btn = $("#take-help");
  const open = btn.getAttribute("aria-expanded") !== "true";
  btn.setAttribute("aria-expanded", String(open));
  $("#take-tip").classList.toggle("open", open);
});
document.addEventListener("click", (e) => {
  if (e.target.closest("#take-help") || e.target.closest("#take-tip")) return;
  $("#take-help")?.setAttribute("aria-expanded", "false");
  $("#take-tip")?.classList.remove("open");
});

$("#hold-take").addEventListener("change", (e) => band.setHoldTake(e.target.checked));
$("#tempo-ramp").addEventListener("change", (e) => band.setTempoRamp(Number(e.target.value)));
$("#chord-breaks").addEventListener("change", (e) => band.setBreakBars(Number(e.target.value)));
$("#chromatic").addEventListener("change", (e) => band.setChromatic(e.target.checked));

$("#take-seed").addEventListener("change", (e) => {
  const v = e.target.value.trim();
  e.target.value = v ? band.newTake(v) : band.newTake();
});

document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  if (state.mode === "inspire" && /^[1-4]$/.test(e.key)) {
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

$("#bass-boost").addEventListener("change", (e) => band.setBassBoost(e.target.checked));

$$(".mute[data-inst]").forEach((b) =>
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
    if (!state.playing) play();
    else if (state.paused) resume();
    else pause();
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

// hitting play on a phone means you want the chords, not the track list you
// just picked from — fold the sleeve away and bring them up. The system view
// is the target, not the stage: the song title is what you were just reading
// in the list, so spending phone rows on it pushes the solo notes off.
function focusStage() {
  if (!isMobile()) return;
  const wasOpen = $(".sleeve").classList.contains("open");
  collapseSleeve();
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const go = () => $("#system-view").scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  // the sleeve folds over 0.32s and the stage rides up with it; scrolling
  // mid-collapse aims at where the chords *were*
  if (wasOpen && !still) setTimeout(go, 340);
  else go();
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
  if (soloLine) renderSoloLine(soloLine.events, soloLine);
  renderSystemView(-1);
  renderTransport();
});

// ------------------------------------------------------------------ boot

applyStatic();
renderLangToggle();

renderTracklist();
selectSong(0);
updateListView();
setMode("session");

// a phone speaker or a pair of earbuds loses the bass fundamental, so the
// boost starts engaged there — off everywhere else, and the switch overrides
// either way. Coarse pointer catches a tablet held sideways, which is wider
// than the mobile breakpoint but still played through a built-in speaker.
if (isMobile() || window.matchMedia("(pointer: coarse)").matches) {
  $("#bass-boost").checked = true;
  band.setBassBoost(true);
}
