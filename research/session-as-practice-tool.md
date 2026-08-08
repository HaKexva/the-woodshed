# Session mode as a practice tool

The question this answers: if you are a horn player, a guitarist, a singer —
anyone whose instrument is not in the browser — is session mode a good place to
work on improvising? Read against the tools improvisers actually use and against
the pedagogy already collected in
[practice-tools-and-pedagogy.md](practice-tools-and-pedagogy.md).

Short answer: **as a play-along it is already good, and in three specific ways
better than the paid tools. As a practice room it is about 60% built — and most
of the missing 40% is already written and wired to the wrong mode.**

## What session mode actually gives you

Everything reachable with `mode === "session"`:

- the tune loops with a four-piece band, regenerated every chorus
- current chord, next chord, four beat lights
- a rolling three-line chart view (previous / live / next four bars) plus the
  full lead sheet with the current bar lit
- **the chord scale for the sounding chord, spelled diatonically** — `Dm7 → D
  dorian → D E F G A B C D`, roots marked (`renderSoloStrip`, main.js:250)
- transport: play / pause / stop, tempo 50–240, band volume 0–150%, per-instrument
  mutes, Bass+
- one bar of hi-hat count-in

## What it does well, and should not lose

**The chord-scale strip is the best thing in the app for a learning improviser.**
It answers the question a beginner actually has — "what can I play over this?" —
in the moment, per chord, in note names rather than theory. iReal Pro shipped its
Chord Scales view years after launch and draws it on a staff; this is more
readable and it is free.

**447 tunes with cited sources.** The changes are the expensive part of building
this kind of tool and they are done, corroborated across two independent corpora
per tune, with the sources shown in-app.

**The band re-improvises rather than looping a recording.** You cannot memorise
the backing, which is the failure mode of every play-along record.

**Per-instrument mutes** cover the classic drills for free: bass + drums only for
hearing the changes without being told them; drums only for time; kill the drums
to practise rubato.

**It runs on a phone with no install.** For a practice room that matters more
than any feature on this page.

## What blocks it

### 1. Every practice control is hidden in the other mode

`#inspire-panel` is `hidden` unless `state.mode === "inspire"` (main.js:451), and
these live inside it (index.html:114–178):

| control | what it does | who it is for |
|---|---|---|
| **tempo ramp** | +2/5/10 bpm each time the form comes round | anyone working a tune up to tempo |
| **chord breaks** | band plays n bars, rests n, alternating | anyone checking whether they still know where they are |
| hold this line / take seed | pins the generated solo | the generated soloist |
| chromatic, crowding, phrasing, voicing, style | shape the generated solo | the generated soloist |

The first two are woodshedding tools, and they are the two best practice features
in the app. Band-in-a-Box calls the first "Woodshed Tempo" and the second "Chord
Breaks"; iReal Pro's tempo ramp is one of its headline practice features. Both
are implemented here, both are correct, and both are **invisible to the person
who came to practise**. They keep working if you set them in inspire mode and
switch back — but nothing tells you they exist.

This is the highest-value fix in this document and it is a markup move.

### 2. No transposition — for a horn player this is close to disqualifying

Nothing in the codebase transposes anything. A tenor or soprano player needs
every chord symbol and every scale a whole step up; alto and baritone a major
sixth / minor third; French horn a fifth. The chord card, the `chord-next`
readout, the chord-scale strip, the system view and the lead sheet all show
concert pitch only.

Two separate features, and the second is the one they need daily:

- **sounding transposition** — play the tune in a different key. This is a
  practice tool in itself: iReal Pro documents stepping the key by 1 or 5
  semitones per repeat to cycle all twelve keys (stepping by 3 visits only four).
- **display transposition** — leave the band where it is and redraw the symbols
  in B♭ / E♭ / F. Pure display work over `flatName` and the chord symbol; the
  band never learns about it.

### 3. No section looping

The transport loops the whole form and nothing else. You cannot loop the bridge,
or bars 5–8, or the four bars you keep fumbling. This is the most-used practice
strategy in the literature the repo already collected — Allingham & Wöllner put
slow practice at 99.45% of classical and 89.12% of non-classical musicians, with
chunking second — and Soundslice, Amazing Slow Downer and iReal all build their
practice UI around it.

Tone's `loopStart` / `loopEnd` already do the work; this is an affordance over two
numbers. The practice literature's one detail worth copying: start the loop
several bars *before* the hard part.

### 4. No chorus counter, and no way to stop

The tune loops forever. There is no readout of how many times through you are and
no "play four choruses then stop". `_chorus` is tracked internally (band.js:914)
and never surfaced. Both halves of that are a few lines and both are how people
actually structure a practice rep.

### 5. The band never leaves you room

Measured on *Autumn Leaves*: **19.4 attacks per bar, identical density in every
bar of every chorus, and not one bar in the form without a piano or guitar
attack.**

`duck()` — the code that thins the comp and drops its velocity in bars where the
soloist is busy (band.js:1002) — is gated on `this.soloOn`. It only ever runs for
the *generated* soloist. The same is true of the drummer's phrase-end answers:
`phraseEnds` is only populated when `soloOn` (band.js:993), so the drummer never
responds to a human.

So the one part of the engine that models a band listening to a soloist is
switched off precisely when there is a real soloist in the room.

*(Since the audit: item 10 moved the phrase-end thinning onto the form model so
it runs for a human, and live mode now listens to the actual room through the
mic — loudness and attack rate, never notes. See
[live-mode.md](live-mode.md).)*

Chord breaks are the manual version of this and they exist. The automatic version
is the per-chorus arrangement plan proposed in
[backing-band-audit.md](backing-band-audit.md) — let the plan include laying out.

### 6. One bar of count-in

`countEvents` is `bpb` hi-hat clicks (band.js:1050). The convention every player
expects is two bars, or one bar at fast tempos, and usually with the tempo audible
in 4 rather than as undifferentiated clicks.

### 7. Nothing analytic points at the human

The repo's own pedagogy research concluded that a generated tool's defensible
advantage over a record is that it can be *annotated, slowed, looped, quizzed and
traded against*. Session mode does none of those for the human player. All of that
machinery exists — harmonic-function classification, chord-relative degree
numbers, the coloured score, the guide-tone thread — and every bit of it points at
the generated soloist in inspire mode.

The cheapest thing that would change this is **trading**: band plays four, you
play four. It needs no new music modelling at all — `setBreakBars(4)` already
implements exactly that cycle. It needs a name, a place in the session UI, and a
visual cue for whose four it is.

### 8. Limited style variety to practise against

82.6% of the songbook is tagged `swing` and there is no way to change a tune's
feel. A player working on bossa phrasing has 4 tunes; latin, 23; funk, 7. Playing
a standard as a bossa — an ordinary thing to want in a practice room — is not
possible. See the style-decoupling item in the backing-band audit; it is the same
fix from the other side.

### 9. Session mode pays for a soloist it never plays

`_buildParts` generates the full solo line every chorus regardless of mode
(band.js:982) and schedules the Part; the `soloOn` check is inside the Part
callback (band.js:1229). So the largest generator in the file runs on the
loop-wrap critical path — the same 0.1-bar window flagged in the backing-band
audit — for a line nobody will hear. `_soloEventsCache` (band.js:987) is written
and never read.

## What the comparable tools have that this doesn't

From the survey in [practice-tools-and-pedagogy.md](practice-tools-and-pedagogy.md),
restricted to things that matter to a player whose instrument is not the computer:

| | iReal Pro | Band-in-a-Box | the woodshed |
|---|---|---|---|
| tempo ramp per repeat | ✅ | ✅ (four modes) | ✅ **hidden in inspire** |
| chord breaks | — | ✅ | ✅ **hidden in inspire** |
| transposition | ✅ per repeat | ✅ | ❌ |
| section loop | ✅ | ✅ | ❌ |
| chorus count / stop after N | ✅ | ✅ | ❌ |
| trading fours | — | ✅ | ✅ **unnamed, hidden** |
| chord scales, live | ✅ (staff) | — | ✅ **and more readable** |
| hide the current-bar highlight as a challenge | ✅ | — | ❌ |
| generated solo displayed with function colouring | — | partial | ✅ **best in class** |
| free, browser-native, no install | — | — | ✅ |

## Ranked recommendations

**Do first — all UI over machinery that already works:**

1. **Move tempo ramp and chord breaks into the session transport.** Rename chord
   breaks to say what it is for.
2. **Display transposition** (concert / B♭ / E♭ / F) applied to the chord card,
   the next-chord readout, the scale strip, the system view and the lead sheet.
3. **Section loop** with a bar-range picker and a pre-roll, snapping to barlines.
4. **Chorus counter and stop-after-N**, both from `_chorus`.
5. **Trading mode** — name and surface the four-bar break cycle, with a cue for
   whose bars are whose.

**Then — small engine work:**

6. **Two-bar count-in**, or one bar above ~200 bpm.
7. **Let the band lay out for the human**: run `duck()` and the drummer's answers
   off a per-chorus arrangement plan rather than off `soloOn`.
8. **Sounding transposition**, including per-repeat stepping to cycle keys.
9. **Skip solo generation when `!soloOn`** — free latency at the loop point.

**Then — the larger ones:**

10. **Feel override in session mode** (swing / two-feel / bossa / latin / shuffle
    / even-8ths), which is also what unlocks the dead style branches.
11. **Limitation modes.** Crook's procedure is a rule stated before you play plus
    a critique after — both are UI. Chord-tones-only, guide-tones-only,
    rhythm-only, first-four-bars-only. The engine already computes the guide-tone
    thread; showing it as a target line to aim at is a display of existing state.
12. **Web MIDI** as the mic-free path to actually verifying what the player
    played. That is its own capability tier and the only route to real feedback,
    but it changes the tool from a play-along into a practice partner.

## Verdict

Session mode is a good play-along and a half-built practice room. The gap is not
musical modelling — the engine is further along than the interface. It is that
the practice features were built for the generated soloist and never offered to
the human one, and that two standard expectations of any tool aimed at horn
players — transposition and section looping — are simply absent.

Fixing items 1–5 is days of interface work over code that already exists and
already works, and it is the difference between "a backing track that follows the
chart" and "a practice room".
