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

// ------------------------------------------------------- reading transposition
//
// How far above concert pitch each instrument *reads*. A tenor player looking at
// a concert C chart has to play D, so the chart they want to see says D — the
// band is not moved, only the writing. Baritone reads the same pitch classes as
// alto an octave down, so it shares the E♭ shift.
export const READING_KEYS = {
  C: { label: "concert", shift: 0 },
  Bb: { label: "B♭", shift: 2 }, // tenor & soprano sax, trumpet, clarinet
  Eb: { label: "E♭", shift: 9 }, // alto & baritone sax
  F: { label: "F", shift: 7 }, // french horn, english horn
};

/** Written spelling for a transposed root. Flats throughout, which is both the
 *  app's existing convention and what a jazz chart mostly uses. */
const shiftName = (name, semitones) => flatName(notePc(name) + semitones);

/**
 * Rewrite a chord symbol into a transposing instrument's written pitch, keeping
 * the quality suffix and any slash bass exactly as written: "Bb7#11" +2 → "C7#11".
 */
export function transposeSymbol(symbol, semitones) {
  if (!semitones) return symbol;
  const [main, bassStr] = String(symbol).trim().split("/");
  const m = main.match(/^([A-G][b#♭♯]?)(.*)$/);
  if (!m) return symbol; // unparseable — leave it alone rather than mangle it
  const out = shiftName(m[1], semitones) + m[2];
  return bassStr ? `${out}/${shiftName(bassStr, semitones)}` : out;
}

/** The same for a free-text key ("G minor", "D dorian", "Eb") — the leading
 *  note name moves and the rest of the words are left alone. */
export function transposeKey(key, semitones) {
  if (!semitones || !key) return key;
  return String(key).replace(/^\s*([A-G][b#♭♯]?)/, (m0, n) => shiftName(n, semitones));
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

// ------------------------------------------------------------ comp voicings
//
// The comping piano used to get one shape per chord symbol: three tones each
// placed independently near a fixed centre. It was deterministic, so every Dm7
// anywhere in the songbook sounded the same three notes in every chorus of every
// take — measured across all 428 tunes, the top voice averaged 0.19 distinct
// notes per chord, and "So What" got two top notes across thirty-two chords.
// Placing each tone on its own also let extensions land under the guide tones:
// twelve chords, all of them #9s, voiced a semitone in close position.
//
// So: build the real shapes per chord as *ordered stacks* — around eighteen of
// them, which makes the clusters structurally impossible — then choose between
// them by voice leading from the chord before. The choice is weighted-random
// rather than nearest-wins, because always taking the smoothest option is its
// own kind of frozen: a comper revoices a chord that sits still.

// The piano keeps the upper half of the middle register and the guitar takes the
// lower (see guitarVoicing). They used to overlap through most of their range —
// measured, 7 of the 15 pitches the piano touched on a chorus were also played
// by the guitar, and the two instruments doubled each other into mud. Splitting
// them is what lets both be heard as themselves.
// The ceiling has to clear the floor by more than a shape's span or some bottom
// notes have no octave that fits and get placed outside the band; a 16-semitone
// span over a 22-semitone band left five of the twelve short. 24 gets all but
// one, and `place` charges 12 penalty points a semitone for leaving, so the
// remainder only strays when nothing else is possible.
const COMP_LO = 57; // A3
// A tenth. Wider stops being one hand shape, and it is also what keeps the
// vocabulary inside the register band: a band has to clear a shape span by
// twelve or some bottom notes have no octave that fits at all.
const COMP_SPAN = 16;
const COMP_HI = 81; // A5

/**
 * Stack these tones upward, each one at its nearest instance strictly more than
 * a semitone above the voice below. That gap rule is the whole reason the
 * clusters can't come back: a ninth and a minor third are a semitone apart, so
 * where the old code let them sit next to each other this pushes the upper one
 * an octave clear.
 */
function rising(ivs) {
  const out = [ivs[0]];
  for (let i = 1; i < ivs.length; i++) {
    let v = ivs[i];
    while (v <= out[out.length - 1] + 1) v += 12;
    out.push(v);
  }
  return out;
}

const voicingCache = new Map();

/** How much colour the comp reaches for. 0 = guide-tone shells and nothing
 *  else; 1 = those plus the rootless forms with a ninth. */
export const COMP_COLOUR = { plain: 0, warm: 1 };

/**
 * The shapes a pianist would reach for on this chord, as interval stacks from
 * the root.
 *
 * These are *named forms* — the shells, the two rootless voicings, drop-2, the
 * quartal stack — and not, as a first attempt had it, every combination of the
 * chord's colour tones in every inversion. That produced 29 shapes for a Dm7,
 * thirteen of which had no third in them at all, because a filter that keeps
 * anything containing a third *or* a seventh happily passes {9, 11, 5, ♭7}.
 * The comp had plenty of variety and stopped sounding like comping.
 *
 * Every form here carries both guide tones where the chord has them; the
 * quartal stack is the one deliberate exception, and it is colour 2 only.
 */
export function pianoVoicings(chord, colour = COMP_COLOUR.warm) {
  const cacheKey = `${chord.symbol}|${colour}`;
  if (voicingCache.has(cacheKey)) return voicingCache.get(cacheKey);

  const iv = chord.intervals;
  const third = pick(iv, [4, 3, 5, 2]) ?? 4; // 5/2 = the suspended chords
  const fifth = pick(iv, [7, 6, 8]) ?? 7;
  const seventh = pick(iv, [10, 11, 9]); // 9 = a 6th chord's 6th
  // A comping pianist supplies the ninth a bare symbol leaves out — but only
  // where the chord scale has one to give. An altered or suspended ninth comes
  // from the symbol and is never overridden, and a chord whose scale has no
  // natural second (locrian on m7b5, altered on 7b13) simply goes without,
  // rather than comping a note the solo-notes strip is telling you not to play.
  const ninth =
    pick(iv, [14, 13, 15]) ??
    (seventh !== null && soloScaleSteps(chord).includes(2) ? 14 : null);

  const seen = new Set();
  const out = [];
  // how many voices are reaching past root / 3rd / 5th / 7th — the number the
  // colour setting is actually a target for
  const core = new Set([0, third % 12, fifth % 12, seventh === null ? -1 : seventh % 12]);
  const offer = (...ivs) => {
    if (ivs.some((v) => v === null || v === undefined)) return;
    const v = rising(ivs);
    if (v[v.length - 1] - v[0] > COMP_SPAN) return;
    const key = v.join();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ivs: v, extras: v.filter((x) => !core.has(((x % 12) + 12) % 12)).length });
  };

  if (seventh === null) {
    // triads and the chords with no seventh at all — these used to comp as two
    // notes, 85 of the songbook's 502 distinct symbols among them
    offer(third, fifth, 0);
    offer(0, third, fifth);
    if (colour >= COMP_COLOUR.warm) offer(fifth, 0, third);
    if (colour >= COMP_COLOUR.warm) offer(third, fifth, ninth);
  } else {
    // shells: the guide tones, with the root under or over them. The whole
    // vocabulary at colour 0, and still the backbone above it.
    offer(0, third, seventh);
    offer(0, seventh, third);
    offer(third, seventh, 0);
    offer(third, fifth, seventh);
    offer(seventh, third, fifth);

    if (colour >= COMP_COLOUR.warm) {
      offer(third, fifth, seventh, ninth); // rootless A
      offer(seventh, ninth, third, fifth); // rootless B
      offer(third, seventh, ninth);
      offer(seventh, third, ninth);
    }

    // A third setting existed here — thirteenths, five-voice upper structures,
    // the quartal stack — and it went. Two settings is the real choice: state
    // the chord plainly, or state it with a ninth. Everything past that was the
    // comp being interesting on its own behalf, which is not this instrument's
    // job under a soloist.
  }

  if (!out.length) out.push({ ivs: rising([third, fifth, seventh ?? 0]), extras: 0 });
  voicingCache.set(cacheKey, out);
  return out;
}

/** Put one interval stack on the keyboard, centred as near `anchor` as the
 *  register band allows. */
function place(chord, ivs, anchor) {
  const bottomPc = (((chord.rootPc + ivs[0]) % 12) + 12) % 12;
  let best = null;
  for (let m = bottomPc; m < 120; m += 12) {
    const notes = ivs.map((v) => m + (v - ivs[0]));
    const outside =
      Math.max(0, notes[notes.length - 1] - COMP_HI) + Math.max(0, COMP_LO - notes[0]);
    const centre = notes.reduce((a, b) => a + b, 0) / notes.length;
    // a semitone outside the band costs a full octave of anchor distance, so
    // leaving it only ever happens to a shape too wide to fit anywhere
    const cost = 12 * outside + Math.abs(centre - anchor);
    if (!best || cost < best.cost) best = { notes, cost };
  }
  return best.notes;
}

/** How far the hand travels from one voicing to the next, both directions. */
function motion(prev, next) {
  if (!prev) return 0;
  const near = (m, set) => Math.min(...set.map((x) => Math.abs(x - m)));
  const fwd = next.reduce((s, m) => s + near(m, prev), 0) / next.length;
  const back = prev.reduce((s, m) => s + near(m, next), 0) / prev.length;
  return (fwd + back) / 2;
}

/**
 * Voicings for a whole form, voice-led chord to chord. `rand` is the caller's
 * RNG so a seeded take gets a reproducible comp; the pass is per chorus, so the
 * same tune is voiced a different way each time round while staying joined up
 * inside any one chorus.
 */
// What each colour setting is actually asking for. Widening the pool alone did
// not work: the shells voice-lead better than anything else, so they won at
// every setting and the three sounded the same. The setting has to bias the
// *choice*, and on more than one axis, or it is a label rather than a sound.
//   extras — voices reaching past root/3rd/5th/7th, which is the tone colour
//   size   — how many voices the hand puts down
//   centre — where the shape sits, so the three occupy different air
//   hold   — how readily a held chord is left alone
//   pick   — how often anything but the smoothest option gets taken
const COMP_SETTINGS = [
  { extras: 0, size: 3, centre: 61, hold: 0.88, pick: [0.86, 0.11, 0.03] },
  { extras: 1, size: 4, centre: 65, hold: 0.74, pick: [0.7, 0.21, 0.07, 0.02] },
];

export function voiceComp(chords, rand = Math.random, opts = {}) {
  const colour = opts.colour ?? COMP_COLOUR.warm;
  const set = COMP_SETTINGS[colour] ?? COMP_SETTINGS[COMP_COLOUR.warm];
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const out = [];
  const recentTops = [];
  let prev = null;
  let prevSymbol = null;

  for (const c of chords) {
    // A comper leaves the hand where it is while the chord does. Revoicing a
    // held chord every single bar is its own kind of tell — the variety reads
    // as restlessness rather than as playing.
    if (prev && c.symbol === prevSymbol && rand() < set.hold) {
      out.push(prev);
      continue;
    }

    const anchor = prev ? mean(prev) : set.centre;
    const scored = pianoVoicings(c.info, colour)
      .map((cand) => ({ ...cand, v: place(c.info, cand.ivs, anchor) }))
      .map((cand) => {
        const v = cand.v;
        const top = v[v.length - 1];
        return {
          v,
          // The colour terms come first and are weighted to dominate, because
          // the differences in voice leading between candidates are only a
          // semitone or two and would otherwise decide every choice.
          s:
            2.6 * Math.abs(cand.extras - set.extras) +
            1.4 * Math.abs(v.length - set.size) +
            0.25 * Math.abs(mean(v) - set.centre) +
            motion(prev, v) +
            0.5 * (prev ? Math.abs(top - prev[prev.length - 1]) : 0) +
            (recentTops.includes(top) ? 0.6 * (colour + 1) : 0),
        };
      })
      .sort((a, b) => a.s - b.s);

    const n = Math.min(set.pick.length, scored.length);
    let r = rand() * set.pick.slice(0, n).reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < n - 1 && (r -= set.pick[i]) > 0) i++;

    const chosen = scored[i].v;
    out.push(chosen);
    prev = chosen;
    prevSymbol = c.symbol;
    recentTops.push(chosen[chosen.length - 1]);
    if (recentTops.length > 3) recentTops.shift();
  }
  return out;
}

// ---------------------------------------------------------- guitar voicings
//
// The rhythm guitar had the same problem the piano had: two shapes per chord,
// deterministic, each placed near a fixed anchor with no reference to the chord
// before it. Measured, that gave 0.74 common tones per change and a top voice
// that leapt past a fourth on a fifth of them — and "So What" got two distinct
// top notes across thirty-two chords.
//
// Which is backwards for this part specifically. The teaching material on
// Freddie Green is *entirely* voice leading — "the Em7 and A7 share the
// fifth-fret G", "the highest note of both the Dm7 and the G7 is the tenth-fret
// F". The line the top notes trace is the part. See research/guitar-comping.md.

const GTR_LO = 43; // G2
const GTR_HI = 65; // F4
const GTR_SPAN = 16; // a tenth — about what the 6-4-2 and 5-3-1 shapes cover

const gtrCache = new Map();

/**
 * The shapes a rhythm guitarist has under the hand for this chord: root, third
 * and seventh with the fifth omitted, in the inversions that stay inside a
 * tenth. Green's own vocabulary, and the octave freedom between them is what
 * gives the voice leading somewhere to go.
 */
export function guitarVoicings(chord) {
  if (gtrCache.has(chord.symbol)) return gtrCache.get(chord.symbol);

  const iv = chord.intervals;
  const third = pick(iv, [4, 3, 5]) ?? 4;
  const seventh = pick(iv, [10, 11, 9, 7]) ?? 7;
  const fifth = pick(iv, [7, 6, 8]) ?? 7;

  const seen = new Set();
  const out = [];
  const offer = (...ivs) => {
    const v = rising(ivs);
    const span = v[v.length - 1] - v[0];
    if (span > GTR_SPAN) return;
    // A shape only counts if some octave of it lands wholly on the neck. The
    // widest inversions have none for certain roots — both octaves hang off an
    // end — and offering them anyway put 4.8% of voicings outside the range,
    // which is how the guitar ended up under the bass again.
    const bottomPc = (((chord.rootPc + v[0]) % 12) + 12) % 12;
    let fits = false;
    for (let m = bottomPc; m <= GTR_HI; m += 12) {
      if (m >= GTR_LO && m + span <= GTR_HI) { fits = true; break; }
    }
    if (!fits) return;
    const key = v.join();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };

  offer(0, third, seventh); // R-3-7, the close shape
  offer(0, seventh, third); // R-7-3, the spread one
  offer(third, seventh, 0); // 3-7-R
  offer(seventh, 0, third); // 7-R-3
  offer(third, 0, seventh);
  offer(seventh, third, 0);
  // the fifth only where the third and seventh collapse onto each other
  if (third === seventh) offer(0, third, fifth);

  if (!out.length) out.push(rising([0, third, seventh]));
  gtrCache.set(chord.symbol, out);
  return out;
}

/**
 * Voicings for a whole form, voice-led chord to chord — common tones held where
 * they exist, and the top voice moved as little as the shapes allow.
 */
export function guitarComp(chords, rand = Math.random) {
  const out = [];
  let prev = null;

  for (const c of chords) {
    const anchor = prev ? prev[0] : 50;
    const scored = guitarVoicings(c.info)
      .map((ivs) => {
        const bottomPc = (((c.info.rootPc + ivs[0]) % 12) + 12) % 12;
        let best = null;
        for (let m = bottomPc; m < 120; m += 12) {
          const notes = ivs.map((v) => m + (v - ivs[0]));
          const outside =
            Math.max(0, notes[notes.length - 1] - GTR_HI) + Math.max(0, GTR_LO - notes[0]);
          const cost = 12 * outside + Math.abs(m - anchor);
          if (!best || cost < best.cost) best = { notes, cost };
        }
        return best.notes;
      })
      .map((v) => ({
        v,
        // Common tones first, because they are what the style is built on, then
        // the top voice, which is the line a listener follows.
        s:
          -2.2 * (prev ? v.filter((m) => prev.includes(m)).length : 0) +
          1.0 * (prev ? Math.abs(v[v.length - 1] - prev[prev.length - 1]) : 0) +
          0.35 * motion(prev, v) +
          0.1 * Math.abs(v.reduce((a, b) => a + b, 0) / v.length - 53),
      }))
      .sort((a, b) => a.s - b.s);

    // Near-deterministic: this part is a line, and a line does not re-roll. The
    // second choice only comes up when it scores essentially as well.
    const chosen = scored.length > 1 && rand() < 0.18 ? scored[1].v : scored[0].v;
    out.push(chosen);
    prev = chosen;
  }
  return out;
}

/**
 * Compact 3-note guitar voicing, low-mid register. Kept for the ballad pad,
 * which places one chord a bar with nothing to lead from.
 * variant 0: shell — root + 3rd + 7th (or 5th).
 * variant 1: rootless color — 3rd + 7th + 9th/5th, a touch higher.
 */
export function guitarVoicing(chord, variant = 0) {
  const iv = chord.intervals;
  const third = pick(iv, [4, 3, 5]) ?? 4;
  const seventh = pick(iv, [10, 11, 9, 7]) ?? 7;
  // Left where it has always been. Moving it to make room for the piano was
  // tried twice — floor down to E2, then ceiling down to G3 — and both read as
  // wrong on the instrument: this range is where the sampled guitar was
  // recorded and where its voicings were tuned. The piano moved its own floor
  // up to A3 instead, which is the half of that split worth keeping.
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
  phrygdom:   { label: "phrygian dominant",   steps: [0, 1, 4, 5, 7, 8, 10, 12] },
  lydaug:     { label: "lydian augmented",    steps: [0, 2, 4, 6, 8, 9, 11, 12] },
  aeolian:    { label: "aeolian",             steps: [0, 2, 3, 5, 7, 8, 10, 12] },
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
  // Eleven qualities used to fall through to the mixolydian default, and for
  // nine of them mixolydian contradicts the symbol outright: a natural 9 over
  // C7b9, a natural 11 over C9#11, a major 3rd over Cmb6. A chord scale may
  // add notes to a chord; it may not take away the ones the symbol spells.
  "7#9#5": "altered", "7b9b5": "altered", "7#9b5": "altered", "7b9#5": "altered",
  "maj7#5": "lydaug",
  "7b9#11": "halfwhole", "7#9#11": "halfwhole", "13b9": "halfwhole",
  "7b9sus": "phrygdom", "7b9sus4": "phrygdom",
  "maj#11": "lydian", "9#11": "lyddom", "13#11": "lyddom",
  "13sus": "mixo",
  mb6: "aeolian",
};

/* ---- the key the tune is in --------------------------------------------
 *
 * A soloist does not rebuild a scale from nothing at every chord — they hear
 * the key, and each chord as a degree of it. Quality lookup alone cannot do
 * that. It answers "major" for every maj7, so over the IV chord the line plays
 * a natural 11, the one note that says the player is reading symbols rather
 * than hearing the tune. Same story for vi (a raised 6th that belongs to no
 * key here) and for V7 in a minor key (a plain mixolydian that ignores the b6
 * the whole tune is built on).
 *
 * So: when a chord is wholly diatonic to the key, the notes come from the
 * key's own collection rotated onto that chord. When it is not — a secondary
 * dominant, a tritone sub, a modulation — nothing is claimed and the quality
 * lookup stands. That test is what keeps Coltrane changes untouched.
 */

const MODE_STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // natural minor: the collection, not the cadence
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

const MINOR_TONIC = new Set(["m", "m7", "m9", "m11", "m6", "m69", "mmaj7"]);

/** Does the tune sit on a minor tonic? Asked only when the label is bare. */
function tonicIsMinor(song, tonicPc) {
  let minor = 0;
  let major = 0;
  for (const bar of song?.progression ?? []) {
    for (const cell of bar ?? []) {
      const info = parseChord(cell.chord);
      if (info.rootPc !== tonicPc) continue;
      if (MINOR_TONIC.has(info.quality)) minor += cell.beats ?? 4;
      else major += cell.beats ?? 4;
    }
  }
  return minor > major;
}

/**
 * The key a tune is in, as { tonicPc, mode, pcs }, or null when it has none.
 *
 * 420 of the 447 tunes label only a root letter, and several of those are
 * minor tunes — Mr. P.C. and Footprints both say "C". The progression is the
 * authority the label is not, so a bare label gets settled by what quality the
 * tune's own tonic chord is.
 */
export function keyContext(song) {
  const raw = song?.key;
  if (!raw || raw === "—") return null;
  const m = /^([A-G][b#♭♯]?)\s*(.*)$/.exec(String(raw).trim());
  if (!m) return null;
  const tonicPc = notePc(m[1]);
  const rest = m[2].trim().toLowerCase();
  let mode = "major";
  if (rest.startsWith("dor")) mode = "dorian";
  else if (rest === "m" || rest.startsWith("min")) mode = "minor";
  else if (rest === "" && tonicIsMinor(song, tonicPc)) mode = "minor";
  return { tonicPc, mode, pcs: MODE_STEPS[mode].map((s) => (tonicPc + s) % 12) };
}

// The seven diatonic modes by their own step pattern, so a collection rotated
// onto a chord can name itself whichever parent mode the key is in.
const MODE_BY_STEPS = {
  "0,2,4,5,7,9,11": "major",
  "0,2,3,5,7,9,10": "dorian",
  "0,1,3,5,7,8,10": "phrygian",
  "0,2,4,6,7,9,11": "lydian",
  "0,2,4,5,7,9,10": "mixolydian",
  "0,2,3,5,7,8,10": "aeolian",
  "0,1,3,5,6,8,10": "locrian",
};

/** Every note the symbol spells is in the scale — a scale may add, never take. */
function fitsChord(chord, steps) {
  const pool = new Set(steps.map((s) => (chord.rootPc + s) % 12));
  return chord.intervals.every((iv) => pool.has((chord.rootPc + iv) % 12));
}

/** The chord read as a degree of the key — null when it is not one of them. */
function keyScale(chord, key) {
  if (!key) return null;
  const inKey = (pc) => key.pcs.includes((((pc % 12) + 12) % 12));

  // V7 of a minor key is not diatonic — it borrows its 3rd from harmonic minor
  // — but it is the most key-defining chord in the tune, and mixolydian answers
  // it with notes from the parallel major: over G7 in C minor, an A and an E
  // natural, neither of which the tune contains. Phrygian dominant is the key's
  // own collection with that borrowed leading tone put back, so the b9 is Ab
  // and the b13 is Eb — both notes the tune has been playing all along.
  //
  // Altered would be the hipper answer, but it drops the natural 5th, and that
  // is a chord tone the symbol did not ask to have taken away.
  const degree = (((chord.rootPc - key.tonicPc) % 12) + 12) % 12;
  const dominant = chord.intervals.includes(4) && chord.intervals.includes(10);
  if (key.mode !== "major" && dominant && degree === 7) {
    const steps = SCALES.phrygdom.steps.filter((s) => s < 12);
    // A written alteration outranks the key: E7#9 asked for that G natural,
    // and E9 for its F#. Neither is in the key, and neither is ours to refuse.
    return fitsChord(chord, steps) ? { steps, label: SCALES.phrygdom.label } : null;
  }

  // wholly diatonic, or the key has no claim on it
  if (!inKey(chord.rootPc)) return null;
  for (const iv of chord.intervals) if (!inKey(chord.rootPc + iv)) return null;

  const steps = MODE_STEPS[key.mode]
    .map((s) => ((((key.tonicPc + s - chord.rootPc) % 12) + 12) % 12))
    .sort((a, b) => a - b);
  return { steps, label: MODE_BY_STEPS[steps.join(",")] ?? "major" };
}

/** Scale steps (semitones, octave dropped) a soloist draws from over a chord. */
export function soloScaleSteps(chord, key = null) {
  return keyScale(chord, key)?.steps ?? SCALES[SCALE_FOR_QUALITY[chord.quality] ?? "mixo"].steps.filter((s) => s < 12);
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" };

/**
 * Notes to solo with over a chord: the matching chord scale, root to root.
 * Returns { label: "D dorian", notes: ["D","E","F","G","A","B","C","D"] }.
 * Seven-note scales are spelled diatonically (one note per letter);
 * diminished/whole-tone scales fall back to flat names.
 *
 * Takes the same key as the generator, so the strip names the scale the line
 * is actually playing. A student reading "C major" over the IV chord while
 * hearing an F# is being taught the wrong thing twice over.
 */
export function soloScale(chord, key = null) {
  const keyed = keyScale(chord, key);
  const scale = keyed
    ? { label: keyed.label, steps: [...keyed.steps, 12] }
    : SCALES[SCALE_FOR_QUALITY[chord.quality] ?? "mixo"];
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
