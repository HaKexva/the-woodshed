# Guitar comping

Why the guitar part reads as wrong, checked against what the sources actually
say about the style it is imitating. Written after two failed attempts to fix it
by ear — a rhythm pool and a register move, both reverted — because neither was
aimed at the real problem.

## What the sources say

Freddie Green is the model the swing setting is built on, and the descriptions of
his technique agree on four things.

**Three notes fingered, one or two sounded.** The shapes are root, third and
seventh with the fifth omitted, on strings 6-4-2 or 5-3-1. But the playing is not
the shape: Green "often distilled things down even further—ghosting all but one
of the notes in a three-note chord," strumming all six strings while "fretting
the outer notes lightly and letting only the fourth string ring—all while
completely deadening the remaining strings"
([Acoustic Guitar](https://acousticguitar.com/learn-to-comp-like-jazz-legend-freddie-green/)).
Scholarly discussion of the recordings goes further: while the videos show the
three-note shapes, "audibly it is clear that Green is playing only one or two
notes of the chord"
([Butterman thesis, freddiegreen.org](https://www.freddiegreen.org/technique/butterman_thesis.pdf)).

**The part is a line, carried by common tones.** The teaching examples are all
voice leading: "common tones—the Em7 and A7 chords share the fifth-fret G", and
"the highest note of both the Dm7 chord and the G7 is the tenth-fret F". The
shapes are chosen so that something stays put and the rest moves as little as
possible.

**Quarter notes, accented on 2 and 4.** Four to the bar, "be sure to accent beats
2 and 4".

**Damped.** The sound is a click of a chord, not a strum that rings.

For the straight-feel settings the model is different again: João Gilberto's
bossa splits the guitar into a thumb bass on the sixth and fifth strings and a
syncopated upper structure on the rest, over a two-bar clave-like cycle
([MasterClass](https://www.masterclass.com/articles/bossa-nova-chords),
[Jazz Guitar Lessons](https://www.jazzguitarlessons.net/blog/intro-bossa-nova-comping)).

## What we actually play

Measured on *Autumn Leaves* and *26-2*, 40–60 choruses each.

| | ours | the sources |
|---|---|---|
| distinct shapes per chord | **2**, deterministic | a shape per position, chosen for the line |
| notes sounding per attack | **3, always** | one or two |
| common tones per chord change | **0.74** (0.44 on *26-2*) | the organising principle |
| top-voice motion | 2.50 st, **20.9% leaping past a fourth** | barely moves |
| *So What*: distinct top notes | **2** over 32 chords | a line |
| accent on 2 and 4 | ✅ +6 velocity | ✅ |
| rhythm | ✅ quarters | ✅ |

**The rhythm was never the problem.** Quarters and the backbeat accent are right,
which is why a pool of half-note bars and pushed &-of-4 bars made it worse rather
than better: it varied the one thing that was already correct.

**The guitar is exactly where the piano was.** `guitarVoicing(chord, variant)` is
pure and deterministic and places each tone near a fixed anchor, so a chord gets
the same two shapes forever and consecutive chords are placed independently of
each other. That is the frozen-top-voice bug the piano had, and the fix that
worked there — build the real shapes, then choose between them by voice leading
from the chord before — has not been applied here. *So What* gets two top notes
across thirty-two chords on the guitar today.

**And every attack is a full three-note chord.** Four of those a bar, on the
instrument with the highest gain in the band, is most of the density. The
recordings that define this style sound one or two notes. This single change
would do more for the "too much" problem than any amount of shortening the chop,
which has already been taken from 0.42 to 0.28 of a beat.

## What to do, in order

1. **Voice-lead it.** Give the guitar the `voiceComp` treatment: a candidate set
   of real shapes per chord, scored by common tones held and top-voice motion
   from the chord before, chosen once per bar. This is the difference between a
   part and a series of unrelated chords, and the machinery already exists.
2. **Ghost the shape.** Sound one or two of the three notes on most beats and the
   full shape on 2 and 4. That is both the documented technique and a direct cut
   to the density, and it makes the backbeat accent land as a change of *weight*
   rather than only of velocity.
3. **Leave the rhythm alone.** Quarters are the part. The variation this
   instrument wants is in the voicing and the damping, not the placement.
4. **Later: a real bossa pattern.** The straight-feel pool is four generic offset
   lists with no thumb-bass/upper-structure split and no two-bar cycle. That is a
   separate piece of work from the swing part and should not be bundled with it.

## Sources

- [Learn to comp like jazz legend Freddie Green — Acoustic Guitar](https://acousticguitar.com/learn-to-comp-like-jazz-legend-freddie-green/)
- [Butterman, *Freddie Green technique* (thesis PDF) — freddiegreen.org](https://www.freddiegreen.org/technique/butterman_thesis.pdf)
- [How similar was Freddie Green's comping to Bach chorales? — jazzguitar.be](https://www.jazzguitar.be/forum/theory/97275-how-similar-freddie-greens-comping-bach-chorales-harmonically.html)
- [Bossa nova chords — MasterClass](https://www.masterclass.com/articles/bossa-nova-chords)
- [Intro to bossa nova comping — Jazz Guitar Lessons](https://www.jazzguitarlessons.net/blog/intro-bossa-nova-comping)
- [Concepts and techniques: Jim Hall — Premier Guitar](https://www.premierguitar.com/concepts-and-techniques-jim-hall)
