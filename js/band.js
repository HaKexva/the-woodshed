// band.js — backing band engine.
// Tone.js drives the transport (tempo, swing, looping); smplr soundfonts
// supply piano / bass / guitar; drums are Tone synths (no samples to host).

import * as Tone from "https://cdn.jsdelivr.net/npm/tone@15.1.22/+esm";
import { Soundfont, SplendidGrandPiano } from "https://cdn.jsdelivr.net/npm/smplr@1.0.0/+esm";
import { parseChord, pianoVoicing, guitarVoicing, bassPcs, placeNear, soloScaleSteps } from "./theory.js";

const BASS_LO = 30; // F#1
const BASS_HI = 52; // E3

// The soloist: smplr's Splendid Grand Piano, practical solo range in MIDI.
const SOLO_LO = 60;
const SOLO_HI = 88;

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
    this.soloInst = null;
    this.soloPart = null;
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
        this.guitar.start({ note: m, time: time + i * (e.roll ? 0.025 : 0.008), duration: e.dur * beatSec(), velocity: e.vel })
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
        case "ride": this.ride.triggerAttackRelease(e.freq ?? 320, e.len ?? 0.5, time, v); break;
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

  /** (Re)generate the improvised line. */
  _rebuildSoloPart() {
    const ctx = this._songCtx;
    if (!ctx) return;
    this.soloPart?.dispose();
    const events = this._soloEvents(ctx.chords, ctx.totalBeats, ctx.style, SOLO_LO, SOLO_HI);
    this.soloPart = new Tone.Part((time, e) => {
      if (!this.soloOn) return;
      const durSec = e.dur * ctx.beatSec();
      this.soloInst?.start({
        note: e.midi,
        time,
        duration: durSec,
        velocity: e.vel,
      });
      Tone.getDraw().schedule(() => this.cb.onSoloNote?.(e.midi % 12, durSec), time);
    }, events.map((e) => [ctx.toBBS(e.beat), e]));
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
  _soloEvents(chords, totalBeats, style, lo, hi) {
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
    // Three dials shape the line: the arc (intensity rises to a peak ~72%
    // through the form), "crowd" (how packed the notes are: 16ths, phrase
    // length, rests, holds) and "heat" (loudness/sharpness: velocity,
    // accents, articulation, register push).
    // The dials are orthogonal: crowd OWNS note count (phrase length, note
    // durations, rests, flavor mix); heat owns the arc scale, velocity and
    // articulation. The arc only shapes contour within what the dials allow.
    const { crowd: c, heat: h } = this.soloFeel;
    const arcAt = (t) => {
      const x = (t % totalBeats) / totalBeats;
      const arc = x < 0.72 ? x / 0.72 : (1 - x) / 0.28;
      const i = (0.18 + 0.72 * arc) * lerp(0.75, 1.2, h) + rnd(-0.12, 0.12);
      return Math.max(0.05, Math.min(1, ballad ? i * 0.6 : i));
    };
    const legato = lerp(0.97, 0.8, h); // hotter = sharper articulation
    // phrase flavors keep the line from sounding same-y; crowding squeezes
    // long-tone phrases out of the mix
    const pickFlavor = (i) => {
      const wRun = 0.25 + 0.45 * i + 0.6 * c;
      const wLong = Math.max(0.06, (0.55 - 0.4 * i) * (1 - 0.8 * c));
      const wRiff = 0.3;
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

    while (t < totalBeats - 0.5) {
      const intensity = arcAt(t);
      const registerTarget = lo + (hi - lo) * Math.min(0.85, lerp(0.35, 0.72, intensity) + h * 0.08);
      const useMotif = motif && Math.random() < 0.35;
      const flavor = useMotif ? "motif" : ballad && Math.random() < 0.5 ? "longtones" : pickFlavor(intensity);
      let velBase = lerp(52, 84, intensity) + lerp(-4, 24, h);
      let blueBoost = 1;

      let durs;
      let plannedSteps = null;
      if (useMotif) {
        durs = motif.durs;
        plannedSteps = motif.steps;
      } else if (flavor === "longtones") {
        // few notes, held — breathes even at high intensity
        const len = 2 + Math.floor(Math.random() * 2);
        durs = Array.from({ length: len }, () => choice(c > 0.6 ? [1, 1.5, 2] : [1.5, 2, 2.5]));
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
        const len = Math.min(16, Math.max(3, Math.round(lerp(3, 6, intensity) * lerp(0.6, 2.0, c) + rnd(-1, 1))));
        const p16 = Math.min(0.7, c * 0.5 + Math.max(0, intensity - 0.5) * 0.3);
        durs = [];
        for (let n = 0; n < len; n++) {
          if (n === len - 1) durs.push(choice(ballad ? [2, 2.5, 3] : c > 0.6 ? [0.5, 1] : [1, 1.5, 2]));
          else if (!ballad && Math.random() < p16) durs.push(0.25);
          else durs.push(Math.random() < 0.3 * (1 - c) ? 1 : 0.5);
        }
      }

      const takenSteps = [];
      const phraseStart = t;
      for (let n = 0; n < durs.length && t < totalBeats - 0.5; n++) {
        const c = chordAt(t);
        const pool = poolFor(c);
        const newChord = c !== lastChord;
        if (newChord || n === 0) {
          // land on a chord tone, drawn toward the arc's register
          const tones = new Set(c.info.intervals.filter((iv) => iv > 0).map((iv) => (c.info.rootPc + iv) % 12));
          const idx = nearestIdx(pool, n === 0 ? (cur + registerTarget) / 2 : cur, (m) => tones.has(m % 12));
          const target = pool[idx];
          lastChord = c;
          // bebop enclosure: scale step above, semitone below, then the target
          if (n === 0 && !useMotif && t - 1 >= lastEnd && Math.random() < lerp(0.15, 0.4, intensity)) {
            const above = pool[Math.min(pool.length - 1, idx + 1)];
            events.push({ beat: t - 1, midi: above, dur: 0.42, vel: Math.round(velBase - 14) });
            events.push({ beat: t - 0.5, midi: target - 1, dur: 0.42, vel: Math.round(velBase - 10) });
          }
          cur = target;
          takenSteps.push(0);
        } else if (plannedSteps) {
          // motif echo: same contour, re-rooted on this chord's scale
          const idx = Math.max(0, Math.min(pool.length - 1, nearestIdx(pool, cur) + plannedSteps[n]));
          cur = pool[idx];
        } else if (Math.random() < 0.12) {
          takenSteps.push(0); // sit on the note
        } else if (Math.random() < lerp(0.1, 0.22, intensity) * blueBoost) {
          const blue = blueNote(c, cur);
          if (blue !== null) cur = blue;
          takenSteps.push(0);
        } else {
          const r = Math.random();
          const mag = r < lerp(0.72, 0.52, intensity) ? 1 : r < 0.86 ? 2 : 3 + Math.floor(Math.random() * 2);
          let dir = Math.random() < (cur > registerTarget ? 0.62 : 0.38) ? -1 : 1; // drift toward the arc
          if (cur < lo + 4) dir = 1;
          if (cur > hi - 4) dir = -1;
          const idx = Math.max(0, Math.min(pool.length - 1, nearestIdx(pool, cur) + dir * mag));
          takenSteps.push(idx - nearestIdx(pool, cur));
          cur = pool[idx];
        }
        const last = n === durs.length - 1;
        const dur = durs[n];
        const offbeat = t % 1 !== 0;
        const vel = Math.round(Math.min(122, Math.max(40, velBase + rnd(-8, 10) + (offbeat ? lerp(2, 10, h) : 0) + (last ? 4 : 0))));
        // grace-note scoop into phrase starts and held notes
        if ((t === phraseStart || last) && t - 0.25 >= lastEnd && Math.random() < 0.18) {
          events.push({ beat: t - 0.25, midi: cur - 1, dur: 0.22, vel: Math.max(30, vel - 26) });
        }
        events.push({ beat: t, midi: cur, dur: dur * legato, vel });
        t += dur;
        lastEnd = t;
      }

      if (!useMotif && !ballad && takenSteps.length >= 3 && Math.random() < 0.5) {
        motif = { durs, steps: takenSteps };
      } else if (Math.random() < 0.25) {
        motif = null; // move on to new material
      }

      // crowd owns the space between phrases; the arc only nudges it
      t += Math.max(0.5, lerp(3.2, 0.5, c) + lerp(0.5, -0.2, intensity) + choice([-0.5, 0, 0.5]) + (ballad ? 1 : 0));
      t = Math.round(t * 4) / 4;
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
    const funkPool = [[1.5, 3.5], [0.5, 1.5, 3.5], [1.5, 2.5]];

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
          vel: Math.round(rnd(30, 38)) + (accent ? 6 : 0),
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
    const push = (bar, off, drum, vel, extra) => events.push({ beat: bar * bpb + off, drum, vel, ...extra });

    // per-bar ride pattern pool (weights sum to 1) — the pulse breathes
    const ridePool = [
      { w: 0.55, p: [[0, 46], [1, 54], [1.5, 32], [2, 46], [3, 54], [3.5, 32]] }, // standard ding-ding-a
      { w: 0.2, p: [[0, 46], [1, 54], [2, 46], [3, 54], [3.5, 32]] },             // drop one skip note
      { w: 0.15, p: [[0, 46], [1, 54], [1.5, 32], [2, 46], [2.5, 28], [3, 54], [3.5, 32]] }, // busier
      { w: 0.1, p: [[0, 46], [1.5, 34], [2, 48], [3, 54]] },                      // broken up
    ];
    const pickRide = () => {
      let r = Math.random();
      for (const { w, p } of ridePool) { if ((r -= w) <= 0) return p; }
      return ridePool[0].p;
    };
    const sectionEnd = (bar) => bar % 8 === 7 || bar === totalBars - 1;

    for (let bar = 0; bar < totalBars; bar++) {
      if (style === "ballad") {
        for (let b = 0; b < bpb; b++) push(bar, b, "ride", b % 2 ? 34 : 26);
        push(bar, 1, "hat", 40);
        if (bpb > 3) push(bar, 3, "hat", 40);
        push(bar, 0, "kick", 22);
        if (bar % 8 === 7 && Math.random() < 0.6) push(bar, bpb - 0.5, "snare", 24); // brush pickup
        continue;
      }
      if (style === "funk") {
        for (let e = 0; e < bpb * 2; e++) push(bar, e / 2, "hat", e % 2 ? 26 : 42);
        push(bar, 1, "snare", 58);
        if (bpb > 3) push(bar, 3, "snare", 58);
        for (const off of choice([[0, 2.5], [0, 1.75, 2.5], [0, 2.5, 3.75]])) push(bar, off, "kick", off === 0 ? 60 : 46);
        if (sectionEnd(bar)) for (const off of [3.25, 3.5, 3.75]) push(bar, off, "snare", 34 + Math.round(off * 4));
        continue;
      }
      if (straight) {
        // bossa: straight 8th hats, 3-2 rim clave, kick on 1 & 3
        const lift = bar % 4 === 3 ? 6 : 0; // every 4th bar leans a little
        for (let e = 0; e < bpb * 2; e++) push(bar, e / 2, "hat", (e % 2 ? 28 : 44) + lift);
        const clave = bar % 2 === 0 ? [0, 1.5, 3] : [1, 2.5];
        for (const off of clave) if (off < bpb) push(bar, off, "rim", 52);
        push(bar, 0, "kick", 50);
        if (bpb > 2) push(bar, 2, "kick", 44);
        if (sectionEnd(bar) && Math.random() < 0.5) push(bar, 3.5, "rim", 46);
        continue;
      }
      // swing
      const crash = bar > 0 && bar % 8 === 0; // top of a section
      if (bpb === 3) {
        for (const [off, vel] of [[0, 52], [1, 40], [1.5, 30], [2, 44]]) push(bar, off, "ride", vel);
        push(bar, 1, "hat", 46);
      } else {
        const pattern = pickRide();
        for (const [off, vel] of pattern) {
          if (crash && off === 0) push(bar, 0, "ride", 68, { len: 1.8, freq: 260 });
          else push(bar, off, "ride", vel);
        }
        push(bar, 1, "hat", 50);
        push(bar, 3, "hat", 50);
      }
      for (let b = 0; b < bpb; b++) if (Math.random() > 0.3) push(bar, b, "kick", Math.round(rnd(14, 20)));
      if (Math.random() < 0.15) push(bar, bpb - 0.5, "kick", 30); // pickup into next bar
      // snare comping: ghosts and the odd accent
      const hits = Math.random() < 0.55 ? 1 : Math.random() < 0.25 ? 2 : 0;
      const spots = [0.5, 1.5, 2, 2.5, 3.5];
      for (let h = 0; h < hits; h++) {
        const off = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
        push(bar, off, "snare", Math.round(Math.random() < 0.3 ? rnd(34, 42) : rnd(18, 28)));
      }
      if (sectionEnd(bar) && bpb === 4) {
        const fill = choice([
          [[2.5, 34], [3, 40], [3.5, 50]],
          [[3, 38], [3.25, 42], [3.5, 46], [3.75, 52]],
          [[3, 44], [3.5, 52]],
        ]);
        for (const [off, vel] of fill) push(bar, off, "snare", vel);
      }
    }
    // the drum synths are monophonic — two hits of the same drum on the same
    // tick throw in Tone; keep the louder one
    const seen = new Map();
    for (const e of events) {
      const k = `${e.drum}:${e.beat}`;
      if (!seen.has(k) || seen.get(k).vel < e.vel) seen.set(k, e);
    }
    return [...seen.values()];
  }
}
