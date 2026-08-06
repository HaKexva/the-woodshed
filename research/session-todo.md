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
| 1 | `[P]` | Move the **tempo ramp** out of `#inspire-panel` (index.html:114) into session mode. It is implemented, correct, and invisible to the person who came to practise. The case for it is not that it is another way to set the tempo — it is the only one you can operate with your hands full: set +5, play eight choruses, finish 40 bpm up without ever having stopped. Backed by Allingham & Wöllner (2022), where gradual increase is the most common way musicians organise slow practice | XS | **done** |
| 1b | `[P]` | ~~Surface **chord breaks**~~ — **dropped.** One vendor precedent (Band-in-a-Box), no study, and as a density option it does not earn a slot. The mechanism survives as item 7: `setBreakBars(4)` is trading fours, which is a named drill rather than a setting | — | **dropped** |
| 2 | `[B]` | **Voice-led, non-deterministic piano voicings.** Candidate set per chord, scored by voice motion from the previous chord and by top-note recency, picked weighted-random among the best few. Fixed the frozen top line, the 85 two-note voicings and the 12 ♯9 semitone clusters in one change — 0.186 → 0.343 distinct top notes per chord, top-voice motion *down* from 2.48 to 1.60 semitones, clusters and dyads to zero. See the applied section of [backing-band-audit.md](backing-band-audit.md#1-voice-led-non-deterministic-piano-voicings--applied) | M | **done** |
| 3 | `[B]` | **Invert the ride weights** — the canonical figure played in 15% of bars, a figure with no beat 2 in 40%, and a `slow > 0.3` gate zeroed the skip note below 95 bpm. Reweighted, and the one skip figure split into three (skip on 2, on 4, on both); gate deleted. Bars with a swung skip note: 30% → 70% above 95 bpm, **0% → 66%** below it | XS | **done** |
| 4 | `[P]` | **Display transposition** (C / B♭ / E♭ / F) on the chord card, next-chord readout, scale strip, system view, lead sheet and Inspire score. Nothing in the codebase transposed anything, which for a horn player is close to disqualifying. The control sits under the song title rather than in the transport: it changes what is written, never what sounds | S | **done** |
| 5 | `[P]` | **Section loop** with a bar-range picker and a pre-roll, snapping to barlines. `loopStart`/`loopEnd` already do the work. Most-used practice strategy in the literature | S | |
| 6 | `[P]` | **Chorus counter and stop-after-N.** Both shipped, but derived in main.js from the bar index rather than off `_chorus`, which band.js still does not publish. Exact while the page is being drawn; a tab left playing in the background stops receiving downbeats, so the count stalls and the stop never fires. Publishing `_chorus` is the remaining half | XS | **done (UI)** |
| 7 | `[P]` | **Name and surface trading fours.** `setBreakBars(4)` already *was* that cycle; it now has the name, and the pedal turns solid amber on your four. The screen derives whose bars they are from the same `bar` index band.js uses, so no callback was added | XS | **done** |
| 8 | `[B]` | **Two-feel** — per-chorus bass feel, drums following. The bass walked quarters from bar 1 of chorus 1 to the end. `two` and `four` are in (`pedal` and `broken` are not); the head chorus and the quiet chorus of the wave take two. 4.14 → 2.03 notes/bar with the root still on 78% of chord changes, drums sitting back to match | S | **done** |
| 9 | `[B]` | **Separate the piano and guitar registers.** Only the piano moved in the end: its floor went F♯3 → A3, taking the overlap from 46.7% to about 25%. Moving the guitar as well was tried twice — floor to E2, ceiling to G3 — and both take it out of the range its voicings were built for, so it stays at 43–65 | XS | **done** |
| 10 | `[P]` | **Let the band lay out for a human.** `duck()` (band.js:1002) and the drummer's phrase-end answers (band.js:993) are gated on `soloOn`, so the one part of the engine that models a band listening to a soloist is off whenever there is a real one | S | |
| 11 | `[B]` | **Make the bass skip.** Was 92.5% stepwise against a 60–70% norm. A full bar now sometimes walks a chord-tone ladder — one rung is a third, not a second — and arrives by leap, the fifth falling a fourth to the next root. Step 92.5% → 73.6% | S | **done** |
| 12 | `[B]` | **A per-chorus arrangement plan**, replacing `bwave` and `role`. `_arrangement()` decides who carries the comp, which whole phrase each of them sits out, how hard the section is leaning and whether the bass is in two — before a note exists. Lay-outs come from the form model, so they are always a contiguous phrase. Piano 1.56–1.98 attacks/bar across the arc against 1.9 flat, velocity 53–65 against a range of 3.6, and 2–5 silent bars where there were none | M | **done** |
| 13 | `[B]` | **Form model** — `formSections()`, with optional `sections: [{ label, bars }]` in the song schema and a derived default: a twelve-bar form turns over in fours, everything else takes 8-bar blocks. 138 tunes (31%) had their fill positions corrected; Blue Monk fills at 4/8/12 rather than 8/12 | M | **done** |
| 14 | `[B]` | **Cross the barline at the top of the form.** Both parts now push over the loop point — piano on half of choruses, guitar on an eighth — using the wrapped `c.next` the bass always had. The wrap push is the chromatic approach, which resolves onto the next downbeat instead of replacing it | XS | **done** |
| 15 | `[B]` | **The drummer converses with the comp.** Snare comping was 0–2 random spots a bar related to nothing. The comp is now built before the drums so its onsets can be passed in, and given the choice the drummer reinforces one or answers in the hole after it: hits landing on the piano go from 47.8% by chance to 70.7% | S | **done** |
| 16 | `[P]` | **Two-bar count-in**, or one bar above ~200 bpm. Currently one bar of undifferentiated hi-hat clicks | XS | |
| 17 | `[P]` | **Skip solo generation when `!soloOn`.** The largest generator in the file runs on the loop-wrap critical path for a line nobody will hear (band.js:982, check at 1229). Delete the write-only `_soloEventsCache` (band.js:987) while there | XS | |
| 18 | `[B]`/`[P]` | **Decouple comping feel from tune style** — a session-mode feel picker (swing / two-feel / bossa / latin / shuffle / even-8ths / ballad). 82.6% of tunes are tagged `swing`, so the blues branch serves 1 tune and modal serves 2. Fixes the dead branches *and* is a practice feature | M | |
| 19 | `[B]` | ~~**Give the guitar something other than quarters**~~ — **reverted.** Half-note bars, holes on beat 3 and pushed &-of-4 bars all read as a guitarist losing the time rather than varying it. The rhythm was never the problem — see [guitar-comping.md](guitar-comping.md). What the part actually wanted became item 27 | S | **reverted** |
| 20 | `[B]` | **Latin bass tumbao** — the root anticipated on the & of 4 and tied over, weight on the & of 2 and beat 4. Downbeat on a full-bar chord 100% → 26%, harmonic changes anticipated 0% → 74%. The 23 latin tunes had been walking a bossa line under a clave section | S | **done** |
| 21 | `[P]` | **Sounding transposition** and per-repeat key stepping (1 or 5 semitones cycles all twelve keys; 3 visits only four) | S | |
| 22 | `[B]` | **Odd meters.** Every ride figure was absolute offsets stopping at 3.5, so a waltz got 4/4's figure minus a beat and Take Five lost its fifth beat from the ride, the comp and the hi-hat alike. A waltz pool riding in threes with the skip on 2 and 3, a 5/4 pool grouped 3+2, and a generated figure for anything else. The piano fills any bar longer than four beats; the bass accents 1 and 4 in five | S | **done** |
| 23 | `[B]` | **Seed the band, not just the solo.** `role`, `bwave` and every pattern pick are bare `Math.random()`; only the soloist runs inside `withSeed` (band.js:1276). Prerequisite for A/B-ing any change above | S | |
| 24 | `[B]` | **Get `_buildParts` off the loop point** — build the next chorus during the current one and swap at the boundary, instead of regenerating several hundred events 0.1 bar before the wrap | M | |
| 25 | `[P]` | **Limitation modes** — chord-tones-only, guide-tones-only, rhythm-only, first-four-bars-only. A rule stated before you play plus a critique after; both are UI, and the guide-tone thread is already computed | M | |
| 26 | `[P]` | **Web MIDI** — the only mic-free route to verifying what the player actually played, and the only thing that turns a play-along into a practice partner. Its own capability tier | L | |
| 27 | `[B]` | **Voice-lead the guitar, and ghost the shape.** `guitarVoicings` + `guitarComp`: Green's own root-3-7 inversions, chosen by common tones held. Top-voice motion 2.50 → 1.91 st, common tones 0.74 → 1.04, *So What* 2 → 4 top notes. And one or two notes sound where three did — full triads 100% → 68% of attacks, the whole shape kept for the backbeat | M | **done** |

## Where it stands

**Done: 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 20, 22, 27.** Between them
they cover what a player names first — the comp repeating itself, the cymbal not
swinging, the bass never changing gear, the guitar sitting on the band, every
chorus sounding like the last one, having to transpose the whole chart in your
head, and the practice controls being invisible to anyone in session mode. The
comp colour that came out of item 2 grew past the piano into a band-wide
plain / warm control that reaches all four instruments.

**Tried and reverted: 19.** The guitar's rhythm was never the problem; what the
part wanted was voice leading and ghosting, which became item 27.
**Dropped: 1b.**

**Still open, cheapest first:** 16, 17 (XS) · 5, 10, 21, 23 (S) · 18, 24, 25 (M)
· 26 (L).

Items 1, 6 and 7 shipped together as **the rig** — a row across the top of the
transport holding the practice controls, readable in the off state so you can see
what is armed without opening anything. It was deliberately a UI-only change:
every pedal drives the band through an API it already had, which is why item 6
arrived with its count derived rather than published, and why item 5 (section
loop) is not there — that one needs `loopStart` / `loopEnd`, and there is nowhere
UI-side to put it. The row has a slot waiting for it.

Reading transposition (item 4) moved into the rig from under the song title. It
is still the odd one out — it changes what is written, never what sounds — but a
player looking for a practice control now has one place to look.

The lead sheet also dims every bar outside the line being played and the one
after it, wrapping at the end of the form. Not from either review; it came out of
using the thing.

Item 23 is worth more than its position suggests: without a seeded band every
measurement here is an average over many takes rather than an A/B, and that is
the whole reason the guitar took three attempts. What is left is now mostly
`[P]` — the practice-room side — plus 18 and 24 on the band.

## Reproducing the measurements

Stub Tone and smplr, import `js/band.js` in Node, and call the event builders off
`Band.prototype`. `_bassEvents` and `_drumEvents` need a `this` (a `rideOn` flag
and the transport bpm); `_pianoEvents` and `_guitarEvents` do not. Watch the bpm
stub — several drum branches are gated on tempo, and a `bpm` that reads back
`undefined` silently disables kick feathering and half the fill vocabulary.

Measure the thing that changed, not the thing next to it. Three checks on this
work failed on their own assumptions rather than on the code: voice leading read
off ghosted events instead of the underlying voicings, a "no re-attack" check
counted held chords as missed anticipations, and a duration check averaged
half-note bars in with the chops. Each looked like a regression and was not.
