# Solo vocabulary plan

The v6 generator passes its metrics and still does not sound like a solo. This
note says why, what the literature says about the gap, and what to build next.

Written August 2026, after [solo-fixes-applied.md](solo-fixes-applied.md) landed
and the line still read as "correct notes on the chord" rather than as playing.

## The complaint

> Currently it's not really like a solo, just random notes on the chord.

That is a fair description of the mechanism, and the numbers do not contradict
it. Phrase length, note density, motif recurrence, contour distribution, half-step
share and leap rate all sit inside their published human bands. Matching every
histogram is not the same as saying something — noise with the right marginals
still sounds like noise.

## Diagnosis

### Notes are rolled, then repaired

`_soloEvents` picks each pitch with dice and then corrects it. In `band.js`
around the walk branch:

```js
let dir = Math.random() < pDown ? -1 : 1;
let mag = r < p1 ? 1 : r < p2 ? 2 : 3 + Math.floor(Math.random() * 2);
cur = pool[nearestIdx(pool, cur) + dir * mag];
```

and then five successive passes move that note again — bebop metric grammar,
avoid-note hygiene, phrase-end resolution, the unison nudge, and the multi-voicing
consonance check. Each pass is individually defensible. Together they are a
spell-checker over random text: the output is well-formed and means nothing.

The missing thing is a unit between *note* and *phrase*. Real bebop lines are
chains of **figures** — a scale fragment, an arpeggio fragment, an approach onto
a target, a turn, a repeat. The engine has a degenerate version of this in
`S.cells`: two or three hand-written licks per style, fired about 30% of the
time. The other 70% is the walk.

### The line has no destination

`chordAt(t)` reads the chord under the cursor. The soloist's entire lookahead is
"is there a chord change soon" (the anticipation branch). Compare the bass, which
uses `c.next` to walk into the following root.

So chord-tone landings fire when the loop *notices* the change, at whatever beat
the previous duration happened to leave it — beat 1.5 or 2.25 as readily as beat
1. Nothing plans a duration so that a target arrives *on* the change. There is no
ii-V handling, no 7→3 resolution, no run into the tonic. This was item 10 of the
[audit](solo-engine-audit.md) and was never built.

Arrival is most of what makes a bebop line sound intentional. Without it, every
correct note is correct in isolation and the line still wanders.

### Rendition

The soloist is `SplendidGrandPiano`. Horns were tried once (WebAudioFont JCLive
presets, commit `4576d1c`) and removed with the WebAudioFont dependency. A piano
cannot scoop, bend, growl, or shape an attack, and jazz phrasing vocabulary is
substantially wind vocabulary.

## What the research says

Frieler and Zaddach's analysis-by-synthesis model
([TISMIR 2020](https://transactions.ismir.net/articles/10.5334/tismir.87))
generates jazz solos from two abstractions and evaluates them against real ones.

**Mid-level units (MLUs)** are ~2–3 second playing ideas — the improviser's
action plans. The nine-category system was derived by annotating the whole Weimar
Jazz Database by hand. Two categories cover about 75% of all MLUs and 75% of solo
duration:

| MLU | Character |
|---|---|
| **line** | long, rhythmically uniform — a run of even 8ths |
| **lick** | short, rhythmically diverse — a syncopated figure |

**The Weimar Bebop Alphabet (WBA)** decomposes those units into interval-sequence
atoms: *scale*, *arpeggio*, *approach*, *trill*, *repetition*, *misc*. Atoms are
chained by a first-order Markov model conditioned on the containing MLU, and only
then realised as pitches through chord-scale theory.

That is exactly the layer this engine lacks, and it is the difference between
"walk, then repair" and "choose a figure, then place it".

Their results, and what they imply here:

- Jazz experts identified the algorithmic solos 64.4% of the time; non-experts
  scored 41.7%, below chance. A rule-based generator can get close enough that
  trained listeners are the only ones who reliably tell.
- Their own weakest component, by their assessment, is the rhythm model — a
  first-order Markov chain over inter-onset-interval classes. Ours is worse: per-note
  dice over `[0.25, 0.5, 1]`.
- The same musical content scored 5.14 as the original audio and 3.47 as deadpan
  MIDI. **Rendition is worth more than any note-level change on this list.**
- Listeners rate music they believe is computer-generated more harshly
  (r = −.66 between liking and perceived "computerness"), so the bar is above
  parity, not at it.

## Plan

Ordered by payoff per line changed, with the prerequisite first.

### 1. Seeded RNG and take capture

Everything is bare `Math.random()`. A good take cannot be reproduced, saved, or
compared, so no change below can be told from a lucky roll. Thread a seeded PRNG
through the solo path, show the seed, and wire the dead `newTake()`.

Cheap, inaudible by itself, and the prerequisite for evaluating the rest.

### 2. Horn soloists — tried, and pulled again

Trumpet, trombone, alto and tenor were built on smplr's MusyngKite soundfonts,
with per-horn sounding ranges, level matching, velocity floors, strict monophony
and a breath rule. Mechanically it worked. Musically it was rejected on the first
listen: *"tp and sax are too fake."*

That is the correct verdict and it is a property of the samples, not the wiring.
General MIDI horn soundfonts carry **one velocity layer and a looped sustain per
instrument**, so every note has the same attack and the same colour no matter how
hard it is played — which is the opposite of what a horn is. This is also why the
first attempt (WebAudioFont JCLive presets, commit `4576d1c`) was pulled. Two
attempts, same rock.

The soloist is back to piano only. What survives is the plumbing: the generator
asks the instrument for its range instead of reading a module constant, so a real
pack only has to declare one.

**What a convincing pack would have to come from.** Checked, with what each
actually contains:

| Source | Licence | Horns |
|---|---|---|
| MusyngKite / FluidR3 GM | CC BY-SA 3.0 | all four — one velocity layer each. This is the thing that sounded fake. |
| [VCSL](https://github.com/sgossner/VCSL) | CC0 | tenor sax and saxello only; its lip aerophones are a didgeridoo. Already the source of the Real drum pack, so the pipeline exists. |
| VSCO 2 Community Edition | CC0 | orchestral trumpet and trombone — straight tone, no jazz articulation. |
| University of Iowa MIS | free to use | historically the best free chromatic multi-dynamic brass and sax recordings, but the site now serves a stub page and the archive has moved. |

None of these is a drop-in jazz horn. A real one means vendoring samples the way
`samples/hq` already does — several velocity layers per note, trimmed, normalised,
converted, manifested — which is a project of its own, not a switch to flip. Worth
doing: rendition still outranks every note-level change on this list.

### 3. Cadence engine: target and arrive

A pre-pass over the flattened chords, using the `next` field the bass already
uses:

- detect ii–V–I, V–I, and turnarounds
- assign each change a **target pitch** — the 7th of the V falling a half step to
  the 3rd of the I is the whole cadence in one interval
- assign each change an **arrival beat**, normally the downbeat
- plan the preceding figure's durations backwards from the arrival, so the
  approach lands *on* the change rather than near it

### 4. Atom layer

Replace the walk with a WBA-style chain. Atoms carry a shape, a direction and a
length; realisation into scale-pool pitches keeps the existing machinery.

| Atom | Shape |
|---|---|
| `scale` | n steps of the chord scale, one direction |
| `arp` | chord tones, one direction, optionally stacked past the 7th |
| `approach` | chromatic and/or scalar approach onto a named target |
| `neighbor` | up-and-back or down-and-back around one pitch |
| `repeat` | the same pitch, rhythmically displaced |
| `leap` | a deliberate wide interval, usually setting up a descent |

The MLU type picks the transition table: a `line` chains long `scale` and `arp`
atoms; a `lick` mixes short atoms with `approach` and `neighbor`. Per-style
weights make the eight players differ *harmonically* rather than only in density
— the audit's finding that they are currently harmonically indistinguishable.

Most of the repair passes become unnecessary, because atoms are correct by
construction.

### 5. Rhythm archetypes and beat-budget phrases

Two changes:

- phrase length becomes a **beat budget**, not a note count — the same count
  currently spans 3 beats or 12
- durations come from onset templates per MLU type instead of per-note dice

### 6. Mine the Weimar Jazz Database

This is the "listen to the masters" part, made computable.

[WJD](https://jazzomat.hfm-weimar.de/download/download.html) is 456 hand-transcribed
solos with note-level pitch and timing, beat and chord annotation, phrase and
chorus segmentation, and MLU labels. SQLite, ODbL.

Roster overlap with our eight styles:

| Style | WJD solos |
|---|---|
| coltrane | 20 |
| miles | 18 |
| parker | 17 |
| dexter | 6 |
| chet | present |
| monk, silver, wes | absent — WJD is monophonic wind and guitar lead |

Extract offline into a generated `js/solo-vocab.js`, no runtime dependency:

- **lick dictionary** — frequent 4–8 note (interval, IOI-class) n-grams per
  performer. Drops straight into the existing `cells` format: hundreds per style
  instead of two.
- **atom transition matrices** per performer, feeding §4
- **phrase length, entry position and density distributions**, feeding §5
- **measured chord-tone-on-beat rates** per performer, replacing guessed constants

Licence: ODbL is attribution plus share-alike on derived databases. The repo is
GPLv3 and already carries a songbook attribution norm, so this fits, but the
generated file needs its own credit line.

Build §4's mechanism with hand-authored atoms first and let the mining replace
the numbers. Do not block on the download.

### 7. Human ears

The generator's own metrics cannot see the thing being complained about. Two
sources that can:

- the same protocol that produced the swing-comping rework: send a take to a
  working pianist, take the judgement in her terms, translate it into generator
  terms afterwards
- hand-annotate one or two reference solos on tunes already in the songbook as
  ground truth for `solo-metrics.js`

## Order

```
1 seed  →  2 horns  →  3 cadence  →  4 atoms  →  5 rhythm  →  6 WJD  →  7 ears
```

Seed first because it makes the rest measurable. Horns second because rendition
outweighs content and it needs no generator change. Cadence before atoms because
atoms need somewhere to aim.

In the event horns went second and came straight back out, so the order that ran
was 1, 3, 4, 5, 6.

## What was built

Sections 1 and 3–6 are in. Section 2 was built and reverted. Section 7 is the
part no code can do.

| | Where |
|---|---|
| Seeded takes | `mulberry32` + `withSeed` in `band.js`; the solo runs in a scope keyed on (take, chorus), so the line is the same no matter what the drummer drew first. `newTake(seed)` and a take field in the inspire panel. |
| Horns | **Reverted** — see §2. `SOLO_INSTRUMENTS` keeps the piano and the range lookup; the GM horns are gone. |
| Cadences | A pre-pass builds `aims`: every change gets a target pitch class and an arrival beat, and a dominant resolving down a fifth gets the real one — its own 7th falling a half step into the 3rd. The note loop shortens a duration so the next note lands *on* the change, and the note before leans onto the target. |
| Atoms | `ATOM_MIX` / `ATOM_LEN` / `pickAtomKind` — scale, arpeggio, approach, neighbour, repeat, leap. The register spring and phrase shape now choose a *figure's* direction once instead of re-rolling every note. Where WJD covers the player, the mix is derived from their measured interval profile. |
| Rhythm | `RHYTHM` templates per mid-level unit, filled into a **beat budget** taken from that player's median/mean annotated phrase length, instead of a note count filled with per-note dice. |
| WJD | `research/wjd-mine.py` → `js/solo-vocab.js`. Interval profiles, phrase lengths, chord-tone rates and a shaped-lick dictionary per player. Pure scale and chromatic runs are filtered out of the licks — the scale figure already makes those. |

## Measured

`js/solo-metrics.js` gained `thirds`, `dirRun` and `landOnChange`, and its
reference bands now cite the corpus directly. Across 8 styles × 6 tunes × 4
choruses:

| Measure | Before | After | Corpus |
|---|---|---|---|
| lands on the change (when playing through it) | 58% | **80%** | — |
| 3rd of the I on a resolving dominant | 15.4% | **20.9%** | — |
| thirds (arpeggio share) | ~15% | **20.6%** | 26.5% |
| leaps ≥5 semitones | — | **15.5%** | 12.7% |
| direction run | 1.6 | **1.86** | 2.04 |
| phrase length | 1.55 bars | **1.68 bars** | ~2.4 bars |
| notes per phrase | 10.1 | **10.6** | 18.6 |
| rest ratio | 37% | **37%** | 12–35% band |
| chord-tone time | 58.5% | **60%** | ~50% |
| half-step rate | 34% | **31.4%** | 25–35% band |

Honest residuals. Thirds are still six points light, the line still turns
slightly more often than a real one, phrases are shorter, and we remain more
consonant than the corpus — which the literature is explicit about being a
machine tell in itself. The styles now differ *harmonically* rather than only in
density, which was the audit's complaint: Coltrane leaps 19% and Chet 15%, Miles
repeats twice as often as Parker, and the per-player mixes come from the players
rather than from taste.

Two caveats on the phrase-length gap. WJD phrases are annotated by ear and merge
what a gap-threshold splits, so the comparison overstates it. And more notes per
phrase is not obviously better here — this is a practice tool, and the person
using it has to hear the changes through the line.

## Later: the singer style, and cutting eight down to four

**Singing, measured.** The WJD transcribes no vocal solos at all — its instrument
codes run ts/tp/as/tb/ss/cor/cl/vib/bs/p/g and no voice — so what a sung line does
differently had to come from a corpus of sung melody. Jazzomat also distribute
[EsAC](https://jazzomat.hfm-weimar.de/download/download.html), 7,352 European folk
songs, same schema, same licence. Not jazz, but a voice is a voice.

| | sung (EsAC) | improvised (WJD) |
|---|---|---|
| repeated pitch | **21.5%** | 4.6% |
| melodic range | **12.6 st** | 28.7 st |
| interval over a fifth | 1.9% | 2.8% |
| interval over an octave | 0.0% | 0.2% |
| reversal after a skip | **66.2%** | 55.1% |
| reversal after a step | 35.7% | 35.1% |
| thirds | 16.4% | 26.5% |
| notes per phrase | 8.6 | 18.6 |

Three of those, not the syllables, are what make a line singable: it lives inside
an octave, it repeats a pitch nearly five times as often, and a leap comes
straight back. The reversal figure is worth the pair of columns — 66% after a
skip against 36% after a step is the effect being real rather than direction
simply being near-random.

The engine gained `span` (narrow the working band before any pool is built),
`maxLeap` (a ceiling on any interval inside a phrase) and `reversal`; the repeat
figure now marks itself deliberate so the anti-stutter pass leaves it alone.

**Eight styles into four.** The audit's complaint that the styles were
harmonically indistinguishable had been fixed, but they were still crowded: on a
14-measure profile, z-scored, the closest pairs were miles/chet 2.96, chet/dexter
3.41, miles/dexter 3.57, dexter/wes 3.66 and parker/wes 3.75 — a mush of
mid-density, mid-phrase presets. Searching all 126 four-style sets for the one
with the largest *minimum* pairwise distance gives coltrane + monk + singer +
silver (min 6.24, mean 7.38) — and **parker + monk + singer + silver** ties it at
the same minimum distance, since parker and coltrane sit 4.16 apart and are
interchangeable at this resolution. Parker is the one kept: the canonical bebop
voice, and the WJD covers it with 17 solos. Either way the four read as dense,
sparse, singable, riffy.

Dropped: miles, coltrane, chet, dexter, wes. Default is silver.

## Later: cantabile, and why long notes were never heard

The complaint was that a note lasting more than a beat is rare. Measured, the
generator *wrote* plenty — 22.6% of notes were a beat or longer — and *sounded*
almost none: 8.6%. Something between the two was eating them.

It was the articulation model, and it was wrong in a way the literature names.
Sounded length was `written × 0.885`, a flat ratio. Bresin & Battel
([JNMR 2000](https://www.tandfonline.com/doi/abs/10.1076/jnmr.29.3.211.3092))
measured key-overlap in legato piano performance and found it **falls as the
inter-onset interval grows** — the join between two notes is a roughly fixed
amount of time, not a fixed fraction of them. A flat ratio therefore punishes
exactly the notes that should be held: a written half note came out 1.77 beats,
a quarter-beat hole in the middle of a sustain. Articulation is now an absolute
gap in beats, capped so it can never eat a short note, and going **negative** —
a genuine overlap — at the singing end of the new dial.

**Cantabile**, the third dial. Not a style but a way of playing any of them:
"in a singing manner", which in the sources means a smooth legato join and a
melodic line drawn as one shape. It drives the join gap, the target note length,
the hold on phrase endings, the figure mix (toward scale and turn, away from
leap), the ghost-note and clipping rates, and the phrase arch.

| | plain | singing |
|---|---|---|
| articulation ratio | 0.67 | **1.04** (overlapping) |
| notes sounding ≥ 1 beat | 6.9% | **18.7%** |
| stepwise | 67.7% | 70.3% |
| leaps | 14.7% | 13.2% |
| rest ratio | 42.1% | 35.8% |
| convex (arch) phrases | 21.7% | 32.3% |

The arch is the weak lever of the six and worth being honest about. Phrase shape
only ever reached the figure branch, so chord landings — a quarter of every line —
overwrote it four times a bar; extending the arch into the landing search moved
convex contours from 21.7% to 32.3% and no further. The shape of a phrase is
still mostly decided by where the harmony puts it.

## Later: making Inspire teach

A design review of the whole mode, rather than the generator, found one thing
dominating: **the generator knew why every note worked and the interface threw
it away.** `onSoloNote(e.midi % 12, durSec)` — one pitch class, octave and beat
and chord and function all discarded — feeding a rolling list of letter names
that scrolled off after four bars. `practice-tools-and-pedagogy.md` had already
found this, and had already found the competitive gap it implies: *no product is
all four of free, browser-native, generating a solo over arbitrary changes, and
displaying that line with harmonic-function colouring.* We were three quarters
in and stopping at the fourth. Worse, `test-solo.html` had the missing quarter
built, on a page no user opens.

Built:

- **The callback carries what the generator knew** — midi, beat, duration, the
  sounding chord and the figure kind that produced the note.
- **The solo, written out.** The chorus against the chart, every note coloured by
  role (chord tone / colour / chromatic / outside) with its degree over its own
  chord, downbeats and held notes marked, the sounding note lit and the current
  bar flagged. Replaces the letter feed.
- **Hold this line** — stop the take re-rolling every chorus, which is the
  difference between listening to an improviser and learning a lick, and
  **tempo ramp** (+2/5/10 BPM per chorus) so the held line can be practised
  faster. Verified: identical note sequence across a wrap, 240 → 245 BPM.
- **Chord breaks** — the band drops for n bars every n bars while the soloist
  keeps going, so you hear whether the line holds the form with nothing under
  it. Verified: bars 0–3 play, 4–7 silent, solo untouched, levels restored on
  stop and on switching off.
- **Drum lead-ins.** Section fills drew from three snare-only figures and the bar
  that turns the form over drew from the same three, so every chorus came back
  the same way. Two pools now — a section fill that punctuates and a longer
  lead-in that hands the top back, landing on a downbeat accent — plus a ~22%
  chance of declining a section fill, which is what makes the ones that land
  mean anything. 52 distinct lead-ins over 60 generations.

Not built from the review: presets over the three dials, and the framing problem
that "Inspire" does not say what it does.

**A note on measuring this in a browser.** `Tone.Draw` dispatches on
`requestAnimationFrame`, which a background tab never fires. Every visual
callback — beat lights, chord card, the lit note — reads as dead when the tab is
not visible, and looks exactly like a broken feature. Screenshots are the only
trustworthy check for anything on the draw path.

## Sources

- [The Jazzomat Research Project — download](https://jazzomat.hfm-weimar.de/download/download.html)
- [Weimar Jazz Database content](https://jazzomat.hfm-weimar.de/dbformat/dbcontent.html)
- Frieler & Zaddach, [Evaluating an Analysis-by-Synthesis Model for Jazz
  Improvisation](https://transactions.ismir.net/articles/10.5334/tismir.87),
  TISMIR 2020
- Frieler et al., [Midlevel analysis of monophonic jazz
  solos](https://colab.ws/articles/10.1177/1029864916636440), Musicae Scientiae
  2016
- [Phrase-Oriented Generative Rhythmic Patterns for Jazz
  Solos](https://www.mdpi.com/2076-3417/15/20/11058), Applied Sciences 2025
