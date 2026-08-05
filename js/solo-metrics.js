// solo-metrics.js — describes a generated solo line in numbers.
//
// Pure analysis, no DOM and no audio, so the lab page and a headless script can
// both use it. The reference bands come from corpus studies of recorded solos;
// they are targets to sit near, not rules — a line that matches all of them can
// still be dull, and a great line can sit outside one or two.

import { soloScaleSteps } from "./theory.js";

const DEGREE = { 0: "1", 1: "b9", 2: "9", 3: "b3", 4: "3", 5: "11", 6: "#11", 7: "5", 8: "b13", 9: "13", 10: "b7", 11: "7" };

function degreeName(iv, isChordTone) {
  const d = DEGREE[iv] ?? String(iv);
  return isChordTone ? d.replace("11", "4").replace("13", "6") : d;
}

/** The harmonic role a pitch plays over a chord — the label a teacher would use. */
export function classify(midi, chord) {
  const iv = (midi - chord.info.rootPc + 120) % 12;
  const chordTones = new Set(chord.info.intervals.map((x) => x % 12));
  const scale = new Set(soloScaleSteps(chord.info).map((x) => x % 12));
  if (chordTones.has(iv)) return { role: "chordtone", deg: degreeName(iv, true) };
  if (scale.has(iv)) return { role: "tension", deg: degreeName(iv, false) };
  return { role: "approach", deg: degreeName(iv, false) };
}

export function chordAt(chords, beat, totalBeats) {
  const b = ((beat % totalBeats) + totalBeats) % totalBeats;
  let best = chords[0];
  for (const c of chords) if (c.startBeat <= b + 1e-6) best = c;
  return best;
}

// Where a band has a published human baseline it is cited; see
// research/evaluation-and-metrics.md. Several are targets to sit *near* rather
// than maximize — corpus studies find that scoring better than a human on
// consonance reads as machine, not as skill.
export const REF = {
  notesPerBar: [4, 9, "4–9 typical for bebop-era solos"],
  chordMatch: [0.48, 0.58, "48–58% of sounding time — 8 bebop saxophonists"],
  chordTone: [0.5, 0.58, "50–58% of notes; higher reads as machine, not skill"],
  chordToneOnDownbeat: [0.55, 1, "≥55% — strong beats carry chord tones"],
  restRatio: [0.12, 0.35, "12–35% — real players breathe"],
  stepwise: [0.55, 0.85, "55–85% of intervals are ≤2 semitones"],
  halfStepRate: [0.25, 0.35, "25–35% of moving intervals — the bebop marker"],
  meanInterval: [2.3, 2.8, "2.3–2.8 semitones"],
  bigLeaps: [0, 0.005, "≤0.5% — real lines almost never leap past an octave"],
  repeatedNotes: [0, 0.06, "≤6% repeated pitches"],
  phraseBars: [1, 3, "most phrases run 1–3 bars"],
  phraseNotes: [8, 18, "8–18 notes — bebop phrases are eighth-note runs"],
  endChordTone: [0.6, 1, "≥60% of phrases come to rest on a chord tone"],
  rangeSemitones: [12, 26, "an octave to just over two"],
  motifRecurrence: [0.1, 1, "≥10% of phrases echo earlier material"],
  // Measured from the 456 solos of the Weimar Jazz Database rather than quoted
  // from a paper — see research/wjd-mine.py and js/solo-vocab.js. These are
  // corpus-wide; per-player figures live in solo-vocab.js.
  thirds: [0.22, 0.31, "26.5% of intervals in the WJD — the arpeggio's share"],
  dirRun: [1.8, 2.4, "2.04 intervals per direction in the WJD"],
  landOnChange: [0.6, 1, "arrivals: land on the change when playing through it"],
};

/** Split a line into phrases — a gap of a beat or more ends one. */
export function phrasesOf(events) {
  if (!events.length) return [];
  const phrases = [];
  let cur = [events[0]];
  for (let i = 1; i < events.length; i++) {
    if (events[i].beat - (events[i - 1].beat + events[i - 1].dur) >= 1) {
      phrases.push(cur);
      cur = [];
    }
    cur.push(events[i]);
  }
  if (cur.length) phrases.push(cur);
  return phrases;
}

export function analyze({ events, chords, totalBeats, bpb }) {
  const bars = totalBeats / bpb;
  const m = { notes: events.length, notesPerBar: events.length / bars };

  // chord tones on downbeats: the strongest single marker of "inside" playing
  const downbeats = events.filter((e) => Math.abs(e.beat - Math.round(e.beat)) < 0.02);
  const ctDown = downbeats.filter((e) => classify(e.midi, chordAt(chords, e.beat, totalBeats)).role === "chordtone");
  m.chordToneOnDownbeat = downbeats.length ? ctDown.length / downbeats.length : 0;

  // real silence only: the sub-quarter-beat gaps between notes are articulation
  // (staccato clipping), not rests, and counting them roughly doubles the figure
  let rested = 0;
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].beat - (events[i - 1].beat + events[i - 1].dur);
    if (gap >= 0.5) rested += gap;
  }
  if (events.length) {
    rested += events[0].beat; // silence before the first note
    const last = events[events.length - 1];
    rested += Math.max(0, totalBeats - (last.beat + last.dur));
  }
  m.restRatio = Math.min(1, rested / totalBeats);

  const ivs = [];
  for (let i = 1; i < events.length; i++) {
    if (events[i].beat - events[i - 1].beat > bpb) continue; // across a rest — not a melodic step
    ivs.push(Math.abs(events[i].midi - events[i - 1].midi));
  }
  m.stepwise = ivs.length ? ivs.filter((x) => x <= 2).length / ivs.length : 0;
  m.leapRate = ivs.length ? ivs.filter((x) => x >= 5).length / ivs.length : 0;
  m.intervalHisto = histo(ivs, 13);
  // Thirds are the arpeggio's fingerprint, and the one interval class the
  // generator was chronically short of: the corpus plays 26.5% and a line built
  // by stepping around a scale plays half that.
  m.thirds = ivs.length ? ivs.filter((x) => x >= 3 && x <= 4).length / ivs.length : 0;

  // How far the line carries on in one direction before turning. A random walk
  // turns constantly; a figure — a scale run, an arpeggio — does not, so this
  // is the cheapest single read on whether the line is made of figures.
  const runs = [];
  let run = 1;
  let prevSign = 0;
  for (let i = 1; i < events.length; i++) {
    if (events[i].beat - events[i - 1].beat > bpb) continue;
    const sign = Math.sign(events[i].midi - events[i - 1].midi);
    if (sign && sign === prevSign) run++;
    else {
      if (prevSign) runs.push(run);
      run = 1;
    }
    if (sign) prevSign = sign;
  }
  if (prevSign) runs.push(run);
  m.dirRun = runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : 0;

  // Does the line arrive? Counted only over changes it actually plays through —
  // a chord that turns over while the player is resting cannot be landed on.
  {
    const onset = new Set(events.map((e) => e.beat.toFixed(3)));
    // One sorted pass. Scanning the whole event list per chord is quadratic,
    // and this runs over hundreds of lines at a time in the metric sweeps.
    const beats = events.map((e) => e.beat).sort((a, b) => a - b);
    const firstAtOrAfter = (x) => {
      let lo = 0;
      let hi = beats.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] < x) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    let played = 0;
    let landed = 0;
    for (let i = 0; i < chords.length; i++) {
      const at = chords[i].startBeat;
      if (i > 0 && chords[i - 1].startBeat === at) continue;
      const k = firstAtOrAfter(at);
      const before = k > 0 && beats[k - 1] > at - 1.6;
      const after = k < beats.length && beats[k] < at + 1.6;
      if (!before || !after) continue;
      played++;
      if (onset.has(at.toFixed(3))) landed++;
    }
    m.landOnChange = played ? landed / played : 0;
  }

  // Bebop's signature is not that it is stepwise — folk song is more stepwise —
  // but that its steps are half steps roughly a third of the time.
  const moving = ivs.filter((x) => x > 0);
  m.halfStepRate = moving.length ? moving.filter((x) => x === 1).length / moving.length : 0;
  m.meanInterval = moving.length ? moving.reduce((a, b) => a + b, 0) / moving.length : 0;
  m.bigLeaps = ivs.length ? ivs.filter((x) => x > 12).length / ivs.length : 0;
  m.repeatedNotes = ivs.length ? ivs.filter((x) => x === 0).length / ivs.length : 0;

  // duration-weighted share of sounding time spent on chord tones — the measure
  // the bebop-saxophonist baselines were computed with
  let chordTime = 0, totalTime = 0;
  for (const e of events) {
    const d = Math.min(e.dur, 4);
    totalTime += d;
    if (classify(e.midi, chordAt(chords, e.beat, totalBeats)).role === "chordtone") chordTime += d;
  }
  m.chordMatch = totalTime ? chordTime / totalTime : 0;

  const phrases = phrasesOf(events);
  const span = (p) => p[p.length - 1].beat + p[p.length - 1].dur - p[0].beat;
  m.phrases = phrases.length;
  m.phraseBars = phrases.length ? phrases.reduce((n, p) => n + span(p), 0) / phrases.length / bpb : 0;
  m.phraseHisto = histo(phrases.map((p) => Math.round(span(p) / bpb)), 9);

  // recorded solos overwhelmingly start phrases off the beat
  m.offbeatStarts = phrases.length
    ? phrases.filter((p) => Math.abs(p[0].beat - Math.round(p[0].beat)) > 0.02).length / phrases.length
    : 0;
  // …and land phrase ends on a strong beat
  m.strongEnds = phrases.length
    ? phrases.filter((p) => {
        const end = (p[p.length - 1].beat % bpb + bpb) % bpb;
        return Math.abs(end - Math.round(end)) < 0.02 && Math.round(end) % 2 === 0;
      }).length / phrases.length
    : 0;

  m.phraseNotes = phrases.length ? events.length / phrases.length : 0;

  // where a phrase comes to rest: real solos land on chord tones, and on the
  // root or 5th about 40% of the time
  const ends = phrases.map((p) => p[p.length - 1]);
  m.endChordTone = ends.length
    ? ends.filter((e) => classify(e.midi, chordAt(chords, e.beat, totalBeats)).role === "chordtone").length / ends.length
    : 0;

  // jazz phrases descend far more often than they arch — the opposite of the
  // folksong "melodic arch", so an arch-shaped contour is the wrong target
  // Classify by comparing the mean pitch of the phrase's three thirds. Judging
  // by the single highest note instead calls almost any wandering line an arch.
  const shape = (p) => {
    if (p.length < 4) return null;
    const third = Math.max(1, Math.floor(p.length / 3));
    const mean = (a) => a.reduce((n, e) => n + e.midi, 0) / a.length;
    const head = mean(p.slice(0, third));
    const mid = mean(p.slice(third, p.length - third));
    const tail = mean(p.slice(p.length - third));
    if (mid > head + 0.75 && mid > tail + 0.75) return "convex";
    if (mid < head - 0.75 && mid < tail - 0.75) return "concave";
    if (tail < head - 1) return "descending";
    if (tail > head + 1) return "ascending";
    return "flat";
  };
  const shapes = phrases.map(shape).filter(Boolean);
  const share = (k) => (shapes.length ? shapes.filter((s) => s === k).length / shapes.length : 0);
  m.contour = { descending: share("descending"), ascending: share("ascending"), convex: share("convex"), concave: share("concave") };

  const midis = events.map((e) => e.midi);
  m.rangeSemitones = midis.length ? Math.max(...midis) - Math.min(...midis) : 0;
  m.motifRecurrence = motifRate(phrases);
  m.roleMix = roleMix(events, chords, totalBeats);
  return m;
}

function histo(values, buckets) {
  const h = new Array(buckets).fill(0);
  for (const v of values) h[Math.min(buckets - 1, Math.max(0, Math.round(v)))]++;
  return h;
}

// A phrase echoes an earlier one when its opening contour matches, transposition
// allowed. Matching is deliberately fuzzy: re-rooting a motif on a new chord
// snaps notes into a different scale, so intervals shift by a semitone or two
// while a listener still plainly hears the same idea. Requiring exact equality
// measures the arithmetic, not the music.
function motifRate(phrases) {
  const shapes = phrases.map((p) => p.slice(0, 5).map((e, i, a) => (i ? e.midi - a[i - 1].midi : 0)).slice(1));
  const echoes = (a, b) => {
    const n = Math.min(a.length, b.length);
    if (n < 3) return false;
    let drift = 0, sameDir = 0;
    for (let i = 0; i < n; i++) {
      drift += Math.abs(a[i] - b[i]);
      if (Math.sign(a[i]) === Math.sign(b[i])) sameDir++;
    }
    return drift <= n && sameDir >= n - 1;
  };
  let hits = 0;
  for (let i = 1; i < shapes.length; i++) {
    if (shapes[i].length >= 3 && shapes.slice(0, i).some((prev) => echoes(shapes[i], prev))) hits++;
  }
  return shapes.length ? hits / shapes.length : 0;
}

function roleMix(events, chords, totalBeats) {
  const counts = { chordtone: 0, tension: 0, approach: 0 };
  for (const e of events) counts[classify(e.midi, chordAt(chords, e.beat, totalBeats)).role]++;
  const n = events.length || 1;
  return { chordtone: counts.chordtone / n, tension: counts.tension / n, approach: counts.approach / n };
}
