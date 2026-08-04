# Solo fixes applied

What changed in the generator after the research, and what it did to the
numbers. Measured over 128 lines — 8 styles × 4 tunes × 4 choruses, dials
centred — with `js/solo-metrics.js`. Reference bands and their sources are in
[evaluation-and-metrics.md](evaluation-and-metrics.md).

## Before and after

| Measure | Before | After | Target | |
|---|---|---|---|---|
| phrase length | 0.89 bars | **1.55** | 1–3 | ✓ |
| notes per phrase | 5.4 | **10.1** | 8–18 | ✓ |
| notes per bar | 3.2 | **4.3** | 4–9 | ✓ |
| motif recurrence | 2.6% | **21%** | ≥10% | ✓ |
| repeated pitches | 22% | **5.7%** | ≤6% | ✓ |
| chord-tone time | 70% | **58.5%** | 48–58% | ~ |
| rest ratio | 50% | **37%** | 12–35% | ~ |
| phrase ends on a strong beat | 9% | **25%** | — | ↑ |
| half-step share | 32% | **34%** | 25–35% | ✓ |
| phrase endings on a chord tone | 70% | **59%** | ≥60% | ~ |
| big leaps (>octave) | 0.4% | **0.5%** | ≤0.5% | ✓ |
| contour: descending | 20% | **37%** | 38% | ✓ |
| contour: convex (arch) | 36% | **18%** | 17% | ✓ |

Three measures sit a point or two outside their band. That was a deliberate
stopping point: the literature is explicit that a line matching every metric can
still be dull, and past this point the changes were tuning numbers rather than
improving music.

## What actually changed

### Motif development — the biggest single win

Three separate bugs stopped it working, and all three had to go.

1. **Steps were recorded before the pitch was final.** The interval was pushed at
   selection time, but three later passes — bebop grammar, avoid-note hygiene,
   phrase-end resolution — moved the note afterwards, and several branches
   recorded a literal zero regardless. An "echo" replayed a contour that had
   never been played. Recording now happens after every pass has run.
2. **Steps were pool indices, not semitones.** A pool index means a different
   interval over every chord, so re-rooting a motif on a new chord produced a
   different melody with the same rhythm. Steps are now semitones, snapped into
   the new chord's scale — the same idea, correctly re-harmonised.
3. **Motifs were abandoned at chord changes.** The chord-landing branch was
   tested before the motif branch, so on a tune with two chords per bar any motif
   longer than a couple of beats was reset mid-statement.

On top of the fixes: motifs now carry into the next chorus (so chorus 3 can quote
chorus 1) and are *developed* rather than repeated — inverted, augmented, or
fragmented, borrowing the operator set GenJam uses on its own material.

### Phrase shape

Jazz phrases descend far more often than they arch: roughly 38% descending
against 17% convex in solo corpora, the inverse of the folksong "melodic arch".
Our lines were 36% arch and 20% descending — so the obvious fix, adding an arch,
would have made them *less* idiomatic. Each phrase now draws a shape from the
corpus distribution and steers toward it.

### Phrase length and breathing

Phrase length was a note *count* with mixed durations, so the same count could
span three beats or twelve, and the rest between phrases could run most of a bar.
The result was one-bar fragments separated by silence. Phrases are now longer and
the gaps shorter, and a phrase's final note is nudged onto the nearest strong
beat when it lands within half a beat of one — the difference between a line that
stops and a line that arrives.

### Harmonic safety

Real bebop players spend 48–58% of their time on chord tones. We were at 70%,
and the literature is clear that being *more* consonant than a human reads as
machine rather than as skill. Three things were over-tightening it: avoid-note
hygiene fired on every note a beat or longer, the guide-tone thread pulled 55% of
chord landings, and phrase endings always resolved to a chord tone. All three
were loosened, and held notes may now sit on a colour tone.

The other half of the problem was too little genuine chromaticism. Enclosures and
approach notes were gated to phrase *starts*, so mid-phrase chord changes — the
large majority — got a bare snap onto the guide tone. The note before a chord
change can now become a half-step leading tone into it, which is what makes a
line sound like it is playing the changes.

### Smaller repairs

- Accidental unisons are broken up. 22% of intervals were repeated pitches,
  because the snapping passes kept collapsing neighbouring notes onto the same
  chord tone. Deliberate repeats still survive.
- A failed nearest-note lookup used to return the middle of the register, which
  surfaced as a surprise octave leap. It now reports no match and the caller
  keeps the current note.
- Motif echoes are clamped so a re-rooted interval can't turn into an octave jump.
- Motifs are cleared when the tune changes.

## Style differentiation, as a side effect

The styles used to be nearly identical in every respect except density. They now
separate on phrase construction too:

| style | notes/bar | notes/phrase | motif recurrence | rest |
|---|---|---|---|---|
| miles | 2.9 | 5.7 | 16% | 30% |
| monk | 3.4 | 4.4 | 8% | 47% |
| chet | 4.2 | 9.8 | 33% | 29% |
| dexter | 4.2 | 11.6 | 21% | 33% |
| parker | 4.8 | 14.5 | 23% | 38% |
| coltrane | 5.6 | 16.4 | 26% | 42% |

Miles is sparse and short-phrased, Coltrane runs nearly three times as many notes
per phrase, Monk is the most fragmented and the least repetitive. That is roughly
the right ordering, and it fell out of the phrasing work rather than being tuned
in.

## Validation

7,360 generated lines — every style × every tune in the songbook × five dial
settings × both voicings × four choruses — checked for non-finite values,
out-of-range pitches, bad durations and velocities, events outside the form, and
empty output. No problems.

## Latin: its own treatment

The `latin` feel was seven multipliers away from `swing`, and measured
identically to it — same note density, same half-step rate, same phrase length,
same syncopation. It was a bebop solo with congas behind it.

What an Afro-Cuban line actually does differently, and what it now does:

- **It is organised by the clave, not the eighth-note grid.** Phrase entries are
  pulled onto the nearest stroke of the 3-2 son clave over its two-bar cycle
  (beats 1, 2.5, 4 | 2, 3), leaving a quarter of entries free so the line can
  cross the clave as well as land on it. Entries on a stroke went from 13% to
  **34%**, against 12% for swing.
- **Straight eighths.** Triplets fell from 14% of notes to **1%**.
- **On top of the beat, not behind it.** The behind-the-beat lag is now
  effectively zero, where swing keeps its drag.
- **More anticipation.** Stating the next chord early is idiomatic here rather
  than occasional.
- **Less bebop chromaticism**, more figure repetition — enclosures, blue notes
  and chromatic passing tones all pulled back, motif restatement raised.

Two supporting changes were needed. The chromatic passing tone ignored the song
feel entirely, so latin stayed as chromatic as bebop however far the enclosure
dial was turned down. And the pickup and enclosure devices front-run a phrase by
half a beat to a beat, which walked the entry straight off the clave stroke it
had just been snapped to — both are now suppressed for clave styles, which is
what took alignment from 21% to 34%.

The parameter merge also gained `motif` and `antic`, so a song's feel can reach
figure repetition and anticipation at all. Both were previously read straight off
the player style, one of about fifteen parameters the audit flagged as
unreachable from the song.

Bossa is left alone. It has its own clave and a much gentler surface, and its
existing feel parameters already separate it from swing.

## Not done

Carried forward, in rough priority order:

- **Swing distorts triplets and 16ths.** Tone applies swing at the tick level, so
  every event off the quarter-note grid is displaced — a triplet comes out
  long-medium-short and a 16th run decelerates. This structurally breaks the
  Coltrane and Parker styles, and it is a scheduling fix, not a generator one.
- **No ii-V-I awareness.** Nothing compares adjacent chords, so there is no 7→3
  resolution and no bebop run into the tonic.
- **Rebuilding only the solo desyncs the comp**, which keeps ducking around a
  line that no longer exists.
- **No seeded RNG**, so a good take can't be reproduced or A/B'd.
- **Bebop devices are still gated on phrase type** rather than note duration, so
  cells and motif restatements miss grammar, ghosting and articulation.
