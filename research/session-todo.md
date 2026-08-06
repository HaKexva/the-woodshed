# Session review — the work list

Everything the two session-mode reviews turned up, ranked by musical value ÷
effort. `[B]` is the backing band ([backing-band-audit.md](backing-band-audit.md)),
`[P]` is session mode as a practice room
([session-as-practice-tool.md](session-as-practice-tool.md)). Each entry says what
the evidence for it was, because several look like taste and are not.

Effort is XS (a few lines) · S (an afternoon) · M (a day or two) · L (its own
project).

| # | | Item | Effort | Status |
|---|---|---|---|---|
| 1 | `[P]` | Move the **tempo ramp** out of `#inspire-panel` (index.html:114) into session mode. It is implemented, correct, and invisible to the person who came to practise. The case for it is not that it is another way to set the tempo — it is the only one you can operate with your hands full: set +5, play eight choruses, finish 40 bpm up without ever having stopped. Backed by Allingham & Wöllner (2022), where gradual increase is the most common way musicians organise slow practice | XS | |
| 1b | `[P]` | ~~Surface **chord breaks**~~ — **dropped.** One vendor precedent (Band-in-a-Box), no study, and as a density option it does not earn a slot. The mechanism survives as item 7: `setBreakBars(4)` is trading fours, which is a named drill rather than a setting | — | **dropped** |
| 2 | `[B]` | **Voice-led, non-deterministic piano voicings.** Candidate set per chord, scored by voice motion from the previous chord and by top-note recency, picked weighted-random among the best few. Fixed the frozen top line, the 85 two-note voicings and the 12 ♯9 semitone clusters in one change — 0.186 → 0.343 distinct top notes per chord, top-voice motion *down* from 2.48 to 1.60 semitones, clusters and dyads to zero. See the applied section of [backing-band-audit.md](backing-band-audit.md#1-voice-led-non-deterministic-piano-voicings--applied) | M | **done** |
| 3 | `[B]` | **Invert the ride weights** — the canonical figure played in 15% of bars, a figure with no beat 2 in 40%, and a `slow > 0.3` gate zeroed the skip note below 95 bpm. Reweighted, and the one skip figure split into three (skip on 2, on 4, on both); gate deleted. Bars with a swung skip note: 30% → 70% above 95 bpm, **0% → 66%** below it | XS | **done** |
| 4 | `[P]` | **Display transposition** (C / B♭ / E♭ / F) on the chord card, next-chord readout, scale strip, system view, lead sheet and Inspire score. Nothing in the codebase transposed anything, which for a horn player is close to disqualifying. The control sits under the song title rather than in the transport: it changes what is written, never what sounds | S | **done** |
| 5 | `[P]` | **Section loop** with a bar-range picker and a pre-roll, snapping to barlines. `loopStart`/`loopEnd` already do the work. Most-used practice strategy in the literature | S | |
| 6 | `[P]` | **Chorus counter and stop-after-N**, both off `_chorus` (band.js:914), which is tracked and never surfaced | XS | |
| 7 | `[P]` | **Name and surface trading fours.** `setBreakBars(4)` already *is* that cycle. Needs a label and a cue for whose bars are whose. Zero music modelling | XS | |
| 8 | `[B]` | **Two-feel** — per-chorus bass feel, drums following. The bass walked quarters from bar 1 of chorus 1 to the end. `two` and `four` are in (`pedal` and `broken` are not); the head chorus and the quiet chorus of the wave take two. 4.14 → 2.03 notes/bar with the root still on 78% of chord changes, drums sitting back to match | S | **done** |
| 9 | `[B]` | **Split the piano and guitar registers** — guitar shells ≈ MIDI 40–62, piano structures 60–76. Measured: 7 of the 15 pitches the piano uses are also played by the guitar | XS | |
| 10 | `[P]` | **Let the band lay out for a human.** `duck()` (band.js:1002) and the drummer's phrase-end answers (band.js:993) are gated on `soloOn`, so the one part of the engine that models a band listening to a soloist is off whenever there is a real one | S | |
| 11 | `[B]` | **Make the bass skip.** 92.5% of quarter-to-quarter motion is a step against a 60–70% norm. Two ladder rungs at a time sometimes, 5th→root drops, octave displacement at the top of the form, and let `targetPcFor` (band.js:2667) reach the 7th | S | |
| 12 | `[B]` | **Replace `bwave` and `role` with a per-chorus arrangement plan** — who comps, bass feel, drum intensity, which *whole bars* are empty. Measured, `bwave` keeps 94.6–100% of events and moves velocity ±3.6; `role` implements laying out as keeping a random 55% of events, which sounds like dropout | M | |
| 13 | `[B]` | **Form model** — optional `sections: [{ label, bars }]` in the song schema, defaulting to 8-bar blocks (12-bar blues → 4/4/4). Drives fills at real section ends, a bridge lift and a turnaround. The band's entire structural knowledge today is `bar % 8 === 7` | M | |
| 14 | `[B]` | **Cross the barline at the top of the form** — piano and guitar stop at the last chord (band.js:2386, 2533) while the bass walks through on the wrapped `c.next` that `_flatten` already provides | XS | |
| 15 | `[B]` | **Let the drummer converse with the comp.** Snare comping is 0–2 random spots a bar related to nothing. `_drumEvents` already takes an `opts` object — pass the piano's onsets and answer or reinforce some of the time | S | |
| 16 | `[P]` | **Two-bar count-in**, or one bar above ~200 bpm. Currently one bar of undifferentiated hi-hat clicks | XS | |
| 17 | `[P]` | **Skip solo generation when `!soloOn`.** The largest generator in the file runs on the loop-wrap critical path for a line nobody will hear (band.js:982, check at 1229). Delete the write-only `_soloEventsCache` (band.js:987) while there | XS | |
| 18 | `[B]`/`[P]` | **Decouple comping feel from tune style** — a session-mode feel picker (swing / two-feel / bossa / latin / shuffle / even-8ths / ballad). 82.6% of tunes are tagged `swing`, so the blues branch serves 1 tune and modal serves 2. Fixes the dead branches *and* is a practice feature | M | |
| 19 | `[B]` | **Give the guitar something other than quarters** — held two-beat chords, more of the &-of-4 push (now 15%), and a moving inner voice inside the three-note shape. Measured 96.6% of guitar attacks on the quarter at a fixed 0.42-beat duration | S | |
| 20 | `[B]` | **Latin bass tumbao** — anticipate the & of 2, land the root on 4. The 23 latin tunes currently get the *bossa* bass line while the rest of the band plays 3-2 son clave | S | |
| 21 | `[P]` | **Sounding transposition** and per-repeat key stepping (1 or 5 semitones cycles all twelve keys; 3 visits only four) | S | |
| 22 | `[B]` | **Odd meters** — a jazz-waltz ride (1, 2&, 3&) and comping pool for the 29 waltzes; rewrite `ridePool` and `patterns4` as `bpb`-relative offsets so 5/4 stops losing its fifth beat | S | |
| 23 | `[B]` | **Seed the band, not just the solo.** `role`, `bwave` and every pattern pick are bare `Math.random()`; only the soloist runs inside `withSeed` (band.js:1276). Prerequisite for A/B-ing any change above | S | |
| 24 | `[B]` | **Get `_buildParts` off the loop point** — build the next chorus during the current one and swap at the boundary, instead of regenerating several hundred events 0.1 bar before the wrap | M | |
| 25 | `[P]` | **Limitation modes** — chord-tones-only, guide-tones-only, rhythm-only, first-four-bars-only. A rule stated before you play plus a critique after; both are UI, and the guide-tone thread is already computed | M | |
| 26 | `[P]` | **Web MIDI** — the only mic-free route to verifying what the player actually played, and the only thing that turns a play-along into a practice partner. Its own capability tier | L | |

## Suggested first cut

**1, 3, 6, 7, 9, 14, 16, 17** — all XS, all independent of each other, none needs
any music modelling. Then **2** on its own is the biggest audible change available
in the band.

Done so far: **2** (piano voicings), **3** (ride weights), **8** (two-feel), and
**4** (display transposition, which jumped the queue because a horn player cannot
use the app without it). The comp colour that came out of item 2 grew into a
band-wide plain/warm/rich control touching all four instruments.

Between them they cover the four things a player names first — the comp repeating
itself, the cymbal not swinging, the bass never changing gear, and having to
transpose the whole chart in your head.

Remaining first-cut items: 1, 6, 7, 9, 14, 16, 17. Item 1b is dropped.

Item 9's headline number has already moved: the new voicings took piano/guitar
pitch doubling from 47% to about 31% on their own, so the register split has less
left to win than when it was written.

## Reproducing the measurements

Stub Tone and smplr, import `js/band.js` in Node, and call the event builders off
`Band.prototype`. `_bassEvents` and `_drumEvents` need a `this` (a `rideOn` flag
and the transport bpm); `_pianoEvents` and `_guitarEvents` do not. Watch the bpm
stub — several drum branches are gated on tempo, and a `bpm` that reads back
`undefined` silently disables kick feathering and half the fill vocabulary.
