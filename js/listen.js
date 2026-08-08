// What the room is playing, as one number the band can act on.
//
// The microphone is not here to transcribe anybody. Pitch would be the wrong
// thing to chase even if it were reliable through a phone speaker at three feet
// — a rhythm section does not follow your notes, it follows how hard you are
// working. So this measures two things a mic is actually good at through a bad
// signal: how loud you are over the room, and how often you are attacking. That
// pair is `heat`, 0 to 1, and it is the whole interface.
//
// THE BLEED PROBLEM. On speakers the mic hears the band, and a band that gets
// louder when it hears something loud is a feedback loop with a beat. Three
// things hold it off, in order of how much they buy:
//
//   1. The browser's own echo canceller, which knows exactly what went to the
//      speaker and subtracts it. This is why echoCancellation is on — the usual
//      advice for music capture is to turn it off, and that advice is for
//      recording, not for this.
//   2. A noise floor that tracks the quiet parts of the room and is subtracted
//      before anything is measured, so a band bleeding steadily into the mic
//      becomes the floor rather than the signal.
//   3. Headphones, which end the problem outright. The panel says so.
//
// It is still true that on speakers at volume a busy band will read as some
// heat of its own. The band moving one step livelier than it should is a much
// smaller failure than a note-detector hearing the piano and calling it you.

const FFT = 1024;
const TICK = 40; // ms between frames — 25 a second is plenty for an envelope

/** Silence long enough to be a decision rather than a rest. Phrasing is
 *  counted in bars, not seconds — a breath between phrases on a ballad lasts
 *  longer than a whole bar on a burner, and the comping literature says a
 *  breath gets filled, not seized (research/live-mode.md). So the window is
 *  two bars of the tune actually being played, and the old fixed value stays
 *  as the floor so a fast tempo can never make the band twitchier than it
 *  already was. */
const QUIET_FLOOR_MS = 1500;

/** The quiet window for a bar of the current length, in ms. `barMs` may be
 *  null before a tune exists; the floor answers for it. */
export function quietWindowMs(barMs) {
  return Math.max(QUIET_FLOOR_MS, (barMs || 0) * 2);
}

/** Adaptive whitening: every bin is normalised by its own recent maximum, so a
 *  loud low end cannot drown an attack up top and a quiet instrument is not
 *  measured against a loud one. Stowell & Plumbley report it moving real-time
 *  onset detection by ten points for almost no arithmetic, and it is the one
 *  thing that makes the same thresholds work for a trumpet and for a guitar.
 *  The floor stops a silent bin from being amplified into noise. */
const WHITEN_DECAY = 0.997;
const WHITEN_FLOOR = -70; // dBFS

/** Frames are averaged over this window before anything is published, so one
 *  loud bar does not swing the band and one quiet one does not drop it. */
const RISE = 0.9; // seconds to most of the way up — leaning in should register
const FALL = 4.5; // and much slower down: two bars of rest is phrasing, not stopping

export class Listener {
  /**
   * @param {object} cb
   *   onFrame({level, heat, onsets}) — every frame, for the meters
   *   onHeat(heat)                   — only when the published heat moves
   *   onError(err)                   — permission refused, no device, etc
   *   barMs()                        — current bar length in ms, so the quiet
   *                                    window can count bars; optional
   *   active()                       — measure only while this is true; the
   *                                    level meter runs regardless. optional
   */
  constructor(cb = {}) {
    this.cb = cb;
    this.running = false;
    this.heat = 0;
    this.level = 0;
    this.stream = null;
    this.source = null;
    this._floor = 0.004; // updated from the room
    this._peaks = null;  // per-bin recent maxima, for the whitening
    this._prevSpectrum = null;
    this._lastLoud = 0;
    this.quiet = true;
    this._fluxHistory = [];
    this._onsetTimes = [];
    this._timer = null;
  }

  /**
   * Open the mic into an existing AudioContext — the band's own, so the
   * recording tap can mix both without a second context and a second clock.
   */
  async start(ctx) {
    if (this.running) return;
    // autoGainControl would spend the whole session undoing the dynamics this
    // is trying to measure, and noiseSuppression is tuned for speech and eats
    // cymbals. Echo cancellation earns its place; see the note at the top.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });

    this.ctx = ctx;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FFT;
    this.analyser.smoothingTimeConstant = 0.35;
    this.source.connect(this.analyser);
    // deliberately not connected to the destination: monitoring yourself
    // through the speaker is the feedback loop, not a feature

    this._time = new Float32Array(this.analyser.fftSize);
    this._freq = new Float32Array(this.analyser.frequencyBinCount);
    this._prevSpectrum = new Float32Array(this.analyser.frequencyBinCount);
    this._peaks = new Float32Array(this.analyser.frequencyBinCount).fill(WHITEN_FLOOR);
    this.running = true;
    this._last = performance.now();
    this._timer = setInterval(() => this._frame(), TICK);
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
    this._timer = null;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.heat = 0;
    this.level = 0;
    this.cb.onHeat?.(0);
  }

  _frame() {
    const a = this.analyser;
    a.getFloatTimeDomainData(this._time);
    a.getFloatFrequencyData(this._freq);

    // ---- how loud, over the room -------------------------------------------
    let sum = 0;
    for (const v of this._time) sum += v * v;
    const rms = Math.sqrt(sum / this._time.length);

    // The floor falls to meet a quiet room quickly and rises to meet a noisy
    // one slowly, so a fan or a bleeding speaker becomes the floor within a few
    // seconds while a held note never does.
    this._floor = rms < this._floor ? this._floor * 0.9 + rms * 0.1 : this._floor * 0.999 + rms * 0.001;
    const over = Math.max(0, rms - this._floor * 1.6);
    // dB, because a linear meter of an instrument is all bottom
    const level = Math.min(1, Math.max(0, (20 * Math.log10(over + 1e-6) + 52) / 46));

    // ---- how often you are attacking ---------------------------------------
    // Spectral flux: the sum of the bins that got louder since the last frame.
    // An attack lights every partial at once, which is what separates a new
    // note from a note still ringing — and it does not care what the note was.
    let flux = 0;
    for (let i = 2; i < this._freq.length; i++) {
      // whiten: hold a decaying peak per bin and measure against it
      const peak = Math.max(this._freq[i], this._peaks[i] * WHITEN_DECAY + WHITEN_FLOOR * (1 - WHITEN_DECAY));
      this._peaks[i] = Math.max(peak, WHITEN_FLOOR);
      const norm = this._freq[i] - this._peaks[i]; // 0 at the bin's own recent loudest
      const d = norm - this._prevSpectrum[i];
      if (d > 0) flux += d;
      this._prevSpectrum[i] = norm;
    }
    this._fluxHistory.push(flux);
    if (this._fluxHistory.length > 50) this._fluxHistory.shift(); // ~2s of frames

    // Heat belongs to the band's clock: it starts at zero when the band starts,
    // not carrying whatever the warm-up left in it, and the quiet state stays
    // parked so a stopped transport cannot arm a takeover. The level meter
    // keeps moving — a player checking the mic wants to see it move — and the
    // whitening and flux history above stay warm, so the first active frame is
    // measured against the room rather than against silence.
    const now = performance.now();
    if (this.cb.active && !this.cb.active()) {
      this._last = now;
      this._lastLoud = now;
      this._onsetTimes.length = 0;
      this.quiet = true;
      if (this.heat !== 0) {
        this.heat = 0;
        this._published = 0;
        this.cb.onHeat?.(0);
      }
      this.level = level;
      this.cb.onFrame?.({ level, heat: 0, onset: false, density: 0, quiet: true });
      return;
    }

    // An adaptive threshold rather than a fixed one: what counts as an attack
    // in a quiet room is nothing at all in a loud one. The median of the last
    // two seconds is the room; an onset has to beat it by half again.
    const sorted = [...this._fluxHistory].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const isOnset = level > 0.08 && flux > median * 1.5 + 8 && now - (this._lastOnset ?? 0) > 70;
    if (isOnset) {
      this._lastOnset = now;
      this._onsetTimes.push(now);
    }
    while (this._onsetTimes.length && now - this._onsetTimes[0] > 2000) this._onsetTimes.shift();
    // eight attacks a second is a fast player flat out; that is the top of the scale
    const density = Math.min(1, this._onsetTimes.length / 2 / 8);

    // ---- the one number ----------------------------------------------------
    // Weighted towards loudness because it is the more reliable of the two
    // through a phone mic, but density is what tells a ballad from a burn at
    // the same volume, so it is not a tiebreaker either.
    const raw = Math.min(1, 0.58 * level + 0.42 * density);
    // dt from the clock, not from TICK: this loop shares a thread with the band,
    // which spends 50ms building parts at every hand-over, and an envelope that
    // assumes its frames arrived on time drifts every time one does not.
    const dt = Math.min(0.5, (now - this._last) / 1000);
    this._last = now;
    const tc = raw > this.heat ? RISE : FALL;
    this.heat += (raw - this.heat) * (1 - Math.exp(-dt / tc));
    this.level = level;

    // Playing or not, as a state rather than a level: the band does something
    // deliberate when you stop, and it needs to know you stopped rather than
    // watching a number sag.
    if (level > 0.12) this._lastLoud = now;
    const quiet = now - this._lastLoud > quietWindowMs(this.cb.barMs?.());
    if (quiet !== this.quiet) {
      this.quiet = quiet;
      this.cb.onQuiet?.(quiet);
    }

    this.cb.onFrame?.({ level, heat: this.heat, onset: isOnset, density, quiet });
    if (Math.abs(this.heat - (this._published ?? -1)) > 0.02) {
      this._published = this.heat;
      this.cb.onHeat?.(this.heat);
    }
  }
}
