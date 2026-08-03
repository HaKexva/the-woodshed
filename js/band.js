// band.js — backing band engine.
// Tone.js drives the transport (tempo, swing, looping); smplr soundfonts
// supply piano / bass / guitar; drums are Tone synths (no samples to host).

import * as Tone from "https://cdn.jsdelivr.net/npm/tone@15.1.22/+esm";
import { Soundfont } from "https://cdn.jsdelivr.net/npm/smplr@1.0.0/+esm";
import { parseChord, pianoVoicing, guitarVoicing, bassPcs, placeNear, soloScaleSteps } from "./theory.js";

const BASS_LO = 30; // F#1
const BASS_HI = 52; // E3

// Solo instruments (GM soundfont name + practical range in MIDI).
export const SOLOISTS = {
  trumpet: { label: "trumpet", sf: "trumpet", lo: 58, hi: 84 },
  trombone: { label: "trombone", sf: "trombone", lo: 45, hi: 70 },
  alto: { label: "alto sax", sf: "alto_sax", lo: 56, hi: 80 },
  tenor: { label: "tenor sax", sf: "tenor_sax", lo: 50, hi: 76 },
  keys: { label: "keys", sf: "acoustic_grand_piano", lo: 60, hi: 88 },
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
    this.soloName = "trumpet";
    this.soloInsts = {};
    this.soloPart = null;
  }

  /** Create audio context + start loading instruments. Safe to call early. */
  setup() {
    if (!this.setupPromise) this.setupPromise = this._setup();
    return this.setupPromise;
  }

  async _setup() {
    this.ctx = new AudioContext();
    Tone.setContext(this.ctx);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    // Small room reverb on the whole band; fall back to a dry signal if
    // the Tone <-> native interconnect misbehaves.
    try {
      const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.12 });
      await reverb.ready;
      Tone.connect(this.master, reverb);
      reverb.toDestination();
    } catch (e) {
      console.warn("reverb unavailable, going dry", e);
      this.master.connect(this.ctx.destination);
    }

    this.gains = {};
    for (const name of ["piano", "guitar", "bass", "drums", "solo"]) {
      const g = this.ctx.createGain();
      g.connect(this.master);
      this.gains[name] = g;
    }
    this.gains.piano.gain.value = 0.75;
    this.gains.guitar.gain.value = 0.6;
    this.gains.bass.gain.value = 1.0;
    this.gains.drums.gain.value = 0.8;
    this.gains.solo.gain.value = 1.25;

    this._buildDrumKit();

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

    [this.piano, this.bass, this.guitar] = await Promise.all([
      loadSf("electric_piano_1", this.gains.piano, "piano"),
      loadSf("acoustic_bass", this.gains.bass, "bass"),
      loadSf("electric_guitar_jazz", this.gains.guitar, "guitar"),
    ]);

    this.cb.onReady?.();
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

  _buildDrumKit() {
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0 },
    });
    this.kick.volume.value = -10;
    this.kick.connect(this.gains.drums);

    this.ride = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 1.1, release: 0.3 },
      harmonicity: 5.1,
      modulationIndex: 18,
      resonance: 7000,
      octaves: 1.2,
    });
    this.ride.volume.value = -22;
    this.ride.connect(this.gains.drums);

    this.hatFilter = new Tone.Filter(6000, "highpass");
    this.hatFilter.connect(this.gains.drums);
    this.hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
    });
    this.hat.volume.value = -16;
    this.hat.connect(this.hatFilter);

    this.snareFilter = new Tone.Filter(1800, "bandpass");
    this.snareFilter.connect(this.gains.drums);
    this.snare = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.002, decay: 0.13, sustain: 0 },
    });
    this.snare.volume.value = -14;
    this.snare.connect(this.snareFilter);

    this.rim = new Tone.MembraneSynth({
      pitchDecay: 0.005,
      octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.06, sustain: 0 },
    });
    this.rim.volume.value = -14;
    this.rim.connect(this.gains.drums);
  }

  setSolo(on) {
    this.soloOn = on;
  }

  /** Lazy-load a solo soundfont and make it the active soloist. */
  async setSoloInstrument(name) {
    const def = SOLOISTS[name];
    if (!def) return;
    await this.setup();
    if (!this.soloInsts[name]) {
      try {
        const inst = new Soundfont(this.ctx, { instrument: def.sf, destination: this.gains.solo });
        await inst.load;
        this.soloInsts[name] = inst;
      } catch (e) {
        console.warn(`soloist ${def.sf} failed, using synth fallback`, e);
        this.soloInsts[name] = this._synthFallback("piano", this.gains.solo);
      }
    }
    const rebuildLine = name !== this.soloName;
    this.soloName = name;
    // range differs per horn — regenerate the line if we're mid-tune
    if (rebuildLine && this.playing) this._rebuildSoloPart();
  }

  setMuted(name, value) {
    this.muted[name] = value;
    if (this.gains?.[name]) {
      this.gains[name].gain.setTargetAtTime(value ? 0 : this._gainFor(name), this.ctx.currentTime, 0.02);
    }
  }

  _gainFor(name) {
    return { piano: 0.75, guitar: 0.6, bass: 1.0, drums: 0.8 }[name];
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
    t.bpm.value = this.bpmOverride ?? song.bpm;
    t.timeSignature = song.timeSignature ?? 4;
    t.swing = feel === "swing" ? (song.style === "ballad" ? 0.45 : 0.56) : 0;
    t.swingSubdivision = "8n";
    t.loop = true;
    t.loopStart = 0;
    t.loopEnd = `${song.progression.length}m`;

    this._buildParts(song, feel);
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
    Object.values(this.soloInsts).forEach((i) => i.stop?.());
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

    const ev = {
      piano: this._pianoEvents(chords, style, straight, bpb),
      guitar: this._guitarEvents(chords, song, style, straight, bpb),
      bass: this._bassEvents(chords, totalBeats, style, straight, bpb),
      drums: this._drumEvents(song, style, straight, bpb),
      meta: [],
    };

    for (const c of chords) ev.meta.push({ kind: "chord", beat: c.startBeat, chord: c });
    for (let b = 0; b < totalBeats; b++) {
      ev.meta.push({ kind: "beat", beat: b, bar: Math.floor(b / bpb), beatInBar: b % bpb });
    }

    const beatSec = () => 60 / Tone.getTransport().bpm.value;
    const toBBS = (beat) => {
      const bar = Math.floor(beat / bpb);
      const rem = beat - bar * bpb;
      return `${bar}:${Math.floor(rem)}:${Math.round((rem % 1) * 4)}`;
    };
    const mk = (events, cb) => {
      const part = new Tone.Part(cb, events.map((e) => [toBBS(e.beat), e]));
      part.start(0);
      this.parts.push(part);
    };

    mk(ev.piano, (time, e) => {
      if (this.muted.piano) return;
      e.midis.forEach((m, i) =>
        this.piano.start({ note: m, time: time + i * (e.roll ? 0.02 : 0.005), duration: e.dur * beatSec(), velocity: e.vel })
      );
    });

    mk(ev.guitar, (time, e) => {
      if (this.muted.guitar) return;
      e.midis.forEach((m, i) =>
        this.guitar.start({ note: m, time: time + i * 0.008, duration: e.dur * beatSec(), velocity: e.vel })
      );
    });

    mk(ev.bass, (time, e) => {
      if (this.muted.bass) return;
      this.bass.start({ note: e.midi, time, duration: e.dur * beatSec(), velocity: e.vel });
    });

    mk(ev.drums, (time, e) => {
      if (this.muted.drums) return;
      const v = e.vel / 127;
      switch (e.drum) {
        case "ride": this.ride.triggerAttackRelease(320, 0.5, time, v); break;
        case "hat": this.hat.triggerAttackRelease(0.04, time, v); break;
        case "snare": this.snare.triggerAttackRelease(0.12, time, v); break;
        case "kick": this.kick.triggerAttackRelease("G1", 0.1, time, v); break;
        case "rim": this.rim.triggerAttackRelease("E4", 0.05, time, v); break;
      }
    });

    mk(ev.meta, (time, e) => {
      Tone.getDraw().schedule(() => {
        if (e.kind === "chord") this.cb.onChord?.(e.chord);
        else this.cb.onBeat?.(e.bar, e.beatInBar);
      }, time);
    });

    this._songCtx = { chords, totalBeats, style, bpb, toBBS, beatSec };
    this._rebuildSoloPart();
  }

  /** (Re)generate the improvised line for the current soloist's range. */
  _rebuildSoloPart() {
    const ctx = this._songCtx;
    if (!ctx) return;
    this.soloPart?.dispose();
    const def = SOLOISTS[this.soloName];
    const events = this._soloEvents(ctx.chords, ctx.totalBeats, ctx.style, def.lo, def.hi);
    this.soloPart = new Tone.Part((time, e) => {
      if (!this.soloOn) return;
      this.soloInsts[this.soloName]?.start({
        note: e.midi,
        time,
        duration: e.dur * ctx.beatSec(),
        velocity: e.vel,
      });
    }, events.map((e) => [ctx.toBBS(e.beat), e]));
    this.soloPart.start(0);
  }

  /**
   * Phrase-based improv: rest, then a run of swing 8ths walking the chord
   * scale — mostly stepwise, occasional leaps, landing on a chord tone at
   * every chord change, held note at phrase ends. Ballads breathe more.
   */
  _soloEvents(chords, totalBeats, style, lo, hi) {
    const events = [];
    const ballad = style === "ballad";
    const center = (lo + hi) / 2;
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

    let t = choice([0.5, 1, 2]);
    let cur = center;
    let lastChord = null;
    while (t < totalBeats) {
      const len = ballad ? 2 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 7);
      for (let n = 0; n < len && t < totalBeats - 0.5; n++) {
        const c = chordAt(t);
        const pool = poolFor(c);
        let idx;
        if (c !== lastChord) {
          // land on 3rd/5th/7th of the fresh chord, close to where we are
          const tones = new Set(c.info.intervals.filter((iv) => iv > 0).map((iv) => (c.info.rootPc + iv) % 12));
          idx = nearestIdx(pool, cur, (m) => tones.has(m % 12));
          lastChord = c;
        } else {
          const r = Math.random();
          const step = r < 0.62 ? 1 : r < 0.86 ? 2 : 3 + Math.floor(Math.random() * 2);
          let dir = Math.random() < 0.5 ? -1 : 1;
          if (cur < lo + 5) dir = 1;
          if (cur > hi - 5) dir = -1;
          idx = Math.max(0, Math.min(pool.length - 1, nearestIdx(pool, cur) + dir * step));
        }
        cur = pool[idx];
        const last = n === len - 1;
        const dur = last
          ? choice(ballad ? [2, 2.5, 3] : [1, 1.5, 2])
          : ballad
            ? choice([0.5, 1, 1])
            : Math.random() < 0.12
              ? 1
              : 0.5;
        const offbeat = t % 1 !== 0;
        events.push({
          beat: t,
          midi: cur,
          dur: dur * 0.92,
          vel: Math.round(Math.min(120, Math.max(50, rnd(74, 96) + (offbeat ? 6 : 0) + (last ? 4 : 0)))),
        });
        t += dur;
      }
      t += ballad ? choice([1.5, 2, 3, 4]) : choice([0.5, 1, 1.5, 2, 3]);
      t = Math.round(t * 2) / 2;
    }
    return events;
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
    if (style === "ballad") {
      // sparse: one soft pad per bar
      song.progression.forEach((bar, barIdx) => {
        const c = chords.find((x) => x.bar === barIdx);
        events.push({ beat: barIdx * bpb, dur: bpb, midis: guitarVoicing(c.info), vel: 28 });
      });
      return events;
    }
    const bossaA = [0, 1.5, 2.5];
    const bossaB = [0.5, 1.5, 3];
    const funk = [1.5, 3.5];
    const chordAt = (beat) => {
      let cur = chords[0];
      for (const c of chords) if (c.startBeat <= beat) cur = c;
      return cur;
    };
    const totalBars = song.progression.length;
    for (let bar = 0; bar < totalBars; bar++) {
      const offsets = style === "funk" ? funk : straight ? (bar % 2 ? bossaB : bossaA) : [...Array(bpb).keys()]; // Freddie Green quarters
      for (const off of offsets) {
        const beat = bar * bpb + off;
        const c = chordAt(beat);
        const accent = !straight && off % 2 === 1;
        events.push({
          beat,
          dur: straight ? 0.6 : 0.42,
          midis: guitarVoicing(c.info),
          vel: Math.round(rnd(30, 38)) + (accent ? 5 : 0),
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
      // syncopated riff: root / b7 / 5th / root
      for (const c of chords) {
        const pcs = bassPcs(c.info);
        const root = placeNear(pcs.root, 36, BASS_LO, BASS_HI);
        const fifth = placeNear(pcs.fifth, root + 4, BASS_LO, BASS_HI);
        const seventh = placeNear(pcs.seventh, root + 6, BASS_LO, BASS_HI);
        events.push({ beat: c.startBeat, midi: root, dur: 0.9, vel: 100 });
        if (c.beats >= 2) events.push({ beat: c.startBeat + 1.5, midi: seventh, dur: 0.45, vel: 84 });
        if (c.beats >= 4) {
          events.push({ beat: c.startBeat + 2.5, midi: fifth, dur: 0.45, vel: 88 });
          events.push({ beat: c.startBeat + 3.5, midi: root, dur: 0.45, vel: 80 });
        }
      }
      return events;
    }

    if (straight) {
      // bossa: dotted-quarter roots and fifths with 8th-note pickups
      for (const c of chords) {
        const pcs = bassPcs(c.info);
        const root = placeNear(pcs.root, 38, BASS_LO, BASS_HI);
        const fifth = placeNear(pcs.fifth, root, BASS_LO, BASS_HI);
        events.push({ beat: c.startBeat, midi: root, dur: 1.3, vel: 96 });
        if (c.beats >= 2) events.push({ beat: c.startBeat + 1.5, midi: fifth, dur: 0.45, vel: 74 });
        if (c.beats >= 4) {
          events.push({ beat: c.startBeat + 2, midi: fifth, dur: 1.3, vel: 90 });
          events.push({ beat: c.startBeat + 3.5, midi: root, dur: 0.45, vel: 74 });
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

  _drumEvents(song, style, straight, bpb) {
    const events = [];
    const totalBars = song.progression.length;
    const push = (bar, off, drum, vel) => events.push({ beat: bar * bpb + off, drum, vel });

    for (let bar = 0; bar < totalBars; bar++) {
      if (style === "ballad") {
        for (let b = 0; b < bpb; b++) push(bar, b, "ride", b % 2 ? 34 : 26);
        push(bar, 1, "hat", 40);
        if (bpb > 3) push(bar, 3, "hat", 40);
        push(bar, 0, "kick", 22);
        continue;
      }
      if (style === "funk") {
        for (let e = 0; e < bpb * 2; e++) push(bar, e / 2, "hat", e % 2 ? 26 : 42);
        push(bar, 1, "snare", 58);
        if (bpb > 3) push(bar, 3, "snare", 58);
        push(bar, 0, "kick", 60);
        push(bar, 2.5, "kick", 48);
        continue;
      }
      if (straight) {
        // bossa: straight 8th hats, 3-2 rim clave, kick on 1 & 3
        for (let e = 0; e < bpb * 2; e++) push(bar, e / 2, "hat", e % 2 ? 28 : 44);
        const clave = bar % 2 === 0 ? [0, 1.5, 3] : [1, 2.5];
        for (const off of clave) if (off < bpb) push(bar, off, "rim", 52);
        push(bar, 0, "kick", 50);
        if (bpb > 2) push(bar, 2, "kick", 44);
        continue;
      }
      // swing
      if (bpb === 3) {
        for (const [off, vel] of [[0, 52], [1, 40], [1.5, 30], [2, 44]]) push(bar, off, "ride", vel);
        push(bar, 1, "hat", 46);
      } else {
        for (const [off, vel] of [[0, 46], [1, 54], [1.5, 32], [2, 46], [3, 54], [3.5, 32]]) push(bar, off, "ride", vel);
        push(bar, 1, "hat", 50);
        push(bar, 3, "hat", 50);
      }
      for (let b = 0; b < bpb; b++) if (Math.random() > 0.3) push(bar, b, "kick", Math.round(rnd(14, 20)));
      // sparse snare comping
      if (Math.random() < 0.55) push(bar, choice([0.5, 1.5, 2, 2.5, 3.5]), "snare", Math.round(rnd(22, 34)));
      if (bar === totalBars - 1 && bpb === 4) {
        push(bar, 3, "snare", 44);
        push(bar, 3.5, "snare", 52);
      }
    }
    return events;
  }
}
