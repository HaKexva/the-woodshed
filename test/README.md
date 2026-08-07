# The checks

`node test/run.mjs` runs everything. `node test/run.mjs solo-key` runs one.

Each file in `checks/` is a standalone script: it measures something about the
generators and exits non-zero when an invariant breaks. They print what they
measured rather than just passing, because most of them exist to answer "did
this get better or only different" — the numbers are the point.

## How they reach the app

`js/band.js` imports Tone and smplr from a CDN, which Node cannot resolve and
which would make a sound if it could. `loader.mjs` maps those two specifiers to
`stubs/` at resolve time, in-process, so the checks import the real `js/` files.

This used to work by copying `js/` next to the checks and rewriting the imports
in the copy. That was a trap: the suite reported green against code that had
already changed underneath it, which is worse than having no suite at all. To
confirm the trap is gone, break something real — turn the lydian entry in
`theory.js`'s `MODE_BY_STEPS` into `major` — and `solo-key` should fail.

## Writing one

Measure the thing that changed, not the thing next to it. Three checks written
during this work failed on their own assumptions rather than on the code: one
read voice leading off ghosted events instead of the underlying voicings, one
counted held chords as missed anticipations, and one averaged half-note bars in
with the chops. Each looked like a regression and was not.

## Determinism

`loader.mjs` replaces `Math.random` before `band.js` is imported, so the whole
band is reproducible. It is not seeded in the app — only the soloist is — and
without this, checks that measure a pattern choice were averaging over random
takes: `item-10` failed about one run in twelve. A check that fails sometimes
is worse in CI than no check, because it teaches people to re-run until green.

Run against another seed with `WOODSHED_SEED=7 node test/run.mjs`. A check that
only passes on the default seed is a weak check, and it is worth finding that
out deliberately rather than on somebody's pull request. The suite currently
passes on every seed tried.
