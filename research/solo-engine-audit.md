# Solo engine audit

A read of `_soloEvents()` and its neighbours in `js/band.js`, asking two
questions: what is actually implemented, and where would a jazz musician hear
the seams. Line numbers are from commit `3cfde94`.

## What is implemented

Every device the project claims exists. Verified in code:

| Device | Where | How it works |
|---|---|---|
| 8 player styles | `SOLO_STYLES` (`band.js:35`), UI in `main.js:284` | Each style is a flat parameter vector — rest/phrase/hold/enclosure/blue/triplet/16th multipliers, register bounds, behind-the-beat lag in ms, articulation, and optional vocabulary licks (`cells`). Missing fields fall back to engine defaults. `wes` is the thinnest: essentially the generic engine with octaves added. |
| Energy wave over 4 choruses | `band.js:1096`, counter at `730`/`738` | `WAVE = [0.85, 1.05, 1.2, 0.65]` indexed by chorus. Above 1.1 unlocks the burn devices; below 0.7 thins voicing and lengthens rests. |
| Burn devices | `band.js:1146` | Peak chorus only, max two per chorus: hemiola (dotted-quarter attacks over three pitches), verbatim riff (a 4-note cell three times against moving harmony), horizontal line (one scale ridden through the changes). Each is followed by a forced breath past the next barline. |
| Earned silence | `band.js:1464` | Tracks how much has been "spent" (note count × peak velocity); past a threshold the line takes a full bar off and re-enters on the & of 4. |
| Avoid-note hygiene | `band.js:1329` | Long notes and phrase-final notes snap to a chord tone, 9th, or 13th on dominants. |
| Bebop metric grammar | `band.js:1320` | On-beat notes in running phrases are pulled to the nearest chord tone within 4 semitones. |
| Guide-tone thread | `band.js:1048`, used at `1276` | A pre-pass picks one 3rd-or-7th per chord across the whole form, each nearest the last. Chord-change landings target it ~55% of the time. |
| Call and response | `band.js:1438` | 35% of the time, repeats a phrase's rhythm and contour with the last two steps forced downward. |
| Sequences | `band.js:1445` | 30% after a short run: replays rhythm and contour starting 2 semitones lower, once or twice. |
| Tritone subs | `band.js:1016`, `1201` | Per-phrase coin flip at high intensity; while armed, dominants draw from the scale a tritone up. |
| Crowd / heat dials | `band.js:175`, read at `1074` | Crowd owns note packing; heat owns the dynamic arc, velocity, offbeat accent, legato, register push, and playback lag. |
| Mono / multi voicing | `band.js:1400` | Doubles held notes, phrase ends and riff stabs — never fast runs. Interval choice is per style. |

Also present and not usually listed: enclosures, pickup entries, grace crushes,
chromatic passing tones on dominants, mordents, ghost notes, style vocabulary
cells, cross-bar anticipation, repeated-note "sit", blue notes, phrase-end
resolution, an 8-bar register reset, comp ducking under the soloist, and the
drummer answering phrase ends.

The device list is not the problem.

## Where it sounds mechanical

### Swing distorts triplets and 16ths

`play()` sets Tone's transport swing with `swingSubdivision = "8n"`. Tone applies
swing at the **tick** level — every event not on a quarter-note boundary is
displaced, regardless of how it was scheduled. The comment in `_makeSoloPart`
says tick-based times make triplets "land exactly"; that is true about rounding
and false about the result.

At swing 0.55 a triplet lands at 0, 0.492, 0.825 — long, medium, short instead of
three equal notes. Sixteenths land at 0, 0.380, 0.683, 0.880: a decelerating
smear that is neither even nor double-time swing.

This hits precisely the styles built on them. `coltrane` has the highest 16th and
triplet weights in the table, `parker` the next; the "sheets of sound" idea is
structurally unrenderable as currently scheduled.

### No melodic shape above the note-to-note level

Pitch selection is a mean-reverting random walk with a weak spring toward a
moving register target. That is the entire large-scale contour mechanism — over
an 18-note phrase the line simply wanders.

There *is* a velocity arc: each phrase crescendos to a peak at roughly 65% of its
length. But the dynamic peak and the melodic peak are uncorrelated — the loudest
note lands at a fixed index no matter where the pitch happens to be, which is the
opposite of how a horn player phrases. Nothing reserves the top of the range for
the climax either, so the highest note of a solo is wherever the walk overshot.

### Motif development is present but broken three ways

1. **The stored contour is not the contour that sounded.** Intervals are recorded
   before three later passes (grammar, avoid-note hygiene, phrase-end resolution)
   move the pitch, and several branches record a literal zero even when the line
   moved several semitones. So an "echo" reproduces the rhythm and a fictional
   melody.
2. **Motifs reset at every chord change.** The chord-change branch is tested
   before the motif branch, so on a tune with two chords per bar a motif spanning
   more than a couple of beats is abandoned mid-statement.
3. **Nothing survives a chorus.** Motif, answer and sequence are locals inside
   `_soloEvents`, which is called fresh each chorus. Chorus 3 cannot quote
   chorus 1.

There are also no transformations — restatements are verbatim, with no
transposition, inversion, retrograde, augmentation or displacement.

### Phrases are not bound to the bar

Phrase length is a **note count**, not a duration, and durations in a phrase are
mixed. The same count can span 3 beats or 12. Rests between phrases are floats
quantized only to 16ths, so entrances land on beat 2.75 of bar 5 as readily as
anywhere musical. Only two code paths ever snap to a barline.

Form awareness is similarly thin: sections are a hard divide-by-8 (so a 12-bar
blues gets a boundary at bar 8), nothing crosses the top of the form — every
chorus boundary is a hard seam — and the layout chorus doesn't lay out at the top.

### No cadence awareness, and chord tones are not targeted *on* the change

Nothing in the generator compares adjacent chords. `c.next` exists and the bass
line uses it; the soloist's only lookahead is "is there a chord soon". There is
no ii-V handling, no 7→3 resolution rule, no bebop run into the tonic.

Chord-tone landings fire when the loop *notices* the chord changed — at whatever
beat the previous note's duration left it, as often beat 1.5 or 2.25 as beat 1.
Nothing plans durations so a chord tone falls on the change.

Enclosures and pickups, the devices that would set up a change, are gated to
phrase starts only. Mid-phrase chord changes — the large majority — get a bare
snap to the guide tone with no approach at all.

The guide-tone thread has two further problems. It picks the nearest of the 3rd
and 7th, and "nearest" rates a held common tone above the descending half step
that makes a guide-tone line sound like one. And because it is deterministic and
absolute, the same chord pulls the melody to the same pitch every time it comes
round, in every chorus — which reads as mechanical and drowns out the register
arc.

### Rhythm is shallower than it looks

Offbeat accents, ghost notes, direction-change accents and behind-the-beat lag
all exist. But ghosting is a flat random roll rather than targeted at weak
positions; articulation clipping is indexed by note number rather than metric
position, so with mixed durations it lands arbitrarily; there is no long-short
8th-note pairing; and anticipations only ever happen between phrases, never as a
mid-line push into a chord change.

### No memory, so no structure

Every decision is an independent coin flip. Nothing tracks how often an idea has
been used, how long since it was last heard, or whether three long-tone phrases
just went by. There is no AAB or AA'B grouping and no budget on device use. The
result is statistically varied and structurally undifferentiated.

### Bebop devices are switched off for the phrases that need them most

Grammar, ghosting, articulation and phrase-end resolution are all gated on the
phrase being a plain "run". When a style cell, motif, answer or sequence is
playing, they are skipped. For `coltrane`, `silver` and `parker` that is roughly
40% of phrases playing with no bebop grammar, no ghosting and no articulation —
in the three styles most defined by exactly those things.

## Technical debt

- **Full band regeneration on the timing-critical path.** A repeat callback fires
  0.1 bar before the loop wraps and rebuilds every part synchronously — several
  hundred events across five generators. On a slow device that is a latency spike
  landing exactly on the loop point.
- **Caches never warm.** Chord objects are rebuilt every chorus, and the pools,
  substitute pools and guide-tone thread are keyed by chord object identity — so
  they are rebuilt from scratch every chorus and every dial change.
- **Rebuilding only the solo desyncs the comp.** The ducking map and phrase-end
  list are computed from the original solo events, so after any style or dial
  change the rhythm section spends the rest of the chorus dodging a line that no
  longer exists.
- **`_soloEvents` is one ~490-line function** with a dozen mutable locals threaded
  through a single interleaved pass and no intermediate representation. Pitch,
  rhythm, dynamics, articulation, ornaments and voicing are all decided in the
  same loop iteration, so every new device has to be spliced mid-loop and
  interacts with everything else. The broken motif recording is a direct
  consequence: there is no note object to record until it is too late.
- **Three parameter namespaces, one composable.** Style and song-feel merge for
  about a dozen parameters; roughly fifteen more are read straight off the style
  and can never be influenced by the song. A bossa can slow the phrasing but
  cannot affect motif use or thread adherence.
- **No determinism.** Everything is bare `Math.random()`. A good take cannot be
  reproduced, saved or compared — which makes iterating on musicality nearly
  untestable, since you cannot tell an improvement from a lucky roll.
- Dead ends: a solo-events cache that is written and never read; a `newTake()`
  method that is implemented and never wired to any control.

## Cheapest changes with the largest effect

Roughly ordered by musical gain per line changed.

1. **Stop swing from mangling subdivisions** — either bake swing into the event
   beats and turn Tone's transport swing off, or pre-subtract Tone's displacement
   for events off the 8th grid. Fixes Coltrane and Parker outright.
2. **Record the interval that actually sounded**, after the grammar and hygiene
   passes rather than before, in every branch. Makes echoes actually echo.
3. **Let motifs survive chord changes** — test the motif branch before the
   chord-change branch for notes after the first.
4. **Correlate the melodic peak with the dynamic peak** — bias the walk upward
   before the phrase's peak index and downward after. Turns a random walk into an
   arc for four lines.
5. **Snap phrase entries to musical positions** (bar start, & of 4, beat 3) and
   make phrase length a beat budget rather than a note count. Probably the single
   biggest change in whether the line sounds phrased.
6. **Approach the chord change, not just the phrase start** — ungate enclosures
   and pickups, and adjust the preceding duration so the target lands on the
   change.
7. **Ungate the bebop devices** — key them off note duration rather than phrase
   type, so cells and motifs get grammar, ghosting and articulation too.
8. **Add motif transformations** — transposition, displacement, inversion,
   augmentation — instead of verbatim restatement.
9. **Persist motifs across choruses** so a later chorus can quote an earlier one.
10. **Detect ii-V-I** in a pre-pass (`c.next` already exists): force the 7th on
    the V, resolve down a half step to the 3rd of the I, and hold tritone subs
    back to the second half of the dominant.
11. **Fix the nearest-note fallback**, which currently returns mid-register on a
    failed lookup and produces surprise octave leaps.
12. **Wire `newTake()`**, and have it rebuild the comp too so the ducking stays in
    sync.
13. **Seed the RNG.** Not audible by itself, but it is the prerequisite for
    evaluating every change above.
