// theory.js — chord symbol parsing and voicing helpers.
// Works in MIDI note numbers throughout. No dependencies.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Interval sets (semitones from root). Extensions may exceed 12 —
// octave placement happens at voicing time.
const QUALITIES = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  "6": [0, 4, 7, 9],
  "69": [0, 4, 7, 9, 14],
  add9: [0, 4, 7, 14],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  "maj7#11": [0, 4, 7, 11, 18],
  m: [0, 3, 7],
  m6: [0, 3, 7, 9],
  m69: [0, 3, 7, 9, 14],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 17],
  mmaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6, 9],
  dim7: [0, 3, 6, 9],
  "7": [0, 4, 7, 10],
  "9": [0, 4, 7, 10, 14],
  "11": [0, 5, 7, 10, 14],
  "13": [0, 4, 7, 10, 14, 21],
  "7b9": [0, 4, 7, 10, 13],
  "7#9": [0, 4, 7, 10, 15],
  "7#11": [0, 4, 7, 10, 18],
  "7b13": [0, 4, 10, 20],
  "7b5": [0, 4, 6, 10],
  "7alt": [0, 4, 10, 13, 20],
  aug: [0, 4, 8],
  "7#5": [0, 4, 8, 10],
  "9#5": [0, 4, 8, 10, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
  "9sus4": [0, 5, 7, 10, 14],
  "13sus4": [0, 5, 7, 10, 14, 21],
  // altered dominants and colour chords the standards repertoire actually uses
  "7b9#5": [0, 4, 8, 10, 13],
  "7b9b5": [0, 4, 6, 10, 13],
  "7#9#5": [0, 4, 8, 10, 15],
  "7#9b5": [0, 4, 6, 10, 15],
  "7b9#11": [0, 4, 7, 10, 13, 18],
  "7#9#11": [0, 4, 7, 10, 15, 18],
  "7b9sus": [0, 5, 7, 10, 13],
  "7b9sus4": [0, 5, 7, 10, 13],
  "13sus": [0, 5, 7, 10, 14, 21],
  "maj#11": [0, 4, 7, 18],
  "9#11": [0, 4, 7, 10, 14, 18],
  "13b9": [0, 4, 7, 10, 13, 21],
  "13#11": [0, 4, 7, 10, 18, 21],
  "maj7#5": [0, 4, 8, 11],
  mb6: [0, 3, 7, 8],
};

const QUALITY_KEYS = Object.keys(QUALITIES).sort((a, b) => b.length - a.length);

export const parseWarnings = [];

function normalizeQuality(raw) {
  let q = raw.replace(/[()\s]/g, "");
  q = q
    .replace(/^-/, "m")
    .replace(/min/g, "m")
    .replace(/Δ/g, "maj7")
    .replace(/ø7?/g, "m7b5")
    .replace(/°7?|o7/g, "dim7")
    .replace(/^M(?=\d)/, "maj")
    .replace(/^Maj/i, "maj")
    .replace(/^\+7|aug7/, "7#5")
    .replace(/^\+$/, "aug")
    .replace(/^(?:7)?alt$/, "7alt")
    .replace(/7sus$/, "7sus4")
    .replace(/^sus$/, "sus4")
    .replace(/m\/?maj7/i, "mmaj7")
    .replace(/♭/g, "b")
    .replace(/♯/g, "#");
  return q;
}

const cache = new Map();

/**
 * parseChord("Am7b5") → { symbol, rootPc, bassPc, intervals, quality }
 * Slash chords supported ("F7/C"). Unknown qualities fall back to the
 * longest known prefix (e.g. "7b9b13" → "7b9") and log a warning.
 */
export function parseChord(symbol) {
  if (cache.has(symbol)) return cache.get(symbol);

  const cleaned = symbol.replace(/[()]/g, "").trim();
  const [main, bassStr] = cleaned.split("/");
  const m = main.match(/^([A-G][b#♭♯]?)(.*)$/);
  if (!m) {
    parseWarnings.push(`unparseable chord: ${symbol}`);
    const fallback = { symbol, rootPc: 0, bassPc: 0, intervals: QUALITIES[""], quality: "" };
    cache.set(symbol, fallback);
    return fallback;
  }

  const rootPc = notePc(m[1]);
  let quality = normalizeQuality(m[2]);
  if (!(quality in QUALITIES)) {
    const prefix = QUALITY_KEYS.find((k) => k !== "" && quality.startsWith(k));
    parseWarnings.push(`unknown quality "${m[2]}" in ${symbol} → using "${prefix ?? "maj"}"`);
    quality = prefix ?? "";
  }

  const bassPc = bassStr ? notePc(bassStr) : rootPc;
  const parsed = { symbol, rootPc, bassPc, rootName: m[1], intervals: QUALITIES[quality], quality };
  cache.set(symbol, parsed);
  return parsed;
}

function notePc(name) {
  const m = name.trim().match(/^([A-G])([b#♭♯]?)/);
  if (!m) return 0;
  let pc = PC[m[1]];
  if (m[2] === "b" || m[2] === "♭") pc -= 1;
  if (m[2] === "#" || m[2] === "♯") pc += 1;
  return ((pc % 12) + 12) % 12;
}

export function flatName(pc) {
  return FLAT_NAMES[((pc % 12) + 12) % 12];
}

/** Nearest MIDI note with pitch class `pc` to `ref`, clamped to [lo, hi]. */
export function placeNear(pc, ref, lo, hi) {
  let best = null;
  for (let midi = pc; midi < 128; midi += 12) {
    if (midi < lo || midi > hi) continue;
    if (best === null || Math.abs(midi - ref) < Math.abs(best - ref)) best = midi;
  }
  return best ?? Math.min(hi, Math.max(lo, pc + 48));
}

function pick(iv, wanted) {
  for (const w of wanted) if (iv.includes(w)) return w;
  return null;
}

/** Guide-tone piano voicing: 3rd + 7th (or 6th) + one color tone, around middle C. */
export function pianoVoicing(chord) {
  const iv = chord.intervals;
  const third = pick(iv, [4, 3, 5, 2]) ?? 4;
  const seventh = pick(iv, [10, 11, 9]);
  const color = pick(iv, [14, 13, 15, 18, 21, 20, 17, 8, 7, 6]);

  const tones = [third, seventh, color].filter((t) => t !== null);
  const midis = tones.map((t, i) => {
    const pc = (chord.rootPc + t) % 12;
    const center = t >= 12 ? 66 : 62;
    return placeNear(pc, center + i, 55, 74);
  });
  return [...new Set(midis)].sort((a, b) => a - b);
}

/**
 * Compact 3-note guitar voicing, low-mid register.
 * variant 0: shell — root + 3rd + 7th (or 5th).
 * variant 1: rootless color — 3rd + 7th + 9th/5th, a touch higher.
 */
export function guitarVoicing(chord, variant = 0) {
  const iv = chord.intervals;
  const third = pick(iv, [4, 3, 5]) ?? 4;
  const seventh = pick(iv, [10, 11, 9, 7]) ?? 7;
  let midis;
  if (variant === 1) {
    const color = pick(iv, [14, 13, 15, 7, 8, 6]) ?? 7;
    midis = [
      placeNear((chord.rootPc + third) % 12, 52, 46, 58),
      placeNear((chord.rootPc + seventh) % 12, 57, 50, 62),
      placeNear((chord.rootPc + color) % 12, 62, 55, 66),
    ];
  } else {
    midis = [
      placeNear(chord.rootPc, 48, 43, 55),
      placeNear((chord.rootPc + third) % 12, 55, 50, 62),
      placeNear((chord.rootPc + seventh) % 12, 58, 50, 64),
    ];
  }
  return [...new Set(midis)].sort((a, b) => a - b);
}

// Chord-scale mapping for the solo-notes strip. Steps in semitones from the
// root; 12 = octave. Diminished scales are 8 distinct notes, no octave needed.
const SCALES = {
  major:      { label: "major",               steps: [0, 2, 4, 5, 7, 9, 11, 12] },
  lydian:     { label: "lydian",              steps: [0, 2, 4, 6, 7, 9, 11, 12] },
  dorian:     { label: "dorian",              steps: [0, 2, 3, 5, 7, 9, 10, 12] },
  melmin:     { label: "melodic minor",       steps: [0, 2, 3, 5, 7, 9, 11, 12] },
  locrian:    { label: "locrian",             steps: [0, 1, 3, 5, 6, 8, 10, 12] },
  mixo:       { label: "mixolydian",          steps: [0, 2, 4, 5, 7, 9, 10, 12] },
  halfwhole:  { label: "half-whole dim.",     steps: [0, 1, 3, 4, 6, 7, 9, 10] },
  wholehalf:  { label: "whole-half dim.",     steps: [0, 2, 3, 5, 6, 8, 9, 11] },
  lyddom:     { label: "lydian dominant",     steps: [0, 2, 4, 6, 7, 9, 10, 12] },
  altered:    { label: "altered",             steps: [0, 1, 3, 4, 6, 8, 10, 12] },
  wholetone:  { label: "whole tone",          steps: [0, 2, 4, 6, 8, 10, 12] },
};

const SCALE_FOR_QUALITY = {
  "": "major", maj: "major", "6": "major", "69": "major", add9: "major", maj7: "major", maj9: "major",
  "maj7#11": "lydian",
  m: "dorian", m7: "dorian", m9: "dorian", m11: "dorian", m6: "dorian", m69: "dorian",
  mmaj7: "melmin",
  m7b5: "locrian",
  dim: "wholehalf", dim7: "wholehalf",
  "7": "mixo", "9": "mixo", "11": "mixo", "13": "mixo",
  sus2: "mixo", sus4: "mixo", "7sus4": "mixo", "9sus4": "mixo", "13sus4": "mixo",
  "7b9": "halfwhole", "7#9": "halfwhole",
  "7#11": "lyddom", "7b5": "lyddom",
  "7alt": "altered", "7b13": "altered",
  aug: "wholetone", "7#5": "wholetone", "9#5": "wholetone",
};

/** Scale steps (semitones, octave dropped) a soloist draws from over a chord. */
export function soloScaleSteps(chord) {
  const scale = SCALES[SCALE_FOR_QUALITY[chord.quality] ?? "mixo"];
  return scale.steps.filter((s) => s < 12);
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" };

/**
 * Notes to solo with over a chord: the matching chord scale, root to root.
 * Returns { label: "D dorian", notes: ["D","E","F","G","A","B","C","D"] }.
 * Seven-note scales are spelled diatonically (one note per letter);
 * diminished/whole-tone scales fall back to flat names.
 */
export function soloScale(chord) {
  const scale = SCALES[SCALE_FOR_QUALITY[chord.quality] ?? "mixo"];
  const diatonic = scale.steps.length === 8 && scale.steps[7] === 12;
  let notes;
  if (diatonic) {
    const rootIdx = LETTERS.indexOf(chord.rootName[0]);
    notes = scale.steps.map((s, i) => {
      if (s % 12 === 0) return chord.rootName;
      const letterIdx = (rootIdx + i) % 7;
      let diff = ((chord.rootPc + s) % 12) - NATURAL_PC[letterIdx];
      if (diff > 6) diff -= 12;
      if (diff < -6) diff += 12;
      return diff in ACC ? LETTERS[letterIdx] + ACC[diff] : flatName(chord.rootPc + s);
    });
  } else {
    notes = scale.steps.map((s) => (s % 12 === 0 ? chord.rootName : flatName(chord.rootPc + s)));
  }
  const pcs = scale.steps.map((s) => (chord.rootPc + s) % 12);
  return { label: `${chord.rootName} ${scale.label}`, notes, pcs };
}

/** Pitch classes a bass line draws from. */
export function bassPcs(chord) {
  const iv = chord.intervals;
  return {
    root: chord.bassPc,
    third: (chord.rootPc + (pick(iv, [4, 3, 5]) ?? 4)) % 12,
    fifth: (chord.rootPc + (pick(iv, [7, 6, 8]) ?? 7)) % 12,
    seventh: (chord.rootPc + (pick(iv, [10, 11, 9]) ?? 7)) % 12,
  };
}
