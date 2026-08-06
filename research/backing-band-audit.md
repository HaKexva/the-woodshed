# Backing band audit

A read of the four rhythm-section generators — `_pianoEvents`, `_guitarEvents`,
`_bassEvents`/`_bassLine`, `_drumEvents` — asking where a player would hear the
machine, and measuring rather than guessing. Line numbers are from the
`worktree-session-review` branch (band.js at 2,990 lines).

Every number below came from running the generators headless in Node with Tone
and smplr stubbed out; the event builders don't touch `this` except for
`_bassEvents` (calls `_bassLine`) and `_drumEvents` (reads `rideOn` and the
transport bpm). Measurements are on *Autumn Leaves* — 4/4, swing, 32 bars, 120
bpm — unless stated, over 8–30 regenerated choruses.

## The one-sentence version

**The band's rhythm is varied and its pitch is a constant.** Every chord maps to
exactly one piano voicing and two guitar voicings, for the life of the program.
Chorus-to-chorus the comp looks completely different (Jaccard overlap 0.15 for
piano) and every bit of that difference is rhythm — the notes are identical every
time, in every chorus, of every take, of every session.

## Measured

### Voicing variety

| | distinct shapes per chord |
|---|---|
| piano (`pianoVoicing`, theory.js:152) | **1** |
| guitar (`guitarVoicing`, theory.js:172) | **2** (shell, rootless colour) |

Both functions are pure and deterministic: `pick()` walks a fixed interval
preference list and `placeNear()` puts each tone near a fixed centre (62/66 for
piano, 52/57/62 for guitar). 200 calls to `pianoVoicing(Dm7)` return one string.

Consequences, measured across the songbook's 483 distinct chord symbols:

- **84 chords (17%) voice as two notes.** Any chord without a 7th — plain
  triads, `sus2`, `aug` — loses the `seventh` pick and comps as a dyad.
- **12 chords voice a semitone in close position**, all of them `#9` chords:
  `Eb7#9 → [61,66,67]` puts the ♯9 and the 3rd adjacent in the middle of the
  voicing. `Cm9 → [58,62,63]` puts the 9th *below* the ♭3. The `center = t >= 12
  ? 66 : 62` rule doesn't guarantee an extension lands above the guide tones.
- **The top voice is frozen.** Mean distinct-top-notes ÷ chords across all 428
  tunes: **0.19**. *Autumn Leaves* has 5 distinct top notes across 35 chords;
  *Impressions* and *So What* have **2 across 32**. That top line is the melodic
  content of the comp, and it is byte-identical every chorus.

### Voice leading

There is none — each chord is placed independently near a fixed centre. It
*averages* acceptably on diatonic tunes (2.48 semitones of top-voice motion on
*Autumn Leaves*, only 3.4% of changes leaping more than a fourth) because the
fixed centre is itself a weak constraint. On a tune that moves key centres it
falls apart: *26-2* leaps more than a fourth in the top voice on **19.3%** of
changes.

### Piano and guitar collide

They are independent draws in overlapping registers.

- piano spans MIDI 56–70, guitar 43–65 on the same tune
- **7 of the 15 pitches the piano uses are also played by the guitar**
- across one chorus: 19 simultaneous piano+guitar attacks containing 23 doubled
  pitches

Neither instrument knows the other exists. A real piano/guitar front line either
splits the register or one lays out.

### Rhythm — onset histogram, 8 choruses

| | events | entropy | distinct positions | shape |
|---|---|---|---|---|
| piano | 527 | 2.70 bits | 7 | 1:16% · 1&:18% · 2&:17% · 3:5% · 3&:14% · 4:9% · 4&:21% |
| guitar | 1003 | 2.15 bits | 5 | **96.6% on the quarter**, 3.4% on the & of 4 |
| bass | 1051 | 2.16 bits | 8 | **96.7% on the quarter**, 3.3% eighth-note skips |
| drums | 2241 | 2.62 bits | 13 | widest vocabulary in the band |

The piano is the healthy one: 70% of its attacks are upbeats, which is exactly
what the pianist's `swing的comping有點太規律` note asked for and got.

The guitar and bass are the problem. The guitar plays four quarter-note chords a
bar with a fixed 0.42-beat duration (band.js:2516) and a 10% chance of dropping
to 2-and-4 instead (band.js:2512). The bass walks quarters with an 8th-note skip
at 3% / 6% / 16% depending on position (band.js:2751).

### Bass line content

- **92.5% of quarter-to-quarter motion is a step (1–2 semitones); 7.5% is a skip
  of a third or more.** Transcribed walking bass runs roughly 60–70% step. The
  line is scalar almost to the exclusion of arpeggiation — `ladderFor()` walks
  the chord scale one rung at a time and `targetPcFor()` picks root 78% / third
  14% / fifth 8% (band.js:2667), never the 7th, never an octave displacement.
- root on the chord change: 77.7% — defensible, slightly high
- 1.2% of intervals are a repeated note; the de-duplication pass (band.js:2732)
  only fixes repeats inside one chord's path, not across a chord boundary

### Drums

Kick feathering and hi-hat are right (1.41 kicks/bar, 90% of them at velocity
≤20; hat 2.13/bar on 2 and 4). The ride is not.

The pool at band.js:2777, and how often each figure actually plays:

```
w=0.30   1  2  3  4              plain quarters, no skip
w=0.40   1  .  3  4              no beat 2 at all
w=0.15   1  2  3  4  4&          one skip
w=0.15   1  2  2& 3  4  4&       the canonical jazz ride figure
```

**The canonical figure plays in 15% of bars. 40% of bars have no beat 2 at all.
Measured across tempos, only ~30% of bars contain any swung skip note** — and
below 95 bpm the `slow > 0.3` gate at band.js:2914 forces `ridePool[0]`, so a
ballad-tempo swing tune has **0%**. That is backwards: a slow tune is where a
drummer puts *more* detail into the ride, not less.

The comment above the pool says "kept sparse; the ride marks time". The ride does
mark time, but the skip note is the thing that makes it swing — it is the most
recognisable rhythmic signature in the idiom, and it is the exception here.

### Per-chorus variation

Mean Jaccard overlap between consecutive choruses: piano 0.15, bass 0.25, guitar
0.43, drums 0.57. The parts genuinely re-roll. But the variation is unstructured
— every chorus is an independent draw with no memory, so nothing builds, nothing
recurs, and nothing marks where you are in the tune.

The two levers that were meant to shape it don't:

- **`bwave`** (band.js:1022) is meant to be an energy arc across four choruses.
  Measured, it keeps 94.6–100% of comp events and moves velocity by ±3.6. That is
  inaudible.
- **`role`** (band.js:1016) is meant to trade guitar-led and piano-led choruses.
  It implements "laying out" as `filter(() => rand() < 0.55)` — keeping a random
  55% of that instrument's events. A comper that plays a random half of its own
  part sounds like dropout, not like an arrangement.

### Form awareness

The band's entire structural knowledge is `sectionEnd = bar => bar % 8 === 7 ||
bar === totalBars - 1` (band.js:2788), used only by the drummer for fills. Piano,
guitar and bass have none at all: no lift into a bridge, no turnaround treatment,
no marking the top.

`form` in the song schema is a display string (`"32-bar AABC"`), never parsed.

And the comp doesn't cross the top of the form: `_pianoEvents` reads `next =
chords[i + 1]` (band.js:2386), undefined on the last chord, and `_guitarEvents`
guards `bar < totalBars - 1` (band.js:2533). So every chorus boundary is a hard
seam where the bass walks through — `_flatten` wraps `c.next` modulo — and the
comp restarts cold.

### Style coverage

| style | tunes | share |
|---|---|---|
| swing | 353 | 82.5% |
| ballad | 39 | 9.1% |
| latin | 23 | 5.4% |
| funk | 6 | 1.4% |
| bossa | 4 | 0.9% |
| modal | 2 | 0.5% |
| blues | **1** | 0.2% |

The carefully written blues comping (6 piano patterns, 5 guitar patterns, a
backbeat lean) serves **one tune**. There are 19 twelve-bar tunes in the
songbook; 18 of them are tagged `swing`. The modal branch serves two.

Two branches are missing outright:

- **The bass has no latin branch.** `_bassLine` goes ballad → funk → `straight`,
  and latin is straight, so all 23 latin tunes get the *bossa* dotted-quarter
  root line while the drums, piano and guitar are playing 3-2 son clave. The
  defining feature of a latin bass — the anticipated tumbao on the & of 2 and
  beat 4 — is absent.
- **There is no two-feel anywhere.** The bass walks quarters from bar 1 of chorus
  1 to the end. A jazz trio plays in 2 on the head and the first solo chorus and
  opens up to 4 after. This is the largest single style variation missing, and it
  applies to 356 of 428 tunes.

### Odd meters

29 waltzes and one 5/4. The drums have a 3/4 ride (band.js:2910); nothing else
has any odd-meter handling.

- **3/4** — piano falls to `patterns2` (a 3-beat chord isn't `>= 4`), so a waltz
  gets the two-beat pool: onsets at 1, 1&, 2&, 3&. Guitar plays three quarters. No
  jazz-waltz vocabulary.
- **5/4 (Take Five)** — measured. Both `patterns4` and `ridePool` are written as
  absolute offsets that stop at 3.5, so neither the piano nor the ride ever
  strikes the fifth beat; the only thing the piano puts in that half of the bar
  is the anticipation into the next one, at offset 4.5. The bass accent rule
  `(startBeat + off) % bpb === 0 ? 6 : … === 2 ? 2 : 0` accents beats 1 and 3 of
  a tune that is grouped 3+2.

## Ranked changes

Ordered by musical gain per line changed.

### 1. Voice-led, non-deterministic piano voicings — **applied**

The single highest-value change in the band. `pianoVoicing(chord)` is gone,
replaced by two functions in theory.js:

- `pianoVoicings(chord)` builds every three- and four-note combination of the
  chord's colour tones that keeps a guide tone, in every inversion that stays
  inside a tenth — 18.5 shapes per chord on average, against one. Each is an
  *ordered stack*: `rising()` lifts each voice to its nearest instance more than
  a semitone above the one below, which makes the clusters structurally
  impossible rather than merely unlikely. The ninth a bare symbol leaves out is
  supplied only where the chord scale has one, so the comp never plays a note the
  solo-notes strip is telling the player to avoid (locrian on `m7b5`, altered on
  `7b13`).
- `voiceComp(chords, rand)` walks the whole form before any event exists, scoring
  each candidate by voice motion from the chord before, by top-voice motion again
  on its own, by whether that top note was used in the last three chords, and by
  distance from the middle of the register band — then picking weighted-random
  among the best four rather than argmin, because always taking the smoothest
  option is its own kind of frozen.

`_pianoEvents` calls it once and indexes in, which also means the anticipation at
the end of a bar voices the same shape the next bar plays — verified over 292
anticipation/landing pairs and 141 chromatic approaches.

Measured before → after:

| | before | after |
|---|---|---|
| shapes per chord | 1 | 18.5 |
| mean distinct top notes ÷ chords, 428 tunes | 0.190 | **0.345** |
| *So What* top notes over 32 chords | 2 | 7.4 |
| *Autumn Leaves* top notes over 35 chords | 5 | 11.2 |
| *Autumn Leaves* top-voice motion | 2.48 st, 3.4% > a fourth | **1.57 st, 3.5%** |
| *26-2* top-voice motion | 2.77 st, 19.3% > a fourth | **1.68 st, 0.4%** |
| distinct top lines over 6 choruses | 1 | 6 |
| chords voicing a semitone in close position | 12 | **0** |
| chords comping as two notes | 84 | **0** |
| piano pitches doubled by the guitar | 46.7% | 30–35% |
| piano onset histogram | 7 positions, 2.70 bits | unchanged |

So the line moves, it moves smoothly, and it moves somewhere different every
chorus — and the rhythm, which was the part that was already right, is untouched.

### 2. Fix the ride weights, and un-gate slow tempos

Invert the pool so the skip figure is the default (~60–70% of bars) and plain
quarters are the variation; delete the `slow > 0.3` forcing so ballads get the
detail they should. Four numbers.

### 3. Two-feel

Add a per-chorus bass feel — `two | four | pedal | broken` — with the drums
following (hi-hat on 2 and 4, ride quarters, kick out). ~20 lines, changes the
character of 83% of the songbook, and gives the arrangement somewhere to go.

### 4. Split the piano and guitar registers

Push the guitar shells down to roughly MIDI 40–62 and the piano rootless
structures up to 60–76 so they stop doubling. Cheap, and it makes both audible.

### 5. Make the bass skip

Let the ladder walk take two rungs at a time some of the time, add 5th-to-root
drops and an octave displacement at the top of the form, and let `targetPcFor`
reach the 7th. Aim for 25–35% skips.

### 6. Give the band a form model

Add optional `sections: [{ label: "A", bars: 8 }, …]` to the song schema, with a
sensible default derived from 8-bar blocks (12-bar blues → 4/4/4). Use it for
fills at real section ends, a lift at the bridge, and a turnaround gesture in the
last two bars. This is also what the drummer's `sectionEnd` should have been.

### 7. Replace `bwave` and `role` with a per-chorus arrangement plan

One object per chorus: who comps, bass feel, drum intensity, which bars are left
empty. Drop *whole bars* rather than random events, so laying out sounds
deliberate. The existing levers are measurably inert and the mechanism that
replaces them is not much more code.

### 8. Cross the barline at the top of the form

Make `_pianoEvents` and `_guitarEvents` use the wrapped `c.next` that `_flatten`
already provides, so the comp anticipates into the repeat instead of stopping
dead.

### 9. Let the drummer converse with the comp

The snare comping is currently 0–2 random spots a bar with no relationship to
anything. The plumbing to fix it exists — `_drumEvents` already takes an `opts`
object with `phraseEnds`. Pass the piano's onset list and have the snare answer
or reinforce a piano hit some of the time. This is the cue that the band is
listening.

Note that in session mode `phraseEnds` is empty: it is only populated when
`soloOn` (band.js:993), so the drummer never answers a *human* soloist.

### 10. Decouple comping style from tune style

82.5% of tunes are tagged `swing`, so most of the style vocabulary is unreachable.
Rather than re-tagging 428 songs, let the player choose the feel in session mode
— swing / two-feel / bossa / latin / shuffle / even-8ths / ballad. That fixes the
dead-branch problem *and* is a practice feature: playing a standard as a bossa is
a normal thing to want.

### 11. Give the guitar something other than quarters

Freddie Green is right for a lot of it, but add held two-beat chords, more of the
&-of-4 push (currently 15%), and a moving inner voice — change one note of the
three-note shape while the others hold — so four quarters aren't literally four
copies.

### 12. Latin bass

A tumbao branch: anticipate the & of 2, land the root on 4. ~15 lines for 23
tunes that currently have a rhythm section playing two different styles at once.

### 13. Odd meters

A jazz-waltz ride (1, 2&, 3&) and comping pool; write the ride pool as offsets
that scale with `bpb` so 5/4 gets a full bar.

### 14. Seed the band

`role`, `bwave`, every pattern pick and every velocity is bare `Math.random()` —
only the soloist runs inside `withSeed` (band.js:1276). So a take is half
reproducible, and an A/B on a comping change is an A/B on the roll. The
`mulberry32`/`withSeed` machinery is already there.

### 15. Get `_buildParts` off the loop point

It regenerates every part 0.1 bar before the wrap — several hundred events, about
0.15 s of headroom at 160 bpm. Build the next chorus during the *previous* one and
swap at the boundary.
