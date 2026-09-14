# Funk: the bass, the keyboard, and the tune's own figure

What the generators do in funk, why, and which parts of it rest on a measured
source rather than on taste. Written after a working keyboard player reviewed
the app's funk playback (2026-09-14) and said three things:

> funk 的話 bass 建議彈的要更有變化不只 walking，然後 KB 也建議可以調整成電一點的音色
>
> 再更進階一點就是 funk 的歌要客製化拍點（比如 Watermelon Man）收掉，音樂再出來，會更帥

That is: the bass needs more variety and shouldn't just walk; the keyboard
wants an electric tone; and funk tunes want their own hit points, with the band
cutting out and coming back in.

## What was wrong with the bass

It was a walking line wearing a funk pattern. Four eighth-note shapes were
rolled per chord, and then the line went through the note-length pass every
other style shares, which stretches each note to 92% of the distance to the
next one. The result: notes joined end to end, a new shape every bar, nothing
off the eighth-note grid, and no ghost notes at all. Everything that makes a
funk bass part identifiable was missing, and the one thing a walking line has —
continuous forward motion — was there instead.

## What the line does now

**A figure, not a line.** One riff is chosen per chorus and repeats, transposed
to whatever chord each bar sits on. One riff over F7, Bb7 and C7 is how a funk
blues works. TalkingBass's funk-blues material is explicit that the riff
"simply repeats throughout the entire 12-bar form" with variation inserted as a
turnaround device — so a dropped note is 2.5× more likely in the bar that turns
a four-bar phrase over than inside one.

**The sixteenth grid, mostly unsounded.** Ghost notes — left-hand-muted, no
weight, a click of pitch — fill the sixteenths between the sounded notes. This
is the core of Rocco Prestia's technique: the plucking hand never stops
alternating, and what you don't hear is what keeps the line moving. Measured
over Watermelon Man: **5.3 notes per bar, 17–20% of them ghosts, 38–40% off the
eighth-note grid, mean note length 0.33 beats** (it was 0.92 of the gap to the
next note). Craft convention, not research, sets the ghost velocity — no study
was found giving a ratio — but the rule that the note *after* a ghost is played
at the top of its range is applied, because the contrast is the effect.

**Behind the kit.** Ainsworth, *Microtiming in Early Funk* (ZGMTH, 2025), over
fourteen 1967–74 tracks and more than a thousand measured deviations: the
sixteenths swing between **1.07:1 and 1.8:1** — present in 13 of 14 tracks, and
never reaching the 2:1 of a triplet — and the bass sits consistently **late**
against the drums. Câmara, Nymoen, Lartillot & Danielsen (JASA 147(2), 2020)
put the point where a listener can hear pushed from laid-back at roughly
**16–30 ms**. So bass notes carry a lag in milliseconds, not beats: 8 ms on the
beat, 20 ms off it. Deliberately inside that band and no further.

**The tie that kills the downbeat.** Zarbo's 2014 thesis on James Jamerson
names a tie from the previous bar, de-emphasising the downbeat, as his
signature device; and quotes Phil Chen on the placement rule — chord tone on
the strong beat, chromatic passing note on the weak one, or as an anticipation
of the downbeat. One of the six riffs anticipates by a sixteenth and holds over
the barline, and the lean into a chord change is a chromatic step on the last
sixteenth of the bar. The lean fires only where the harmony actually moves or
the phrase turns over — leaning into every barline is the walking habit again.

Measured repetition: the figure holds from one bar to the next **70% of the
time** on a tune with one chord per bar; on a four-bar loop that changes chord
every bar it is far lower, which is correct — the harmony is what moves.

## The keyboard

Funk now comps on the electric piano, chosen by style the way the bass already
was (electric there too). Nobody plays this music on a concert grand. Every
other style keeps the Splendid grand.

## The tune's own figure

`song.figure` lets a tune carry the rhythm the band actually plays:

```js
figure: {
  parts: ["piano", "guitar"],      // who plays it (default: the whole band)
  owns: true,                      // and plays nothing else in its bars
  cells: [{ bars: [0, 1], hits: [[beat, dur], …] }],
  breaks: [[bar, beat, beats], …], // where everybody lays out
}
```

`owns` is the difference between a band punching over its own groove and a band
playing the figure and nothing else. A break removes every part, and leaves the
soloist — in session mode, the person holding the instrument. Figures are
played on the head and every fourth chorus after.

### What is encoded, and what is not

**Cantaloupe Island — encoded.** Read off the University of Iowa Jazz Camp lead
sheet: bars 1–8 and 13–16 rest on the downbeat and hit the & of 1, 2, 3, 4 and
the & of 4 (the last tied over the barline); bars 9–12 on the Dm7 drop to two
attacks, beat 1 and the & of 2. That density drop across the third phrase is
the tune's whole rhythmic architecture. The keys and guitar own those bars; the
bass and drums keep their groove, as on the record.

**Watermelon Man — not encoded.** This is the tune the feedback named, and the
honest answer is that the figure could not be verified. The sources that
describe the 1962 head's rhythm in bar-and-beat detail are user-uploaded charts
rather than published editions, no separate band-stab figure distinct from the
melody could be confirmed, and no stop-time break could be confirmed at all.
For the 1973 *Head Hunters* version nothing usable was found. Encoding a figure
here means guessing at a specific rhythm and putting it in the app as fact, so
it is left out until somebody who plays it says what it is — two lines of data
once they do.

**The Chicken — not encoded.** The Jaco arrangement has a bar marked
"N.C. — unison" where the whole band punches a line together, which is exactly
what `figure` is for, but the beat placement inside that bar could not be read
at usable resolution.

**Chameleon — not in the songbook.** Its staged intro (bass alone, drums the
second time, chords the third) and its N.C. unison line are well documented in
a 2009 transcription if it is ever added.

## Sources

- Ainsworth, *Microtiming in Early Funk*, ZGMTH 2025 — https://www.gmth.de/zeitschrift/artikel/1224.aspx
- Câmara, Nymoen, Lartillot & Danielsen, JASA 147(2) 2020 — https://pubs.aip.org/asa/jasa/article-abstract/147/2/1028/993482
- Zarbo, *James Jamerson: From Jazz Bassist to Popular Music Icon* (2014) — http://www.olliedudekplaysbass.com/uploads/6/6/9/5/6695290/zarbo-thesis-2014_james_jamerson.pdf
- Rocco Prestia on left-hand muting — https://onlinebasscourses.com/lessons/technique/left-hand-muting-bass-technique/
- TalkingBass, *How To Build A Great Funky Bass Line* — https://www.talkingbass.net/how-to-build-a-funky-bass-line/
- Cantaloupe Island lead sheet, University of Iowa Jazz Camp — https://iowasummermusiccamps.uiowa.edu/sites/iowasummermusiccamps.uiowa.edu/files/2024-04/Cantaloupe%20Island%20leadsheet%20-%20Piano.pdf
- The Chicken, arr. Pastorius, 5 horns + bass — https://www.mindformusic.com/files/acfupload/266/672fd0171d0da_The_Chicken_5_horns__bass.pdf
- Chameleon, transcription by Ville V. (2009) — https://kellerjazz.com/music/Chameleon2-HerbieHancock.pdf

No published corpus study of funk bass note density was found; the notes-per-bar
figures above are measurements of this app's own output, not a target taken
from the literature.

## Checks

`test/checks/funk.mjs` — the figure holds from bar to bar but not forever, the
ghosts are there, the notes stay short (and the walking line stays long), funk
picks the electric piano, and Cantaloupe Island's keys play its figure and
nothing else in its bars.
