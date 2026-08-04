# Practice tools and pedagogy

What comparable tools actually do, how improvisers are actually taught, and what
of that a static browser site can deliver.

## The finding that reframes Inspire mode

The generator already computes, per note, most of the information a teaching tool
needs — a voice-led guide-tone thread built across the whole form before any note
is generated, explicit bebop enclosures, chromatic passing tones, blue notes,
tritone-substitution pools, and a phrase type for every phrase. It then discards
all of it at the UI boundary. The callback that reaches the interface passes a
single pitch class:

```js
this.cb.onSoloNote?.(e.midi % 12, durSec);   // js/band.js
```

Octave, beat position, chord context and harmonic function are all thrown away.
The tool already knows *why* each note works and never says so. Most of the
recommendations below are a matter of surfacing existing state rather than new
music modelling.

## The strategic caveat, up front

The strongest primary pedagogy source found — Solli, Aksdal & Inderberg,
"Learning Jazz Language by Aural Imitation," *Journal of Aesthetic Education*
55:4 (2021), documenting 40+ years of the NTNU jazz programme
([PDF](https://erlingak.folk.ntnu.no/LearningJazzLanguage/LearningJazzLanguage.pdf)) —
explicitly rules out learning by imitating computer-generated music. Its criteria
for a model solo require that it be human and communicative, ideally with three
or more interacting players, and chosen by the student out of genuine desire.

Don't argue with it; design around it. A generated solo's defensible advantage
over a Coltrane record is that it can be **annotated, slowed, looped, quizzed and
traded against**, infinitely, over whatever tune the student picked. That makes
Inspire an *analysis and drill surface*, not a model to imitate — a framing that
aligns the product with the literature instead of against it.

That paper also puts rhythm before pitch: its first phase is entirely singing and
clapping with no instrument — isolate the rhythm, clap it, beat the pulse while
singing the rhythm, and only then add pitches.

## Competitive landscape

**No product is all four of: free, browser-native, generates a solo over
arbitrary changes, and displays that line live with harmonic-function colouring.**
That square is empty.

### Impro-Visor — the closest prior art
Harvey Mudd research project, GPL-2.0, last released 2019.
<https://www.cs.hmc.edu/~keller/jazz/improvisor/>

- **Four-colour note coloration**: black = chord tone, green = colour tone, blue =
  chromatic approach tone, red = outside. The key design decision is that *the
  generator's grammar terminals are the same four categories* — generation and
  visualisation share one vocabulary.
- **Rectification** pulls any note that is neither chord nor colour tone to the
  nearest one — used both to clean melodies and to show a student how their line
  would look with pitch errors corrected.
- **Passive trading**: adjusting the grammar to insert rests lets it trade fours
  or eights indefinitely. Its documentation is honest that it does not react to
  what the soloist plays.
- Its trading modes come with a tutor taxonomy: respond *reflecting* what the user
  played (companion), respond *more complex*, or respond *simpler* — the last
  described as useful for showing better-structured melodies.
- Vocabulary file `vocab/My.voc` is machine-readable and rich: per chord it gives
  spelling, colour tones, chord-tone priority, explicit approach-note groups,
  avoid notes, substitutes and a chord-scale list.

### Band-in-a-Box — the only mainstream generate-and-display tool
- **Solo modes**: Normal, Fills%, Around Melody, **Trade 2s / 4s / 8s**, custom bar
  range, and which choruses to solo on.
- **Note colours** for chord tone / non-chord tone / non-chord-non-scale, with
  editable colour files, and note names printable inside noteheads **as numbers
  relative to the current chord**.
- **Woodshed Tempo**: +N BPM per loop with four modes — up only, up then down, up
  then reset, up and stay. The manual likens two of them to a treadmill workout.
- **Chord Breaks**: band plays four bars, rests four, so you find out on re-entry
  whether you drifted.
- Its Soloist Editor exposes **maximum notes per beat**, with the stated rationale
  of producing a solo using only quarter notes or longer for sight-reading study.
- During playback: notation with the sounding note highlighted and 1–2 bars of
  scroll-ahead.

### iReal Pro
- **Per-repeat tempo ramp** (1–20 BPM) and **per-repeat transposition**, with
  documented interval maths — stepping by 1 or 5 semitones cycles all twelve keys,
  stepping by 3 visits only four.
- Current-measure highlight can be **hidden deliberately** as a practice challenge.
- **Chord Scales view** draws the recommended scale on a staff, following along
  during playback. Deliberately no melody, no solo, no notation entry.

### Aebersold — two free assets worth mining
- **[Scale Syllabus](https://www.jazzbooks.com/mm5/download/FREE-scale-syllabus.pdf)** —
  a chord→scale table where the scales are ordered *by degree of dissonance*.
  For a dominant 7th: Mixolydian → major pentatonic → bebop dominant → Lydian
  dominant → whole tone → diminished → altered → blues. That is a ready-made,
  indexable tension dial, directly mappable to a slider.
- **[Jazz Handbook](https://www.jazzbooks.com/mm5/download/FQBK-handbook.pdf)** —
  chord tones, "pretty notes" (7ths, 9ths, ♯4ths), and an approach-note list;
  prints scale-degree numbers under noteheads.

### Soundslice — the reference for browser notation UX
- **Loop by dragging over the notation**, auto-snapping to notes and barlines,
  with the rest of the score fading out.
- **Speed training**: initial speed, final speed, increment, plays per speed,
  count-in. Their example runs 50%→100% in 10% steps, 4 plays each — 24 passes.
- **Focus mode** re-engraves the looped bars as a standalone piece.
- **Synth overlay** plays synthesised notation on top of a real recording —
  architecturally identical to "generated solo over backing track".
- Pitch names can be shown as scale degrees, but **key-relative, not
  chord-relative**, and there is no chord-tone marking.

### Others, briefly
- **Amazing Slow Downer** — arrow buttons shift the loop by its own length
  (bar-by-bar advance), ½× and 2× buttons halve or double it, and each saved loop
  carries its own speed, pitch and mix. A loop *is* a practice preset.
- **SessionBand** Jazz Vol.3 has styles literally called "Swing Guide Tones" and
  "Swing Jazz Licks" that assemble a recorded horn line over your changes — and
  never display it.
- **Chordbot** colour-codes the chord picker green / yellow / red by how many
  out-of-key tones a chord has. Chord level, not note level.
- **Transcribe!** aligns a spectrum curve to an on-screen keyboard, and states its
  own limit: it makes no attempt at rhythm or notation.
- **Tenuto / Functional Ear Trainer** — the feedback design is the transferable
  part: mark the wrong answer and *stay on the same question until it's right*,
  with a running accuracy percentage, and advance only above ~90%.
- **Free browser tools** that exist — Shed It!, chord-progressions.com (which does
  have trading bars), JazzBuddy, JJazzLab. **None draws a generated line.**

## Teaching methods worth implementing

**Guide tones.** The most computable topic on the list, and we already compute the
thread. The chordal 3rd and 7th define chord identity; in falling-fifth motion
**the 7th of one chord descends a half step to become the 3rd of the next**, and
this survives tritone substitution. The standard practice sequence: extract the
3rds and 7ths as a melody, then practise approach and surround tones, then
improvise using approach tones with guide tones as targets, **landing them on
beats 1 and 3**. (Smither, "Guide-Tone Space," *MTO* 25.2, 2019.)

**Target and approach notes.** Hal Crook's *How to Improvise*, in use at Berklee
since 1988, organises everything as "what to play, how to play, when to play" and
applies a target approach to pacing, phrase length, rhythmic density, dynamics,
articulation, motive development and rhythmic displacement. The placement rule is
simple and testable: **chord tones on the beat, chromatics off the beat.**

**Limitation practice.** Crook's procedure: pick one topic, pick a harmonic
setting, improvise restricted to that topic, then self-critique. Named limitations
from across the sources: chord-tone-only, guide-tone-only, rhythm-only (one
pitch), root-only, motif-only, four-note restriction (Bergonzi), and
solo-only-in-the-first-four-bars. **A limitation is a rule stated before you play
plus a critique after — both are UI, not signal processing.**

**Barry Harris.** The most algorithmically implementable body of material found.
The half-step rules are a literal lookup table: given a starting scale degree and
chord quality, which chromatic notes to insert when descending **so that chord
tones land on downbeats**. The four sixth-diminished scales are generated by
alternating a chord tone with a diminished arpeggio. A free, curriculum-shaped
write-up: Galliano, "Notes on the Method of Barry Harris"
([PDF](https://irfu.cea.fr/Pisp/frederic.galliano/Zique/barry_harris.pdf)).
⚠ Check IP before branding anything with his name.

**The Banacos ear-training exercise** is mic-free and underused: sound a cadence
to fix tonality, play one note in slow steady rhythm, **name it**; if wrong,
re-sound the cadence and alternate between cadence and note until the
relationship is clear. At 75–90% correct, move to two notes, then three. The
response is a *name*, not a sung pitch — fully deliverable with taps and a sampled
piano, which we already have.

**Slow practice, with numbers.** Allingham & Wöllner, *Psychology of Music* 50:6
(2022): **99.45% of classical and 89.12% of non-classical musicians use slow
practice**; it is the most-used tempo strategy, chunking second, and **gradual
increase is the most common organisation**. Practice-literature detail worth
copying: loop boundaries should start several bars *before* the hard part.

## Two exercises portable this week

Both from Keller's Impro-Visor classroom deck, both mic-free and backend-free:

- **Coloration exercise** — load a solo with colouring *off*, have the student
  identify each note's function, then reveal. Turns passive listening into active
  analysis, and our lab page already renders exactly this view.
- **Fixed trading** — take a generated chorus and delete every other four bars.
  Play the result and let the student trade fours with it. Zero new music
  modelling.

## Ranked recommendations

1. **Widen the note callback** — pass the whole event plus a role tag instead of a
   pitch class. Everything below depends only on this.
2. **Colour the solo feed by harmonic function**, with chord-relative degree
   numbers (b7, 9, ♯11). The feed already renders note names; this is a swap.
3. **Show the guide-tone thread** as a faint second line, soloable as audio to
   sing against, highlighting the 7→3 resolution when it fires.
4. **Coloration quiz.**
5. **Fixed trading**, with who-starts and trade-length controls.
6. **Practice ramp** — +N BPM per chorus with a live tempo/repeat readout, plus an
   up-then-reset mode.
7. **Loop a section with pre-roll**, snapping to barlines, the loop carrying its
   own tempo.
8. **Limitation modes** reusing the existing dials.
9. **Banacos drill.**
10. **Progressive reveal** for transcription — rhythm first, pitches after.

### Heavier or out of scope
- **Notation rendering** is a real dependency. **abcjs (MIT)** is the best fit —
  playback, looping, tempo warp, note-highlight callbacks and a jazz chord-grid
  view. VexFlow (MIT) is render-only; Verovio is higher fidelity but LGPL/GPL-3.
- **Magenta.js** chord-conditioned melody generation (Apache-2.0) is the only
  permissive ready-made option, but it is TensorFlow.js plus a 5.6 MB checkpoint —
  against the no-build-step ethos, and our hand-written generator is more
  controllable and more explainable.
- **Requires a microphone**: only *verifying* that the student played the right
  pitch. Client-side pitch detection needs no backend but does need a permission
  prompt and bleed handling.
- **Web MIDI is the mic-free path to real verification** and would unlock genuine
  active trading and target-note grading. Worth treating as its own capability
  tier.

### Licensing
Safe for our GPLv3: abcjs, VexFlow, ireal-renderer (MIT); OpenSheetMusicDisplay
(BSD-3 — several listings wrongly say MIT); Magenta.js (Apache-2.0); Verovio
(LGPL-3/GPL-3).

⚠ **Impro-Visor is GPL-2.0.** If that is v2-only rather than "v2 or later", its
code and grammars are incompatible with GPLv3. The ideas are not copyrightable.
⚠ Shed It! is CC BY-NC-SA (non-commercial). Some GitHub jazz generators carry no
licence file at all — reference only, do not copy.
