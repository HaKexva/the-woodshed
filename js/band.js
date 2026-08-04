// band.js — backing band engine.
// Tone.js drives the transport (tempo, swing, looping); smplr soundfonts
// supply piano / bass / guitar; drums are Tone synths (no samples to host).

import * as Tone from "https://cdn.jsdelivr.net/npm/tone@15.1.22/+esm";
import { Soundfont, SplendidGrandPiano, Sampler } from "https://cdn.jsdelivr.net/npm/smplr@1.0.0/+esm";
import { parseChord, pianoVoicing, guitarVoicing, bassPcs, placeNear, soloScaleSteps } from "./theory.js";

const BASS_LO = 30; // F#1
const BASS_HI = 52; // E3

// The soloist: smplr's Splendid Grand Piano, practical solo range in MIDI.
const SOLO_LO = 60;
const SOLO_HI = 88;

// Song-style feel layer — composes multiplicatively with the soloist-style
// presets so a Parker solo over a bossa still swings *bossa*. swing is the
// baseline; ballad keeps its dedicated handling and adds nothing here.
export const STYLE_FEEL = {
  swing: {},
  ballad: {},
  bossa: { trip: 0.25, p16: 0.5, encl: 0.6, blue: 0.6, rest: 1.15, hold: 1.2, lag: 0.5, offStart: 0.35, wLong: 1.3, grammar: 0.9, velOff: -4, phrase: 0.9 },
  latin: { trip: 0.35, p16: 0.9, encl: 0.8, blue: 0.9, lag: 0.3, offStart: 0.45, offAcc: 4, grammar: 0.9 },
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
  miles: {
    label: "miles",
    blurb: "space, short motifs, mid register, behind the beat",
    p: {
      ornament: 0.1,
      rest: 2.2, phrase: 0.5, phraseCap: 6, regLo: 0.45, regHi: 0.6,
      encl: 0.3, blue: 0.8, trip: 0.4, p16: 0.2, hold: 1.6, artic: 0.98,
      lag: 28, motif: 0.5, sit: 0.2, velOff: -8, contrast: 0.8, wLong: 1.6,
      cellProb: 0.3,
      cells: [
        { steps: [0, 1, 0], durs: [1, 0.5, 2.5] },
        { steps: [0, -1], durs: [1, 2] },
      ],
    },
  },
  parker: {
    label: "parker",
    blurb: "relentless bebop 8ths, enclosures, barline-crossing phrases",
    p: {
      ornament: 0.08,
      rest: 0.55, phrase: 1.5, phraseCap: 18, regLo: 0.45, regHi: 0.8,
      encl: 2.2, blue: 1.2, trip: 1.3, p16: 0.8, hold: 0.6, artic: 0.92,
      lag: 6, motif: 0.25, offStart: 0.5, wRun: 1.5, antic: 1.4,
      cellProb: 0.35,
      cells: [
        { steps: [0, -1, -1, 2, -1, -1], durs: [0.5, 0.5, 0.5, 0.5, 0.5, 1] },
        { steps: [0, 1, 1, -2, 1], durs: [0.5, 0.25, 0.25, 0.5, 1] },
        { steps: [0, 2, -1, -1, -1], durs: [0.5, 0.5, 0.5, 0.5, 0.5] },
      ],
    },
  },
  coltrane: {
    label: "coltrane",
    blurb: "sheets of sound — 16th cascades, stacked arpeggios",
    p: {
      multiInt: "rare",
      ornament: 0.05,
      rest: 0.4, phrase: 1.9, phraseCap: 24, regLo: 0.35, regHi: 0.9,
      encl: 0.8, blue: 0.7, trip: 1.5, p16: 2.2, hold: 0.5, artic: 0.88,
      lag: 2, motif: 0.5, wRun: 2, contrast: 1.2,
      cellProb: 0.4,
      cells: [
        { steps: [0, 1, 1, 2], durs: [0.25, 0.25, 0.25, 0.25] },
        { steps: [0, 2, 2, -1, -1, -1], durs: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25] },
        { steps: [0, 2, 2, 1, -2, -2], durs: [0.25, 0.25, 0.25, 0.25, 0.25, 0.5] },
      ],
    },
  },
  monk: {
    label: "monk",
    blurb: "angular leaps, weak-beat jabs, sudden silences",
    p: {
      multiInt: "seconds",
      ornament: 0,
      rest: 1.6, phrase: 0.7, phraseCap: 8, regLo: 0.4, regHi: 0.75,
      encl: 0.6, blue: 1.4, trip: 0.7, p16: 0.4, hold: 1.2, artic: 0.68,
      lag: 10, motif: 0.55, wide: 0.3, gap: 0.22, crush: 0.4, crushDur: 0.1,
      offAcc: 14, contrast: 1.4, sit: 0.18,
      cellProb: 0.25,
      cells: [
        { steps: [0, 3, -4, 3], durs: [0.5, 0.5, 0.5, 1] },
        { steps: [0, -3, 4], durs: [0.5, 1, 1.5] },
      ],
    },
  },
  chet: {
    label: "chet",
    blurb: "singable stepwise lines, chord tones, soft and unhurried",
    p: {
      multiInt: "none",
      ornament: 0.3,
      rest: 1.5, phrase: 0.8, phraseCap: 9, regLo: 0.35, regHi: 0.55,
      encl: 0.5, blue: 0.6, trip: 0.6, p16: 0.15, hold: 1.3, artic: 1,
      lag: 20, motif: 0.4, thread: 0.75, stepBias: [0.85, 0.1], velOff: -10,
      contrast: 0.7,
      cellProb: 0.3,
      cells: [
        { steps: [0, 1, 1, -1, -1], durs: [0.5, 0.5, 1, 0.5, 1.5] },
        { steps: [0, -1, 1, 1], durs: [1, 0.5, 0.5, 2] },
      ],
    },
  },
  dexter: {
    label: "dexter",
    blurb: "way behind the beat, long even notes, sneaks in quotes",
    p: {
      ornament: 0.25,
      rest: 1, phrase: 1, regLo: 0.4, regHi: 0.7,
      hold: 1.5, artic: 1, lag: 38, onBeat: 0.6, contrast: 0.6,
      cellProb: 0.35,
      cells: [
        { steps: [0, 1, 2, -1, 0], durs: [1, 0.5, 0.5, 0.5, 1.5] },
        { steps: [0, 0, 1, -1], durs: [0.5, 0.5, 1, 2] },
        { steps: [0, 2, -1, 1], durs: [1, 1, 0.5, 1.5] },
      ],
    },
  },
  wes: {
    label: "wes",
    blurb: "builds the chorus: single notes → octaves → chords",
    p: {
      multiInt: "octave",
      ornament: 0.15,
      rest: 1.1, phrase: 1, regLo: 0.4, regHi: 0.7,
      blue: 1.3, motif: 0.45, artic: 0.95, lag: 22, wesArc: true,
    },
  },
  silver: {
    label: "silver",
    blurb: "short funky riffs, repeated and squeezed, gospel smears",
    p: {
      multiInt: "thirds",
      ornament: 0.15,
      rest: 1.2, phrase: 0.5, phraseCap: 6, regLo: 0.4, regHi: 0.65,
      blue: 1.8, trip: 0.7, hold: 0.9, artic: 0.78, lag: 8, motif: 0.65,
      onBeat: 0.5, crush: 0.35, wRiff: 1.8, contrast: 1.2,
      cellProb: 0.4,
      cells: [
        { steps: [0, -2, 0, 1], durs: [0.5, 0.25, 0.25, 1] },
        { steps: [0, 1, -1, 0], durs: [0.5, 0.5, 0.5, 1.5] },
        { steps: [0, 0, -1, 0], durs: [0.5, 0.25, 0.25, 1] },
      ],
    },
  },
};

const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Band {
  constructor(callbacks = {}) {
    this.cb = callbacks; // { onChord, onBeat, onProgress, onReady }
    this.ctx = null;
    this.song = null;
    this.parts = [];
    this.muted = { piano: false, guitar: false, bass: false, drums: false };
    this.setupPromise = null;
    this.playing = false;
    this.soloOn = false;
    this.soloFeel = { crowd: 0.5, heat: 0.5 }; // crowd: note packing · heat: loudness/sharpness
    this.soloStyleName = "dexter";
    this.soloVoicing = "mono"; // mono: single-note line · multi: doubled holds, stabs, octaves
    this.soloInst = null;
    this.soloPart = null;
    // sound-quality A/B: mixing polish flags + instrument upgrades
    this.polish = { pan: true, eq: true, comp: true, reverb: true, sat: true, vel: true, drumTone: true };
    this.grandOn = true;
    this.rideOn = true;
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

  /** Throw away the current solo line and improvise a fresh one, mid-tune. */
  newTake() {
    if (this.playing) this._rebuildSoloPart();
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

  /** Set one solo-feel dial (0..1) — "crowd" or "heat". Regenerates live. */
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
    const bg = this.bgVolume ?? 1;
    this.gains.piano.gain.value = 0.75 * bg;
    this.gains.guitar.gain.value = 1.15 * bg;
    this.gains.bass.gain.value = 1.0 * bg;
    this.gains.drums.gain.value = 0.75 * bg;
    this.gains.solo.gain.value = 1.25;

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

    [this.pianoEP, this.bassGM, this.guitar] = await Promise.all([
      loadSf("electric_piano_1", this.gains.piano, "piano"),
      loadSf("electric_bass_finger", this.gains.bass, "bass"),
      loadSf("electric_guitar_jazz", this.gains.guitar, "guitar"),
    ]);
    this.piano = this.pianoEP;
    this.bass = this.bassGM;
    if (this.grandOn) this._loadGrand();

    this.cb.onReady?.();
  }

  // each style gets its own bass voice: uprights for the acoustic styles,
  // fingered electric for the groove styles
  static STYLE_BASS = {
    funk: ["MusyngKite", "electric_bass_finger"],
    default: ["FluidR3_GM", "acoustic_bass"],
  };

  _applyStyleBass(style) {
    if (this._bassOverride) return;
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
      if (this.grandOn) this.piano = this.pianoGrand;
      return;
    }
    try {
      const inst = new SplendidGrandPiano(this.ctx, { destination: this.gains.piano });
      await inst.load;
      this.pianoGrand = inst;
      if (this.grandOn) this.piano = inst;
    } catch (e) {
      console.warn("grand comping piano unavailable, staying on EP", e);
    }
  }

  setGrand(on) {
    this.grandOn = on;
    if (on) this._loadGrand();
    else if (this.pianoEP) this.piano = this.pianoEP;
  }

  _refreshGain(name) {
    if (name === "bass" && this.strips?.bass && this.polish.reverb) {
      // electric (funk) bass wants to sit dry up front — barely any room on it
      const send = this._bassChoice?.includes("electric") ? 0.012 : 0.04;
      this.strips.bass.send.gain.setTargetAtTime(send, this.ctx.currentTime, 0.03);
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
      bass: { f: 300, cut: -2, airF: 6000, air: 0 },
      drums: { f: 400, cut: -2, airF: 9000, air: 2 },
      solo: { f: 300, cut: -2, airF: 8000, air: 1.5 },
    };
    const sends = { piano: 0.18, guitar: 0.16, bass: 0.04, drums: 0.1, solo: 0.22 };

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
    this.strips.bass.sat.curve = P.sat ? this._satCurves.warm : this._satCurves.flat;
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

  /** Lazy-load the solo piano. */
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
    const base = { piano: 0.75, guitar: 1.3, bass: 1.0, drums: 0.75, solo: 1.25 }[name];
    return name === "bass" && this._bassChoice?.includes("electric") ? base * 0.78 : base;
  }

  setBpm(bpm) {
    if (this.ctx) Tone.getTransport().bpm.value = bpm;
  }

  loadSong(song) {
    this.song = song;
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
        this._buildParts(song, feel);
      },
      `${song.progression.length}m`,
      `${song.progression.length + 0.9}m`
    );
    this.playing = true;
    t.start("+0.1");
  }

  stop() {
    const t = Tone.getTransport();
    t.stop();
    t.cancel(0);
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
    const soloEvents = this._soloEvents(chords, totalBeats, style, SOLO_LO, SOLO_HI, bpb);
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
      events.filter((e) => !busyBars.has(Math.floor(e.beat / bpb)) || Math.random() < 0.55)
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
    if (role === "guitar") ev.piano = ev.piano.filter(() => Math.random() < 0.55);
    if (role === "piano") ev.guitar = ev.guitar.filter(() => Math.random() < 0.55);

    // each chorus leans a little different — comping thickens on the "up"
    // choruses and thins with softer touch on the "down" ones
    const bwave = [0.92, 1, 1.1, 0.82][(this._chorus ?? 0) % 4];
    const tilt = (events) =>
      events
        .filter(() => bwave >= 1 || Math.random() < 0.7 + bwave * 0.3)
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
      if (this.drumSamples?.[e.drum]) {
        const trim = { hat: 0.6, snare: 1.3, kick: 0.7, rim: 1.1, ride: 0.35 }[e.drum] ?? 1;
        const src = this.ctx.createBufferSource();
        src.buffer = this.drumSamples[e.drum];
        src.playbackRate.value = Math.pow(2, rnd(-35, 35) / 1200);
        const g = this.ctx.createGain();
        // perceptual curve: quiet hits fall away faster than linear
        const vNorm = Math.pow(e.vel / 127, this.polish.drumTone ? 1.35 : 1);
        g.gain.value = Math.min(1, vNorm * 1.35 * trim);
        src.connect(g);
        if (this.polish.drumTone && e.vel < 60 && e.drum !== "ride") {
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
    this._makeSoloPart(this._soloEvents(ctx.chords, ctx.totalBeats, ctx.style, SOLO_LO, SOLO_HI, ctx.bpb));
  }

  _makeSoloPart(events) {
    const ctx = this._songCtx;
    if (!ctx) return;
    this.soloPart?.dispose();
    // tick-based times so triplets land exactly; a touch of laid-back lag
    // (less when playing hot) plus per-note jitter humanizes the placement
    const ppq = Tone.getTransport().PPQ;
    this.soloPart = new Tone.Part((time, e) => {
      if (!this.soloOn) return;
      const st = SOLO_STYLES[this.soloStyleName]?.p ?? {};
      const durSec = e.dur * ctx.beatSec();
      const when = time + (((st.lag ?? 19) * (STYLE_FEEL[ctx.style]?.lag ?? 1)) / 1000) * (1 - 0.55 * this.soloFeel.heat) + ((e.lagAdj ?? 0) / 1000) + rnd(-0.004, 0.004);
      this.soloInst?.start({
        note: e.midi,
        time: when,
        duration: durSec,
        velocity: this._vel(e.vel),
      });
      for (const m of e.extra ?? []) {
        this.soloInst?.start({ note: m, time: when + 0.006, duration: durSec, velocity: this._vel(Math.max(30, e.vel - 14)) });
      }
      Tone.getDraw().schedule(() => this.cb.onSoloNote?.(e.midi % 12, durSec), when);
    }, events.map((e) => [`${Math.round((e.beat + ctx.bpb) * ppq)}i`, e]));
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
  _soloEvents(chords, totalBeats, style, lo, hi, bpb = 4) {
    const events = [];
    const ballad = style === "ballad";
    const lerp = (a, b, x) => a + (b - a) * x;
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
      return best === -1 ? Math.floor(pool.length / 2) : best;
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
      let prevT = (lo + hi) / 2;
      for (const ch of chords) {
        const iv = ch.info.intervals;
        const cands = [];
        for (const s of [pk(iv, [4, 3, 5]) ?? 4, pk(iv, [10, 11, 9]) ?? 7]) {
          const pc = (ch.info.rootPc + s) % 12;
          for (let m = lo + 2; m <= hi - 3; m++) if (m % 12 === pc) cands.push(m);
        }
        let best = cands[0] ?? Math.round(prevT);
        for (const m of cands) if (Math.abs(m - prevT) < Math.abs(best - prevT)) best = m;
        thread.set(ch, best);
        prevT = best;
      }
    }
    // Three dials shape the line: the arc (intensity rises to a peak ~72%
    // through the form), "crowd" (how packed the notes are: 16ths, phrase
    // length, rests, holds) and "heat" (loudness/sharpness: velocity,
    // accents, articulation, register push).
    // The dials are orthogonal: crowd OWNS note count (phrase length, note
    // durations, rests, flavor mix); heat owns the arc scale, velocity and
    // articulation. The arc only shapes contour within what the dials allow.
    const { crowd: c, heat: h } = this.soloFeel;
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
      hold: (S.hold ?? 1) * (F.hold ?? 1),
      sit: (S.sit ?? 0.12) * (F.sit ?? 1),
      crush: (S.crush ?? 0.18) * (F.crush ?? 1),
      grammar: (S.grammar ?? 0.65) * (F.grammar ?? 1),
      offStart: Math.max(S.offStart ?? 0, F.offStart ?? 0),
      offAcc: (S.offAcc ?? 0) + (F.offAcc ?? 0),
      velOff: (S.velOff ?? 0) + (F.velOff ?? 0),
      wRun: (S.wRun ?? 1) * (F.wRun ?? 1),
      wLong: (S.wLong ?? 1) * (F.wLong ?? 1),
      wRiff: (S.wRiff ?? 1) * (F.wRiff ?? 1),
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
      let i = ((0.18 + 0.72 * arc) * lerp(0.75, 1.2, h) + rnd(-0.12, 0.12)) * wave * (1 + Math.min(chor, 6) * 0.015);
      if (t >= windFrom) i *= 0.5;
      return Math.max(0.05, Math.min(1, ballad ? i * 0.6 : i));
    };
    const legato = Math.min(1, lerp(0.97, 0.8, h) * (S.artic ?? 1)); // hotter = sharper articulation
    // phrase flavors keep the line from sounding same-y; crowding squeezes
    // long-tone phrases out of the mix
    const pickFlavor = (i) => {
      const wRun = (0.25 + 0.45 * i + 0.6 * c) * M.wRun;
      const wLong = Math.max(0.06, (0.55 - 0.4 * i) * (1 - 0.8 * c)) * M.wLong;
      const wRiff = 0.3 * M.wRiff;
      let r = Math.random() * (wRun + wLong + wRiff);
      if ((r -= wRun) <= 0) return "run";
      if ((r -= wLong) <= 0) return "longtones";
      return "riff";
    };

    let t = choice([0.5, 1, 1.5, 2]);
    let cur = lo + (hi - lo) * 0.45;
    let lastChord = null;
    let lastEnd = 0;
    let motif = null; // { durs, steps } — signed scale-steps of a kept phrase
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
      if (!ballad && isPeakChorus && intensity > 0.8 && burns < 2 && t < windFrom - 4 && Math.random() < 0.35) {
        burns++;
        const vb = lerp(52, 84, intensity) + lerp(-4, 24, h) + M.velOff;
        const c0 = chordAt(t);
        const pool0 = poolFor(c0);
        const i0 = nearestIdx(pool0, Math.max(cur, registerTarget + 3)); // shout from up high
        const octs = this.soloVoicing === "multi";
        const kind = choice(["hemiola", "riff", "horizontal"]);
        if (kind === "hemiola") {
          // 3-over-4 hammer: dotted-quarter attacks cycling three pitches
          const cell = [pool0[i0], pool0[Math.max(0, i0 - 1)], pool0[Math.min(pool0.length - 1, i0 + 1)]];
          const reps = 4 + Math.floor(Math.random() * 3);
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
          const len = 10 + Math.floor(Math.random() * 4);
          for (let j = 0; j < len && t < totalBeats - 1; j++) {
            idx = Math.max(0, Math.min(pool0.length - 1, idx + (Math.random() < 0.6 ? -1 : 1)));
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
      const useMotif = !useAnswer && !useSeq && motif && Math.random() < (S.motif ?? 0.35);
      const useCell = !useAnswer && !useSeq && !useMotif && S.cells && Math.random() < (S.cellProb ?? 0);
      const flavor = useAnswer || useSeq || useMotif ? "motif" : useCell ? "cell" : ballad && Math.random() < 0.5 ? "longtones" : pickFlavor(intensity);
      let velBase = lerp(52, 84, intensity) + lerp(-4, 24, h) + M.velOff + (useAnswer ? -6 : 0);
      let blueBoost = 1;
      // outside color: tritone-sub scale over dominants near the peak
      const subActive = intensity > 0.75 && Math.random() < 0.25;
      let forceStartMidi = null;

      let durs;
      let plannedSteps = null;
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
        durs = motif.durs;
        plannedSteps = motif.steps;
      } else if (useCell) {
        // vocabulary lick, transposed onto this chord's scale
        const cell = choice(S.cells);
        durs = [...cell.durs];
        plannedSteps = [...cell.steps];
      } else if (flavor === "longtones") {
        // few notes, held — breathes even at high intensity
        const len = 2 + Math.floor(Math.random() * 2);
        durs = Array.from({ length: len }, () => choice(c > 0.6 ? [1, 1.5, 2] : [1.5, 2, 2.5]) * M.hold);
        durs[len - 1] += 0.5;
        velBase -= 8;
      } else if (flavor === "riff") {
        // short syncopated cell, leans bluesy
        const len = 3 + Math.floor(Math.random() * 3) + (c > 0.6 ? 2 : 0);
        durs = Array.from({ length: len }, (_, n) =>
          n === len - 1 ? choice([1, 1.5]) : choice(c > 0.5 ? [0.5, 0.25, 0.25] : [0.5, 0.5, 0.25])
        );
        if (t % 1 === 0 && Math.random() < 0.6) t += 0.5; // offbeat entry
        blueBoost = 2;
      } else {
        // run: the workhorse — crowd directly packs the notes, at any point
        // in the form
        const len = Math.min(S.phraseCap ?? 16, Math.max(3, Math.round(lerp(3, 6, intensity) * lerp(0.6, 2.0, c) * M.phrase * wave + rnd(-1, 1))));
        const p16 = Math.min(0.8, (c * 0.5 + Math.max(0, intensity - 0.5) * 0.3) * M.p16 * (isPeakChorus ? 1.3 : 1));
        durs = [];
        while (durs.length < len - 1) {
          if (!ballad && durs.length < len - 3 && Math.random() < (0.08 + 0.16 * intensity) * M.trip) {
            durs.push(1 / 3, 1 / 3, 1 / 3); // triplet cell over one beat
          } else if (!ballad && Math.random() < p16) durs.push(0.25);
          else durs.push(Math.random() < 0.3 * (1 - c) ? 1 : 0.5);
        }
        durs.push(choice(ballad ? [2, 2.5, 3] : c > 0.6 ? [0.5, 1] : [1, 1.5, 2]) * M.hold);
      }
      // phrase-start timing personality: on the beat (Dexter, Silver) or
      // pushed off it (Parker)
      if (S.onBeat && Math.random() < S.onBeat) t = Math.round(t);
      else if (M.offStart && Math.abs(t - Math.round(t)) < 0.05 && Math.random() < M.offStart) t += 0.5;

      const takenSteps = [];
      const phraseStart = t;
      let lastMain = null; // previous sounded note, for bebop passing tones
      let prevStep = 0;
      let phrasePeakVel = 0;
      let phraseNotes = 0;
      for (let n = 0; n < durs.length && t < totalBeats - 0.5; n++) {
        const c = chordAt(t);
        const pool = subActive && isDom(c) ? subPoolFor(c) : poolFor(c);
        const newChord = c !== lastChord;
        if (forceStartMidi !== null && n === 0) {
          // sequence repeat: exact transposition, don't re-root on the chord
          cur = pool[nearestIdx(pool, forceStartMidi)];
          lastChord = c;
          takenSteps.push(0);
        } else if (newChord || n === 0) {
          // land on the guide-tone thread (or a nearby chord tone), drawn
          // toward the arc's register
          let target;
          let idx;
          if (Math.random() < (S.thread ?? 0.55)) {
            target = thread.get(c);
            idx = nearestIdx(pool, target);
          } else {
            const tones = new Set(c.info.intervals.filter((iv) => iv > 0).map((iv) => (c.info.rootPc + iv) % 12));
            idx = nearestIdx(pool, n === 0 ? (cur + registerTarget) / 2 : cur, (m) => tones.has(m % 12));
            target = pool[idx];
          }
          lastChord = c;
          // bebop enclosure: scale step above, semitone below, then the target
          if (n === 0 && !useMotif && t - 1 >= lastEnd && Math.random() < lerp(0.15, 0.4, intensity) * M.encl) {
            const above = pool[Math.min(pool.length - 1, idx + 1)];
            events.push({ beat: t - 1, midi: above, dur: 0.42, vel: Math.round(velBase - 14) });
            events.push({ beat: t - 0.5, midi: target - 1, dur: 0.42, vel: Math.round(velBase - 10) });
          } else if (n === 0 && !ballad && t - 0.5 >= lastEnd && Math.abs(t - Math.round(t)) < 0.05 && Math.random() < 0.4) {
            // pickup entry: two stepwise notes on the & of the previous beat,
            // walking up into the landing
            events.push({ beat: t - 0.5, midi: pool[Math.max(0, idx - 2)], dur: 0.22, vel: Math.round(velBase - 14) });
            events.push({ beat: t - 0.25, midi: pool[Math.max(0, idx - 1)], dur: 0.22, vel: Math.round(velBase - 9) });
          }
          cur = target;
          takenSteps.push(0);
        } else if (plannedSteps) {
          // motif echo: same contour, re-rooted on this chord's scale
          const idx = Math.max(0, Math.min(pool.length - 1, nearestIdx(pool, cur) + plannedSteps[n]));
          cur = pool[idx];
        } else if (Math.random() < M.sit) {
          takenSteps.push(0); // sit on the note
        } else if (Math.random() < lerp(0.1, 0.22, intensity) * blueBoost * M.blue) {
          const blue = blueNote(c, cur);
          if (blue !== null) cur = blue;
          takenSteps.push(0);
        } else {
          const r = Math.random();
          const p1 = S.stepBias?.[0] ?? lerp(0.72, 0.52, intensity);
          const p2 = p1 + (S.stepBias?.[1] ?? (0.86 - lerp(0.72, 0.52, intensity)));
          let mag = r < p1 ? 1 : r < p2 ? 2 : 3 + Math.floor(Math.random() * 2);
          if (S.wide && Math.random() < S.wide) mag = 5 + Math.floor(Math.random() * 2); // angular leap
          let dir = Math.random() < (cur > registerTarget ? 0.62 : 0.38) ? -1 : 1; // drift toward the arc
          if (cur < lo + 4) dir = 1;
          if (cur > hi - 4) dir = -1;
          const idx = Math.max(0, Math.min(pool.length - 1, nearestIdx(pool, cur) + dir * mag));
          takenSteps.push(idx - nearestIdx(pool, cur));
          cur = pool[idx];
          // bebop metric grammar: notes landing on the beat want to be chord
          // tones — tensions belong on the upbeats
          if (flavor === "run" && !subActive && Math.abs(t - Math.round(t)) < 0.05 && Math.random() < M.grammar) {
            const tonePcs = new Set(c.info.intervals.map((iv2) => (c.info.rootPc + iv2) % 12));
            const gi = nearestIdx(pool, cur, (m) => tonePcs.has(m % 12));
            if (gi >= 0 && Math.abs(pool[gi] - cur) <= 4) cur = pool[gi];
          }
        }
        const last = n === durs.length - 1;
        // avoid-note hygiene: anything held a beat or longer (any flavor,
        // planned or not) must be a chord tone or a safe tension
        if (!subActive && (durs[n] >= 1 || last)) {
          const iv2 = c.info.intervals;
          const safe = new Set(iv2.filter((x) => x > 0).map((x) => (c.info.rootPc + x) % 12));
          safe.add((c.info.rootPc + 2) % 12); // 9th
          if (iv2.includes(4) && iv2.includes(10)) safe.add((c.info.rootPc + 9) % 12); // 13 on dominants
          if (!safe.has(((cur % 12) + 12) % 12)) {
            const si = nearestIdx(pool, cur, (m) => safe.has(m % 12));
            if (si >= 0) cur = pool[si];
          }
        }
        // phrase ends resolve — 3rd or 9th of the sounding chord, the thing
        // that makes a line sound intentional
        if (last && !plannedSteps && flavor !== "longtones") {
          const iv = c.info.intervals;
          const third = (c.info.rootPc + (iv.includes(4) ? 4 : iv.includes(3) ? 3 : 4)) % 12;
          const ninth = (c.info.rootPc + 2) % 12;
          const res = new Set([third, ninth]);
          const idx = nearestIdx(pool, cur, (m) => res.has(m % 12));
          if (idx >= 0) cur = pool[idx];
        }
        const dur = durs[n];
        // sudden mid-phrase silence (Monk): skip the note, keep the time
        if (S.gap && !last && n > 0 && Math.random() < S.gap) {
          t += dur;
          lastEnd = t;
          continue;
        }
        const offbeat = Math.abs(t - Math.round(t)) > 0.05;
        // crescendo into the phrase's peak, easing after
        const peak = Math.max(1, Math.round((durs.length - 1) * 0.65));
        const contour = (13 * (1 - Math.abs(n - peak) / Math.max(peak, durs.length - peak, 1)) - 4) * (S.contrast ?? 1);
        const thisStep = takenSteps[takenSteps.length - 1] ?? 0;
        const turned = n > 1 && Math.sign(thisStep) !== 0 && Math.sign(thisStep) !== Math.sign(prevStep); // direction change
        prevStep = thisStep || prevStep;
        // ghosts: quiet in-between notes inside longer runs, horn-style
        const ghost = flavor === "run" && durs.length >= 5 && n > 0 && !last && n !== peak && Math.random() < 0.18;
        let vel = Math.round(Math.min(122, Math.max(40, velBase + contour + rnd(-6, 7) + (offbeat ? lerp(2, 10, h) + M.offAcc : 0) + (last ? 4 : 0) + (turned ? 4 : 0))));
        if (ghost) vel = Math.max(25, Math.round(vel * 0.45));
        // grace-note scoop/crush into phrase starts and held notes
        if ((t === phraseStart || last) && t - 0.25 >= lastEnd && Math.random() < M.crush) {
          events.push({ beat: t - 0.25, midi: cur - 1, dur: S.crushDur ?? 0.22, vel: Math.max(30, vel - 26) });
        }
        // bebop passing tone: a chromatic 16th slipped between a whole-step
        // descent over a dominant chord
        if (lastMain && isDom(c) && lastMain.midi - cur === 2 && lastMain.rawDur === 0.5 && !ghost && Math.random() < 0.45) {
          lastMain.dur = 0.25 * legato;
          events.push({ beat: lastMain.beat + 0.25, midi: cur + 1, dur: 0.23, vel: Math.max(28, vel - 12) });
        }
        // bebop articulation: clip every fourth note of a run
        const clip = flavor === "run" && !last && n % 4 === 3 ? 0.75 : 1;
        phrasePeakVel = Math.max(phrasePeakVel, vel);
        phraseNotes++;
        const ev = { beat: t, midi: cur, dur: dur * legato * clip, vel, rawDur: dur };
        // drifting time feel: phrase endings sit back, climaxes push
        if (last) ev.lagAdj = 8;
        else if (vel > 100) ev.lagAdj = -5;
        // ornaments on held notes — a quick upper-neighbor mordent
        if (dur >= 1.5 && Math.random() < (S.ornament ?? 0.12)) {
          const upper = pool[Math.min(pool.length - 1, nearestIdx(pool, cur) + 1)];
          if (upper !== cur) {
            events.push({ beat: t + 0.3, midi: upper, dur: 0.16, vel: Math.max(28, vel - 16) });
            events.push({ beat: t + 0.55, midi: cur, dur: (dur - 0.6) * legato * 0.9, vel: Math.max(30, vel - 8) });
            ev.dur = 0.28;
          }
        }
        // multi voicing: thicken holds, phrase ends, and riff stabs — runs
        // stay single-note so fast lines don't smear. Each style doubles in
        // its own interval, thickness rides the energy wave, and the added
        // note is held to the same avoid-note hygiene as the melody.
        if (this.soloVoicing === "multi") {
          const mode = S.multiInt ?? "default";
          let p = last || dur >= 1.2 ? 0.6 : flavor === "riff" ? 0.35 : intensity > 0.7 && !offbeat ? 0.2 : 0;
          if (mode === "none") p = 0;
          if (mode === "rare") p *= 0.3;
          if (isLayout) p *= 0.25;
          if (isPeakChorus) p = Math.min(0.85, p * 1.4);
          if (Math.random() < p) {
            let add;
            if (mode === "seconds") add = cur - choice([1, 2]); // crunchy Monk cluster
            else if (mode === "octave" || (isPeakChorus && Math.random() < 0.5)) add = cur - 12; // locked hands at the peak
            else add = pool[Math.max(0, nearestIdx(pool, cur) - choice([2, 2, 3]))]; // 3rd/6th below
            // keep the doubling consonant (except deliberate clusters)
            if (mode !== "seconds" && add !== undefined && dur >= 1) {
              const iv3 = c.info.intervals;
              const safe3 = new Set(iv3.map((x) => (c.info.rootPc + x) % 12));
              safe3.add((c.info.rootPc + 2) % 12);
              if (!safe3.has(((add % 12) + 12) % 12)) {
                const ai = nearestIdx(pool, add, (m) => safe3.has(m % 12));
                if (ai >= 0) add = pool[ai];
              }
            }
            if (add !== undefined && add !== cur && add >= lo - 8) ev.extra = [add];
          }
        }
        events.push(ev);
        lastMain = ev;
        t += dur;
        lastEnd = t;
      }

      const freshPhrase = !useMotif && !useAnswer && !useSeq && !useCell;
      if (freshPhrase && !ballad && takenSteps.length >= 3 && Math.random() < 0.5) {
        motif = { durs, steps: takenSteps };
      } else if (Math.random() < 0.25) {
        motif = null; // move on to new material
      }

      // call & response: answer the phrase with its own rhythm, bent downward
      if (freshPhrase && !ballad && takenSteps.length >= 3 && flavor !== "longtones" && Math.random() < 0.35) {
        const steps = [...takenSteps];
        steps[steps.length - 1] = -Math.abs(steps[steps.length - 1] || 1);
        if (steps.length > 1) steps[steps.length - 2] = -Math.abs(steps[steps.length - 2] || 1);
        answer = { durs, steps };
      }
      // diatonic sequence: a short cell repeats a step lower, 1-2 times
      else if (freshPhrase && !ballad && flavor === "run" && durs.length <= 5 && lastMain && Math.random() < 0.3) {
        seq = { durs, steps: takenSteps, startMidi: lastMain.midi - 2, reps: Math.random() < 0.4 ? 2 : 1 };
      }

      // cross-bar anticipation: state the next chord's guide tone half a
      // beat early and hold it over the barline
      const nc = chords.find((x) => x.startBeat >= t + 0.5 && x.startBeat <= t + 4);
      if (nc && !ballad && Math.random() < 0.3 * (S.antic ?? 1)) {
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
      const spent = Math.min(1, (phraseNotes * (phrasePeakVel / 110)) / 9);
      const restWave = (2.05 - wave) * (isLayout ? 1.3 : 1); // the tide: peaks crowd, layouts leave holes
      if (!ballad && spent > 0.75) {
        t = Math.ceil(t / bpb) * bpb + bpb - 0.5; // full-bar breath, re-enter on the & of 4
      } else {
        t += Math.max(0.5, (lerp(3.2, 0.5, c) + lerp(0.5, -0.2, intensity)) * M.rest * (0.6 + 0.9 * spent) * restWave + choice([-0.5, 0, 0.5]) + (ballad ? 1 : 0));
      }
      t = Math.round(t * 4) / 4;
    }
    // Wes: the chorus builds — single notes, then octaves, then chords
    if (S.wesArc) {
      for (const e of events) {
        const x = e.beat / totalBeats;
        if (x > 0.45 && e.midi + 12 <= hi + 3) e.extra = [e.midi + 12];
        if (x > 0.78) (e.extra ??= []).push(e.midi - 5);
      }
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
    const patterns4 = straight
      ? [ [[0, 1], [1.5, 1.5], [3, 1]], [[0.5, 1], [2, 1], [3.5, 0.5]], [[0, 1.5], [2.5, 1.5]] ]
      : [ [[0, 1.5], [1.5, 1]], [[0, 1], [2.5, 1.5]], [[1.5, 2.5]], [[0, 2]], [[0, 1], [3, 1]], [[2.5, 1.5]] ];
    const patterns2 = straight
      ? [ [[0, 0.75], [1.5, 0.5]], [[0, 1.5]] ]
      : [ [[0, 1.5]], [[0.5, 1.5]], [[0, 1], [1.5, 0.5]] ];

    const funkPatterns = [ [[1.5, 0.5], [3, 0.5]], [[0, 0.5], [2.5, 0.5]], [[1.5, 0.5], [2.5, 0.5], [3.5, 0.5]] ];

    for (const c of chords) {
      const midis = pianoVoicing(c.info);
      let hits;
      if (style === "ballad") hits = [[0, c.beats]];
      else if (style === "funk") hits = c.beats >= 4 ? choice(funkPatterns) : [[0, 0.5]];
      else if (c.beats >= 4) hits = choice(patterns4);
      else if (c.beats >= 2) hits = choice(patterns2);
      else hits = [[0, c.beats]];

      for (const [off, dur] of hits) {
        if (off >= c.beats) continue;
        events.push({
          beat: c.startBeat + off,
          dur: Math.min(dur, c.beats - off),
          midis,
          vel: Math.round(rnd(50, 68)),
          roll: style === "ballad",
        });
      }
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
        if (Math.random() < 0.25) return;
        const c = chords.find((x) => x.bar === barIdx);
        events.push({
          beat: barIdx * bpb,
          dur: bpb,
          midis: guitarVoicing(c.info, Math.random() < 0.4 ? 1 : 0),
          vel: 28,
          roll: Math.random() < 0.5,
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

    for (let bar = 0; bar < totalBars; bar++) {
      const variant = Math.random() < 0.35 ? 1 : 0;
      let offsets;
      if (style === "funk") offsets = choice(funkPool);
      else if (straight) offsets = choice(bossaPool);
      else if (Math.random() < 0.1) offsets = [1, 3]; // breathe: comp 2 & 4 only
      else offsets = [...Array(bpb).keys()]; // Freddie Green quarters

      for (const off of offsets) {
        const beat = bar * bpb + off;
        const c = chordAt(beat);
        const accent = !straight && off % 2 === 1; // lean on 2 & 4
        events.push({
          beat,
          dur: straight ? 0.6 : 0.42,
          midis: guitarVoicing(c.info, variant),
          vel: Math.round(rnd(30, 38)) + (accent ? 6 : 0) + (style === "funk" ? 10 : 0),
        });
      }

      // swing: occasional push — anticipate next bar's chord on the & of 4
      if (!straight && style !== "funk" && bar < totalBars - 1 && Math.random() < 0.15) {
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

  _bassEvents(chords, totalBeats, style, straight, bpb) {
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
          if (Math.random() < 0.15) {
            // simple bar: let the root ring
            events.push({ beat: c.startBeat + 2, midi: root, dur: 1.8, vel: 86 });
          } else {
            const half = Math.random() < 0.3 ? third : fifth;
            events.push({ beat: c.startBeat + 2, midi: half, dur: 1.3, vel: 90 });
            const nextRoot = placeNear(c.next.info.bassPc, root, BASS_LO, BASS_HI);
            const pickup = Math.random() < 0.3 ? nextRoot + (nextRoot > half ? -1 : 1) : root;
            events.push({ beat: c.startBeat + 3.5, midi: pickup, dur: 0.45, vel: 74 });
          }
        }
      }
      return events;
    }

    // swing: walking quarters with chromatic approach into each new chord
    let prev = 38;
    for (let b = 0; b < totalBeats; b++) {
      const c = chordAt(b);
      const pcs = bassPcs(c.info);
      const chordEnd = c.startBeat + c.beats;
      let midi;
      if (b === c.startBeat) {
        midi = placeNear(pcs.root, prev, BASS_LO, BASS_HI);
      } else if (b === chordEnd - 1) {
        const nextRoot = placeNear(c.next.info.bassPc, prev, BASS_LO, BASS_HI);
        midi = nextRoot + (Math.random() < 0.5 ? 1 : -1);
        midi = Math.max(BASS_LO, Math.min(BASS_HI, midi));
      } else {
        const cands = [pcs.third, pcs.fifth, pcs.seventh]
          .map((pc) => placeNear(pc, prev + (Math.random() < 0.5 ? 2 : -2), BASS_LO, BASS_HI))
          .filter((m) => m !== prev);
        midi = cands.length ? choice(cands) : prev + 2;
      }
      events.push({ beat: b, midi, dur: 0.62, vel: Math.round(rnd(86, 100)) });
      prev = midi;
    }
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
      let r = Math.random();
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
    const combo = Math.floor(Math.random() * comboCount);

    for (let bar = 0; bar < totalBars; bar++) {
      const fillBar = sectionEnd(bar) && bpb === 4 && slow < 0.3;
      if (endsByBar.has(bar) && slow < 0.3 && !fillBar && Math.random() < 0.5) {
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
          if (Math.random() > 0.5 + slow * 0.3) push(bar, 0, "kick", kv(20));
        } else if (Math.random() > slow * 0.5) {
          push(bar, 0, "kick", kv(22));
        }
        if (bar % 8 === 7 && slow < 0.3 && Math.random() < 0.6) push(bar, bpb - 0.5, "snare", 24);
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
          for (const off of [0.75, 1.25, 2.75, 3.25]) if (Math.random() < 0.35) push(bar, off, "snare", Math.round(rnd(10, 16)));
        }
        if (sectionEnd(bar) && slow < 0.3) for (const off of [3.5, 3.75]) push(bar, off, "snare", 30);
        continue;
      }

      if (style === "latin") {
        // calypso/latin gets its own voice instead of borrowing the bossa clave
        for (const [off, vel] of [[0, 42], [1, 46], [2, 42], [3, 46]]) if (off < bpb) push(bar, off, "ride", vel);
        if (Math.random() < 0.3) push(bar, choice([1.5, 3.5]), "ride", 30);
        for (let e = 0; e < bpb * 2; e++) push(bar, e / 2, "hat", e % 2 ? 30 : 46);
        if (combo === 0) {
          for (const off of [0.5, 1.5, 2.5, 3.5]) if (off < bpb) push(bar, off, "rim", Math.round(rnd(36, 46)));
          push(bar, 0, "kick", 50);
          if (bpb > 2) push(bar, 2, "kick", 46);
        } else {
          const clave = bar % 2 === 0 ? [1, 2.5] : [0, 1.5, 3];
          for (const off of clave) if (off < bpb) push(bar, off, "rim", 50);
          push(bar, 0, "kick", 50);
          if (Math.random() < 0.4) push(bar, 2.5, "kick", kv(38));
        }
        if (sectionEnd(bar) && Math.random() < 0.5) push(bar, 3.5, "rim", 46);
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
          if (Math.random() < 0.5) push(bar, 1.5, "kick", kv(34)); // surdo-ish & of 2
          if (Math.random() < 0.3) push(bar, 3.5, "kick", kv(30));
        }
        if (sectionEnd(bar) && Math.random() < 0.5) push(bar, 3.5, "rim", 46);
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
        if (combo === 2 && slow < 0.3 && Math.random() < 0.3) push(bar, choice([0.5, 2.5]), "hat", 26); // hat color tick
      }
      for (let b = 0; b < bpb; b++) if (Math.random() > kickThresh) push(bar, b, "kick", kv(rnd(14, 20)));
      if (slow < 0.3 && !fillBar && Math.random() < 0.08) push(bar, bpb - 0.5, "kick", kv(28));
      if (fillBar) {
        const fill = choice([
          [[2.5, 34], [3, 40], [3.5, 50]],
          [[3, 38], [3.25, 42], [3.5, 46], [3.75, 52]],
          [[3, 44], [3.5, 52]],
        ]);
        for (const [off, vel] of fill) push(bar, off, "snare", vel);
        continue;
      }
      const hits = Math.random() < (0.55 - slow * 0.25) * compMul * comboComp ? 1 : Math.random() < 0.25 * comboComp ? 2 : 0;
      const spots = slow > 0.3 ? [2] : [0.5, 1.5, 2, 2.5, 3.5];
      for (let h = 0; h < hits; h++) {
        const off = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
        push(bar, off, "snare", Math.round(Math.random() < 0.3 ? rnd(34, 42) : rnd(18, 28)));
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
