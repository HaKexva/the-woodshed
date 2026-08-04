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

export const REF = {
  notesPerBar: [4, 9, "4–9 typical for bebop-era solos"],
  chordToneOnDownbeat: [0.55, 1, "≥55% — strong beats carry chord tones"],
  restRatio: [0.12, 0.35, "12–35% — real players breathe"],
  stepwise: [0.55, 0.85, "55–85% of intervals are ≤2 semitones"],
  phraseBars: [1.5, 4.5, "1.5–4.5 bars per phrase"],
  rangeSemitones: [12, 26, "an octave to just over two"],
  motifRecurrence: [0.1, 1, "≥10% of phrases echo earlier material"],
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

// A phrase echoes an earlier one when its opening intervals match, transposition
// allowed — that is the shape a listener hears as development rather than novelty.
function motifRate(phrases) {
  const shapes = phrases.map((p) =>
    p.slice(0, 5).map((e, i, a) => (i ? e.midi - a[i - 1].midi : 0)).slice(1).join(",")
  );
  let echoes = 0;
  for (let i = 1; i < shapes.length; i++) {
    if (shapes[i].split(",").length >= 3 && shapes.slice(0, i).includes(shapes[i])) echoes++;
  }
  return shapes.length ? echoes / shapes.length : 0;
}

function roleMix(events, chords, totalBeats) {
  const counts = { chordtone: 0, tension: 0, approach: 0 };
  for (const e of events) counts[classify(e.midi, chordAt(chords, e.beat, totalBeats)).role]++;
  const n = events.length || 1;
  return { chordtone: counts.chordtone / n, tension: counts.tension / n, approach: counts.approach / n };
}
