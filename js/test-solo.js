// test-solo.js — Inspire-mode lab. Not linked from the app; open /test-solo.html.
//
// Two jobs: play a generated solo, and show what it is actually made of.
// The annotated view colors every note by harmonic function; the metrics panel
// measures the line against reference values drawn from jazz-corpus research so
// a change to the generator can be judged by more than vibes.

import { SONGS } from "./songs.js";
import { Band, SOLO_STYLES } from "./band.js";
import { flatName } from "./theory.js";
import { analyze, classify, chordAt, REF } from "./solo-metrics.js";

const $ = (s) => document.querySelector(s);

const band = new Band({
  onProgress: (n, total) => ($("#status").textContent = `loading instruments… ${n}/${total}`),
  onReady: () => ($("#status").textContent = ""),
  onHqProgress: (n, total) => ($("#status").textContent = n === total ? "" : `loading Real pack… ${n}/${total}`),
});
band.hqOn = true; // Real pack for the backing band; setup() kicks off the load

const PICKS = ["Autumn Leaves", "Take the A Train", "Blue Bossa", "So What", "Blue Monk", "Misty", "St. Thomas", "All The Things You Are"];
const songs = PICKS.map((t) => SONGS.find((s) => s.title === t)).filter(Boolean);
$("#song").innerHTML = songs.map((s, i) => `<option value="${i}">${s.title} (${s.style} · ${s.bpm})</option>`).join("");
$("#style").innerHTML = Object.keys(SOLO_STYLES).map((k) => `<option value="${k}">${k}</option>`).join("");
$("#style").value = band.soloStyleName;

band.loadSong(songs[0]);
band.setSolo(true);

let playing = false;
const song = () => songs[Number($("#song").value)];

// ---------------------------------------------------------------- generation

// The band regenerates its solo every chorus. To make the annotated view an
// honest transcript rather than a lookalike sample, the lab intercepts that call
// and hands back the pinned line instead — same notes, every chorus.
const improvise = Band.prototype._soloEvents;
let pinned = null;

band._soloEvents = function (...args) {
  if (pinned && $("#pin").checked) return pinned.map((e) => ({ ...e }));
  return improvise.apply(this, args);
};

/** Improvise one chorus without scheduling it. Always a fresh line. */
function generate() {
  const s = song();
  const bpb = s.beatsPerBar ?? 4;
  const chords = band._flatten(s, bpb);
  const totalBeats = s.progression.length * bpb;
  const events = improvise.call(band, chords, totalBeats, s.style, band.soloRange.lo, band.soloRange.hi, bpb);
  events.sort((a, b) => a.beat - b.beat);
  return { events, chords, totalBeats, bpb, style: s.style };
}

/** Generate, show it, and play it. */
async function generateAndShow({ autoplay = false } = {}) {
  const gen = generate();
  pinned = gen.events;
  renderScore(gen);
  renderMetrics(analyze(gen));
  if (playing) band.newTake();
  else if (autoplay) await play();
}

// ---------------------------------------------------------------- rendering

function renderMetrics(m) {
  const pct = (x) => `${Math.round(x * 100)}<small>%</small>`;
  const num = (x, d = 1) => x.toFixed(d);
  const card = (name, valHtml, key, raw, extra = "") => {
    const [lo, hi, note] = REF[key] ?? [];
    const warn = key && (raw < lo || raw > hi) ? " warn" : "";
    return `<div class="metric${warn}">
      <p class="metric-name">${name}</p>
      <p class="metric-val">${valHtml}</p>
      <p class="metric-ref">${note ?? ""}</p>${extra}</div>`;
  };
  $("#metrics").innerHTML = [
    card("notes / bar", num(m.notesPerBar), "notesPerBar", m.notesPerBar),
    card("chord tone on downbeat", pct(m.chordToneOnDownbeat), "chordToneOnDownbeat", m.chordToneOnDownbeat),
    card("rest ratio", pct(m.restRatio), "restRatio", m.restRatio),
    card("stepwise motion", pct(m.stepwise), "stepwise", m.stepwise),
    card("phrase length", `${num(m.phraseBars)}<small> bars</small>`, "phraseBars", m.phraseBars,
      histoHtml(m.phraseHisto, (i) => i)),
    card("range", `${m.rangeSemitones}<small> st</small>`, "rangeSemitones", m.rangeSemitones),
    card("motif recurrence", pct(m.motifRecurrence), "motifRecurrence", m.motifRecurrence),
    card("phrases starting off the beat", pct(m.offbeatStarts), null, 0,
      `<p class="metric-ref">high is idiomatic — real solos rarely enter on beat 1</p>`),
    card("phrases ending on a strong beat", pct(m.strongEnds), null, 0,
      `<p class="metric-ref">low means phrases stop rather than land</p>`),
    card("note roles",
      `<span style="color:var(--green)">${Math.round(m.roleMix.chordtone * 100)}</span> /
       <span style="color:var(--blue)">${Math.round(m.roleMix.tension * 100)}</span> /
       <span style="color:var(--amber)">${Math.round(m.roleMix.approach * 100)}</span>`,
      "chordTone", m.roleMix.chordtone,
      `<p class="metric-ref">chord tone / tension / chromatic · human corpora ≈ 56 / 34 / 10</p>`),
    card("thirds", pct(m.thirds), "thirds", m.thirds,
      `<p class="metric-ref">the arpeggio figure's share — WJD 26.5%</p>`),
    card("direction run", num(m.dirRun, 2), "dirRun", m.dirRun,
      `<p class="metric-ref">intervals before the line turns — a walk turns constantly</p>`),
    card("lands on the change", pct(m.landOnChange), "landOnChange", m.landOnChange,
      `<p class="metric-ref">counted only over changes it plays through</p>`),
    card("interval spread", `${m.phrases}<small> phrases</small>`, null, 0,
      histoHtml(m.intervalHisto, (i) => (i % 3 === 0 ? i : ""))),
  ].join("");
}

function histoHtml(h, label) {
  const max = Math.max(1, ...h);
  return `<div class="histo">${h.map((v) => `<i style="height:${(v / max) * 100}%"></i>`).join("")}</div>
    <div class="histo-labels">${h.map((_, i) => `<span>${label(i)}</span>`).join("")}</div>`;
}

function renderScore({ events, chords, totalBeats, bpb }) {
  const bars = totalBeats / bpb;
  const html = [];
  for (let bar = 0; bar < bars; bar++) {
    const inBar = events.filter((e) => e.beat >= bar * bpb && e.beat < (bar + 1) * bpb);
    const chordsHere = chords.filter((c) => c.bar === bar).map((c) => c.symbol).join(" ");
    const notes = inBar.length
      ? inBar.map((e) => {
          const c = classify(e.midi, chordAt(chords, e.beat, totalBeats));
          const down = Math.abs(e.beat - Math.round(e.beat)) < 0.02 ? " downbeat" : "";
          return `<span class="n ${c.role}${down}" title="beat ${(e.beat % bpb + 1).toFixed(2)} · midi ${e.midi} · vel ${e.vel}">${flatName(e.midi % 12)}<span class="deg">${c.deg}</span></span>`;
        }).join("")
      : `<span class="rest">— rest —</span>`;
    html.push(`<div class="bar" data-bar="${bar}">
      <div class="bar-head"><span class="bar-chord">${chordsHere || "&nbsp;"}</span><span class="bar-num">${bar + 1}</span></div>
      <div class="bar-notes">${notes}</div>
    </div>`);
  }
  $("#score").innerHTML = html.join("");
}

// ---------------------------------------------------------------- controls

async function play() {
  // the soloist is lazy-loaded and silently no-ops until it exists, so the lab
  // has to ask for it the way the app's inspire mode does
  if (!band.soloInst) {
    $("#status").textContent = band.ctx ? "loading solo piano…" : "loading instruments…";
    await band.loadSoloist();
    $("#status").textContent = "";
  }
  await band.play();
  playing = true;
  $("#play").textContent = "■ stop";
}

function stop() {
  band.stop();
  playing = false;
  $("#play").textContent = "▶ play";
}

$("#play").addEventListener("click", () => (playing ? stop() : play()));
$("#generate").addEventListener("click", () => generateAndShow({ autoplay: true }));

$("#pin").addEventListener("change", () => {
  if (playing) band.newTake();
});

$("#hq").addEventListener("change", async (e) => {
  if (!band.ctx) { band.hqOn = e.target.checked; return; } // applied when setup runs
  await band.setHq(e.target.checked);
  e.target.checked = band.hqOn;
});

$("#song").addEventListener("change", () => {
  const wasPlaying = playing;
  if (wasPlaying) stop();
  band.loadSong(song());
  generateAndShow();
  if (wasPlaying) play();
});

$("#style").addEventListener("change", (e) => {
  band.setSoloStyle(e.target.value);
  generateAndShow();
});

for (const [id, key] of [["crowd", "crowd"], ["phrase", "phrase"]]) {
  $(`#${id}`).addEventListener("input", (e) => {
    $(`#${id}-val`).textContent = e.target.value;
    band.setSoloFeel(key, Number(e.target.value) / 100);
    generateAndShow();
  });
}

$("#voicing").addEventListener("change", (e) => {
  band.setSoloVoicing(e.target.value);
  generateAndShow();
});

document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT"].includes(e.target.tagName)) return;
  if (e.code === "Space") { e.preventDefault(); playing ? stop() : play(); }
  if (e.key === "g") generateAndShow({ autoplay: true });
});

window.band = band;
generateAndShow();
