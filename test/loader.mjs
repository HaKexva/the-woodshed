// Lets the checks import js/band.js directly.
//
// band.js pulls Tone and smplr straight off a CDN, which Node cannot resolve
// and which would make a sound if it could. This maps those two specifiers to
// local stubs at resolve time, in-process, so the checks run against the real
// js/ files rather than against copies of them.
//
// Copies were the previous arrangement and they were a trap: the suite happily
// reported green against code that had already changed underneath it. Nothing
// is copied now, so a stale check is not possible.
import { registerHooks } from "node:module";

// Determinism.
//
// band.js captures Math.random once, at module init, as the source its rand()
// falls back to when no seed is active — and only the soloist ever sets one.
// So every check that measures a pattern choice was averaging over random
// takes, and one of them (item-10, comparing comp density at phrase ends
// against everywhere else) failed about one run in twelve. A check that fails
// sometimes is worse in CI than no check at all: it teaches people to re-run
// until it goes green.
//
// Replacing Math.random here, before band.js is ever imported, makes the whole
// band reproducible without the app having to change. Set WOODSHED_SEED to run
// the suite against a different one — a check that only passes on this seed is
// a weak check, and that is worth finding out on purpose rather than by
// accident on somebody's pull request.
const seed = Number(process.env.WOODSHED_SEED ?? 0x5eed) >>> 0;
let state = seed || 1;
Math.random = () => {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const STUBS = [
  [/[/@]tone@|tonejs/i, new URL("./stubs/tone.js", import.meta.url).href],
  [/smplr/i, new URL("./stubs/smplr.js", import.meta.url).href],
];

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("https://")) {
      for (const [re, url] of STUBS) {
        if (re.test(specifier)) return { url, shortCircuit: true };
      }
      throw new Error(`test loader: no stub for remote import ${specifier}`);
    }
    return next(specifier, context);
  },
});
