// band.js — backing band engine.
// Tone.js drives the transport (tempo, swing, looping); smplr soundfonts
// supply piano / bass / guitar; drums are Tone synths (no samples to host).

import * as Tone from "https://cdn.jsdelivr.net/npm/tone@15.1.22/+esm";
import { Soundfont, SplendidGrandPiano, Sampler } from "https://cdn.jsdelivr.net/npm/smplr@1.0.0/+esm";
import { parseChord, pianoVoicing, guitarVoicing, bassPcs, placeNear, soloScaleSteps } from "./theory.js";
import { WJD } from "./solo-vocab.js";

const BASS_LO = 30; // F#1
const BASS_HI = 52; // E3

// The soloist: smplr's Splendid Grand Piano, practical solo range in MIDI.
export const SOLO_LO = 60;
export const SOLO_HI = 88;

// What the retired loudness dial used to sit at. Velocity, articulation,
// register push and behind-the-beat lag all read it; the arc supplies the
// dynamics now, so this is simply the middle of the old range.
const SOLO_HEAT = 0.5;

// The soloist is the piano, and horns are still the open question. The
// literature puts rendition ahead of note content for whether a solo reads as
// played (Frieler & Zaddach 2020: identical material scored 5.14 as audio and
// 3.47 as deadpan MIDI), so a real horn would be worth more than anything in
// the generator below — but a General MIDI horn is not a real horn. MusyngKite
// ships one velocity layer and a looped sustain per instrument, which is why
// the first attempt at horns (WebAudioFont JCLive, commit 4576d1c) was pulled
// too. See research/solo-vocabulary-plan.md for what a convincing pack would
// have to come from.
export const SOLO_INSTRUMENTS = {
  piano: { label: "piano", lo: SOLO_LO, hi: SOLO_HI, mono: false, breath: Infinity, floor: 25, trim: 1 },
};
// Song-style feel layer — composes multiplicatively with the soloist-style
// presets so a Parker solo over a bossa still swings *bossa*. swing is the
// baseline; ballad keeps its dedicated handling and adds nothing here.
export const STYLE_FEEL = {
  swing: {},
  ballad: {},
  bossa: { trip: 0.25, p16: 0.5, encl: 0.6, blue: 0.6, rest: 1.15, hold: 1.2, lag: 0.5, offStart: 0.35, wLong: 1.3, grammar: 0.9, velOff: -4, phrase: 0.9 },
  latin: {
    clave: true,
    trip: 0.06, p16: 0.9, encl: 0.4, blue: 0.5, lag: 0.05, offStart: 0.6, offAcc: 6,
    grammar: 0.9, motif: 1.5, antic: 2.2, wRiff: 1.6, sit: 1.4, rest: 0.85, phrase: 1.1,
  },
  funk: { trip: 0.15, p16: 1.6, encl: 0.5, blue: 1.7, rest: 1.05, hold: 0.8, lag: 0.25, offStart: 0.55, offAcc: 6, wRiff: 1.9, phrase: 0.75, sit: 1.5, crush: 1.3, grammar: 0.7 },
  blues: { blue: 1.8, trip: 1.1, encl: 0.9, wRiff: 1.5, sit: 1.3, crush: 1.5, grammar: 0.85 },
  modal: { encl: 0.4, blue: 0.8, phrase: 1.3, rest: 1.1, hold: 1.25, wRun: 1.15, grammar: 0.7, lag: 0.9 },
};

// Soloist style presets — parameter vectors over the generator, derived from
// published analyses of each player (see README sources). Every field is an
// override; missing fields fall back to the generic engine behavior.
//   rest/phrase/hold/encl/blue/trip/p16 = multipliers · reg = register band
//   lag = ms behind the beat · artic = articulation (1 legato, <1 detached)
//   cells = vocabulary licks as {steps: scale-step deltas, durs: beats}
export const SOLO_STYLES = {
  parker: {
    label: "parker",
    blurb: "relentless bebop 8ths, enclosures, barline-crossing phrases",
    p: {
      atoms: { approach: 2.6, scale: 1.15, arp: 1.1, repeat: 0.4 },
      ornament: 0.08,
      rest: 0.55, phrase: 1.5, phraseCap: 18, regLo: 0.45, regHi: 0.8,
      encl: 2.2, blue: 1.2, trip: 1.3, p16: 0.8, hold: 0.6, artic: 0.92,
      lag: 6, motif: 0.25, offStart: 0.5, wRun: 1.5, antic: 1.4, aim: 0.92,
      cellProb: 0.35,
      cells: [
        { steps: [0, -1, -1, 2, -1, -1], durs: [0.5, 0.5, 0.5, 0.5, 0.5, 1] },
        { steps: [0, 1, 1, -2, 1], durs: [0.5, 0.25, 0.25, 0.5, 1] },
        { steps: [0, 2, -1, -1, -1], durs: [0.5, 0.5, 0.5, 0.5, 0.5] },
      ],
    },
  },
  monk: {
    label: "monk",
    blurb: "angular leaps, weak-beat jabs, sudden silences",
    p: {
      atoms: { leap: 3, repeat: 1.8, neighbor: 1.4, scale: 0.55, arp: 0.8 },
      multiInt: "seconds",
      ornament: 0,
      rest: 1.6, phrase: 0.7, phraseCap: 8, regLo: 0.4, regHi: 0.75,
      encl: 0.6, blue: 1.4, trip: 0.7, p16: 0.4, hold: 1.2, artic: 0.68,
      lag: 10, motif: 0.55, wide: 0.3, gap: 0.22, crush: 0.4, crushDur: 0.1, aim: 0.45,
      offAcc: 14, contrast: 1.4, sit: 0.18,
      cellProb: 0.25,
      cells: [
        { steps: [0, 3, -4, 3], durs: [0.5, 0.5, 0.5, 1] },
        { steps: [0, -3, 4], durs: [0.5, 1, 1.5] },
      ],
    },
  },
  // Measured against EsAC's 7,352 sung folk melodies rather than guessed at:
  // beside the jazz corpus a sung line repeats a pitch nearly five times as
  // often (21.5% vs 4.6%), lives inside an octave rather than two and a half
  // (12.6 semitones vs 28.7), and turns back after a skip two thirds of the
  // time (66% vs 55%, against 36% after a plain step). Those three, not the
  // syllables, are what make a line singable. Atom mix and phrase length come
  // straight off that profile in solo-vocab.js.
  singer: {
    label: "singer",
    blurb: "inside an octave, stepwise, and a leap comes straight back",
    p: {
      multiInt: "none",
      ornament: 0.2,
      span: 0.48, // an octave and a bit of the piano's range, centred on the register
      maxLeap: 9, // only 1.9% of sung intervals clear a fifth, none clears an octave
      reversal: 0.66,
      rest: 1.35, phrase: 0.7, phraseCap: 11, regLo: 0.35, regHi: 0.62,
      encl: 0.5, blue: 1.4, trip: 0.7, p16: 0.2, hold: 1.5, artic: 1,
      lag: 24, motif: 0.6, thread: 0.6, onBeat: 0.35, sit: 0.18,
      crush: 0.45, crushDur: 0.14, contrast: 0.85, wLong: 1.3, aim: 0.8,
    },
  },
  silver: {
    label: "silver",
    blurb: "short funky riffs, repeated and squeezed, gospel smears",
    p: {
      atoms: { repeat: 2.2, neighbor: 1.6, leap: 1.2, scale: 0.85, approach: 0.7 },
      multiInt: "thirds",
      ornament: 0.15,
      rest: 1.2, phrase: 0.5, phraseCap: 6, regLo: 0.4, regHi: 0.65,
      blue: 1.8, trip: 0.7, hold: 0.9, artic: 0.78, lag: 8, motif: 0.65,
      onBeat: 0.5, crush: 0.35, wRiff: 1.8, contrast: 1.2, aim: 0.75,
      cellProb: 0.4,
      cells: [
        { steps: [0, -2, 0, 1], durs: [0.5, 0.25, 0.25, 1] },
        { steps: [0, 1, -1, 0], durs: [0.5, 0.5, 0.5, 1.5] },
        { steps: [0, 0, -1, 0], durs: [0.5, 0.25, 0.25, 1] },
      ],
    },
  },
};

// Deterministic randomness. Every generator used to call Math.random(), which
// meant a take could not be reproduced, saved or compared — and an A/B on some
// musical change was really an A/B on the roll. Everything now goes through
// rand(), and the solo runs inside a seeded scope so a (seed, chorus) pair
// always produces the same line no matter what the other parts drew first.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
let _rand = Math.random;
const rand = () => _rand();
/** Run fn with the RNG pinned to seed, then put the previous source back. */
const withSeed = (seed, fn) => {
  const prev = _rand;
  _rand = mulberry32(seed);
  try {
    return fn();
  } finally {
    _rand = prev;
  }
};
/** Human-typeable take seeds: "4F2A" ⇄ a 32-bit number. */
export const seedToText = (n) => (n >>> 0).toString(36).toUpperCase().padStart(6, "0");
export const textToSeed = (s) => {
  const direct = parseInt(String(s).trim(), 36);
  if (Number.isFinite(direct)) return direct >>> 0;
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

const rnd = (lo, hi) => lo + rand() * (hi - lo);
const choice = (arr) => arr[Math.floor(rand() * arr.length)];

export class Band {
  constructor(callbacks = {}) {
    this.cb = callbacks; // { onChord, onBeat, onProgress, onReady }
    this.ctx = null;
    this.song = null;
    this.parts = [];
    this.muted = { piano: false, guitar: false, bass: false, drums: false };
    this.setupPromise = null;
    this.playing = false;
    this.paused = false; // playing && paused = held mid-tune, position kept
    this.soloOn = false;
    this.soloFeel = { crowd: 0.5, phrase: 0.5, cantabile: 0.5 }; // packing · statement length · how much it sings
    this.soloStyleName = "silver";
    this.soloVoicing = "mono"; // mono: single-note line · multi: doubled holds, stabs, octaves
    this.soloInst = null;
    this.soloPart = null;
    this.takeSeed = randomSeed(); // this take's identity — see newTake()
    // Woodshed controls. holdTake stops the line re-rolling every chorus, which
    // is the difference between listening to an improviser and learning a lick;
    // rampBpm walks the tempo up while it repeats; breakBars drops the band out
    // so you find out on re-entry whether the line kept the form on its own.
    this.holdTake = false;
    this.rampBpm = 0;
    this.rampCap = 320;
    this.breakBars = 0;
    // sound-quality A/B: mixing polish flags + instrument upgrades
    this.polish = { pan: true, eq: true, comp: true, reverb: true, sat: true, vel: true, drumTone: true };
    this.grandOn = true;
    this.rideOn = true;
    // HQ sample pack (CC0 — Karoryfer/FreePats/Versilian): opt-in, hot-swaps
    // piano/guitar/bass/drums once every file is decoded
    this.hqOn = false;
    this._hq = {};
    this.bassBoost = false; // see _gainFor
  }

  /** Push the bass forward for walking-line practice — level in _gainFor,
   *  shelf corner in _applyPolish. Both have to move, hence the full pass. */
  setBassBoost(on) {
    this.bassBoost = !!on;
    this._refreshGain("bass");
    this._applyPolish();
  }

  /** Background-band level (0..1.5) — scales piano/guitar/bass/drums, not the solo. */
  setBgVolume(v) {
    this.bgVolume = Math.max(0, Math.min(1.5, v));
    if (!this.gains) return;
    for (const name of ["piano", "guitar", "bass", "drums"]) {
      if (!this.muted[name]) {
        this.gains[name].gain.setTargetAtTime(this._gainFor(name) * this.bgVolume, this.ctx.currentTime, 0.02);
      }
    }
  }

  /** Throw away the current solo line and improvise a fresh one, mid-tune.
   *  Pass a seed (number or the text form shown in the UI) to play a take back;
   *  omit it to roll a new one. Returns the seed actually used. */
  newTake(seed) {
    this.takeSeed = seed === undefined ? randomSeed() : textToSeed(seed);
    // Motifs carry between choruses, so a take is only reproducible if it also
    // starts from no remembered material. Clearing here makes (seed, chorus)
    // enough to identify a line even when the seed is typed in mid-tune.
    this._soloMotif = null;
    if (this.playing) this._rebuildSoloPart();
    this.cb.onTake?.(seedToText(this.takeSeed));
    return seedToText(this.takeSeed);
  }

  /** The current take's seed, in the short text form. */
  get takeId() {
    return seedToText(this.takeSeed);
  }

  /** Keep replaying this exact line instead of improvising a fresh one each
   *  chorus. Pins the current take so a tempo ramp has something to ramp. */
  setHoldTake(on) {
    this.holdTake = !!on;
    this._heldLine = on ? (this.soloEvents ?? []).map((e) => ({ ...e })) : null;
    if (!on) this.cb.onTake?.(seedToText(this.takeSeed));
  }

  /** Woodshed tempo: add this many BPM each time the form comes round, up to
   *  cap. 0 turns it off. */
  setTempoRamp(step, cap = 320) {
    this.rampBpm = Math.max(0, Math.min(20, step));
    this.rampCap = cap;
  }

  /** Chord breaks: the band plays n bars then rests n, and keeps alternating.
   *  0 turns it off and restores the levels. */
  setBreakBars(n) {
    this.breakBars = Math.max(0, n | 0);
    if (!this.breakBars) this._setBandSilent(false);
  }

  /** Duck the whole rhythm section, leaving the soloist alone. */
  _setBandSilent(silent, time) {
    if (!this.gains) return;
    const bg = this.bgVolume ?? 1;
    const at = time ?? this.ctx.currentTime;
    for (const name of ["piano", "guitar", "bass", "drums"]) {
      if (this.muted[name]) continue;
      this.gains[name].gain.setTargetAtTime(silent ? 0 : this._gainFor(name) * bg, at, 0.03);
    }
  }

  setSoloVoicing(v) {
    if (!["mono", "multi"].includes(v) || v === this.soloVoicing) return;
    this.soloVoicing = v;
    if (this.playing) this._rebuildSoloPart();
  }

  setSoloStyle(name) {
    if (!(name in SOLO_STYLES) || name === this.soloStyleName) return;
    this.soloStyleName = name;
    if (this.playing) this._rebuildSoloPart();
  }

  /** Set one solo-feel dial (0..1) — "crowd", "phrase" or "cantabile". Regenerates live. */
  setSoloFeel(dial, v) {
    if (!(dial in this.soloFeel)) return;
    this.soloFeel[dial] = Math.max(0, Math.min(1, v));
    if (this.playing) this._rebuildSoloPart();
  }

  /** Create audio context + start loading instruments. Safe to call early. */
  setup() {
    if (!this.setupPromise) this.setupPromise = this._setup();
    return this.setupPromise;
  }

  async _setup() {
    this.ctx = new AudioContext();
    Tone.setContext(this.ctx);
    const ctx = this.ctx;

    // ---- mix bus: strips (sat → EQ → pan) → dry sum → glue → limiter →
    // master → out, with a low-cut pre-delayed reverb SEND. Every polish
    // element has a transparent state so the whole chain can A/B against
    // the legacy sound live.
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.connect(this.master);
    this.glue = ctx.createDynamicsCompressor();
    this.glue.connect(this.limiter);
    this.drySum = ctx.createGain();
    this.drySum.connect(this.glue);

    // legacy inline-style reverb path (what prod sounds like today)
    this.legacyWet = ctx.createGain();
    this.legacyWet.gain.value = 0;
    this.drySum.connect(this.legacyWet);
    // polished send path: low-cut + pre-delay into a longer tail
    this.sendSum = ctx.createGain();
    this.sendCut = ctx.createBiquadFilter();
    this.sendCut.type = "highpass";
    this.sendCut.frequency.value = 300;
    this.preDelay = ctx.createDelay(0.1);
    this.preDelay.delayTime.value = 0.022;
    this.sendSum.connect(this.sendCut);
    this.sendCut.connect(this.preDelay);
    try {
      this.sendReverb = new Tone.Reverb({ decay: 1.9, wet: 1 });
      await this.sendReverb.ready;
      Tone.connect(this.preDelay, this.sendReverb);
      Tone.connect(this.sendReverb, this.glue);
      this.legacyReverb = new Tone.Reverb({ decay: 1.5, wet: 1 });
      await this.legacyReverb.ready;
      Tone.connect(this.legacyWet, this.legacyReverb);
      Tone.connect(this.legacyReverb, this.master);
    } catch (e) {
      console.warn("reverb unavailable, going dry", e);
    }

    // per-instrument strips
    this.gains = {};
    this.strips = {};
    for (const name of ["piano", "guitar", "bass", "drums", "solo"]) {
      const g = ctx.createGain();
      const sat = ctx.createWaveShaper(); // identity until enabled
      const cut = ctx.createBiquadFilter();
      cut.type = "peaking";
      cut.gain.value = 0;
      const air = ctx.createBiquadFilter();
      air.type = "highshelf";
      air.gain.value = 0;
      const pan = ctx.createStereoPanner();
      const send = ctx.createGain();
      send.gain.value = 0;
      g.connect(sat);
      sat.connect(cut);
      cut.connect(air);
      air.connect(pan);
      pan.connect(this.drySum);
      pan.connect(send);
      send.connect(this.sendSum);
      this.gains[name] = g;
      this.strips[name] = { sat, cut, air, pan, send };
    }

    // Virtual bass, engaged by Bass+. A phone speaker moves nothing below
    // ~250 Hz — the driver is far smaller than the wavelength — and a walking
    // line lives at 41 Hz (E1) to 196 Hz (G3), so on a phone the fundamental
    // is simply absent and turning the strip up only buys cone distortion.
    // Instead, generate the harmonics of that low content and let the ear put
    // the fundamental back: the "missing fundamental" that consumer kit has
    // leaned on for decades. Rectifier for the even harmonics, soft clip for
    // the odd; 2nd through 4th together are what make the illusion hold.
    const vbCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = i / 511.5 - 1;
      vbCurve[i] = 0.5 * (Math.abs(x) - 0.5) + (0.5 * Math.tanh(2.6 * x)) / Math.tanh(2.6);
    }
    const bass = this.strips.bass;
    // Body. "Fatter" is not "louder": weight lives at the top of the
    // fundamental range, around 120 Hz, and the strip had only a mud cut at
    // 300 and a treble shelf, so there was nowhere to put any. A lowshelf in
    // front of the drive means the saturation has something to thicken.
    const vbBody = ctx.createBiquadFilter();
    vbBody.type = "lowshelf";
    vbBody.frequency.value = 130;
    vbBody.gain.value = 0;
    bass.body = vbBody;
    const vbLow = ctx.createBiquadFilter(); // the fundamentals, not the pluck
    vbLow.type = "lowpass";
    vbLow.frequency.value = 220;
    const vbShape = ctx.createWaveShaper();
    vbShape.curve = vbCurve;
    const vbHi = ctx.createBiquadFilter(); // drop the DC the rectifier adds
    vbHi.type = "highpass";
    vbHi.frequency.value = 200;
    const vbTop = ctx.createBiquadFilter(); // keep it out of the piano's way
    vbTop.type = "lowpass";
    vbTop.frequency.value = 1400;
    const vbMix = ctx.createGain();
    vbMix.gain.value = 0; // silent unless Bass+ is on — see _applyPolish
    this.gains.bass.disconnect(bass.sat);
    this.gains.bass.connect(vbBody);
    vbBody.connect(bass.sat);
    bass.sat.connect(vbLow);
    vbLow.connect(vbShape);
    vbShape.connect(vbHi);
    vbHi.connect(vbTop);
    vbTop.connect(vbMix);
    vbMix.connect(bass.cut);
    bass.vb = vbMix;
    // _gainFor owns the levels — setting them literally here only held until the
    // first mute / band-volume / style change refreshed the strip from it
    const bg = this.bgVolume ?? 1;
    for (const name of ["piano", "guitar", "bass", "drums", "solo"]) {
      this.gains[name].gain.value = this._gainFor(name) * (name === "solo" ? 1 : bg);
    }

    this._applyPolish();

    this._buildDrumKit();
    this._loadDrumSamples(); // fire-and-forget — synth kit covers until ready

    let loaded = 0;
    const total = 3;
    const progress = () => this.cb.onProgress?.(++loaded, total);

    const loadSf = async (sfName, dest, fallback) => {
      try {
        const inst = new Soundfont(this.ctx, { instrument: sfName, destination: dest });
        await inst.load;
        progress();
        return inst;
      } catch (e) {
        console.warn(`soundfont ${sfName} failed, using synth fallback`, e);
        progress();
        return this._synthFallback(fallback, dest);
      }
    };

    [this.pianoEP, this.bassGM, this.guitarGM] = await Promise.all([
      loadSf("electric_piano_1", this.gains.piano, "piano"),
      loadSf("electric_bass_finger", this.gains.bass, "bass"),
      loadSf("electric_guitar_jazz", this.gains.guitar, "guitar"),
    ]);
    this._applyPiano();
    this._applyGuitar();
    this.bass = this.bassGM;
    if (this.grandOn) this._loadGrand();
    if (this.hqOn) this.loadHqPack();

    this.cb.onReady?.();
  }

  // each style gets its own bass voice: uprights for the acoustic styles,
  // fingered electric for the groove styles
  static STYLE_BASS = {
    funk: ["MusyngKite", "electric_bass_finger"],
    default: ["FluidR3_GM", "acoustic_bass"],
  };

  _applyStyleBass(style) {
    this._lastStyle = style;
    if (this._bassOverride) return;
    // Real pack: upright for the acoustic styles, sampled electric for funk
    // (falls back to GM electric until the pack carries one)
    const real = style === "funk" ? this._hq.bassElectric : this._hq.bass;
    if (this.hqOn && real) {
      this._bassChoice = style === "funk" ? "hq/electric" : "hq/meatbass";
      this.bass = real;
      this._refreshGain("bass");
      return;
    }
    const [kit, name] = Band.STYLE_BASS[style] ?? Band.STYLE_BASS.default;
    this.setBass(kit, name);
  }

  /** Audition any GM bass rendering: setBass("MusyngKite","electric_bass_finger") etc. */
  async setBass(kit, name) {
    this._bassChoice = `${kit}/${name}`;
    this._bassCache ??= {};
    const key = this._bassChoice;
    if (!this._bassCache[key]) {
      try {
        const inst = new Soundfont(this.ctx, { instrument: name, kit, destination: this.gains.bass });
        await inst.load;
        this._bassCache[key] = inst;
      } catch (e) {
        console.warn(`bass ${key} failed`, e);
        return;
      }
    }
    if (this._bassChoice === key) {
      this.bass = this._bassCache[key];
      this._refreshGain("bass");
    }
  }

  /** Acoustic grand for the comping piano (Splendid, public domain). */
  async _loadGrand() {
    if (this.pianoGrand) {
      this._applyPiano();
      return;
    }
    try {
      const inst = new SplendidGrandPiano(this.ctx, { destination: this.gains.piano });
      await inst.load;
      this.pianoGrand = inst;
      this._applyPiano();
    } catch (e) {
      console.warn("grand comping piano unavailable, staying on EP", e);
    }
  }

  setGrand(on) {
    this.grandOn = on;
    if (on) this._loadGrand();
    else this._applyPiano();
  }

  // comping piano stays on the Splendid grand — the sampled upright lost the
  // ear test against it, so the HQ pack covers guitar/bass/drums only
  _applyPiano() {
    this.piano = (this.grandOn && this.pianoGrand) || this.pianoEP;
  }

  _applyGuitar() {
    this.guitar = (this.hqOn && this._hq.guitar) || this.guitarGM;
  }

  /** Fetch + decode the whole HQ pack (idempotent — one load per session). */
  loadHqPack(onProgress) {
    if (!this.gains) return null; // before first play — _setup calls back in
    this._hqLoading ??= (async () => {
      const { loadHqPack } = await import("./hqpack.js");
      this._hq = await loadHqPack(
        this.ctx,
        { bass: this.gains.bass, bassElectric: this.gains.bass, guitar: this.gains.guitar, drums: this.gains.drums },
        (n, total) => (onProgress ?? this.cb.onHqProgress)?.(n, total)
      );
      if (this.hqOn) this._applyHq();
    })().catch((e) => {
      console.warn("HQ pack failed to load — staying on standard sounds", e);
      this._hqLoading = null;
      this.hqOn = false;
      this.cb.onHqError?.(e);
    });
    return this._hqLoading;
  }

  _applyHq() {
    this._applyPiano();
    this._applyGuitar();
    this._applyStyleBass(this._lastStyle ?? "swing");
    this._refreshGain("piano");
  }

  /** Switch between the HQ sample pack and the standard soundfonts, live. */
  setHq(on, onProgress) {
    this.hqOn = on;
    if (onProgress) this.cb.onHqProgress = onProgress;
    if (on && !this._hq.bass) return this.loadHqPack(onProgress);
    this._applyHq();
  }

  /** Reverb send for the bass strip. The Real pack's basses are close-miked and
   *  bone dry next to the GM soundfonts, so they need a lot more room to sit in
   *  the same space as the rest of the trio. The send bus low-cuts at 300 Hz,
   *  so this wets the harmonics and leaves the fundamental tight. */
  _bassSend() {
    const real = this._bassChoice?.startsWith("hq/");
    // electric (funk) bass wants to sit dry up front — barely any room on it
    if (this._bassChoice?.includes("electric")) return real ? 0.03 : 0.012;
    return real ? 0.425 : 0.13;
  }

  _refreshGain(name) {
    if (name === "bass" && this.strips?.bass && this.polish.reverb) {
      this.strips.bass.send.gain.setTargetAtTime(this._bassSend(), this.ctx.currentTime, 0.03);
    }
    if (!this.gains?.[name] || this.muted[name]) return;
    const bg = name === "solo" ? 1 : this.bgVolume ?? 1;
    this.gains[name].gain.setTargetAtTime(this._gainFor(name) * bg, this.ctx.currentTime, 0.03);
  }

  setRide(on) {
    this.rideOn = on;
    if (this.playing && this._songCtx) this._buildParts(this.song, this._lastFeel);
  }

  /** Toggle one polish element ("pan","eq","comp","reverb","sat","vel",
   *  "drumTone") or "on" for the whole chain. All live-safe. */
  setMix(key, val) {
    if (key === "on") for (const k of Object.keys(this.polish)) this.polish[k] = val;
    else if (key in this.polish) this.polish[key] = val;
    this._applyPolish();
  }

  _applyPolish() {
    if (!this.ctx) return;
    const P = this.polish;
    const t = this.ctx.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, t, 0.03);

    // stereo stage: a recorded-trio picture
    const pans = { piano: -0.35, guitar: 0.4, bass: 0, drums: 0.12, solo: -0.08 };
    // mud cut (peaking) + air (highshelf) per strip
    const eqs = {
      piano: { f: 280, cut: -3.5, airF: 8000, air: 1.5 },
      guitar: { f: 320, cut: -3, airF: 7000, air: 1 },
      // the shelf runs *down* on bass: the pluck's click lives up here, and
      // rolling it off is what turns an obvious attack into a hazier note.
      // Boost moves the corner up so the pluck comes back — a phone speaker
      // reads the bass by its attack, having no fundamental to work with
      bass: { f: 300, cut: -1.2, airF: this.bassBoost ? 3200 : 2400, air: -12 },
      drums: { f: 400, cut: -2, airF: 9000, air: 2 },
      solo: { f: 300, cut: -2, airF: 8000, air: 1.5 },
    };
    const sends = { piano: 0.18, guitar: 0.16, bass: this._bassSend(), drums: 0.1, solo: 0.22 };

    for (const [name, s] of Object.entries(this.strips)) {
      set(s.pan.pan, P.pan ? pans[name] : 0);
      const e = eqs[name];
      s.cut.frequency.value = e.f;
      s.cut.Q.value = 1;
      s.air.frequency.value = e.airF;
      set(s.cut.gain, P.eq ? e.cut : 0);
      set(s.air.gain, P.eq ? e.air : 0);
      set(s.send.gain, P.reverb ? sends[name] : 0);
    }
    // the harmonics that stand in for the fundamental a phone cannot produce
    if (this.strips.bass.vb) set(this.strips.bass.vb.gain, this.bassBoost ? 2.5 : 0);
    // Weight under the note. Backed off when Bass+ is on: that path is already
    // synthesising harmonics of the same content, and the two stack into boom.
    if (this.strips.bass.body) set(this.strips.bass.body.gain, P.eq ? (this.bassBoost ? 2 : 4.5) : 0);

    set(this.legacyWet.gain, P.reverb ? 0 : 0.35); // legacy inline-ish wash

    // bass warmth: gentle tanh drive
    if (!this._satCurves) {
      const mk = (drive) => {
        const c = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
          const x = (i / 511.5) - 1;
          c[i] = drive === 0 ? x : Math.tanh(x * (1 + drive)) / Math.tanh(1 + drive);
        }
        return c;
      };
      this._satCurves = { flat: mk(0), warm: mk(1.6), light: mk(0.6) };
    }
    // light drive, not warm: the harder tanh added upper harmonics, and those
    // harmonics are the edge on the note — the softest lever left once the
    // velocity is already sitting entirely on the gentle sample layer
    this.strips.bass.sat.curve = P.sat ? this._satCurves.light : this._satCurves.flat;
    this.strips.drums.sat.curve = P.sat ? this._satCurves.light : this._satCurves.flat;
    for (const n of ["piano", "guitar", "solo"]) this.strips[n].sat.curve = this._satCurves.flat;

    // glue + limiter (transparent when off)
    if (P.comp) {
      this.glue.threshold.value = -18;
      this.glue.ratio.value = 3;
      this.glue.knee.value = 12;
      this.glue.attack.value = 0.012;
      this.glue.release.value = 0.24;
      this.limiter.threshold.value = -2;
      this.limiter.ratio.value = 20;
      this.limiter.knee.value = 0;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.1;
      set(this.master.gain, 1.12);
    } else {
      this.glue.threshold.value = 0;
      this.glue.ratio.value = 1;
      this.limiter.threshold.value = 0;
      this.limiter.ratio.value = 1;
      set(this.master.gain, 0.9);
    }
  }

  /** Velocity curve: push our timid velocities into the expressive part of
   *  the samplers' response. Transparent when the polish flag is off. */
  _vel(v) {
    if (!this.polish.vel) return v;
    return Math.round(Math.min(127, 127 * Math.pow(v / 127, 0.72)));
  }

  /** The soloist's sounding range. A table lookup rather than a constant, so a
   *  future sampled horn only has to declare its own. */
  get soloRange() {
    return SOLO_INSTRUMENTS.piano;
  }

  /** Lazy-load the soloist. */
  async loadSoloist() {
    await this.setup();
    if (this.soloInst) return;
    try {
      const inst = new SplendidGrandPiano(this.ctx, { destination: this.gains.solo });
      await inst.load;
      this.soloInst = inst;
    } catch (e) {
      console.warn("solo piano failed, using synth fallback", e);
      this.soloInst = this._synthFallback("piano", this.gains.solo);
    }
  }

  /** Minimal smplr-compatible adapter over a Tone synth (offline fallback). */
  _synthFallback(kind, dest) {
    const presets = {
      piano: { oscillator: { type: "triangle8" }, envelope: { attack: 0.005, decay: 0.4, sustain: 0.3, release: 0.4 } },
      guitar: { oscillator: { type: "triangle4" }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.2 } },
      bass: { oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.2 } },
    };
    const synth = new Tone.PolySynth(Tone.Synth, presets[kind]);
    synth.volume.value = -8;
    synth.connect(dest);
    return {
      start: ({ note, time, duration, velocity = 90 }) =>
        synth.triggerAttackRelease(Tone.Frequency(note, "midi").toFrequency(), duration, time, velocity / 127),
      stop: () => synth.releaseAll(),
    };
  }

  /** Real one-shot samples (vendored in /samples/drums) — the synth pools
   *  keep playing until these are decoded, or forever if they're absent. */
  async _loadDrumSamples() {
    try {
      const base = "samples/drums";
      const probe = await fetch(`${base}/kick.m4a`, { method: "HEAD" });
      if (!probe.ok) return;
      // ride stays synthesized (MetalSynth pool) — the sampled ride read as
      // a crash; everything else plays real one-shots
      const bufs = {};
      await Promise.all(
        ["hat", "snare", "kick", "rim", "ride"].map(async (n) => {
          const res = await fetch(`${base}/${n}.m4a`);
          if (!res.ok) throw new Error(`${n}.m4a: ${res.status}`);
          bufs[n] = await this.ctx.decodeAudioData(await res.arrayBuffer());
        })
      );
      this.drumSamples = bufs;
    } catch (e) {
      console.warn("drum samples unavailable — staying on the synth kit", e);
    }
  }

  _buildDrumKit() {
    // Voice pools: each drum gets multiple rotating voices so overlapping
    // hits ring into each other like a real kit (and same-tick retriggers
    // land on different voices instead of throwing).
    const pool = (n, make) => {
      const voices = Array.from({ length: n }, make);
      let i = 0;
      return { next: () => voices[i++ % voices.length] };
    };

    this.kickPool = pool(2, () => {
      const s = new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 5,
        envelope: { attack: 0.001, decay: 0.35, sustain: 0 },
      });
      s.volume.value = -10;
      s.connect(this.gains.drums);
      return s;
    });

    this.ridePool = pool(3, () => {
      const s = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 1.1, release: 0.3 },
        harmonicity: 5.1,
        modulationIndex: 18,
        resonance: 7000,
        octaves: 1.2,
      });
      s.volume.value = -22;
      s.connect(this.gains.drums);
      return s;
    });

    this.hatFilter = new Tone.Filter(6000, "highpass");
    this.hatFilter.connect(this.gains.drums);
    this.hatPool = pool(2, () => {
      const s = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
      });
      s.volume.value = -16;
      s.connect(this.hatFilter);
      return s;
    });

    this.snareFilter = new Tone.Filter(1800, "bandpass");
    this.snareFilter.connect(this.gains.drums);
    this.snarePool = pool(2, () => {
      const s = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.002, decay: 0.13, sustain: 0 },
      });
      s.volume.value = -14;
      s.connect(this.snareFilter);
      return s;
    });

    this.rimPool = pool(2, () => {
      const s = new Tone.MembraneSynth({
        pitchDecay: 0.005,
        octaves: 1.5,
        envelope: { attack: 0.001, decay: 0.06, sustain: 0 },
      });
      s.volume.value = -14;
      s.connect(this.gains.drums);
      return s;
    });
  }

  setSolo(on) {
    this.soloOn = on;
  }

  setMuted(name, value) {
    this.muted[name] = value;
    if (this.gains?.[name]) {
      const bg = name === "solo" ? 1 : this.bgVolume ?? 1;
      this.gains[name].gain.setTargetAtTime(value ? 0 : this._gainFor(name) * bg, this.ctx.currentTime, 0.02);
    }
  }

  _gainFor(name) {
    // bass plays the soft velocity layer (see _bassEvents), which costs level;
    // this used to buy all of it back at 1.29 and the bass sat too far forward.
    // Held 5 dB under that now — soft touch, and it stays behind the trio.
    let g = { piano: 0.69, guitar: 1.2, bass: 0.7, drums: 0.8, solo: 1.25 }[name];
    // boost pulls the bass back up front for practising walking lines — phone
    // speakers and cheap earbuds lose the fundamental at the mixed level
    if (name === "bass" && this.bassBoost) g = 1.5;
    if (name === "piano" && this.hqOn) g *= 1.05; // keys sit up a touch in the Real mix
    if (name === "bass" && this._bassChoice?.includes("electric")) g *= 0.78;
    return g;
  }

  setBpm(bpm) {
    if (this.ctx) Tone.getTransport().bpm.value = bpm;
  }

  loadSong(song) {
    this.song = song;
    this._soloMotif = null; // a new tune starts with no material to quote
    if (this.playing) this.stop();
  }

  async play() {
    await this.setup();
    await Tone.start();

    const t = Tone.getTransport();
    const song = this.song;
    const feel = song.feel ?? (["bossa", "latin", "funk"].includes(song.style) ? "straight" : "swing");

    t.stop();
    t.cancel(0);
    t.position = 0;
    const bpmNow = this.bpmOverride ?? song.bpm;
    t.bpm.value = bpmNow;
    t.timeSignature = song.timeSignature ?? 4;
    // swing ratio follows tempo, iReal-style: rounder when slow, flatter fast
    const swingAmt = song.style === "ballad" ? 0.45 : bpmNow < 110 ? 0.58 : bpmNow < 170 ? 0.55 : 0.48;
    t.swing = feel === "swing" ? swingAmt : 0;
    t.swingSubdivision = "8n";
    // bar 0 is a count-in; the form loops over bars 1..n
    t.loop = true;
    t.loopStart = "1m";
    t.loopEnd = `${song.progression.length + 1}m`;

    this._chorus = 0;
    this._lastFeel = feel;
    this._applyStyleBass(song.style);
    this._buildParts(song, feel);
    // every chorus is a fresh take: just before each loop wrap, re-roll the
    // band's patterns and the solo (which builds as choruses stack up)
    t.scheduleRepeat(
      () => {
        this._chorus++;
        if (this.rampBpm) {
          const next = Math.min(this.rampCap, Tone.getTransport().bpm.value + this.rampBpm);
          this.setBpm(Math.round(next));
          this.cb.onTempo?.(Math.round(next));
        }
        this._buildParts(song, feel);
      },
      `${song.progression.length}m`,
      `${song.progression.length + 0.9}m`
    );
    this.playing = true;
    this.paused = false;
    t.start("+0.1");
  }

  /** Freeze where the tune stands. The parts and the transport position
   *  survive, so resume() picks the bar up mid-phrase rather than from the
   *  top — the reason to pause at all when you are working one passage. */
  pause() {
    if (!this.playing || this.paused) return;
    Tone.getTransport().pause();
    this.paused = true;
    // a sampled note holds its tail past the pause otherwise, so the bar
    // rings on over a stopped band
    this.piano?.stop?.();
    this.bass?.stop?.();
    this.guitar?.stop?.();
    this.soloInst?.stop?.();
  }

  resume() {
    if (!this.playing || !this.paused) return;
    this.paused = false;
    Tone.getTransport().start("+0.05");
  }

  stop() {
    const t = Tone.getTransport();
    t.stop();
    t.cancel(0);
    this.paused = false;
    this._setBandSilent(false); // a stop landing inside a chord break would stay muted
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    this.soloPart?.dispose();
    this.soloPart = null;
    this.playing = false;
    this.piano?.stop?.();
    this.bass?.stop?.();
    this.guitar?.stop?.();
    this.soloInst?.stop?.();
  }

  // ---------------------------------------------------------------- events

  _buildParts(song, feel) {
    this.parts.forEach((p) => p.dispose());
    this.parts = [];

    const bpb = song.timeSignature ?? 4;
    const chords = this._flatten(song, bpb);
    const totalBeats = song.progression.length * bpb;
    const straight = feel !== "swing";
    const style = song.style;

    // the soloist goes first so the band can listen to it
    this._songCtx = { chords, totalBeats, style, bpb };
    const soloEvents =
      this.holdTake && this._heldLine
        ? this._heldLine.map((e) => ({ ...e }))
        : this._soloEvents(chords, totalBeats, style, this.soloRange.lo, this.soloRange.hi, bpb);
    if (this.holdTake && !this._heldLine) this._heldLine = soloEvents.map((e) => ({ ...e }));
    this._soloEventsCache = soloEvents;

    // which bars is the soloist busy in? the comp thins there and breathes
    // in the gaps (only when the solo is actually audible)
    const busyBars = new Set();
    const phraseEnds = [];
    if (this.soloOn) {
      const perBar = new Map();
      for (const e of soloEvents) {
        const bar = Math.floor(e.beat / bpb);
        perBar.set(bar, (perBar.get(bar) ?? 0) + 1);
        if (e.dur >= 1.1) phraseEnds.push(e.beat);
      }
      for (const [bar, n] of perBar) if (n >= 3) busyBars.add(bar);
    }
    const duck = (events) =>
      events.filter((e) => !busyBars.has(Math.floor(e.beat / bpb)) || rand() < 0.55)
        .map((e) => (busyBars.has(Math.floor(e.beat / bpb)) ? { ...e, vel: Math.max(20, e.vel - 8) } : e));

    const ev = {
      piano: duck(this._pianoEvents(chords, style, straight, bpb)),
      guitar: duck(this._guitarEvents(chords, song, style, straight, bpb)),
      bass: this._bassEvents(chords, totalBeats, style, straight, bpb),
      drums: this._drumEvents(song, style, straight, bpb, { phraseEnds }),
      meta: [],
    };

    // rhythm-section roles: after the first chorus, guitar-led and piano-led
    // choruses trade off — both comping full-time is a machine's tell
    const role = this._chorus ? choice(["guitar", "piano", "both"]) : "both";
    if (role === "guitar") ev.piano = ev.piano.filter(() => rand() < 0.55);
    if (role === "piano") ev.guitar = ev.guitar.filter(() => rand() < 0.55);

    // each chorus leans a little different — comping thickens on the "up"
    // choruses and thins with softer touch on the "down" ones
    const bwave = [0.92, 1, 1.1, 0.82][(this._chorus ?? 0) % 4];
    const tilt = (events) =>
      events
        .filter(() => bwave >= 1 || rand() < 0.7 + bwave * 0.3)
        .map((e) => ({ ...e, vel: Math.max(16, Math.round(e.vel + (bwave - 1) * 20)) }));
    ev.piano = tilt(ev.piano);
    ev.guitar = tilt(ev.guitar);

    for (const c of chords) ev.meta.push({ kind: "chord", beat: c.startBeat, chord: c });
    for (let b = 0; b < totalBeats; b++) {
      ev.meta.push({ kind: "beat", beat: b, bar: Math.floor(b / bpb), beatInBar: b % bpb });
    }

    const beatSec = () => 60 / Tone.getTransport().bpm.value;
    // everything shifts one bar right — bar 0 belongs to the count-in
    const toBBS = (beat) => {
      const shifted = beat + bpb;
      const bar = Math.floor(shifted / bpb);
      const rem = shifted - bar * bpb;
      return `${bar}:${Math.floor(rem)}:${Math.round((rem % 1) * 4)}`;
    };
    const mk = (events, cb) => {
      const part = new Tone.Part(cb, events.map((e) => [toBBS(e.beat), e]));
      part.start(0);
      this.parts.push(part);
    };

    // count-in: one bar of hat clicks (plays once — the loop skips bar 0)
    const countEvents = [];
    for (let b = 0; b < bpb; b++) {
      countEvents.push({ beat: b, drum: "hat", vel: b === 0 ? 56 : 40, count: true });
      ev.meta.push({ kind: "beat", beat: b - bpb, bar: -1, beatInBar: b });
    }
    const countPart = new Tone.Part(
      (time, e) => {
        if (this.drumSamples?.hat) {
          const src = this.ctx.createBufferSource();
          src.buffer = this.drumSamples.hat;
          const g = this.ctx.createGain();
          g.gain.value = (e.vel / 127) * 1.1;
          src.connect(g);
          g.connect(this.gains.drums);
          src.start(time);
        } else {
          try { this.hatPool.next().triggerAttackRelease(0.04, time, e.vel / 127); } catch { /* skip */ }
        }
      },
      countEvents.map((e) => [`0:${e.beat}:0`, e])
    );
    countPart.start(0);
    this.parts.push(countPart);

    mk(ev.piano, (time, e) => {
      if (this.muted.piano) return;
      e.midis.forEach((m, i) =>
        this.piano.start({ note: m, time: time + i * (e.roll ? 0.02 : 0.005), duration: e.dur * beatSec(), velocity: this._vel(e.vel) })
      );
    });

    mk(ev.guitar, (time, e) => {
      if (this.muted.guitar) return;
      e.midis.forEach((m, i) =>
        this.guitar.start({ note: m, time: time + i * (e.roll ? 0.025 : 0.008), duration: e.dur * beatSec(), velocity: this._vel(e.vel) })
      );
    });

    mk(ev.bass, (time, e) => {
      if (this.muted.bass) return;
      this.bass.start({ note: e.midi, time, duration: e.dur * beatSec() * 0.88, velocity: this._vel(e.vel) });
    });

    mk(ev.drums, (time, e) => {
      if (this.muted.drums) return;
      const v = e.vel / 127;
      // sampled kit when loaded: real attacks, per-hit pitch/level jitter;
      // per-drum trim keeps the ride way back in the mix
      const hqBuf = this.hqOn && this._hq.drums ? this._hq.drums.pick(e.drum, e.vel) : null;
      const buf = hqBuf ?? this.drumSamples?.[e.drum];
      if (buf) {
        // Real samples are peak-normalized to -3 dB, so these trims mirror the
        // standard kit's per-voice balance
        // Real ride is an overhead-mic take — soft attack, so it needs a much
        // hotter trim than the dry standard one-shot to read in the mix
        const trim = hqBuf
          ? { hat: 0.7, snare: 1.35, kick: 0.9, rim: 1.2, ride: 0.65 }[e.drum] ?? 0.5
          : { hat: 0.6, snare: 1.3, kick: 0.7, rim: 1.1, ride: 0.35 }[e.drum] ?? 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        // HQ kit has real round-robins, so only a whisper of pitch jitter
        src.playbackRate.value = Math.pow(2, rnd(hqBuf ? -12 : -35, hqBuf ? 12 : 35) / 1200);
        const g = this.ctx.createGain();
        // perceptual curve: quiet hits fall away faster than linear
        const vNorm = Math.pow(e.vel / 127, this.polish.drumTone ? 1.35 : 1);
        g.gain.value = Math.min(1, vNorm * 1.35 * trim);
        src.connect(g);
        // HQ velocity layers already darken soft hits — skip the filter there
        if (!hqBuf && this.polish.drumTone && e.vel < 60 && e.drum !== "ride") {
          // soft hits get darker, not just quieter — like sticks do
          const lp = this.ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 2500 + (e.vel / 60) * 7000;
          g.connect(lp);
          lp.connect(this.gains.drums);
        } else {
          g.connect(this.gains.drums);
        }
        // hat choke: a new hat hit cuts the previous one's tail
        if (e.drum === "hat" && this.polish.drumTone) {
          try { this._lastHat?.stop(time); } catch { /* already ended */ }
          this._lastHat = src;
        }
        src.start(time);
        return;
      }
      // rotating voices + per-hit jitter: pitch, decay, and ring length all
      // vary a little, and harder hits ring longer — no two hits identical
      try {
        switch (e.drum) {
          case "ride":
            this.ridePool.next().triggerAttackRelease(
              (e.freq ?? 320) + rnd(-22, 22),
              (e.len ?? 0.5) * (0.7 + v * 0.7) * rnd(0.9, 1.1),
              time,
              v
            );
            break;
          case "hat": this.hatPool.next().triggerAttackRelease(rnd(0.028, 0.05), time, v); break;
          case "snare": this.snarePool.next().triggerAttackRelease(rnd(0.1, 0.16) * (0.8 + v * 0.5), time, v); break;
          case "kick": this.kickPool.next().triggerAttackRelease(rnd(46, 52), 0.1, time, v); break;
          case "rim": this.rimPool.next().triggerAttackRelease(rnd(312, 345), 0.05, time, v); break;
        }
      } catch { /* same-tick voice collision — skip the hit */ }
    });

    mk(ev.meta, (time, e) => {
      // scheduled on the audio clock, not in the draw callback — a level change
      // a frame late is a level change you can hear
      if (this.breakBars && e.kind === "beat" && e.beatInBar === 0 && e.bar >= 0) {
        this._setBandSilent(Math.floor(e.bar / this.breakBars) % 2 === 1, time);
      }
      Tone.getDraw().schedule(() => {
        if (e.kind === "chord") this.cb.onChord?.(e.chord);
        else this.cb.onBeat?.(e.bar, e.beatInBar);
      }, time);
    });

    this._songCtx = { chords, totalBeats, style, bpb, beatSec };
    this._makeSoloPart(soloEvents);
  }

  /** Regenerate the line on demand (dial/style change, "new take"). */
  _rebuildSoloPart() {
    const ctx = this._songCtx;
    if (!ctx) return;
    this._makeSoloPart(this._soloEvents(ctx.chords, ctx.totalBeats, ctx.style, this.soloRange.lo, this.soloRange.hi, ctx.bpb));
  }

  _makeSoloPart(events) {
    const ctx = this._songCtx;
    if (!ctx) return;
    this.soloPart?.dispose();
    const ppq = Tone.getTransport().PPQ;

    // Tone swings at the tick level: every event off the beat is displaced by
    //   shift(x) = (swing / 3) · sin(π · x)     [x = position within the beat]
    // which is right for 8th notes and wrong for everything else — a triplet
    // came out long-medium-short and a 16th run decelerated. The curve is
    // monotonic, so invert it: 8ths keep Tone's swing, and triplets and 16ths
    // are pre-compensated to land where the generator actually wrote them.
    const swing = Tone.getTransport().swing;
    const invert = (beat) => {
      const whole = Math.floor(beat);
      const x = beat - whole;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (mid + (swing / 3) * Math.sin(Math.PI * mid) < x) lo = mid;
        else hi = mid;
      }
      return whole + (lo + hi) / 2;
    };

    // Which notes belong to a figure finer than an 8th? Position alone can't
    // say — a note on the & of a beat is a swung 8th in one line and the third
    // of four even 16ths in another. The gap to its neighbours can: anything
    // spaced tighter than an 8th is a triplet or a 16th burst, and those are
    // played even, so they get compensated and the plain 8ths keep their swing.
    const order = [...events].sort((a, b) => a.beat - b.beat);
    const fine = new Set();
    const tight = (g) => g > 1e-6 && g < 0.45;
    for (let i = 0; i < order.length; i++) {
      const before = i > 0 ? order[i].beat - order[i - 1].beat : Infinity;
      const after = i < order.length - 1 ? order[i + 1].beat - order[i].beat : Infinity;
      if (tight(before) || tight(after)) fine.add(order[i]);
    }

    const preSwing = (e) => {
      if (!swing) return e.beat;
      const x = e.beat - Math.floor(e.beat);
      if (x < 1e-6) return e.beat; // on the beat — Tone leaves these alone
      if (!fine.has(e) && Math.abs(x - 0.5) < 1e-6) return e.beat; // a plain 8th: swing it
      return invert(e.beat);
    };
    this.soloEvents = [...events].sort((a, b) => a.beat - b.beat);
    this.cb.onSoloLine?.(this.soloEvents, { chords: ctx.chords, totalBeats: ctx.totalBeats, bpb: ctx.bpb });
    this.soloPart = new Tone.Part((time, e) => {
      if (!this.soloOn) return;
      const st = SOLO_STYLES[this.soloStyleName]?.p ?? {};
      const durSec = e.dur * ctx.beatSec();
      const when = time + (((st.lag ?? 19) * (STYLE_FEEL[ctx.style]?.lag ?? 1)) / 1000) * (1 - 0.55 * SOLO_HEAT) + ((e.lagAdj ?? 0) / 1000) + rnd(-0.004, 0.004);
      this.soloInst?.start({
        note: e.midi,
        time: when,
        duration: durSec,
        velocity: this._vel(e.vel),
      });
      // Inner voices sit under the melody and arrive fractionally after it —
      // a hand does not land perfectly flat, and stacking three notes at one
      // instant and one level reads as a synthesiser, not as a chord.
      (e.extra ?? []).forEach((m, k) => {
        this.soloInst?.start({
          note: m,
          time: when + 0.005 + k * 0.004 + rnd(0, 0.003),
          duration: durSec * (1 - 0.04 * k),
          velocity: this._vel(Math.max(28, e.vel - 14 - k * 7)),
        });
      });
      // The interface used to receive a bare pitch class — octave, beat, chord
      // and harmonic function all thrown away at this line, so a tool that
      // knows exactly why every note works could only ever print a letter.
      let c = ctx.chords[0];
      for (const x of ctx.chords) if (x.startBeat <= e.beat % ctx.totalBeats) c = x;
      Tone.getDraw().schedule(
        () => this.cb.onSoloNote?.({ midi: e.midi, beat: e.beat, durSec, chord: c, atom: e.atom, vel: e.vel }),
        when
      );
    }, events.map((e) => [`${Math.round((preSwing(e) + ctx.bpb) * ppq)}i`, e]));
    this.soloPart.start(0);
  }

  /**
   * Phrase-based improv with a dynamic arc — no fixed mood. Intensity rises
   * across the chorus (sparse/soft open → busy/loud peak ~3/4 in → cool-down)
   * and every phrase parameter interpolates with it: length, rest, velocity,
   * register, 16th-note runs. Realism devices: motif echoes (a phrase's
   * rhythm+contour replayed transposed), bebop enclosures into chord-tone
   * landings, blue notes, repeated notes, grace-note scoops.
   */
  /** The improvised line for one chorus. Seeded on (take, chorus) so the same
   *  take always plays the same solo — the other parts draw from the RNG too,
   *  so without a scope of its own the line would shift whenever the drummer
   *  rolled one more fill. */
  _soloEvents(chords, totalBeats, style, lo, hi, bpb = 4) {
    const seed = (Math.imul(this.takeSeed >>> 0, 0x9e3779b1) + (this._chorus ?? 0) * 0x85ebca6b) >>> 0;
    return withSeed(seed, () => this._soloLine(chords, totalBeats, style, lo, hi, bpb));
  }

  _soloLine(chords, totalBeats, style, lo, hi, bpb = 4) {
    const events = [];
    {
      // A voice does not have a piano's range. Narrowing the band itself —
      // rather than only the register target — is what keeps every later pass
      // (pools, guide tones, arrivals) inside it, so nothing can quietly put
      // the line somewhere nobody could sing.
      const sp = SOLO_STYLES[this.soloStyleName]?.p?.span;
      if (sp && sp < 1) {
        const mid = lo + (hi - lo) * (((SOLO_STYLES[this.soloStyleName].p.regLo ?? 0.35) + (SOLO_STYLES[this.soloStyleName].p.regHi ?? 0.72)) / 2);
        const half = ((hi - lo) * sp) / 2;
        lo = Math.round(Math.max(lo, mid - half));
        hi = Math.round(Math.min(hi, mid + half));
      }
    }
    const ballad = style === "ballad";
    const lerp = (a, b, x) => a + (b - a) * x;

    // Where a phrase is allowed to start. Quantising the gap between phrases
    // to 16ths let a line re-enter on beat 2.75, which reads as losing the
    // place rather than as phrasing. Players come in where the bar is audible
    // — the middle of the bar, the & of 4 as a pickup, or the next downbeat —
    // so land on the 8th grid and pull onto one of those when it is close.
    // Only ever moves forward, so the phrase loop always makes progress.
    const snapEntry = (x) => {
      const eighth = Math.ceil(x * 2) / 2;
      const bar = Math.floor(eighth / bpb) * bpb;
      for (const s of [bar + Math.floor(bpb / 2), bar + bpb - 0.5, bar + bpb]) {
        if (s >= eighth && s - eighth <= 0.5 && rand() < 0.65) return s;
      }
      return eighth;
    };
    const pools = new Map();
    const poolFor = (c) => {
      if (!pools.has(c)) {
        const pcs = new Set(soloScaleSteps(c.info).map((s) => (c.info.rootPc + s) % 12));
        const pool = [];
        for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) pool.push(m);
        pools.set(c, pool);
      }
      return pools.get(c);
    };
    // chord tones only — what an arpeggio figure walks, as opposed to the full
    // scale a run walks
    const tonePools = new Map();
    const tonePoolFor = (c) => {
      if (!tonePools.has(c)) {
        const pcs = new Set(c.info.intervals.map((s) => (c.info.rootPc + s) % 12));
        const pool = [];
        for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) pool.push(m);
        tonePools.set(c, pool.length >= 3 ? pool : poolFor(c));
      }
      return tonePools.get(c);
    };
    const isDom = (c) => c.info.intervals.includes(4) && c.info.intervals.includes(10);
    // tritone-sub color: mixolydian a tritone away, for dominants at the peak
    const subPools = new Map();
    const subPoolFor = (c) => {
      if (!subPools.has(c)) {
        const subRoot = (c.info.rootPc + 6) % 12;
        const pcs = new Set([0, 2, 4, 5, 7, 9, 10].map((s) => (subRoot + s) % 12));
        const pool = [];
        for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) pool.push(m);
        subPools.set(c, pool);
      }
      return subPools.get(c);
    };
    const chordAt = (beat) => {
      let cur = chords[0];
      for (const c of chords) if (c.startBeat <= beat % totalBeats) cur = c;
      return cur;
    };
    const nearestIdx = (pool, midi, filter) => {
      let best = -1;
      for (let i = 0; i < pool.length; i++) {
        if (filter && !filter(pool[i])) continue;
        if (best === -1 || Math.abs(pool[i] - midi) < Math.abs(pool[best] - midi)) best = i;
      }
      return best; // -1 when nothing matched — callers must keep the current note
    };
    const blueNote = (c, near) => {
      const pcs = [3, 6, 10].map((s) => (c.info.rootPc + s) % 12);
      let best = null;
      for (let m = Math.max(lo, near - 8); m <= Math.min(hi, near + 8); m++) {
        if (!pcs.includes(m % 12)) continue;
        if (best === null || Math.abs(m - near) < Math.abs(best - near)) best = m;
      }
      return best;
    };
    // guide-tone thread: a voice-led line of 3rds/7ths through the whole
    // form — the skeleton real solos hang from
    const thread = new Map();
    {
      const pk = (arr, wanted) => { for (const w of wanted) if (arr.includes(w)) return w; return null; };
      const candsFor = (ch) => {
        const iv = ch.info.intervals;
        const out = [];
        for (const s of [pk(iv, [4, 3, 5]) ?? 4, pk(iv, [10, 11, 9]) ?? 7]) {
          const pc = (ch.info.rootPc + s) % 12;
          for (let m = lo + 2; m <= hi - 3; m++) if (m % 12 === pc) out.push(m);
        }
        return out;
      };
      let prevT = (lo + hi) / 2;
      for (let i = 0; i < chords.length; i++) {
        const ch = chords[i];
        const cands = candsFor(ch);
        // What the next chord can be reached from. Picking purely the nearest
        // guide tone rates a held common tone above the descending half step
        // — and that half step (7th falling to the next 3rd) is the whole
        // reason a guide-tone line sounds like a line rather than a series of
        // correct notes. One chord of lookahead is enough to prefer it.
        const nextPcs = i + 1 < chords.length
          ? new Set(candsFor(chords[i + 1]).map((m) => m % 12))
          : null;
        let best = cands[0] ?? Math.round(prevT);
        let bestCost = Infinity;
        for (const m of cands) {
          const d = m - prevT;
          let cost = Math.abs(d);
          if (d === 0) cost += 1.5; // a held tone is easy and says nothing
          if (d === -1) cost -= 2; // arrived by the descending half step
          if (nextPcs?.has((((m - 1) % 12) + 12) % 12)) cost -= 2.5; // sets one up
          if (cost < bestCost) {
            bestCost = cost;
            best = m;
          }
        }
        thread.set(ch, best);
        prevT = best;
      }
    }
    // Cadences. The line used to have no lookahead at all: chordAt(t) reported
    // whatever was under the cursor, so a chord tone landed on the change only
    // when the previous duration happened to leave it there — as often beat
    // 2.25 as beat 1. Arriving is most of what makes a bebop line sound like it
    // is going somewhere, so every change now carries a target pitch class and
    // a beat to hit it on, and dominants resolving down a fifth get the real
    // one: the 7th of the V falling a half step into the 3rd of the I.
    const changeBeats = [...new Set(chords.map((ch) => ch.startBeat))].sort((a, b) => a - b);
    const aims = new Map(); // chord → { pc, prep, kind }
    {
      const ivOf = (ch, wanted, fallback) => {
        for (const w of wanted) if (ch.info.intervals.includes(w)) return w;
        return fallback;
      };
      const thirdPc = (ch) => (ch.info.rootPc + ivOf(ch, [3, 4], 4)) % 12;
      const seventhPc = (ch) => (ch.info.rootPc + ivOf(ch, [10, 11], 10)) % 12;
      for (let i = 0; i < chords.length; i++) {
        const ch = chords[i];
        const prev = chords[i - 1] ?? chords[chords.length - 1];
        const up4 = (prev.info.rootPc + 5) % 12 === ch.info.rootPc;
        const downHalf = (prev.info.rootPc + 11) % 12 === ch.info.rootPc;
        const resolving = isDom(prev) && (up4 || downHalf);
        aims.set(ch, {
          // The 3rd is what a resolution lands on. Away from a cadence the
          // guide-tone thread already picked a voice-led note, so aim there and
          // leave the thread's line intact.
          pc: resolving ? thirdPc(ch) : thread.get(ch) % 12,
          // What the previous chord should be sitting on to make that arrival
          // audible — its 7th, a half step above the target.
          prep: resolving ? seventhPc(prev) : null,
          kind: resolving ? (up4 ? "V-I" : "tritone") : "change",
        });
      }
    }
    /** The next chord boundary strictly after `beat`, or null past the form. */
    const changeAfter = (beat) => {
      for (const b of changeBeats) if (b > beat + 1e-6) return b;
      return null;
    };
    const chordAtStart = new Map(chords.map((ch) => [ch.startBeat, ch]));
    // Two dials plus the arc shape the line. "crowd" is density — how packed
    // the notes are — and "phrase" is length: how long a statement runs before
    // the player breathes. They were one dial before, which is why turning up
    // the note count also chopped the phrasing.
    //
    // Loudness used to be the second dial and is gone. It never earned its
    // place next to the other one: the mixer already has a band level, and the
    // dynamics that matter here are the ones the *line* makes as it builds and
    // lays back, not a level the listener sets once. That range now lives in
    // the arc below, which the dial was mostly flattening.
    const { crowd: c, phrase: ph, cantabile: cant } = this.soloFeel;
    const h = SOLO_HEAT;
    // A dial that leaves the middle alone: 0.5 is exactly today's behaviour,
    // and the ends stretch away from it in both directions.
    const dial = (min, mid, max, x) => (x < 0.5 ? lerp(min, mid, x * 2) : lerp(mid, max, (x - 0.5) * 2));
    // The old top of the dial is the new middle. At 2.2x the corpus phrase
    // length the line finally read as a solo rather than as answers, so that
    // is 100% now and the slider runs half to double it.
    const PHRASE_100 = 2.2;
    const phraseSpan = dial(0.5, 1, 2, ph); // 50% … 100% … 200%
    const phraseDial = PHRASE_100 * phraseSpan;
    const S = SOLO_STYLES[this.soloStyleName]?.p ?? {};
    const F = STYLE_FEEL[style] ?? {};
    // merged parameter view: soloist personality x song-style feel
    const M = {
      trip: (S.trip ?? 1) * (F.trip ?? 1),
      p16: (S.p16 ?? 1) * (F.p16 ?? 1),
      encl: (S.encl ?? 1) * (F.encl ?? 1),
      blue: (S.blue ?? 1) * (F.blue ?? 1),
      rest: (S.rest ?? 1) * (F.rest ?? 1),
      phrase: (S.phrase ?? 1) * (F.phrase ?? 1),
      hold: (S.hold ?? 1) * (F.hold ?? 1) * lerp(0.8, 1.6, cant),
      sit: (S.sit ?? 0.08) * (F.sit ?? 1),
      crush: (S.crush ?? 0.18) * (F.crush ?? 1),
      grammar: (S.grammar ?? 0.26) * (F.grammar ?? 1),
      offStart: Math.max(S.offStart ?? 0, F.offStart ?? 0),
      offAcc: (S.offAcc ?? 0) + (F.offAcc ?? 0),
      velOff: (S.velOff ?? 0) + (F.velOff ?? 0),
      wRun: (S.wRun ?? 1) * (F.wRun ?? 1),
      wLong: (S.wLong ?? 1) * (F.wLong ?? 1),
      wRiff: (S.wRiff ?? 1) * (F.wRiff ?? 1),
      motif: (S.motif ?? 0.5) * (F.motif ?? 1),
      antic: (S.antic ?? 1) * (F.antic ?? 1),
      // how reliably the player lands on the change rather than near it —
      // bebop aims almost every time, Monk deliberately does not
      aim: Math.min(0.95, (S.aim ?? 0.7) * (F.aim ?? 1)),
    };
    // multi-chorus energy wave: statement → build → PEAK → layout, repeat.
    // High tide gets burn devices; the layout chorus genuinely rests.
    const chor = this._chorus ?? 0;
    const WAVE = [0.85, 1.05, 1.2, 0.65];
    const wave = ballad ? 0.9 : WAVE[chor % 4];
    const isPeakChorus = wave > 1.1;
    const isLayout = wave < 0.7;
    const windFrom = totalBeats - 2 * bpb;
    const arcAt = (t) => {
      const x = (t % totalBeats) / totalBeats;
      const arc = x < 0.72 ? x / 0.72 : (1 - x) / 0.28;
      let i = ((0.08 + 0.9 * arc) * lerp(0.75, 1.2, h) + rnd(-0.1, 0.1)) * wave * (1 + Math.min(chor, 6) * 0.015);
      if (t >= windFrom) i *= 0.5;
      return Math.max(0.05, Math.min(1, ballad ? i * 0.6 : i));
    };
    // Articulation. This was a flat multiplier — every note sounded 0.885 of
    // its written length — which is wrong in the way that matters: a written
    // half note came out 1.77 beats, a quarter-beat hole punched into the
    // middle of a note whose whole point is being held. Bresin & Battel
    // (JNMR 2000) measured legato key-overlap *falling* as the inter-onset
    // interval grows, i.e. the join between two notes is a roughly fixed
    // amount of time rather than a fixed fraction of them. So: a gap in beats,
    // capped so it can never eat a short note, and going negative — a real
    // overlap — at the singing end of the dial.
    const joinGap = lerp(0.2, -0.05, cant) * (2 - (S.artic ?? 1));
    const sound = (d) => Math.max(0.1, d - Math.min(joinGap, d * 0.4));
    const legato = Math.min(1, lerp(0.97, 0.8, h) * (S.artic ?? 1)); // still used by the grace figures
    // phrase flavors keep the line from sounding same-y; crowding squeezes
    // long-tone phrases out of the mix
    const pickFlavor = (i) => {
      const wRun = (0.15 + 0.45 * i + 1.15 * c) * M.wRun;
      const wLong = Math.max(0.03, (1.5 - 1.4 * i) * (1 - 0.95 * c)) * M.wLong;
      const wRiff = 0.3 * M.wRiff;
      let r = rand() * (wRun + wLong + wRiff);
      if ((r -= wRun) <= 0) return "run";
      if ((r -= wLong) <= 0) return "longtones";
      return "riff";
    };

    // The Weimar Bebop Alphabet, after Frieler's analysis of the 456 solos in
    // the Weimar Jazz Database: a jazz line is a chain of figures — a scale
    // fragment, an arpeggio fragment, an approach onto a target, a turn around
    // one note, a repeat, a leap — and not a note-by-note walk. What used to
    // live here was a mean-reverting random walk with five correction passes
    // bolted on afterwards, which is a spell-checker over random text: every
    // note defensible, the line saying nothing.
    //
    // Figure choice is conditioned on the mid-level unit: a "line" (long,
    // rhythmically even) chains long scale and arpeggio figures, a "lick"
    // (short, syncopated) mixes short figures with approaches and turns. Those
    // two cover about 75% of everything in the corpus.
    const ATOM_MIX = {
      line: { scale: 0.42, arp: 0.34, approach: 0.08, neighbor: 0.06, leap: 0.06, repeat: 0.04 },
      lick: { scale: 0.18, arp: 0.26, approach: 0.22, neighbor: 0.16, repeat: 0.1, leap: 0.08 },
    };
    // Rhythm templates, one set per mid-level unit. A "line" is rhythmically
    // uniform — that is what makes it a line — so its templates are runs of
    // eighths with the odd triplet turn or sixteenth pair; a "lick" is short
    // and syncopated. Both are filled into a beat budget, so a phrase ends up
    // a length of time rather than a number of notes.
    const RHYTHM = {
      line: [
        [0.5, 0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [0.5, 0.5, 1],
        [1 / 3, 1 / 3, 1 / 3, 0.5, 0.5],
        [0.25, 0.25, 0.5, 0.5],
        [0.25, 0.25, 0.25, 0.25, 0.5, 0.5],
      ],
      lick: [
        [0.5, 0.25, 0.25, 1],
        [1.5, 0.5, 1], // Charleston
        [0.5, 0.5, 1.5],
        [0.25, 0.25, 0.5, 0.5, 1],
        [1 / 3, 1 / 3, 1 / 3, 1],
        [0.5, 1, 0.5],
        [1, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1.5],
      ],
    };
    const ATOM_LEN = {
      line: { scale: [4, 8], arp: [3, 6], approach: [3, 3], neighbor: [2, 4], repeat: [2, 3], leap: [1, 1] },
      lick: { scale: [2, 5], arp: [2, 4], approach: [3, 3], neighbor: [2, 3], repeat: [2, 3], leap: [1, 1] },
    };
    // Where the corpus can speak, let it. WJD gives each of these players a
    // measured interval profile — how much of their movement is stepwise, in
    // thirds, in leaps, in repeats — and each figure produces one of those
    // kinds. Divide the wanted share of intervals by the number of intervals a
    // figure yields and you have how often to reach for it. Styles the corpus
    // cannot cover (the pianists and Wes: WJD transcribes single-line wind and
    // guitar) keep their hand-authored mix.
    const ATOM_YIELD = { scale: 5.5, arp: 3.7, approach: 2.5, neighbor: 2.5, repeat: 1.5, leap: 1 };
    const prof = WJD.styles?.[this.soloStyleName];
    let measuredMix = null;
    if (prof) {
      // The figures are not the only thing moving the line: chord landings,
      // arrival approaches, motif echoes and vocabulary cells all contribute
      // intervals the mix does not choose, and nearly all of them are
      // stepwise. Measured against the corpus, aiming the mix straight at the
      // target shares lands 10 points heavy on steps and 10 light on thirds,
      // so the mix has to lean past the target to hit it.
      measuredMix = {
        scale: (prof.step * 0.34) / ATOM_YIELD.scale,
        neighbor: (prof.step * 0.2) / ATOM_YIELD.neighbor,
        approach: (prof.step * 0.14) / ATOM_YIELD.approach,
        arp: (prof.third * 3.1) / ATOM_YIELD.arp,
        leap: prof.leap / ATOM_YIELD.leap,
        repeat: (prof.repeat * 2.2) / ATOM_YIELD.repeat,
      };
      const sum = Object.values(measuredMix).reduce((x, y) => x + y, 0);
      for (const k in measuredMix) measuredMix[k] /= sum; // same scale as ATOM_MIX
    }
    // Vocabulary. Two or three hand-written licks per style was the whole
    // library; the corpus supplies the shapes each player actually reached for
    // repeatedly. Plain scale and chromatic runs are filtered out at mining
    // time — the scale figure already makes those — so what lands here is the
    // part the generator could not invent: material that turns.
    const vocab = [...(S.cells ?? []), ...(prof?.licks ?? [])];
    const cellProb = Math.min(0.55, (S.cellProb ?? 0) + (prof?.licks?.length ? 0.12 : 0));
    const pickAtomKind = (mlu) => {
      const mix = ATOM_MIX[mlu];
      const w = S.atoms ?? {};
      let total = 0;
      const rows = [];
      for (const k in mix) {
        // a lick still leans on its short figures even for a measured player,
        // so the corpus profile blends with the unit's own character
        let base = measuredMix ? (mlu === "line" ? measuredMix[k] : (measuredMix[k] + mix[k]) / 2) : mix[k] * (w[k] ?? 1);
        // a singing line moves by step and turns around notes; it does not jump
        base *= k === "scale" || k === "neighbor" ? lerp(0.85, 1.4, cant) : k === "leap" ? lerp(1.5, 0.35, cant) : 1;
        total += base;
        rows.push([k, total]);
      }
      const r = rand() * total;
      for (const [k, acc] of rows) if (r <= acc) return k;
      return "scale";
    };
    let carryDir = 0; // a leap owes the line a step back the other way

    let t = choice([0.5, 1, 1.5, 2]);
    let cur = lo + (hi - lo) * 0.45;
    let lastChord = null;
    let lastEnd = 0;
    // seed from the previous chorus so a later chorus can quote an earlier one —
    // the structural memory that multi-chorus solos are built on
    let motif = this._soloMotif ?? null; // { durs, steps } — heard intervals of a kept phrase
    let answer = null; // pending call-&-response reply
    let seq = null; // pending diatonic sequence repeat
    let lastSection = -1;
    let burns = 0;

    while (t < totalBeats - 0.5) {
      const intensity = arcAt(t);
      const registerTarget = lo + (hi - lo) * Math.min(0.85, lerp(S.regLo ?? 0.35, S.regHi ?? 0.72, intensity) + h * 0.08);
      // a new 8-bar section pulls the line back toward its home register
      const section = Math.floor(t / (8 * bpb));
      if (section !== lastSection) {
        lastSection = section;
        cur = Math.round((cur + registerTarget) / 2);
      }

      // burn devices: at the peak chorus's high tide, spend the overflow on
      // something shaped instead of just more notes — then breathe
      if (!ballad && isPeakChorus && intensity > 0.8 && burns < 2 && t < windFrom - 4 && rand() < 0.35) {
        burns++;
        const vb = lerp(42, 98, intensity) + lerp(-4, 24, h) + M.velOff;
        const c0 = chordAt(t);
        const pool0 = poolFor(c0);
        const i0 = nearestIdx(pool0, Math.max(cur, registerTarget + 3)); // shout from up high
        const octs = this.soloVoicing === "multi";
        const kind = choice(["hemiola", "riff", "horizontal"]);
        if (kind === "hemiola") {
          // 3-over-4 hammer: dotted-quarter attacks cycling three pitches
          const cell = [pool0[i0], pool0[Math.max(0, i0 - 1)], pool0[Math.min(pool0.length - 1, i0 + 1)]];
          const reps = 4 + Math.floor(rand() * 3);
          for (let r = 0; r < reps && t < totalBeats - 1.5; r++) {
            const e = { beat: t, midi: cell[r % 3], dur: 1.3, vel: Math.round(Math.min(120, vb + 12)) };
            if (octs) e.extra = [e.midi - 12];
            events.push(e);
            t += 1.5;
          }
        } else if (kind === "riff") {
          // climax riff, verbatim against the moving harmony
          const riff = [0, 2, 1, -1].map((s) => pool0[Math.max(0, Math.min(pool0.length - 1, i0 + s))]);
          for (let r = 0; r < 3 && t < totalBeats - 2.5; r++) {
            riff.forEach((m, j) => {
              const e = { beat: t + j * 0.5, midi: m, dur: 0.45, vel: Math.round(Math.min(120, vb + 10 - j * 2)) };
              if (octs) e.extra = [m - 12];
              events.push(e);
            });
            t += 2;
          }
        } else {
          // horizontal line: one scale ridden straight through the changes
          let idx = i0;
          const len = 10 + Math.floor(rand() * 4);
          for (let j = 0; j < len && t < totalBeats - 1; j++) {
            idx = Math.max(0, Math.min(pool0.length - 1, idx + (rand() < 0.6 ? -1 : 1)));
            events.push({ beat: t, midi: pool0[idx], dur: 0.46, vel: Math.round(Math.min(118, vb + 6)) });
            t += 0.5;
          }
        }
        cur = events[events.length - 1]?.midi ?? cur;
        lastChord = null; // force a fresh landing after the shout
        lastEnd = t;
        // a shout earns a real hole — breathe to past the next barline
        t = Math.ceil(t / bpb) * bpb + 1;
        t = Math.round(t * 4) / 4;
        continue;
      }
      const useAnswer = answer !== null;
      const useSeq = !useAnswer && seq !== null;
      const useMotif = !useAnswer && !useSeq && motif && rand() < Math.min(0.85, M.motif);
      const useCell = !useAnswer && !useSeq && !useMotif && vocab.length > 0 && rand() < cellProb;
      const flavor = useAnswer || useSeq || useMotif ? "motif" : useCell ? "cell" : ballad && rand() < 0.5 ? "longtones" : pickFlavor(intensity);
      let velBase = lerp(42, 98, intensity) + lerp(-4, 24, h) + M.velOff + (useAnswer ? -6 : 0);
      let blueBoost = 1;
      // outside color: tritone-sub scale over dominants near the peak
      const subActive = intensity > 0.75 && rand() < 0.25;
      let forceStartMidi = null;

      let durs;
      let plannedSteps = null;
      let mluKind = null; // set when this phrase is written rather than recalled
      if (useAnswer) {
        durs = answer.durs;
        plannedSteps = answer.steps;
        answer = null;
      } else if (useSeq) {
        durs = seq.durs;
        plannedSteps = seq.steps;
        forceStartMidi = seq.startMidi;
        seq = seq.reps > 1 ? { ...seq, reps: seq.reps - 1, startMidi: seq.startMidi - 2 } : null;
      } else if (useMotif) {
        // develop it rather than repeat it: the operators real players use on
        // their own material — restate, invert, stretch, shorten
        durs = [...motif.durs];
        plannedSteps = [...motif.steps];
        const op = choice(["verbatim", "verbatim", "verbatim", "invert", "augment", "fragment"]);
        if (op === "invert") plannedSteps = plannedSteps.map((x) => -x);
        else if (op === "augment") durs = durs.map((d) => d * 1.5);
        else if (op === "fragment" && durs.length >= 5) {
          const keep = Math.max(3, Math.ceil(durs.length / 2));
          durs = durs.slice(0, keep);
          plannedSteps = plannedSteps.slice(0, keep);
        }
      } else if (useCell) {
        // vocabulary lick, transposed onto this chord's scale
        const cell = choice(vocab);
        durs = [...cell.durs];
        plannedSteps = [...cell.steps];
      } else if (flavor === "longtones") {
        // few notes, held — breathes even at high intensity
        const len = 2 + Math.floor(rand() * 2);
        durs = Array.from({ length: len }, () => choice([1, 1.5, 2, 2.5, 3].slice(Math.round(c * 2), Math.round(c * 2) + 3)) * M.hold);
        durs[len - 1] += 0.5;
        velBase -= 8;
      } else if (flavor === "riff") {
        // short syncopated cell, leans bluesy
        const len = 3 + Math.floor(rand() * 3) + Math.round(c * 3);
        durs = Array.from({ length: len }, (_, n) =>
          n === len - 1 ? choice([1, 1.5]) : choice(c > 0.5 ? [0.5, 0.25, 0.25] : [0.5, 0.5, 0.25])
        );
        if (t % 1 === 0 && rand() < 0.6) t += 0.5; // offbeat entry
        blueBoost = 2;
      } else {
        // The workhorse phrase. Length is a **span of beats**, not a count of
        // notes: the old builder rolled a note count and then rolled each
        // duration, so the same "12-note phrase" ran anywhere from 3 beats to
        // 12 and nothing about it related to the bar. WJD's annotated phrases
        // run a median 7 beats; each player's own figure is in solo-vocab.js.
        //
        // The beats are then filled with rhythm templates rather than per-note
        // dice. A line of even eighths, a triplet turn, a Charleston — these
        // are the shapes a player has in their hands, and a run of independent
        // duration rolls is precisely what none of them look like.
        mluKind = flavor === "riff" || ballad ? "lick" : rand() < 0.38 + 0.22 * c + 0.15 * intensity ? "line" : "lick";
        // Between the corpus median (7 beats) and its mean (9.5): the mean is
        // dragged up by a long tail of one-breath marathons, the median down by
        // the two-bar answers, and a target between the two measures back closest.
        const want =
          ((prof ? (prof.phraseBeatsMedian + prof.phraseBeatsMean) / 2 : 8) *
            phraseDial * lerp(0.88, 1.12, c) * M.phrase * lerp(0.62, 1.3, intensity) * wave) + rnd(-1, 1);
        const p16 = Math.min(0.92, (0.02 + c * 0.95 + Math.max(0, intensity - 0.35) * 0.6) * M.p16 * (isPeakChorus ? 1.3 : 1));
        const pTrip = Math.min(0.85, (0.04 + 0.3 * intensity + 0.22 * c) * M.trip);
        const has = (tpl, d) => tpl.some((x) => Math.abs(x - d) < 1e-6);
        durs = [];
        let spent = 0;
        // the per-style note cap has to travel with the dial or it swallows
        // the long end whole
        const cap = Math.round((S.phraseCap ?? 18) * 2.1 * phraseSpan);
        while (spent < Math.max(1.5, want) - 0.6 && durs.length < cap - 1) {
          const usable = RHYTHM[mluKind].filter(
            (tpl) =>
              (ballad ? !has(tpl, 0.25) && !has(tpl, 1 / 3) : true) &&
              (!has(tpl, 0.25) || rand() < p16) &&
              (!has(tpl, 1 / 3) || rand() < pTrip)
          );
          // Crowding picks the *shape*, not just the sprinkling. Sparse wants
          // templates whose notes are long, crowded wants the running ones, so
          // weight the draw by how close a template's mean note is to the
          // length the dial is asking for.
          const targetDur = lerp(1.2, 0.26, c) * lerp(0.8, 1.7, cant);
          let tpl = [0.5, 0.5];
          if (usable.length) {
            const w = usable.map((x) => 1 / (0.08 + Math.abs(x.reduce((a, b) => a + b, 0) / x.length - targetDur)));
            let r = rand() * w.reduce((a, b) => a + b, 0);
            tpl = usable[usable.length - 1];
            for (let k = 0; k < usable.length; k++) {
              if ((r -= w[k]) <= 0) {
                tpl = usable[k];
                break;
              }
            }
          }
          for (const d of tpl) {
            durs.push(d);
            spent += d;
          }
        }
        durs.push(choice(ballad ? [2, 2.5, 3] : [0.5, 1, 1.5, 2, 2.5].slice(Math.round((1 - c) * 2), Math.round((1 - c) * 2) + 3)) * M.hold);
      }
      // phrase-start timing personality: on the beat (Dexter, Silver) or
      // pushed off it (Parker)
      if (S.onBeat && rand() < S.onBeat) t = Math.round(t);
      else if (M.offStart && Math.abs(t - Math.round(t)) < 0.05 && rand() < M.offStart) t += 0.5;
      if (F.clave && bpb === 4 && rand() < 0.75) {
        // 3-2 son clave over a two-bar cycle — every stroke is within a beat of
        // anywhere, so this pulls rather than merely nudges
        const cycle = ((t % (bpb * 2)) + bpb * 2) % (bpb * 2);
        let best = null;
        for (const stroke of [0, 1.5, 3, 5, 6]) {
          if (best === null || Math.abs(stroke - cycle) < Math.abs(best - cycle)) best = stroke;
        }
        const shift = best - cycle;
        if (Math.abs(shift) <= 1.05 && t + shift > lastEnd) t += shift;
      }

      // contour shape, drawn from the distribution measured in jazz solo
      // corpora: descending dominates and the arch is the minority case
      // The shape distribution below is measured from jazz solos, where
      // descending dominates and the arch is the minority case. Cantabile
      // wants the opposite — the arch *is* the singing shape — so at the top
      // of the dial it overrides the draw rather than nudging it.
      const shapeRoll = rand();
      const phraseShape =
        cant > 0.45 && rand() < (cant - 0.45) * 1.7 ? "convex" :
        shapeRoll < 0.38 ? "descending" : shapeRoll < 0.58 ? "ascending" : shapeRoll < 0.75 ? "convex" : shapeRoll < 0.86 ? "concave" : "flat";
      const takenSteps = [];
      const phraseStart = t;
      // Where the phrase crests. The velocity contour has always peaked around
      // two thirds through; the *pitch* was wherever the walk left it, so the
      // loudest note and the highest note had nothing to do with each other —
      // which is the opposite of how anybody sings a line. At the singing end
      // of the dial the two are pulled together.
      const peak = Math.max(1, Math.round((durs.length - 1) * 0.65));
      let lastMain = null; // previous sounded note, for bebop passing tones
      let prevStep = 0;
      let phrasePeakVel = 0;
      let phraseNotes = 0;
      // Bebop grammar, ghosting and articulation were gated on the phrase
      // being a plain "run", which switched all three off for motifs, cells,
      // answers and sequences — around 40% of phrases in the very styles those
      // devices define. What makes the grammar audible is the notes running,
      // not which branch chose them, so gate on the note lengths instead.
      const running =
        flavor !== "longtones" &&
        durs.filter((d) => d <= 0.6).length >= Math.max(3, durs.length * 0.5);
      // The arrival clamp below rewrites durations, and motifs, answers and
      // sequences hand over the very array they intend to replay. Work on a
      // copy so bending this statement to the changes does not bend the stored
      // idea with it.
      durs = [...durs];
      // Which mid-level unit is this? Long and even reads as a line, short or
      // mixed reads as a lick, and the two draw their figures differently.
      // A written phrase already knows which unit it is; a recalled one — a
      // motif, a vocabulary cell, an answer — has to be read back off its
      // rhythm, since long and even is what makes a line a line.
      const evenish = durs.filter((d) => Math.abs(d - durs[0]) < 0.13).length / durs.length;
      const mlu = mluKind ?? (flavor === "riff" || durs.length <= 4 || evenish < 0.55 ? "lick" : "line");
      let atom = null; // the figure currently being played
      for (let n = 0; n < durs.length && t < totalBeats - 0.5; n++) {
        const c = chordAt(t);
        const pool = subActive && isDom(c) ? subPoolFor(c) : poolFor(c);
        const newChord = c !== lastChord;
        const prevMidi = cur;
        let sat = false;
        // Aim at the change. If this note would step over the next chord
        // boundary, shorten it so the following note lands exactly on the new
        // chord's downbeat. Skipped inside triplets, where the clamp would
        // produce a duration nobody can hear as intentional.
        const change = changeAfter(t);
        const rest8 = change === null ? 0 : (change - t) * 4;
        const aiming =
          change !== null &&
          n < durs.length - 1 &&
          t + durs[n] > change + 1e-6 &&
          change - t >= 0.25 &&
          Math.abs(rest8 - Math.round(rest8)) < 1e-6 &&
          rand() < M.aim;
        if (aiming) durs[n] = change - t;
        if (forceStartMidi !== null && n === 0) {
          // sequence repeat: exact transposition, don't re-root on the chord
          cur = pool[nearestIdx(pool, forceStartMidi)];
          lastChord = c;
        } else if ((newChord || n === 0) && !(plannedSteps && n > 0)) {
          // land on the guide-tone thread (or a nearby chord tone), drawn
          // toward the arc's register
          let target;
          let idx;
          const aim = aims.get(c);
          // Always taking the *nearest* usable note means every chord change is
          // entered by a step, and a quarter of all the notes in the line are
          // chord changes — which is a large part of why the corpus plays a
          // third where we played a second. A player as often jumps into the
          // new chord as creeps into it.
          const jumpIn = n > 0 && !ballad && rand() < 0.38;
          // Chord landings are about a quarter of every line and they were deaf
          // to the phrase's shape — they took the nearest usable note and the
          // arch got overwritten four times a bar. Lean the search up before the
          // crest and down after it, so the landings build the arc instead of
          // flattening it.
          const archPull = durs.length > 3 ? (n < peak ? 3.5 : -3.5) * cant : 0;
          const from = (jumpIn ? cur + (cur > registerTarget ? -4 : 4) : cur) + archPull;
          if (aim && aim.kind !== "change") {
            // a dominant just resolved — take the 3rd, always. This is the one
            // note in the tune that is not a matter of taste.
            idx = nearestIdx(pool, from, (m) => m % 12 === aim.pc);
            if (idx < 0) idx = nearestIdx(pool, from);
            target = pool[idx];
          } else if (rand() < (S.thread ?? 0.4)) {
            target = thread.get(c);
            idx = nearestIdx(pool, target);
          } else {
            const tones = new Set(c.info.intervals.filter((iv) => iv > 0).map((iv) => (c.info.rootPc + iv) % 12));
            idx = nearestIdx(pool, n === 0 ? (cur + registerTarget) / 2 : from, (m) => tones.has(m % 12));
            target = pool[idx];
          }
          lastChord = c;
          if (n > 0 && lastMain && (lastMain.rawDur ?? 1) <= 0.5 && Math.abs(lastMain.midi - target) >= 2
              && rand() < lerp(0.22, 0.44, intensity) * M.encl) {
            lastMain.midi = target + (target > lastMain.midi ? -1 : 1);
          }
          // bebop enclosure: scale step above, semitone below, then the target
          if (n === 0 && !useMotif && !F.clave && t - 1 >= lastEnd && rand() < lerp(0.15, 0.4, intensity) * M.encl) {
            const above = pool[Math.min(pool.length - 1, idx + 1)];
            events.push({ beat: t - 1, midi: above, dur: 0.42, vel: Math.round(velBase - 14) });
            events.push({ beat: t - 0.5, midi: target - 1, dur: 0.42, vel: Math.round(velBase - 10) });
          } else if (n === 0 && !ballad && !F.clave && t - 0.5 >= lastEnd && Math.abs(t - Math.round(t)) < 0.05 && rand() < 0.4) {
            // pickup entry: two stepwise notes on the & of the previous beat,
            // walking up into the landing
            events.push({ beat: t - 0.5, midi: pool[Math.max(0, idx - 2)], dur: 0.22, vel: Math.round(velBase - 14) });
            events.push({ beat: t - 0.25, midi: pool[Math.max(0, idx - 1)], dur: 0.22, vel: Math.round(velBase - 9) });
          }
          cur = target;
        } else if (plannedSteps) {
          // motif echo: the same heard contour, snapped into this chord's scale
          const want = Math.max(-11, Math.min(11, plannedSteps[n] ?? 0));
          const idx = nearestIdx(pool, cur + want);
          if (idx >= 0) cur = pool[idx];
        } else if (rand() < M.sit) {
          sat = true; // deliberately sit on the note
        } else if (rand() < lerp(0.1, 0.22, intensity) * blueBoost * M.blue) {
          const blue = blueNote(c, cur);
          if (blue !== null) cur = blue;
        } else {
          // Draw the next figure when the current one runs out. Register
          // spring and phrase shape choose the figure's *direction*, once,
          // instead of re-rolling every note — which is what turns a walk into
          // a contour.
          if (!atom || atom.left <= 0) {
            const pos = n / Math.max(1, durs.length - 1);
            const shapePull =
              phraseShape === "descending" ? 0.22
              : phraseShape === "ascending" ? -0.22
              : phraseShape === "convex" ? (pos < 0.45 ? -0.24 : 0.28)
              : phraseShape === "concave" ? (pos < 0.45 ? 0.24 : -0.28)
              : 0;
            const arch = (n < peak ? -0.5 : 0.5) * cant; // rise to the crest, then fall away
            const pDown = Math.min(0.92, Math.max(0.08, (cur > registerTarget ? 0.62 : 0.38) + shapePull + arch));
            // Post-skip reversal. Measured at 66% after a skip in sung melody
            // and 55% in the jazz corpus, against 36% after a step in both —
            // so it is a real property of a leap, not of melody in general.
            const skipBack =
              S.reversal && prevStep && Math.abs(prevStep) >= 3 && rand() < S.reversal ? -Math.sign(prevStep) : 0;
            let dir = carryDir || skipBack || (rand() < pDown ? -1 : 1);
            if (cur < lo + 4) dir = 1;
            if (cur > hi - 4) dir = -1;
            carryDir = 0;
            const kind = S.wide && rand() < S.wide ? "leap" : pickAtomKind(mlu);
            const [lmin, lmax] = ATOM_LEN[mlu][kind];
            atom = { kind, dir, left: lmin + Math.floor(rand() * (lmax - lmin + 1)), step: 0, home: cur };
            if (kind === "approach") {
              // scale step above the target, chromatic below, then the target
              const tp = tonePoolFor(c);
              const ti = nearestIdx(tp, cur + dir * 3);
              atom.target = ti >= 0 ? tp[ti] : cur;
              const ai = nearestIdx(pool, atom.target + 1);
              atom.seq = [ai >= 0 ? pool[ai] : atom.target + 2, atom.target - 1, atom.target];
            }
          }
          const idxIn = (arr) => nearestIdx(arr, cur);
          const clampIdx = (arr, i) => arr[Math.max(0, Math.min(arr.length - 1, i))];
          if (atom.kind === "scale") cur = clampIdx(pool, idxIn(pool) + atom.dir);
          else if (atom.kind === "arp") {
            // An arpeggio moves in thirds. Adjacent chord tones are not always
            // a third apart — the 7th and the root of a major 7th chord are a
            // semitone — so a move that small is not the figure, and it skips
            // on to the next tone instead.
            const tp = tonePoolFor(c);
            const at = nearestIdx(tp, cur);
            let next = clampIdx(tp, at + atom.dir);
            if (Math.abs(next - cur) <= 2) next = clampIdx(tp, at + atom.dir * 2);
            cur = next;
          }
          else if (atom.kind === "approach") cur = atom.seq[Math.min(2, atom.step)];
          else if (atom.kind === "neighbor") cur = atom.step % 2 === 0 ? clampIdx(pool, idxIn(pool) + atom.dir) : atom.home;
          else if (atom.kind === "repeat") {
            cur = atom.home;
            sat = true; // deliberate — keep the anti-stutter pass off it
          }
          else {
            // leap: a deliberate wide interval, and the line owes a step back
            cur = clampIdx(pool, idxIn(pool) + atom.dir * (4 + Math.floor(rand() * 3)));
            carryDir = -atom.dir;
          }
          atom.step++;
          atom.left--;
          // Bebop metric grammar: on-beat notes want to be chord tones. An
          // arpeggio is already chord tones and an approach is chromatic on
          // purpose, so snapping either would only undo the figure.
          if (running && !subActive && (atom.kind === "scale" || atom.kind === "leap" || atom.kind === "neighbor")
              && Math.abs(t - Math.round(t)) < 0.05 && rand() < M.grammar) {
            const tonePcs = new Set(c.info.intervals.map((iv2) => (c.info.rootPc + iv2) % 12));
            const gi = nearestIdx(pool, cur, (m) => tonePcs.has(m % 12));
            if (gi >= 0 && Math.abs(pool[gi] - cur) <= 4) cur = pool[gi];
          }
        }
        // Lean onto the arrival. The note before a change takes the approach:
        // over a resolving dominant that is the dominant's own 7th, sitting a
        // half step above the target — the whole cadence in one interval —
        // and elsewhere a chromatic neighbour. Only for notes short enough to
        // read as an approach; a chromatic tone held two beats is just wrong.
        if (aiming && !plannedSteps && !sat && durs[n] <= 1) {
          const nextCh = chordAtStart.get(change);
          const aimNext = nextCh && aims.get(nextCh);
          if (aimNext) {
            const nextPool = poolFor(nextCh);
            const ti = nearestIdx(nextPool, cur, (mm) => mm % 12 === aimNext.pc);
            if (ti >= 0) {
              const tgt = nextPool[ti];
              const approach = aimNext.prep !== null ? tgt + 1 : tgt + (rand() < 0.62 ? -1 : 1);
              if (approach >= lo - 2 && approach <= hi + 2) cur = approach;
            }
          }
        }
        // Nothing wider than the style can sing. Applied after the approach so
        // it catches every path into the note, and only inside a phrase — a new
        // entry is allowed to start wherever it likes.
        if (S.maxLeap && n > 0 && lastMain && Math.abs(cur - lastMain.midi) > S.maxLeap) {
          const pulled = nearestIdx(pool, lastMain.midi + Math.sign(cur - lastMain.midi) * S.maxLeap);
          if (pulled >= 0) cur = pool[pulled];
        }
        const last = n === durs.length - 1;
        // avoid-note hygiene: anything held a beat or longer (any flavor,
        // planned or not) must be a chord tone or a safe tension
        if (!subActive && (durs[n] >= 1.5 || last)) {
          const iv2 = c.info.intervals;
          const safe = new Set(iv2.filter((x) => x > 0).map((x) => (c.info.rootPc + x) % 12));
          safe.add((c.info.rootPc + 2) % 12); // 9th
          safe.add((c.info.rootPc + 9) % 12); // 6th/13th sits fine over almost anything
          if (!iv2.includes(4)) safe.add((c.info.rootPc + 5) % 12); // 11th, except over a major 3rd
          const colour = new Set([2, 9].map((x) => (c.info.rootPc + x) % 12));
          if (!iv2.includes(4)) colour.add((c.info.rootPc + 5) % 12);
          const want = rand() < 0.35 ? colour : safe;
          if (!want.has(((cur % 12) + 12) % 12)) {
            const si = nearestIdx(pool, cur, (m) => want.has(m % 12));
            if (si >= 0 && Math.abs(pool[si] - cur) <= 6) cur = pool[si];
          }
        }
        // phrase ends resolve — 3rd or 9th of the sounding chord, the thing
        // that makes a line sound intentional
        if (last && !plannedSteps && flavor !== "longtones") {
          const iv = c.info.intervals;
          const third = (c.info.rootPc + (iv.includes(4) ? 4 : iv.includes(3) ? 3 : 4)) % 12;
          const ninth = (c.info.rootPc + 2) % 12;
          // land on a chord tone most of the time — the 9th is a colour ending,
          // not the default one
          const fifth = (c.info.rootPc + (iv.includes(6) ? 6 : iv.includes(8) ? 8 : 7)) % 12;
          const res = new Set(rand() < 0.7 ? [third, fifth, c.info.rootPc] : [ninth, third]);
          const idx = nearestIdx(pool, cur, (m) => res.has(m % 12));
          if (idx >= 0 && Math.abs(pool[idx] - cur) <= 7) cur = pool[idx];
        }
        // Repeated pitches are the commonest stutter in generated lines, and the
        // snapping passes above collapse neighbouring notes onto the same chord
        // tone. Deliberate repeats survive; accidental unisons get nudged.
        if (!sat && lastMain && cur === lastMain.midi) {
          const at = nearestIdx(pool, cur);
          const alt = at + (at > 0 && (rand() < 0.6 || at >= pool.length - 1) ? -1 : 1);
          if (alt >= 0 && alt < pool.length) cur = pool[alt];
        }
        // Record the interval that actually sounded. Everything above — grammar,
        // hygiene, resolution, the unison nudge — moves the pitch after it is
        // chosen, so recording any earlier stores a contour nobody hears, and
        // motif echoes replay a melody that was never played.
        takenSteps.push(n === 0 ? 0 : cur - prevMidi);

        if (last && !ballad) {
          const inBar = ((t % bpb) + bpb) % bpb;
          const strong = Math.round(inBar / 2) * 2;
          const shift = strong - inBar;
          if (Math.abs(shift) <= 0.5 && t + shift > lastEnd) t += shift;
        }
        const dur = durs[n];
        // sudden mid-phrase silence (Monk): skip the note, keep the time
        if (S.gap && !last && n > 0 && rand() < S.gap) {
          t += dur;
          lastEnd = t;
          continue;
        }
        const offbeat = Math.abs(t - Math.round(t)) > 0.05;
        // crescendo into the phrase's peak, easing after
        const contour = (18 * (1 - Math.abs(n - peak) / Math.max(peak, durs.length - peak, 1)) - 6) * (S.contrast ?? 1);
        const thisStep = takenSteps[takenSteps.length - 1] ?? 0;
        const turned = n > 1 && Math.sign(thisStep) !== 0 && Math.sign(thisStep) !== Math.sign(prevStep); // direction change
        prevStep = thisStep || prevStep;
        // ghosts: quiet in-between notes inside longer runs, horn-style
        const ghost = running && durs.length >= 5 && n > 0 && !last && n !== peak && rand() < 0.18 * lerp(1.3, 0.15, cant);
        let vel = Math.round(Math.min(124, Math.max(28, velBase + contour + rnd(-6, 7) + (offbeat ? lerp(2, 10, h) + M.offAcc : 0) + (last ? 4 : 0) + (turned ? 4 : 0))));
        if (ghost) vel = Math.max(25, Math.round(vel * 0.45));
        // grace-note scoop/crush into phrase starts and held notes
        if ((t === phraseStart || last) && t - 0.25 >= lastEnd && rand() < M.crush) {
          events.push({ beat: t - 0.25, midi: cur - 1, dur: S.crushDur ?? 0.22, vel: Math.max(30, vel - 26) });
        }
        // bebop passing tone: a chromatic 16th slipped between a whole-step
        // descent over a dominant chord
        if (lastMain && Math.abs(lastMain.midi - cur) === 2 && lastMain.rawDur === 0.5 && !ghost
            && rand() < (isDom(c) ? 0.4 : 0.2) * Math.min(1.4, M.encl)) {
          lastMain.dur = 0.25 * legato;
          const between = cur + (lastMain.midi > cur ? 1 : -1);
          events.push({ beat: lastMain.beat + 0.25, midi: between, dur: 0.23, vel: Math.max(28, vel - 12) });
        }
        // bebop articulation: clip every fourth note of a run
        const clip = running && !last && n % 4 === 3 ? lerp(0.75, 0.97, cant) : 1;
        phrasePeakVel = Math.max(phrasePeakVel, vel);
        phraseNotes++;
        const ev = { beat: t, midi: cur, dur: sound(dur) * clip, vel, rawDur: dur, atom: atom && !plannedSteps ? atom.kind : flavor };
        // drifting time feel: phrase endings sit back, climaxes push
        if (last) ev.lagAdj = 8;
        else if (vel > 100) ev.lagAdj = -5;
        // ornaments on held notes — a quick upper-neighbor mordent
        if (dur >= 1.5 && rand() < (S.ornament ?? 0.12)) {
          const upper = pool[Math.min(pool.length - 1, nearestIdx(pool, cur) + 1)];
          if (upper !== cur) {
            events.push({ beat: t + 0.3, midi: upper, dur: 0.16, vel: Math.max(28, vel - 16) });
            events.push({ beat: t + 0.55, midi: cur, dur: sound(dur - 0.6) * 0.95, vel: Math.max(30, vel - 8) });
            ev.dur = 0.28;
          }
        }
        // Multi voicing: thicken holds, phrase ends and riff stabs — runs stay
        // single-note so fast lines don't smear. This used to add exactly one
        // note, which is a two-finger interval and not a voicing; a player
        // putting weight under a melody note puts a hand under it. Thickness
        // rides the tide and the note's length, and every added note is held to
        // the same avoid-note hygiene as the melody.
        if (this.soloVoicing === "multi") {
          const mode = S.multiInt ?? "default";
          let p = last || dur >= 1.2 ? 0.6 : flavor === "riff" ? 0.35 : intensity > 0.7 && !offbeat ? 0.2 : 0;
          if (mode === "none") p = 0;
          if (mode === "rare") p *= 0.3;
          if (isLayout) p *= 0.25;
          if (isPeakChorus) p = Math.min(0.85, p * 1.4);
          if (rand() < p) {
            // how many fingers go under the melody: a long note at high tide
            // gets a full hand, a passing stab gets one note
            let voices = 1;
            if (dur >= 0.9 || last) voices = 2;
            if ((dur >= 1.4 || last) && (intensity > 0.6 || isPeakChorus)) voices = 3;
            if (isLayout) voices = Math.min(voices, 1);
            if (mode === "rare") voices = 1;
            const idx = nearestIdx(pool, cur);
            const tones = new Set(c.info.intervals.map((x) => (c.info.rootPc + x) % 12));
            const safe3 = new Set(tones);
            safe3.add((c.info.rootPc + 2) % 12);
            const add = [];
            if (mode === "seconds") {
              // Monk: a cluster, not a chord — seconds stacked straight down
              for (let k = 0; k < voices; k++) add.push(cur - choice([1, 2]) - k * 2);
            } else if (mode === "octave") {
              // Wes: the octave first, then the chord tone that fills it in
              add.push(cur - 12);
              if (voices >= 2) add.push(pool[Math.max(0, idx - 2)]);
              if (voices >= 3) add.push(pool[Math.max(0, idx - 4)]);
            } else if (isPeakChorus && voices >= 3 && rand() < 0.5) {
              // locked hands at the top: melody doubled an octave down with the
              // chord filled in between
              add.push(pool[Math.max(0, idx - 2)], pool[Math.max(0, idx - 4)], cur - 12);
            } else {
              // block chord: chord tones stacked under the melody
              const under = [];
              for (let m = cur - 1; m >= lo - 8 && under.length < voices; m--) {
                if (tones.has(((m % 12) + 12) % 12) && cur - m >= 3) under.push(m);
              }
              add.push(...under);
            }
            // keep the voicing consonant (except the deliberate clusters), drop
            // anything out of range, and never double the melody note itself
            const clean = [];
            for (let a of add) {
              if (a === undefined || a >= cur || a < lo - 12) continue;
              if (mode !== "seconds" && dur >= 1 && !safe3.has(((a % 12) + 12) % 12)) {
                const ai = nearestIdx(pool, a, (m) => safe3.has(m % 12));
                if (ai >= 0) a = pool[ai];
              }
              if (a < cur && !clean.includes(a)) clean.push(a);
            }
            if (clean.length) ev.extra = clean;
          }
        }
        events.push(ev);
        lastMain = ev;
        t += dur;
        lastEnd = t;
      }

      const freshPhrase = !useMotif && !useAnswer && !useSeq && !useCell;
      if (freshPhrase && !ballad && takenSteps.length >= 3 && rand() < 0.5) {
        motif = { durs, steps: takenSteps };
        this._soloMotif = motif; // carry it into the next chorus
      } else if (rand() < 0.2) {
        motif = null; // move on to new material
      }

      // call & response: answer the phrase with its own rhythm, bent downward
      if (freshPhrase && !ballad && takenSteps.length >= 3 && flavor !== "longtones" && rand() < 0.35) {
        const steps = [...takenSteps];
        steps[steps.length - 1] = -Math.abs(steps[steps.length - 1] || 1);
        if (steps.length > 1) steps[steps.length - 2] = -Math.abs(steps[steps.length - 2] || 1);
        answer = { durs, steps };
      }
      // diatonic sequence: a short cell repeats a step lower, 1-2 times
      else if (freshPhrase && !ballad && flavor === "run" && durs.length <= 5 && lastMain && rand() < 0.3) {
        seq = { durs, steps: takenSteps, startMidi: lastMain.midi - 2, reps: rand() < 0.4 ? 2 : 1 };
      }

      // cross-bar anticipation: state the next chord's guide tone half a
      // beat early and hold it over the barline
      const nc = chords.find((x) => x.startBeat >= t + 0.5 && x.startBeat <= t + 4);
      if (nc && !ballad && rand() < Math.min(0.8, 0.3 * M.antic)) {
        const antBeat = nc.startBeat - 0.5;
        if (antBeat >= lastEnd + 0.25 && antBeat < totalBeats - 1) {
          cur = thread.get(nc);
          events.push({ beat: antBeat, midi: cur, dur: 1.4 * legato, vel: Math.round(Math.min(120, velBase + 8)) });
          lastChord = nc;
          lastEnd = antBeat + 1.4;
          t = lastEnd;
        }
      }

      // earned silence: the rest scales with how big the phrase was, and a
      // real shout buys a full-bar hole snapped to the barline
      // How much the phrase just spent. The divisor was calibrated when a
      // phrase was six notes; phrases run twice that now, so it saturated on
      // almost everything and the full-bar breath below — meant for a shout —
      // fired after every statement, flattening the arc it was supposed to
      // punctuate.
      const spent = Math.min(1, (phraseNotes * (phrasePeakVel / 110)) / 17);
      const restWave = (2.05 - wave) * (isLayout ? 1.3 : 1); // the tide: peaks crowd, layouts leave holes
      if (!ballad && spent > 0.88 && intensity > 0.62) {
        t = Math.ceil(t / bpb) * bpb + bpb - 0.5; // full-bar breath, re-enter on the & of 4
      } else {
        // Phrases now run a full corpus-length, and the rest scaled with how
        // big the phrase was — so lengthening the phrases lengthened the holes
        // to match and the line spent nearly half the form silent. Damped: a
        // long phrase still buys more air than a short one, just less of it.
        // How long before the next statement. This used to be driven mostly by
        // how big the last phrase was, which is backwards for a tide: a quiet
        // long-tone phrase at the bottom of the arc "spent" almost nothing and
        // so bought almost no air, and the line came out evenly busy from top
        // to bottom. The arc leads now — two and a half beats of room down at
        // the bottom, half a beat at the peak — and phrase weight only trims
        // it.
        const air = lerp(2.6, 0.5, intensity) * M.rest * (0.72 + 0.3 * spent) * lerp(2.45, 0.38, c) * restWave;
        t += Math.max(0.5, air * 1.45 * dial(0.85, 1, 1.25, ph) + choice([-0.5, 0, 0.5]) + (ballad ? 1 : 0));
      }
      t = snapEntry(t);
    }
    // hard guard: nothing outside the form or the instrument's range
    return events.filter((e) => e.beat >= 0 && e.beat < totalBeats && e.midi >= lo - 6 && e.midi <= hi + 6 && e.dur > 0);
  }

  _flatten(song, bpb) {
    const chords = [];
    song.progression.forEach((bar, barIdx) => {
      let offset = 0;
      for (const c of bar) {
        chords.push({
          symbol: c.chord,
          beats: c.beats,
          bar: barIdx,
          offset,
          startBeat: barIdx * bpb + offset,
          info: parseChord(c.chord),
        });
        offset += c.beats;
      }
    });
    chords.forEach((c, i) => (c.next = chords[(i + 1) % chords.length]));
    return chords;
  }

  _pianoEvents(chords, style, straight, bpb) {
    const events = [];
    // Swing comping lives on the upbeats. A pool where most patterns start on
    // beat 1 is the machine tell a player hears first, so the offbeat-first
    // shapes outnumber the downbeat ones here (charleston, & of 1, & of 4).
    const patterns4 = straight
      ? [ [[0, 1], [1.5, 1.5], [3, 1]], [[0.5, 1], [2, 1], [3.5, 0.5]], [[0, 1.5], [2.5, 1.5]] ]
      : [
          [[0, 1.5], [1.5, 1]], [[0, 1], [2.5, 1.5]], [[0, 2]], [[0, 1], [3, 1]],
          [[1.5, 2.5]], [[2.5, 1.5]], [[1.5, 1], [3.5, 0.5]], [[1.5, 1.5], [3, 0.5]],
          [[0.5, 1.5], [2.5, 1]], [[0.5, 1], [2, 0.5], [3.5, 0.5]], [[0.5, 2.5]],
          [[0.5, 1], [2.5, 1]],
        ];
    const patterns2 = straight
      ? [ [[0, 0.75], [1.5, 0.5]], [[0, 1.5]] ]
      : [ [[0, 1.5]], [[0.5, 1.5]], [[0, 1], [1.5, 0.5]], [[0.5, 1]], [[1.5, 0.5]] ];

    const funkPatterns = [ [[1.5, 0.5], [3, 0.5]], [[0, 0.5], [2.5, 0.5]], [[1.5, 0.5], [2.5, 0.5], [3.5, 0.5]] ];

    // Afro-Cuban comping is organised by the clave, not drawn from a pool: the
    // 3-2 son clave is the structural core the whole band locks to, so these
    // are fixed per side of the two-bar cycle. Same strokes the soloist snaps
    // to in _soloEvents, which is what keeps the section out of cruzado.
    const CLAVE_3 = [[0, 1], [1.5, 1], [3, 1]];
    const CLAVE_2 = [[1, 1], [2, 1.5]];

    // Blues leans on the backbeat and plays straighter than swing — chords on
    // 2 and 4 with the odd 8th, rather than the upbeat-led swing shapes.
    const bluesPatterns = [
      [[1, 1], [3, 1]],
      [[1, 1], [2.5, 0.5], [3, 1]],
      [[0, 0.5], [1, 1], [3, 1]],
      [[1, 0.5], [1.5, 0.5], [3, 1]],
      [[1, 1], [3, 0.5], [3.5, 0.5]],
      [[1, 1.5], [3, 1]],
    ];

    // Modal comping is defined by how little of it there is — long rootless
    // held voicings and open space, not density. The empty pattern is the
    // point: a bar of air is idiomatic here, not a missing feature.
    const modalPatterns = [
      [[0, 3.5]], [[1.5, 2.5]], [[0, 2]], [[2.5, 1.5]],
      [[0, 1.5], [2.5, 1.5]], [[1.5, 1], [3, 1]], [],
    ];

    // did the previous chord get anticipated? then this one is already
    // sounding and must not restate its own downbeat. and if it ended on a
    // chromatic approach, this one *must* state the downbeat — an approach
    // that never lands is just a wrong note.
    let anticipated = false;
    let resolving = false;

    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const next = chords[i + 1];
      const midis = pianoVoicing(c.info);
      const swung = !straight && style !== "ballad" && style !== "funk";

      // The push: the next chord lands half a beat early, over the barline.
      // Without it the pattern restarts at every chord change and the comp
      // sounds quantised — this is the gesture that unglues it from the grid.
      // Sometimes it arrives as a chromatic approach instead: the target
      // voicing a semitone above, sliding down into the change. An approach
      // resolves *onto* the beat, so it leaves the next downbeat intact;
      // a true anticipation replaces it.
      const pushes = swung && next && c.beats >= 2 && rand() < 0.35;
      const approach = pushes && rand() < 0.3;
      const pushBeat = pushes ? next.startBeat - 0.5 : null;

      let hits;
      if (style === "ballad") {
        // a held pad most of the time, but a ballad that only ever lands on
        // beat 1 sits still — let it move once in a while
        hits = c.beats < 4 || rand() < 0.55
          ? [[0, c.beats]]
          : choice([[[0, 2], [2, c.beats - 2]], [[0, 1.5], [2.5, c.beats - 2.5]]]);
      } else if (style === "funk") hits = c.beats >= 4 ? choice(funkPatterns) : [[0, 0.5]];
      else if (style === "latin" && bpb === 4 && c.startBeat % bpb === 0) {
        // walk the clave across however many bars this chord lasts, so a
        // two-bar chord still gets 3-side then 2-side rather than one repeated
        hits = [];
        for (let b = 0; b + bpb <= c.beats; b += bpb) {
          const side = Math.floor((c.startBeat + b) / bpb) % 2 === 0 ? CLAVE_3 : CLAVE_2;
          for (const [off, dur] of side) hits.push([b + off, dur]);
        }
        if (!hits.length) hits = [[0, Math.min(1, c.beats)]];
      } else if (style === "modal" && c.beats >= 4) hits = choice(modalPatterns);
      else if (style === "blues" && c.beats >= 4) hits = choice(bluesPatterns);
      else if (c.beats >= 4) hits = choice(patterns4);
      else if (c.beats >= 2) hits = choice(patterns2);
      else hits = [[0, c.beats]];
      if (anticipated) hits = hits.filter(([off]) => off > 0.25); // already ringing
      else if (resolving && !hits.some(([off]) => off < 0.25)) {
        const first = hits.length ? hits[0][0] : c.beats;
        hits = [[0, Math.min(1, first)], ...hits]; // land the approach
      }

      for (const [off, dur] of hits) {
        if (off >= c.beats) continue;
        const beat = c.startBeat + off;
        if (pushBeat !== null && beat >= pushBeat) continue; // the push owns the turn
        // blues puts its weight on 2 and 4; modal sits back and stays out of
        // the way, since the space is the sound
        const inBar = beat % bpb;
        const lean =
          style === "blues" ? (inBar === 1 || inBar === 3 ? 9 : -2)
          : style === "modal" ? -9
          : style === "latin" && inBar === 0 ? 4
          : 0;
        events.push({
          beat,
          dur: Math.min(dur, c.beats - off),
          midis,
          vel: Math.max(24, Math.round(rnd(50, 68) + lean)),
          roll: style === "ballad",
        });
      }

      if (pushBeat !== null) {
        const target = pianoVoicing(next.info);
        events.push({
          beat: pushBeat,
          dur: approach ? 0.45 : 0.9,
          midis: approach ? target.map((m) => m + 1) : target,
          vel: Math.round(rnd(56, 72)), // a push is played, not whispered
        });
      }
      anticipated = pushes && !approach;
      resolving = approach;
    }
    return events;
  }

  _guitarEvents(chords, song, style, straight, bpb) {
    const events = [];
    const chordAt = (beat) => {
      let cur = chords[0];
      for (const c of chords) if (c.startBeat <= beat) cur = c;
      return cur;
    };
    const totalBars = song.progression.length;

    if (style === "ballad") {
      // sparse pads, some rolled, resting every few bars
      song.progression.forEach((bar, barIdx) => {
        if (rand() < 0.25) return;
        const c = chords.find((x) => x.bar === barIdx);
        events.push({
          beat: barIdx * bpb,
          dur: bpb,
          midis: guitarVoicing(c.info, rand() < 0.4 ? 1 : 0),
          vel: 28,
          roll: rand() < 0.5,
        });
      });
      return events;
    }

    // pattern pools give each bar its own rhythm
    const bossaPool = [
      [0, 1.5, 2.5],
      [0.5, 1.5, 3],
      [0, 1.5, 3, 3.5],
      [0.5, 2, 2.5],
    ];
    const funkPool = [[0.5, 1.5, 2.5, 3.5], [1.5, 2.5, 3.5], [0.5, 1.5, 3], [1.5, 3.5]];
    // blues chops the backbeat rather than running Freddie Green quarters
    const bluesPool = [[1, 3], [1, 3], [0, 1, 2, 3], [1, 2.5, 3], [0.5, 1, 3]];
    // modal lays out or holds — the guitar is texture here, not time
    const modalPool = [[0], [1.5], [2.5], [], [], [0, 2.5]];

    for (let bar = 0; bar < totalBars; bar++) {
      const variant = rand() < 0.35 ? 1 : 0;
      let offsets;
      if (style === "funk") offsets = choice(funkPool);
      // latin before the straight branch: it locks to clave instead of a pool
      else if (style === "latin" && bpb === 4) offsets = bar % 2 === 0 ? [0, 1.5, 3] : [1, 2];
      else if (straight) offsets = choice(bossaPool);
      else if (style === "modal") offsets = choice(modalPool);
      else if (style === "blues") offsets = choice(bluesPool);
      else if (rand() < 0.1) offsets = [1, 3]; // breathe: comp 2 & 4 only
      else offsets = [...Array(bpb).keys()]; // Freddie Green quarters

      // modal holds its voicings; latin's guajeo is short and percussive
      const hold = style === "modal" ? 2.2 : style === "latin" ? 0.5 : straight ? 0.6 : 0.42;

      for (const off of offsets) {
        const beat = bar * bpb + off;
        const c = chordAt(beat);
        const accent = !straight && off % 2 === 1; // lean on 2 & 4
        const lean =
          style === "blues" && (off === 1 || off === 3) ? 8 : style === "modal" ? -8 : 0;
        events.push({
          beat,
          dur: hold,
          midis: guitarVoicing(c.info, variant),
          vel: Math.max(18, Math.round(rnd(30, 38)) + (accent ? 6 : 0) + (style === "funk" ? 10 : 0) + lean),
        });
      }

      // swing: occasional push — anticipate next bar's chord on the & of 4
      if (!straight && style !== "funk" && bar < totalBars - 1 && rand() < 0.15) {
        const next = chordAt((bar + 1) * bpb);
        events.push({
          beat: bar * bpb + bpb - 0.5,
          dur: 0.3,
          midis: guitarVoicing(next.info, variant),
          vel: Math.round(rnd(40, 46)),
        });
      }
    }
    return events;
  }

  /** Walking/riff line, then one sustain pass over the top of it. */
  _bassEvents(chords, totalBeats, style, straight, bpb) {
    const events = this._bassLine(chords, totalBeats, style, straight, bpb);

    // Note length, every style alike. Short plucked notes leave audible holes
    // between the beats, which is what makes a sampled bass read as *plucked*
    // rather than bowed-into-place — it's the tail that fills the space. Each
    // note now rings almost into the next one. Never shortens a note that was
    // already long, so the ballad's held roots are untouched.
    events.sort((a, b) => a.beat - b.beat);
    for (let i = 0; i < events.length - 1; i++) {
      const gap = events[i + 1].beat - events[i].beat;
      if (gap > 0) events[i].dur = Math.min(2.6, Math.max(events[i].dur, gap * 0.92));
    }

    // Softer pluck. The Real pack splits its bass samples at velocity 63, and
    // the line used to sit at 84-102 — every single note fired the hard-plucked
    // layer, which is the attack that reads as too obvious. Scaled down, most
    // notes take the gentler layer and only accents cross over; _gainFor pushes
    // the level back up so this costs no loudness, just edge.
    for (const e of events) e.vel = Math.max(28, Math.round(e.vel * 0.6));
    return events;
  }

  _bassLine(chords, totalBeats, style, straight, bpb) {
    const events = [];
    const chordAt = (beat) => {
      let cur = chords[0];
      for (const c of chords) if (c.startBeat <= beat) cur = c;
      return cur;
    };

    if (style === "ballad") {
      for (const c of chords) {
        const pcs = bassPcs(c.info);
        events.push({ beat: c.startBeat, midi: placeNear(pcs.root, 38, BASS_LO, BASS_HI), dur: Math.min(2, c.beats), vel: 88 });
        if (c.beats >= 4) {
          events.push({ beat: c.startBeat + 2, midi: placeNear(pcs.fifth, 40, BASS_LO, BASS_HI), dur: 2, vel: 78 });
        }
      }
      return events;
    }

    if (style === "funk") {
      // syncopated riff over root / b7 / 5th — shape rolled per chord so the
      // groove breathes between loops
      for (const c of chords) {
        const pcs = bassPcs(c.info);
        const root = placeNear(pcs.root, 36, BASS_LO, BASS_HI);
        const fifth = placeNear(pcs.fifth, root + 4, BASS_LO, BASS_HI);
        const seventh = placeNear(pcs.seventh, root + 6, BASS_LO, BASS_HI);
        const oct = Math.min(BASS_HI, root + 12);
        const shape = choice([
          [[0, root, 0.9, 100], [1.5, seventh, 0.45, 84], [2.5, fifth, 0.45, 88], [3.5, root, 0.45, 80]],
          [[0, root, 0.9, 100], [1.5, seventh, 0.45, 84], [2.5, fifth, 0.45, 88], [3.5, oct, 0.4, 84]], // octave pop
          [[0, root, 0.7, 100], [1, root, 0.45, 78], [2.5, seventh, 0.45, 86], [3.5, fifth, 0.45, 80]],
          [[0, root, 1.4, 100], [2.5, fifth, 0.45, 86], [3, seventh, 0.45, 82]],
        ]);
        for (const [off, midi, dur, vel] of shape) {
          if (off < c.beats) events.push({ beat: c.startBeat + off, midi, dur, vel });
        }
      }
      return events;
    }

    if (straight) {
      // bossa: dotted-quarter roots with 8th-note pickups — the second half
      // varies between 5th, 3rd, and a chromatic walk into the next chord
      for (const c of chords) {
        const pcs = bassPcs(c.info);
        const root = placeNear(pcs.root, 38, BASS_LO, BASS_HI);
        const fifth = placeNear(pcs.fifth, root, BASS_LO, BASS_HI);
        const third = placeNear(pcs.third, root, BASS_LO, BASS_HI);
        events.push({ beat: c.startBeat, midi: root, dur: 1.3, vel: 96 });
        if (c.beats >= 2) events.push({ beat: c.startBeat + 1.5, midi: fifth, dur: 0.45, vel: 74 });
        if (c.beats >= 4) {
          if (rand() < 0.15) {
            // simple bar: let the root ring
            events.push({ beat: c.startBeat + 2, midi: root, dur: 1.8, vel: 86 });
          } else {
            const half = rand() < 0.3 ? third : fifth;
            events.push({ beat: c.startBeat + 2, midi: half, dur: 1.3, vel: 90 });
            const nextRoot = placeNear(c.next.info.bassPc, root, BASS_LO, BASS_HI);
            const pickup = rand() < 0.3 ? nextRoot + (nextRoot > half ? -1 : 1) : root;
            events.push({ beat: c.startBeat + 3.5, midi: pickup, dur: 0.45, vel: 74 });
          }
        }
      }
      return events;
    }

    // Swing: walking quarters, built the way the method books teach it. Each
    // chord gets a TARGET on its first beat and an APPROACH on its last; the
    // beats between walk from one to the other along the chord scale. Two
    // rules carry it, and the old beat-by-beat random pick broke both:
    //   · an approach note is a half or whole step from its target, never a
    //     leap — a jump right at the barline is the most audible kind
    //   · the line holds a direction rather than re-rolling one every beat
    const clamp = (m) => Math.max(BASS_LO, Math.min(BASS_HI, m));
    const leadIns = new Set(); // beats that walk into a new chord
    const CENTRE = (BASS_LO + BASS_HI) / 2;

    // every note of the chord scale that fits the instrument, low to high —
    // walking "by step" means moving one rung along this
    const ladderFor = (info) => {
      const pcs = new Set(soloScaleSteps(info).map((s) => (info.rootPc + s) % 12));
      const out = [];
      for (let m = BASS_LO; m <= BASS_HI; m++) if (pcs.has(m % 12)) out.push(m);
      return out.length ? out : [clamp(info.rootPc + 36)];
    };
    const nearestIdx = (ladder, midi) => {
      let best = 0;
      for (let i = 1; i < ladder.length; i++) {
        if (Math.abs(ladder[i] - midi) < Math.abs(ladder[best] - midi)) best = i;
      }
      return best;
    };
    const targetPcFor = (info) => {
      const p = bassPcs(info);
      const r = rand();
      // mostly the root; other chord tones keep it from spelling out every bar
      return r < 0.14 ? p.third : r < 0.22 ? p.fifth : p.root;
    };

    let dir = 1;
    let target = placeNear(bassPcs(chords[0].info).root, 38, BASS_LO, BASS_HI);

    for (const c of chords) {
      const startBeat = c.startBeat;
      const emit = (off, midi) => {
        const accent = (startBeat + off) % bpb === 0 ? 6 : (startBeat + off) % bpb === 2 ? 2 : 0;
        events.push({
          beat: startBeat + off,
          midi: clamp(midi),
          dur: rnd(0.55, 0.7),
          vel: Math.round(rnd(84, 96) + accent),
        });
      };

      // Where the next chord starts is decided here, so this bar knows what
      // it is walking toward. Bias the octave back toward the middle of the
      // range so the line can't drift off to an extreme and stay there.
      const nextTarget = placeNear(
        targetPcFor(c.next.info),
        target - (target - CENTRE) * 0.5,
        BASS_LO,
        BASS_HI
      );

      if (c.beats <= 1) {
        emit(0, target);
        dir = Math.sign(nextTarget - target) || dir;
        target = nextTarget;
        continue;
      }

      // APPROACH — a half or whole step into the next target, taken from the
      // side the line is already travelling so the motion stays continuous
      const toward = Math.sign(nextTarget - target) || dir;
      let approach = clamp(nextTarget - toward * (rand() < 0.55 ? 1 : 2));
      // at the very bottom or top of the instrument the clamp can land the
      // approach on its own target — come at it from the other side instead
      if (approach === nextTarget) approach = clamp(nextTarget + toward);

      // walk the inner beats along the scale, spacing them evenly between
      // target and approach so each move is a step or two rather than a jump
      const ladder = ladderFor(c.info);
      const iA = nearestIdx(ladder, target);
      const iB = nearestIdx(ladder, approach);
      const moves = c.beats - 1;
      const step = Math.sign(iB - iA) || dir;
      const path = [target];
      let prevIdx = iA;
      for (let k = 1; k < moves; k++) {
        let idx = Math.round(iA + ((iB - iA) * k) / moves);
        if (idx === prevIdx) idx = prevIdx + step;
        idx = Math.max(0, Math.min(ladder.length - 1, idx));
        path.push(ladder[idx]);
        prevIdx = idx;
      }
      path.push(approach);

      // A walking line never plays the same note twice running — a repeat
      // stalls the forward motion the quarters exist to create. The approach
      // is the note that has to stay put, so nudge the one before it; a
      // chromatic step out is idiomatic anyway.
      for (let i = 1; i < path.length; i++) {
        if (path[i] !== path[i - 1]) continue;
        if (i > 1) path[i - 1] = clamp(path[i - 1] - step);
        else path[i] = clamp(path[i] + 2 * step); // target and approach collided
      }
      path.forEach((m, i) => emit(i, m));
      leadIns.add(startBeat + c.beats - 1);

      dir = Math.sign(approach - target) || dir;
      target = nextTarget;
    }

    // Second pass: 8th-note skips between quarters. Done after the line exists
    // so each skip can genuinely pass between its neighbours rather than guess
    // at a note that hasn't been chosen yet. Densest on the way into a change.
    const quarters = [...events];
    for (let i = 0; i < quarters.length - 1; i++) {
      const cur = quarters[i];
      const nxt = quarters[i + 1];
      const chance = leadIns.has(cur.beat) ? 0.16 : cur.beat % bpb === 1 ? 0.06 : 0.03;
      if (rand() >= chance) continue;
      const gap = nxt.midi - cur.midi;
      const dir = Math.sign(gap) || 1;
      // fill a leap from the middle; step through a close interval chromatically
      const mid = Math.abs(gap) >= 3 ? cur.midi + dir * Math.round(Math.abs(gap) / 2) : nxt.midi - dir;
      if (mid === cur.midi || mid === nxt.midi) continue;
      events.push({ beat: cur.beat + 0.5, midi: clamp(mid), dur: 0.28, vel: Math.max(60, cur.vel - 18) });
    }
    events.sort((a, b) => a.beat - b.beat);
    return events;
  }

  _drumEvents(song, style, straight, bpb, opts = {}) {
    const events = [];
    const totalBars = song.progression.length;
    const push = (bar, off, drum, vel, extra) => events.push({ beat: bar * bpb + off, drum, vel, ...extra });
    // where the soloist ends phrases, the drummer answers
    const endsByBar = new Map();
    for (const b of opts.phraseEnds ?? []) {
      const bar = Math.floor(b / bpb);
      if (!endsByBar.has(bar)) endsByBar.set(bar, []);
      endsByBar.get(bar).push(b - bar * bpb);
    }

    // per-bar ride pattern pool — kept sparse; the ride marks time
    const ridePool = [
      { w: 0.3, p: [[0, 44], [1, 50], [2, 44], [3, 50]] },
      { w: 0.4, p: [[0, 44], [2, 46], [3, 50]] },
      { w: 0.15, p: [[0, 44], [1, 50], [2, 44], [3, 50], [3.5, 28]] },
      { w: 0.15, p: [[0, 46], [1, 52], [1.5, 30], [2, 46], [3, 52], [3.5, 30]] },
    ];
    const pickRide = () => {
      let r = rand();
      for (const { w, p } of ridePool) { if ((r -= w) <= 0) return p; }
      return ridePool[0].p;
    };
    const sectionEnd = (bar) => bar % 8 === 7 || bar === totalBars - 1;
    const bpm = Tone.getTransport().bpm.value;
    const slow = Math.max(0, Math.min(1, (110 - bpm) / 50));
    const kv = (v) => Math.max(8, Math.round(v * (1 - slow * 0.45)));

    // each chorus rolls a kit combination for its style — the drummer plays
    // the tune a different way every time through
    const comboCount = { swing: 3, blues: 3, modal: 3, ballad: 2, bossa: 3, latin: 2, funk: 3 }[style] ?? 3;
    const combo = Math.floor(rand() * comboCount);

    for (let bar = 0; bar < totalBars; bar++) {
      const fillBar = sectionEnd(bar) && bpb === 4 && slow < 0.3;
      if (endsByBar.has(bar) && slow < 0.3 && !fillBar && rand() < 0.5) {
        const off = Math.round(endsByBar.get(bar)[0] * 2) / 2;
        if (off >= 0 && off < bpb) push(bar, off, "snare", 32);
      }

      if (style === "ballad") {
        for (let b = 0; b < bpb; b++) push(bar, b, "ride", b % 2 ? 34 : 26);
        push(bar, 1, "hat", 40);
        if (bpb > 3) push(bar, 3, "hat", 40);
        if (combo === 1) {
          // brush swirl: whisper-level snare on 1 and 3 stands in for the swirl
          push(bar, 0, "snare", 16);
          if (bpb > 3) push(bar, 2, "snare", 14);
          if (rand() > 0.5 + slow * 0.3) push(bar, 0, "kick", kv(20));
        } else if (rand() > slow * 0.5) {
          push(bar, 0, "kick", kv(22));
        }
        if (bar % 8 === 7 && slow < 0.3 && rand() < 0.6) push(bar, bpb - 0.5, "snare", 24);
        continue;
      }

      if (style === "funk") {
        const hatAcc = combo === 2 ? [40, 22, 34, 22, 44, 22, 34, 26] : [34, 22, 34, 22, 34, 22, 34, 22];
        for (let e = 0; e < bpb * 2; e++) push(bar, e / 2, "hat", hatAcc[e % 8] ?? 30);
        push(bar, 1, "snare", 44);
        if (bpb > 3) push(bar, 3, "snare", 44);
        const pools = [
          [[0, 2.5], [0, 2.5], [0, 1.5, 2.5], [0, 2.75], [0, 1.5, 3.5]],
          [[0, 2.5], [0, 1.75, 2.5], [0, 2.5, 3.75]],
          [[0, 2.5], [0, 2.75], [0, 1.5, 2.5]],
        ][combo] ?? [[0, 2.5]];
        for (const off of choice(pools)) push(bar, off, "kick", kv(off === 0 ? 46 : 32));
        if (combo === 1) {
          // ghost 16ths around the backbeat
          for (const off of [0.75, 1.25, 2.75, 3.25]) if (rand() < 0.35) push(bar, off, "snare", Math.round(rnd(10, 16)));
        }
        if (sectionEnd(bar) && slow < 0.3) for (const off of [3.5, 3.75]) push(bar, off, "snare", 30);
        continue;
      }

      if (style === "latin") {
        // calypso/latin gets its own voice instead of borrowing the bossa clave
        for (const [off, vel] of [[0, 42], [1, 46], [2, 42], [3, 46]]) if (off < bpb) push(bar, off, "ride", vel);
        if (rand() < 0.3) push(bar, choice([1.5, 3.5]), "ride", 30);
        for (let e = 0; e < bpb * 2; e++) push(bar, e / 2, "hat", e % 2 ? 30 : 46);
        if (combo === 0) {
          for (const off of [0.5, 1.5, 2.5, 3.5]) if (off < bpb) push(bar, off, "rim", Math.round(rnd(36, 46)));
          push(bar, 0, "kick", 50);
          if (bpb > 2) push(bar, 2, "kick", 46);
        } else {
          // 3-2 son clave, same orientation as the soloist and the comp — the
          // drums used to start on the 2-side, which put the section cruzado
          const clave = bar % 2 === 0 ? [0, 1.5, 3] : [1, 2];
          for (const off of clave) if (off < bpb) push(bar, off, "rim", 50);
          push(bar, 0, "kick", 50);
          if (rand() < 0.4) push(bar, 2.5, "kick", kv(38));
        }
        if (sectionEnd(bar) && rand() < 0.5) push(bar, 3.5, "rim", 46);
        continue;
      }

      if (straight) {
        // bossa: straight 8th hats + rim clave; combos flip the clave and
        // color the hats
        const lift = bar % 4 === 3 ? 6 : 0;
        const accent = combo === 1 ? [48, 26, 40, 26, 48, 26, 40, 30] : null;
        for (let e = 0; e < bpb * 2; e++) {
          const base = (accent ? accent[e % 8] : e % 2 ? 28 : 44) + lift;
          push(bar, e / 2, "hat", Math.max(14, base + Math.round(rnd(-4, 4))));
        }
        const flip = combo === 1; // 2-3 clave instead of 3-2
        const clave = (bar % 2 === 0) !== flip ? [0, 1.5, 3] : [1, 2.5];
        for (const off of clave) if (off < bpb) push(bar, off, "rim", 52);
        push(bar, 0, "kick", 50);
        if (bpb > 2) push(bar, 2, "kick", 44);
        if (combo === 2) {
          if (rand() < 0.5) push(bar, 1.5, "kick", kv(34)); // surdo-ish & of 2
          if (rand() < 0.3) push(bar, 3.5, "kick", kv(30));
        }
        if (sectionEnd(bar) && rand() < 0.5) push(bar, 3.5, "rim", 46);
        continue;
      }

      // swing family (swing / blues / modal)
      const compMul = { blues: 1.2, modal: 0.65 }[style] ?? 1;
      const comboComp = [1, 1.5, 0.7][combo] ?? 1;
      const kickThresh = 0.65 + slow * 0.25 + (combo === 1 ? 0.15 : 0) + (style === "modal" ? 0.1 : 0);
      if (bpb === 3) {
        for (const [off, vel] of [[0, 48], [1, 38], [2, 42]]) push(bar, off, "ride", vel);
        push(bar, 1, "hat", 46);
      } else {
        const pattern = slow > 0.3 ? ridePool[0].p : pickRide();
        for (const [off, vel] of pattern) push(bar, off, "ride", vel);
        push(bar, 1, "hat", 50);
        push(bar, 3, "hat", 50);
        if (combo === 2 && slow < 0.3 && rand() < 0.3) push(bar, choice([0.5, 2.5]), "hat", 26); // hat color tick
      }
      for (let b = 0; b < bpb; b++) if (rand() > kickThresh) push(bar, b, "kick", kv(rnd(14, 20)));
      if (slow < 0.3 && !fillBar && rand() < 0.08) push(bar, bpb - 0.5, "kick", kv(28));
      if (fillBar) {
        // Every eight bars used to draw from the same three snare-only figures,
        // and the bar that turns the form over drew from them too — so the way
        // back to the top sounded identical every chorus. Two pools now: a
        // section fill that punctuates, and a longer lead-in that hands the top
        // back to the band. A drummer also declines to fill sometimes, which is
        // what makes the fills that do land mean anything.
        const lead = bar === totalBars - 1;
        const pool = lead
          ? [
              [[2, "snare", 30], [2.5, "snare", 36], [3, "snare", 42], [3.5, "snare", 52]],
              [[2, "kick", 34], [2.5, "snare", 34], [3, "snare", 44], [3.5, "kick", 46], [3.75, "snare", 54]],
              [[1.5, "snare", 26], [2, "rim", 34], [2.5, "snare", 32], [3, "snare", 40], [3.25, "snare", 44], [3.5, "snare", 50]],
              [[2, "snare", 40], [2.75, "snare", 30], [3, "kick", 42], [3.5, "snare", 50]],
              [[0.5, "snare", 24], [1.5, "snare", 28], [2.5, "snare", 34], [3, "snare", 40], [3.5, "snare", 48], [3.75, "kick", 44]],
              [[3, "snare", 46], [3.33, "snare", 46], [3.67, "snare", 52]],
            ]
          : [
              [[2.5, "snare", 34], [3, "snare", 40], [3.5, "snare", 50]],
              [[3, "snare", 38], [3.25, "snare", 42], [3.5, "snare", 46], [3.75, "snare", 52]],
              [[3, "snare", 44], [3.5, "snare", 52]],
              [[2.5, "rim", 30], [3, "snare", 38], [3.5, "kick", 44]],
              [[3, "kick", 40], [3.5, "snare", 48]],
              [[2.5, "snare", 28], [2.75, "snare", 32], [3.5, "snare", 46]],
              [[3.5, "snare", 44]],
            ];
        if (lead || rand() > 0.22) {
          for (const [off, drum, vel] of choice(pool)) push(bar, off, drum, kv(vel));
          // and land it: the top of the form gets the weight the lead-in promised
          if (lead) {
            push(0, 0, "kick", kv(44));
            push(0, 0, "hat", kv(44));
          }
          continue;
        }
      }
      const hits = rand() < (0.55 - slow * 0.25) * compMul * comboComp ? 1 : rand() < 0.25 * comboComp ? 2 : 0;
      const spots = slow > 0.3 ? [2] : [0.5, 1.5, 2, 2.5, 3.5];
      for (let h = 0; h < hits; h++) {
        const off = spots.splice(Math.floor(rand() * spots.length), 1)[0];
        push(bar, off, "snare", Math.round(rand() < 0.3 ? rnd(34, 42) : rnd(18, 28)));
      }
    }
    // mono synths throw on same-tick retriggers — keep the louder hit
    const seen = new Map();
    for (const e of events) {
      const k = `${e.drum}:${e.beat}`;
      if (!seen.has(k) || seen.get(k).vel < e.vel) seen.set(k, e);
    }
    // ride only when explicitly enabled (HQ toggle)
    return [...seen.values()].filter((e) => this.rideOn || e.drum !== "ride");
  }
}
