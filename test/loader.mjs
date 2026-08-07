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
