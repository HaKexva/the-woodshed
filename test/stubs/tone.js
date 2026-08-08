// Minimal Tone.js stand-in so band.js can be imported in Node.
//
// Parts keep what they were scheduled with, so a check can read the positions
// the band actually wrote rather than re-deriving them.
let bpm = 160;
export const setBpm = (v) => (bpm = v);
const bpmParam = { get value() { return bpm; }, set value(v) { bpm = v; } };
const transport = {
  get bpm() { return bpmParam; },
  PPQ: 192,
  // where the transport is, in ticks. Nothing here advances it; a check that
  // needs time to pass sets it, which is the only way to test a band decision
  // that is scheduled rather than immediate.
  ticks: 0,
  stop() {}, cancel() {}, start() {}, pause() {},
  position: 0, timeSignature: 4, swing: 0, swingSubdivision: "8n",
  loop: false, loopStart: 0, loopEnd: 0,
  scheduleRepeat() {},
};
export const getTransport = () => transport;
export const now = () => 0;
export const getDraw = () => ({ schedule() {} });
export const setContext = () => {};
export const start = async () => {};
export const connect = () => {};

export const parts = [];
export const clearParts = () => (parts.length = 0);
export class Part {
  constructor(cb, events) {
    this.cb = cb;
    this.events = events ?? [];
    parts.push(this);
  }
  start() {}
  dispose() {}
}
export class Reverb { constructor() { this.ready = Promise.resolve(); } }
export class PolySynth { constructor() {} connect() {} }
export class Synth {}
export class MembraneSynth { constructor() { this.volume = {}; } connect() {} }
export class MetalSynth { constructor() { this.volume = {}; } connect() {} }
export class NoiseSynth { constructor() { this.volume = {}; } connect() {} }
export class Filter { constructor() {} connect() {} }
export const Frequency = () => ({ toFrequency: () => 440 });
