// Minimal smplr stand-in. Nothing here makes a sound; the checks read the
// events the generators produce, never the audio.
class Silent {
  constructor() { this.load = Promise.resolve(); }
  start() {}
  stop() {}
}
export class Soundfont extends Silent {}
export class SplendidGrandPiano extends Silent {}
export class Sampler extends Silent {}
export class Mallet extends Silent {}
export class Versilian extends Silent {}
