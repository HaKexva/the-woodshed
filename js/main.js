// main.js — UI wiring: song list, transport, session mode, inspire mode.

import { SONGS } from "./songs.js";
import { loadMine, saveMine, removeMine, exportMine, importMine, randomTitle } from "./mytunes.js";
import { Band, SOLO_STYLES } from "./band.js";
import {
  parseChord,
  parseWarnings,
  soloScale,
  flatName,
  transposeSymbol,
  transposeKey,
  READING_KEYS,
  keyContext,
} from "./theory.js";
import { classify, chordAt } from "./solo-metrics.js";
import { t, getLang, setLang, applyStatic } from "./i18n.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const SEARCH_LIMIT = 60; // enough to scroll through; keeps a broad query cheap
const LETTER_FROM = 20; // below this the whole book fits one scroll; no need to slice it
const ALL_CAP = 120; // rows rendered for "all tunes" before you have to pick a letter
const ALPHA = Array.from({ length: 26 }, (_, k) => String.fromCharCode(65 + k));

// Your own tunes share the list with the songbook. Rather than renumber 428
// entries, they sit above a base — songAt() is the only place that has to know,
// and every existing index into SONGS still means what it meant.
const MINE_BASE = 100000;
let mine = loadMine();

const songAt = (i) => (i >= MINE_BASE ? mine[i - MINE_BASE] : SONGS[i]);
const isMineIdx = (i) => i >= MINE_BASE;

/** Bucket a title: A–Z, or "#" for anything starting with a digit or symbol. */
function letterOf(title) {
  const ch = title.trim().charAt(0).toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}

// Reading transposition. The band never moves — this rewrites what is *written*
// so a tenor player reads D over the concert C the trio is playing, instead of
// transposing 32 bars in their head while trying to hear the changes. Set once
// and remembered, because it is a property of the instrument in your hands.
const savedReading = localStorage.getItem("woodshed-reading");
let readingKey = savedReading in READING_KEYS ? savedReading : "C";
const shift = () => READING_KEYS[readingKey].shift;
/** A chord symbol as this instrument should read it. */
const written = (symbol) => transposeSymbol(symbol, shift());

const state = {
  mode: "session", // session | inspire
  songIndex: 0,
  letter: "ALL", // "ALL", "#", or A-Z — which slice of the book the list shows
  customSong: null, // song loaded from the editor instead of the songbook
  playing: false,
  paused: false, // playing && paused = held on the bar, position kept
  loading: false,
  ready: false,
  // the rig
  boost: false, // Bass+ — harmonics that stand in for a fundamental a speaker cannot make
  stopAfter: 0, // choruses to play before stopping — 0 runs until you stop it
  chorus: 0, // times round the form so far, 1-based while playing
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
  sheetLetters = { letters, have };
  renderLetterSheet(letters, have);
  $("#letter-trigger").hidden = false;

  $("#letter-trigger").addEventListener("click", () => {
    const open = $("#letter-sheet").hidden;
    $("#letter-sheet").hidden = !open;
    $("#letter-trigger").setAttribute("aria-expanded", String(open));
  });

  $("#letter-sheet").addEventListener("click", (e) => {
    const btn = e.target.closest("button:not([disabled])");
    if (!btn) return;
    $("#letter-sheet").hidden = true;
    $("#letter-trigger").setAttribute("aria-expanded", "false");
    if (btn.dataset.l === "NEW") {
      openEditor();
      return;
    }
    state.letter = btn.dataset.l;
    $("#song-search").value = ""; // picking a letter is a browse move, not a search
    updateListView();
  });
}

/** The jump-to grid. Your own tunes get a heading of their own — it is where
 *  you would go looking for them — and starting one sits beside it, because
 *  finding and making are the same errand. */
function renderLetterSheet(letters, have) {
  const mineCell = `<button type="button" class="mine" data-l="MINE"${mine.length ? "" : " disabled"}>★ ${t("mineTunes")} · ${mine.length}</button>`;
  $("#letter-sheet").innerHTML =
    `<button type="button" class="all" data-l="ALL">${t("allTunes")}</button>` +
    mineCell +
    `<button type="button" class="new" data-l="NEW">＋ ${t("newTune")}</button>` +
    letters
      .map((L) => `<button type="button" data-l="${L}"${have.has(L) ? "" : " disabled"}>${L}</button>`)
      .join("");
}

let sheetLetters = null;
function refreshLetterSheet() {
  if (!sheetLetters) return;
  renderLetterSheet(sheetLetters.letters, sheetLetters.have);
}

/** Songbook indices to show right now: search hits, or the chosen letter. */
function visibleIndices(query) {
  const q = query.trim().toLowerCase();
  const mineIdx = mine.map((_, k) => MINE_BASE + k);
  if (q) {
    const match = (s) => `${s.title} ${s.composer ?? ""} ${s.key ?? ""} ${s.style ?? ""}`.toLowerCase().includes(q);
    // your own first: a short list you wrote beats a long one you did not
    const hits = mineIdx.filter((i) => match(songAt(i)));
    for (let i = 0; i < SONGS.length && hits.length < SEARCH_LIMIT; i++) {
      if (match(SONGS[i])) hits.push(i);
    }
    return hits;
  }
  if (state.letter === "MINE") return mineIdx;
  if (SONGS.length < LETTER_FROM || state.letter === "ALL") {
    return [...mineIdx, ...SONGS.slice(0, ALL_CAP).map((_, i) => i)];
  }
  const out = [];
  for (let i = 0; i < SONGS.length; i++) if (letterOf(SONGS[i].title) === state.letter) out.push(i);
  return out;
}

function selectSong(i) {
  const song = songAt(i);
  if (!song) return;
  const wasPlaying = state.playing;
  if (wasPlaying) stop();
  state.songIndex = i;
  state.customSong = null;
  state.mineId = isMineIdx(i) ? song.id : null;
  // yours can be edited and deleted; the songbook can be neither
  $("#edit-preview").hidden = !state.mineId;
  $("#delete-tune").hidden = !state.mineId;
  disarmDelete();
  if (!isMineIdx(i) && SONGS.length >= LETTER_FROM && state.letter !== "ALL") state.letter = letterOf(song.title);
  updateListView();
  state.currentSong = song;
  $("#song-title").textContent = song.title;
  $("#song-detail").textContent =
    `${song.composer} — ${transposeKey(song.key, shift())} · ${song.form} · ${song.style}`;
  $("#tempo").value = song.bpm;
  $("#tempo-val").textContent = song.bpm;
  band.bpmOverride = null;
  band.loadSong(song);
  // a feel is chosen for the tune you are on, so it does not follow you to the next
  band.setFeel(null);
  $("#band-feel").value = "auto";
  renderRig();
  renderLeadsheet(song);
  renderSources(song);
  resetChordDisplay();
  collapseSleeve();
  if (wasPlaying) play();
}

// A citation should name the source, not the host it happens to sit on. The two
// corpora behind almost every tune in the book were rendering as "doi.org" and
// "github.com", which credits nobody and tells a reader nothing. Named where a
// name exists; a GitHub URL falls back to its repository; everything else to the
// hostname, which for a one-off blog post is the honest label anyway.
const SOURCE_NAMES = {
  "doi.org/10.5281/zenodo.3546040": "iRealPro Corpus of Jazz Standards",
  "github.com/Impro-Visor/Impro-Visor": "Impro-Visor",
  "jazzomat.hfm-weimar.de": "Weimar Jazz Database",
  "en.wikipedia.org": "Wikipedia",
};

function sourceLabel(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname.replace(/\/$/, "");
  return (
    SOURCE_NAMES[host + path] ??
    SOURCE_NAMES[host] ??
    (host === "github.com" ? path.split("/").filter(Boolean).pop() ?? host : host)
  );
}

function renderSources(song) {
  const box = $("#song-source");
  box.innerHTML = (song.source ?? [])
    .map((url) => `<a href="${url}" target="_blank" rel="noopener">${esc(sourceLabel(url))}</a>`)
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
      .map((c) => `<span class="bar-chord" data-beat="${c.beats}">${written(c.chord)}</span>`)
      .join("");
    grid.appendChild(cell);
  });
  highlightBar(lastBar); // a rebuild mid-tune must not lose where the band is
}

// The chart is 32 bars of equal weight, and you only ever read two lines of it:
// the one you are on and the one coming. The rest drops back rather than going
// away — it is still there to glance at, it just stops competing.
const LS_LINE = 4; // bars per line — matches .leadsheet's grid-template-columns

function highlightBar(barIdx) {
  const cells = $$(".bar");
  const lines = Math.ceil(cells.length / LS_LINE);
  const line = barIdx >= 0 ? Math.floor(barIdx / LS_LINE) : -1;
  // the form loops, so the line after the last one is the first
  const next = line < 0 ? -1 : (line + 1) % lines;
  cells.forEach((el) => {
    const b = Number(el.dataset.bar);
    const l = Math.floor(b / LS_LINE);
    el.classList.toggle("current", b === barIdx);
    // Stopped, the whole chart sits back: there is no line to be on, and a
    // sheet at full contrast reads as though the band were about to come in.
    el.classList.toggle("far", line < 0 || (l !== line && l !== next));
  });
}

function resetChordDisplay() {
  lastChord = null;
  lastBar = -1;
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
      // Each symbol is its own box so a crowded bar wraps between chords
      // rather than being cut off mid-symbol. data-n carries how many, so the
      // type can step down with the crowding instead of at one threshold.
      //
      // A lone symbol cannot wrap between anything, and the longest in the
      // book — AMaj7#11/Gb — is wider than a quarter of a phone at any size
      // worth reading. A slash chord may break after the slash, which is how
      // it is read anyway; data-long then takes the rest of the way.
      const cls = `sys-cell${bar.length > 1 ? " multi" : ""}${b === curBar ? " on" : ""}`;
      const syms = bar.map((x) => written(x.chord));
      const longest = Math.max(...syms.map((s) => s.length));
      const long = longest >= 8 ? ` data-long="${Math.min(longest, 11)}"` : "";
      html += `<span class="${cls}" data-n="${bar.length}"${long}>${syms
        .map((s) => `<span class="sys-ch">${s.replace("/", "/<wbr>")}</span>`)
        .join("")}</span>`;
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

// The tune's key, moved into the reading key alongside the chord symbol — a
// tenor reading up a tone needs the key it sees, not the one the trio hears.
function readingKeyContext() {
  const k = keyContext(state.currentSong);
  const by = shift();
  if (!k || !by) return k;
  const move = (pc) => ((((pc + by) % 12) + 12) % 12);
  return { ...k, tonicPc: move(k.tonicPc), pcs: k.pcs.map(move) };
}

function renderSoloStrip(info) {
  // parse the *written* symbol so the scale is spelled in the reading key —
  // "D dorian → D E F G A B C D" for a tenor over the trio's C minor
  const { label, notes, pcs } = soloScale(shift() ? parseChord(written(info.symbol)) : info, readingKeyContext());
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
    const symbols = ctx.chords.filter((c) => c.bar === bar).map((c) => written(c.symbol)).join(" ");
    const notes = inBar.length
      ? inBar
          .map((e) => {
            const c = classify(e.midi, chordAt(ctx.chords, e.beat, ctx.totalBeats));
            const strong = Math.abs(e.beat - Math.round(e.beat)) < 0.02 ? " downbeat" : "";
            const held = e.dur >= 1 ? " held" : "";
            // the degree is chord-relative and so survives transposition; only
            // the note name has to be rewritten into the reading key
            return `<span class="n ${c.role}${strong}${held}" data-beat="${e.beat.toFixed(3)}" title="${e.atom ?? ""}">${flatName(e.midi + shift())}<i>${c.deg}</i></span>`;
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
  chorusBar = -1;
  state.chorus = 1; // the first time round is chorus one, not chorus zero
  renderRig();
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
  resetRig();
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

// ------------------------------------------------------------------ the rig

// Trading fours is `setBreakBars(4)` under the name of the drill it already is:
// the band plays four bars and rests four, which with a human in the room is
// call and response. band.js works out who is sounding from the bar index, so
// the screen derives whose four it is from the same number rather than needing
// to be told — same formula, same bar, no engine change.

// The chorus count is derived too: the form has come round whenever the bar
// index stops climbing. band.js keeps a private `_chorus` for the arrangement
// and never publishes it.
//
// Deriving it costs one thing worth knowing: these downbeats arrive through
// Tone's draw callbacks, which a browser stops running when the tab is in the
// background. Audio keeps going, so a tune left playing behind another window
// undercounts, and "stop after four" will not fire. Nothing here can fix that —
// the count has to come off the transport, which means band.js publishing its
// `_chorus`, which is the engine half of this item.
let chorusBar = -1;

function renderChorus() {
  $("#chorus-n").textContent = state.chorus || "—";
}

function armPedal(sel, on) {
  $(sel).classList.toggle("on", !!on);
}

/** Repaint every pedal from state. Also the language hook: the value and
 *  sub-lines are written from here, so `applyStatic` cannot leave a pedal
 *  reading its placeholder after a language switch. */
function renderRig() {
  armPedal("#pedal-ramp", Number($("#tempo-ramp").value) > 0);
  armPedal("#pedal-count", state.stopAfter > 0);
  armPedal("#pedal-reading", readingKey !== "C");
  // both of these light when they are off their default, which is the rule the
  // rig runs on: you can see what is armed without opening anything
  armPedal("#pedal-feel", $("#band-feel").value !== "auto");
  armPedal("#pedal-comp", $("#comp-colour").value !== "warm");

  $("#boost-v").textContent = t(state.boost ? "boostOn" : "rampOff");
  $("#bass-boost").setAttribute("aria-pressed", String(state.boost));
  armPedal("#bass-boost", state.boost);

  renderChorus();
}

/** A bar has started. Returns false if the rig stopped the band on it, so the
 *  caller knows not to go on and light a bar that is no longer playing. */
function rigBar(bar) {
  if (bar <= chorusBar) {
    state.chorus++;
    // "four choruses then stop" means four complete times round, so the count
    // runs out on the downbeat that would have started a fifth
    if (state.stopAfter && state.chorus > state.stopAfter) {
      stop();
      return false;
    }
  }
  chorusBar = bar;
  renderRig();
  return true;
}

function resetRig() {
  chorusBar = -1;
  state.chorus = 0;
  renderRig();
}

// ------------------------------------------------------------------ band events

// what is on screen right now, so a reading-key change can repaint it without
// waiting for the next chord to come round
let lastChord = null;
let lastBar = -1;

function handleBeat(bar, beatInBar) {
  $$(".beat-light").forEach((el, i) => el.classList.toggle("on", i === beatInBar));
  if (bar < 0) return; // count-in: pulse the lights, touch nothing else
  if (beatInBar === 0) {
    if (!rigBar(bar)) return; // the rig ran the chorus count out on this downbeat
    lastBar = bar;
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
  lastChord = chord;
  $("#chord-next").textContent = t("next", { chord: written(chord.next.symbol) });
  const el = $("#chord-now");
  setChordText(el, written(chord.symbol));
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
$("#chromatic").addEventListener("change", (e) => band.setChromatic(e.target.checked));

// ---- the rig ----

$("#tempo-ramp").addEventListener("change", (e) => {
  band.setTempoRamp(Number(e.target.value));
  renderRig();
});

// Nothing is scheduled ahead: the count is checked on each downbeat, so
// changing this mid-tune takes effect on the next time round.
$("#stop-after").addEventListener("change", (e) => {
  state.stopAfter = Number(e.target.value);
  renderRig();
});

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

// ---- Real sample pack. There is no longer a switch: the sampled instruments
// are simply what the band sounds like, and a toggle offering a worse version
// of the same thing was only ever a question nobody wanted asked. The pill
// still reports progress on a first visit, and still offers a way out if the
// download is going badly.
function hqPill(n, total) {
  if (!band.hqOn) return; // bailed mid-load — leave the pill alone
  if (n === total) {
    setStatus("");
    return;
  }
  $("#status").innerHTML =
    `${t("status.loadingHq", { n, total })} <button id="hq-skip" class="linklike">${t("hqSkip")}</button>`;
  $("#hq-skip").onclick = () => {
    band.setHq(false);
    setStatus("");
  };
}

band.hqOn = true; // _setup kicks off the pack load at first play
band.cb.onHqProgress = hqPill;

// Bass+ is a pedal in the rig now rather than a switch in the mix: it is set up
// before you play, not ridden while you do.
$("#bass-boost").addEventListener("click", () => {
  state.boost = !state.boost;
  band.setBassBoost(state.boost);
  renderRig();
});

// Reading transposition. Nothing about the band changes — every surface that
// prints a chord symbol simply redraws in the new key. The chord card and the
// scale strip are driven by the band's chord callback, so they only refresh on
// the next chord; repaint them here from the last one so the change is visible
// the moment you make it rather than a bar later.
// How much the rhythm section reaches — remembered, like the reading key. Warm
// is the default and the fallback: a value left in storage from an older build,
// or anything the select does not offer, resolves back to it rather than
// quietly leaving the band somewhere nobody chose.
const COMP_LEVELS = ["plain", "warm"];
const savedComp = localStorage.getItem("woodshed-comp");
const compLevel = COMP_LEVELS.includes(savedComp) ? savedComp : "warm";
band.setCompColour(compLevel);
$("#comp-colour").value = compLevel;
$("#comp-colour").addEventListener("change", (e) => {
  band.setCompColour(e.target.value);
  localStorage.setItem("woodshed-comp", e.target.value);
  renderRig();
});

// How the band plays this tune, as opposed to what the tune is. Deliberately not
// remembered: a feel belongs to the tune in front of you, and coming back
// tomorrow to find every standard playing as a bossa would be a bug. It resets
// with the song for the same reason.
$("#band-feel").addEventListener("change", (e) => {
  band.setFeel(e.target.value);
  renderRig();
});

$("#reading-key").value = readingKey;
$("#reading-key").addEventListener("change", (e) => {
  readingKey = READING_KEYS[e.target.value] ? e.target.value : "C";
  localStorage.setItem("woodshed-reading", readingKey);
  const song = state.currentSong;
  if (song) {
    $("#song-detail").textContent =
      `${song.composer} — ${transposeKey(song.key, shift())} · ${song.form} · ${song.style}`;
    renderLeadsheet(song);
  }
  if (lastChord) handleChord(lastChord);
  if (soloLine) renderSoloLine(soloLine.events, soloLine);
  renderSystemView(lastBar);
  renderRig();
});

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
      const song = songAt(i);
      if (!song) return "";
      const num = isMineIdx(i) ? "★" : String(i + 1).padStart(2, "0");
      return `<li><button class="track${i === active ? " active" : ""}${isMineIdx(i) ? " mine" : ""}" data-i="${i}">
        <span class="track-num">${num}</span>
        <span class="track-title">${esc(song.title)}</span>
        <span class="track-meta">${esc(song.key ?? "—")} · ${song.bpm} bpm · ${esc(song.style)}</span>
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

/** Draw the chart from what is in the box right now. This is the job error
 *  messages used to do: a miscounted bar or an unreadable chord shows up as you
 *  make it, in the same grid the player uses, rather than after a button. */
function renderEditorSheet() {
  const ts = Number($("#ed-ts").value) || 4;
  const text = $("#ed-prog").value;
  // an empty field is not a mistake — it is the state you open in
  const blank = !text.trim();
  const { progression, errors, warnings } = blank
    ? { progression: [], errors: [], warnings: [] }
    : parseProgressionText(text, ts);
  // Flag by bar number, which every message carries, rather than by digging a
  // chord symbol out of the prose — "unknown quality \"zzz7\" in Bbzzz7" quotes
  // the quality, not the chord.
  const bad = new Set(
    [...errors, ...warnings].map((m) => Number((m.match(/bar (\d+)/) ?? [])[1])).filter(Boolean)
  );

  $("#ed-sheet").hidden = !progression.length;
  $("#ed-sheet").innerHTML = progression
    .map((bar, i) => `<span class="${bad.has(i + 1) ? "bad" : ""}">${bar.map((c) => esc(c.chord)).join(" ")}</span>`)
    .join("");

  // the verdict rides on the shape line rather than taking a line of its own —
  // "8 bars · 4/4 · reads" says everything the tick and the sentence did
  const clean = progression.length > 0 && !errors.length && !warnings.length;
  $("#ed-shape").innerHTML = progression.length
    ? esc(t("ed.shape", { bars: progression.length, ts: `${ts}/4` })) + (clean ? ` · <b>${esc(t("ed.reads"))}</b>` : "")
    : esc(t("ed.sheetEmpty"));

  // the status line only reports on the changes; save and delete write to it too
  if (!editorHeld) {
    const issues = [...errors, ...warnings];
    $("#ed-errors").classList.remove("ok");
    $("#ed-errors").innerHTML = issues.map(esc).join("<br>");
  }
  return { progression, errors, warnings };
}

// a save or delete message outranks the live parse line until the next keystroke
let editorHeld = false;

/* ---- the key is a list now, not a text box -----------------------------
 *
 * It used to be free text, back when the key was a caption. The soloist reads
 * it now: it decides whether the IV chord gets lydian and whether the V7 of a
 * minor tune gets its b9. "Bb Major" still parses, but "B flat" or "bbm" does
 * not, and the cost of that typo is the whole key context going quietly
 * missing — no error, just a line that plays the wrong notes over the right
 * chords. A list cannot be typed wrong.
 */
function fillKeyOptions() {
  const roots = Array.from({ length: 12 }, (_, pc) => flatName(pc));
  const group = (mode) =>
    `<optgroup label="${mode}">${roots.map((r) => `<option>${r} ${mode}</option>`).join("")}</optgroup>`;
  $("#ed-key").innerHTML = `<option value="—">—</option>${group("major")}${group("minor")}`;
}

/** Show a key, keeping anything the list does not offer rather than rewriting it. */
function setEditorKey(key) {
  const sel = $("#ed-key");
  const want = key && key !== "—" ? String(key).trim() : "—";
  // A tune saved before this list existed — or imported from someone else's
  // export — keeps whatever key it had. Snapping it to the nearest option
  // would edit a field the person never touched.
  if (![...sel.options].some((o) => o.value === want)) {
    sel.insertAdjacentHTML("afterbegin", `<option>${esc(want)}</option>`);
  }
  sel.value = want;
}

function buildEditorSong() {
  const ts = Number($("#ed-ts").value);
  const { progression, errors, warnings } = parseProgressionText($("#ed-prog").value, ts);
  // A title is no longer a gate. The shortest path from "I have some changes"
  // to hearing them should not run through naming the thing first.
  const title = $("#ed-title").value.trim() || randomTitle($("#ed-key").value);
  const song = {
    title,
    composer: "unknown",
    key: $("#ed-key").value || "—",
    bpm: Number($("#ed-bpm").value) || 120,
    style: $("#ed-style").value,
    timeSignature: ts,
    form: `${progression.length}-bar`,
    progression,
  };
  return { song, errors, warnings };
}

const ALERT_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function showEditorIssues(errors, warnings) {
  editorHeld = true;
  $("#ed-errors").classList.remove("ok");
  $("#ed-errors").innerHTML = [
    ...errors.map(esc),
    ...warnings.map((w) => `${ALERT_ICON} ${esc(w)}`),
  ].join("<br>");
  // warnings block too — an unrecognized chord quality would play as the
  // wrong chord, so don't let it be previewed or exported
  return errors.length > 0 || warnings.length > 0;
}

/** Same line, different meaning: green when something worked. It shares the
 *  slot with the error line, so it has to stop looking like one. */
function editorSays(msg) {
  editorHeld = true;
  $("#ed-errors").classList.add("ok");
  $("#ed-errors").innerHTML = `${CHECK_ICON} ${esc(msg)}`;
}

for (const id of ["#ed-prog", "#ed-ts"]) {
  $(id).addEventListener("input", () => {
    editorHeld = false;
    renderEditorSheet();
  });
}

// Locking the page by hiding body overflow leaves iOS free to scroll the page
// behind a fixed overlay when a field takes focus, and the sheet then stops
// answering to touch until the field blurs. Pinning the body at its current
// offset instead keeps the position and gives the sheet the only scroll.
let lockedAt = 0;

function lockPage() {
  lockedAt = window.scrollY;
  document.body.classList.add("modal-open");
  document.body.style.top = `-${lockedAt}px`;
}

function unlockPage() {
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, lockedAt);
}

function openEditor(song) {
  editing = null;
  editorHeld = false;
  $("#ed-errors").textContent = "";
  $("#ed-errors").classList.remove("ok");
  if (song) fillEditor(song);
  else syncEditorButtons();
  renderEditorSheet();
  $("#editor-overlay").hidden = false;
  lockPage();
  // Only on a roomy screen, and the changes field rather than the title: on a
  // phone this would throw the keyboard up before you had decided anything,
  // and it aims at the wrong box — the changes are what you came to type.
  if (window.matchMedia("(min-width: 901px)").matches) $("#ed-prog").focus();
}

function closeEditor() {
  $("#editor-overlay").hidden = true;
  unlockPage();
}

$("#open-editor").addEventListener("click", () => openEditor());
$("#add-tune-quick").addEventListener("click", () => openEditor());
let armedDelete = null;

function disarmDelete() {
  clearTimeout(armedDelete);
  armedDelete = null;
  $("#delete-tune").classList.remove("armed");
  $("#delete-tune-label").textContent = t("deleteTune");
}

$("#delete-tune").addEventListener("click", () => {
  if (!state.mineId) return;
  if (!armedDelete) {
    // arm rather than confirm: a dialog for one row is heavier than the act
    $("#delete-tune").classList.add("armed");
    $("#delete-tune-label").textContent = t("deleteSure");
    armedDelete = setTimeout(disarmDelete, 3500);
    return;
  }
  disarmDelete();
  const gone = state.mineId;
  if (state.playing) stop();
  removeMine(gone);
  refreshMine();
  state.mineId = null;
  $("#delete-tune").hidden = true;
  $("#edit-preview").hidden = true;
  selectSong(0); // land somewhere real rather than on a tune that is gone
});

$("#edit-preview").addEventListener("click", () => {
  // it edits the tune on screen: one you saved, or the unsaved preview
  const mineNow = state.mineId ? mine.find((t) => t.id === state.mineId) : null;
  openEditor(mineNow ?? state.customSong ?? undefined);
});
$("#ed-close").addEventListener("click", closeEditor);
$("#ed-grab").addEventListener("click", closeEditor);
$("#ed-grab").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    closeEditor();
  }
});
// drag the handle down to dismiss, the way a sheet is expected to behave
$("#ed-grab").addEventListener("pointerdown", (e) => {
  const sheet = $(".editor");
  const from = e.clientY;
  let dy = 0;
  e.target.setPointerCapture?.(e.pointerId);
  const move = (ev) => {
    dy = Math.max(0, ev.clientY - from);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = (ev) => {
    sheet.style.transform = "";
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    if (ev.type === "pointerup" && dy > 90) closeEditor();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  // the browser cancels the pointer the moment it decides a touch is a scroll;
  // without this the move handler stays bound and every later drag moves the
  // sheet instead of scrolling it
  document.addEventListener("pointercancel", end);
});
$("#editor-overlay").addEventListener("click", (e) => {
  if (e.target === $("#editor-overlay")) closeEditor();
});

// A dialog you can open with a key you can leave with a key. The close button
// went to an icon in the corner, and on a phone the backdrop is a thin strip
// above a near-full-height sheet, so this stopped being optional.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#editor-overlay").hidden) closeEditor();
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
  setEditorKey(gen.key);
  $("#ed-style").value = gen.style;
  $("#ed-bpm").value = gen.bpm;
  if (!$("#ed-title").value.trim()) $("#ed-title").value = `Dice in ${gen.key}`;
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

function fillEditor(song) {
  const ts = song.timeSignature === 3 ? 3 : 4;
  $("#ed-title").value = song.title ?? "";
  setEditorKey(song.key);
  $("#ed-bpm").value = song.bpm ?? 120;
  $("#ed-style").value = [...$("#ed-style").options].some((o) => o.value === song.style) ? song.style : "swing";
  $("#ed-ts").value = String(ts);
  $("#ed-prog").value = progressionToText(song.progression, ts);
  editing = song.id ?? null;
  syncEditorButtons();
  editorHeld = false;
  renderEditorSheet();
}

// which saved tune the editor is currently standing in for, if any
let editing = null;

function syncEditorButtons() {
  $("#ed-delete").hidden = !editing;
  $("#ed-save-label").textContent = editing ? t("ed.update") : t("ed.save");
}

/** Re-read the store and put every view that shows tunes back in step. */
function refreshMine() {
  mine = loadMine();
  refreshLetterSheet();
  updateListView();
}

$("#ed-save").addEventListener("click", () => {
  // One button, because saving and hearing it are the same intention. Previewing
  // without saving only ever produced a tune you then lost.
  const { song, errors, warnings } = buildEditorSong();
  if (showEditorIssues(errors, warnings)) return;
  const stored = saveMine(song, editing);
  editing = stored.id;
  syncEditorButtons();
  $("#ed-title").value = stored.title; // a generated name becomes visible
  refreshMine();
  closeEditor();

  // it is a real tune now, so select it the way the list would rather than
  // holding it as an unsaved preview
  const at = mine.findIndex((t) => t.id === stored.id);
  if (at < 0) return;
  const wasPlaying = state.playing;
  selectSong(MINE_BASE + at);
  if (!wasPlaying) play();
});

$("#ed-delete").addEventListener("click", () => {
  if (!editing) return;
  removeMine(editing);
  editing = null;
  syncEditorButtons();
  refreshMine();
  editorSays(t("ed.deleted"));
});

$("#ed-export-all").addEventListener("click", () => {
  const blob = new Blob([exportMine()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `woodshed-tunes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#ed-import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const { added, skipped, error } = importMine(await file.text());
  e.target.value = "";
  if (error || !added) {
    $("#ed-errors").classList.remove("ok");
    $("#ed-errors").textContent = t("err.noTunes");
    return;
  }
  refreshMine();
  editorSays(t("ed.imported", { n: added, skipped }));
});

const CHECK_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;


// ---- iOS: put the viewport back after the keyboard goes.
//
// Two separate bugs wear the same face. The first is the auto-zoom on any field
// under 16px, which is fixed in the stylesheet. The second is WebKit's own: on
// dismissing the keyboard it does not always restore visualViewport.height or
// offsetTop, so the page stays scaled and shifted and has to be pinched back by
// hand. It is worst on pages with position: fixed chrome, which this one is all
// the way down — a fixed transport, a fixed overlay, and a body that pins
// itself while the editor is open.
//
// WebKit will not re-measure on its own, but it will if something forces a
// reflow. So: notice the keyboard leaving, then make it look again.
{
  const vv = window.visualViewport;
  const touch = matchMedia("(hover: none)").matches;
  if (vv && touch) {
    let keyboardUp = false;

    const remeasure = () => {
      const el = document.documentElement;
      const was = el.style.minHeight;
      el.style.minHeight = `${vv.height + 1}px`;
      void el.offsetHeight; // synchronous reflow — the point of the exercise
      el.style.minHeight = was;
      // and land the scroll where it belongs rather than wherever the keyboard
      // left it. The editor pins the body, so respect that offset if it is set.
      const pinned = document.body.classList.contains("modal-open");
      window.scrollTo(0, pinned ? 0 : window.scrollY);
    };

    const settle = () => {
      // the keyboard is down again once the visual viewport is back to roughly
      // the layout viewport's height
      const down = vv.height >= window.innerHeight - 40;
      if (!down) {
        keyboardUp = true;
        return;
      }
      if (!keyboardUp) return;
      keyboardUp = false;
      // one frame late, so WebKit has finished its own animation first
      requestAnimationFrame(remeasure);
    };

    vv.addEventListener("resize", settle);
    // blur fires even when the viewport events do not, on the "Done" button
    document.addEventListener(
      "focusout",
      (e) => {
        if (!e.target.matches?.("input, textarea, select")) return;
        setTimeout(settle, 120);
      },
      true
    );
  }
}

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
  renderRig(); // the pedal values are written from state, not from data-i18n
});

// ------------------------------------------------------------------ boot

applyStatic();
renderLangToggle();

fillKeyOptions();
renderTracklist();
selectSong(0);
updateListView();
setMode("session");
renderRig();

// a phone speaker or a pair of earbuds loses the bass fundamental, so the
// boost starts engaged there — off everywhere else, and the switch overrides
// either way. Coarse pointer catches a tablet held sideways, which is wider
// than the mobile breakpoint but still played through a built-in speaker.
if (isMobile() || window.matchMedia("(pointer: coarse)").matches) {
  state.boost = true;
  band.setBassBoost(true);
  renderRig();
}
