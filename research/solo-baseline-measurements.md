# Baseline measurements of the generated line

Numbers, not impressions. Produced by running the generator headless — stubbing
out Tone.js and smplr so `_soloEvents()` can be called from Node — over
**8 styles × 4 tunes × 4 choruses**, and analysing the result with
`js/solo-metrics.js`.

Tunes: Autumn Leaves, Take the A Train, So What, Blue Bossa. Dials at centre
(crowd 0.5, heat 0.5), mono voicing. Measured at commit `3cfde94`.

Reproduce by copying `js/band.js` with its two CDN imports stubbed, alongside
`theory.js`, `songs.js` and `solo-metrics.js`, then calling `_flatten()` and
`_soloEvents()` directly. The generator has no DOM or audio dependency.

## Phrasing and shape

| Measure | Ours | Reference | Verdict |
|---|---|---|---|
| notes / bar | 3.17 | 4–9 | **low** |
| rest ratio | 50% | 12–35% | **high** |
| phrase length | 0.89 bars | 1.5–4.5 | **low** |
| motif recurrence | 2.2% | ≥10% | **very low** |
| phrases ending on a strong beat | 12% | most should | **very low** |
| phrases starting off the beat | 83% | high is idiomatic | ok |
| stepwise motion | 73% | 55–85% | ok |
| range | 19 semitones | 12–26 | ok |
| chord tone on downbeat | 73% | ≥55% | ok |

Read together: the soloist plays a one-bar fragment, rests most of a bar, plays
another unrelated fragment, and almost never resolves anywhere. Material
essentially never comes back. That is the "generated" quality — not wrong notes,
but no sentences.

The rest figure needed care. A first pass counted every inter-note gap as
silence and reported 55%; but the gap distribution is cleanly bimodal — **77% of
gaps are under a quarter beat** (staccato articulation, not rest), then a valley,
then real rests at a beat or more. Counting only gaps of half a beat or more
still gives 50%. The phrase-splitting threshold of one beat sits squarely in that
valley, so the phrase statistics are trustworthy.

## Harmonic role mix — the surprise

| style | chord tone | tension | chromatic |
|---|---|---|---|
| miles | 69% | 23% | 7% |
| parker | 66% | 27% | 7% |
| coltrane | 66% | 30% | 5% |
| monk | 65% | 26% | 9% |
| chet | 68% | 27% | 5% |
| dexter | 65% | 28% | 6% |
| wes | 64% | 29% | 7% |
| silver | 65% | 28% | 6% |
| **mean** | **66%** | **27%** | **7%** |
| *human corpora* | *50–56%* | *~34%* | *~10%* |

Two findings.

**The eight styles are harmonically identical.** Miles and Coltrane differ by
three percentage points; the whole spread is 64–69%. Whatever distinguishes the
styles, it is not note choice — only density and rhythm. Style parameter vectors
carry no harmonic-colour dial at all.

**We are more consonant than real players.** Human corpora sit at 50–56% chord
tones; we sit at 66%. And per the literature, over-consonance is itself a machine
tell rather than a safety margin — see
[evaluation-and-metrics.md](evaluation-and-metrics.md). 7% chromatic is thin for
bebop, which traces directly to the audit's finding that enclosures and approach
notes only fire at phrase *starts*, never at the mid-phrase chord changes where
the language actually lives.

This corrects an earlier read of the data. Chord-tone-on-downbeat at 73% looked
like evidence that harmony was healthy; the fuller picture is that the line is
harmonically *safe* — landing correctly, but rarely leaving.

## What this implies

Fixing phrasing is worth more than fixing pitch selection, and the three
structural numbers — phrase length, motif recurrence, strong-beat endings — are
where the whole gap lives. They are also the three the audit traces to specific
bugs rather than to missing design.

The role mix suggests a second, cheaper lever: loosen the avoid-note hygiene and
let approach notes fire mid-phrase. That should move chord tones down toward the
mid-50s and chromatics up, without touching the architecture.
