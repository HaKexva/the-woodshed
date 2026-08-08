# Live mode — a band that listens to the room

Written after live mode shipped (commit `4cacde0`, August 2026), because the
design questions it answers were settled in a commit message rather than here,
and because one of them — *what should the band do when the player stops?* —
deserved a pass through the literature rather than a hunch. Code line numbers
refer to that commit; treat them as approximate once the code moves.

## What it is

The microphone reduces the room to one number, `heat` (0–1), built from the two
things a phone mic is actually good at through a bad signal: loudness over the
room's own floor, and attack rate. Attack rate is spectral flux with adaptive
whitening — every bin normalised by its own decaying maximum, which is what
makes one threshold serve a trumpet and a guitar alike (Stowell & Plumbley,
"Adaptive whitening for improved real-time audio onset detection", ICMC 2007) —
against a rolling two-second median threshold (listen.js:139–168). The two are
mixed 0.58 loudness / 0.42 density: loudness is the more reliable of the pair,
but density is what tells a ballad from a burn at the same volume
(listen.js:174).

There is deliberately no transcription. That is not only an engineering retreat
— pitch through a phone speaker at three feet is not recoverable — it is what
the interaction literature says a rhythm section attends to anyway; see below.

Heat replaces the written four-chorus arc over the arc's own range: `energy =
0.5 + 0.5 * heat` (band.js:1951), so heat 0 lands on the arc's quiet chorus and
heat 1 on its peak, and nothing downstream of `_arrangement` can tell whether
the number came from the room or the chorus counter. The check for all of this
is [test/checks/live-heat.mjs](../test/checks/live-heat.mjs).

## The question: what does a band do when the player stops?

The design as shipped: silence longer than 1.5s flips a `quiet` state
(listen.js:31, 187–192), and the band **takes the floor** — eight bars at heat
0.9, four on a form shorter than 16 bars, then it settles at 0.5 and waits
(band.js:38–41, 419–439). The moment the player comes back, the room's own heat
applies again. Fading out with the player was rejected in the commit message:
"fading out is what a volume control does; taking the room is what a band
does."

The research question is whether that matches what rhythm sections actually do.

## What the literature says

**Intensity-following is the real, common form of interaction.** Givan
(["Rethinking Interaction in Jazz
Improvisation"](https://mtosmt.org/issues/mto.16.22.3/mto.16.22.3.givan.html),
Music Theory Online 22.3, 2016) splits ensemble interaction into three tiers:
*microinteraction* (the timing/tuning adjustments any ensemble makes),
*macrointeraction* — "coordinating intensity levels with soloists" — which is
common and audible, and *motivic interaction* (trading recognisable figures),
which he argues is "only intermittently present in jazz" and heavily overstated
in the scholarship. Live mode implements exactly the middle tier and nothing
above it: heat is macrointeraction as a number. The thing the mic cannot do —
hear your phrases and answer them motivically — is the thing Givan says even
human bands mostly do not do.

**The band follows; it does not lead.** Givan's Oscar Peterson example: behind
Gillespie, Peterson would lay out or comp light through the solo's opening and
ratchet up later — "Dizzy loved brute force behind him when he was ready for
it; however, he did not like to be forced down into it." And Sonny Rollins
preferred accompanists who "play steady" over ones who chase his phrasing. Both
argue for the *slow* end of the response dial — and for `chorus` (the loop
point reads heat when it plans) being the default rather than a compromise. The
`bar` setting, the commit message already concedes, is "the setting most likely
to sound like a machine reacting rather than a band listening."

**A breath gets a fill; a vacated floor gets taken.** Comping pedagogy (e.g.
[jazz-library.com's comping guide](https://jazz-library.com/articles/comping/))
treats the soloist's short silences as the comper's material: counterpoint
motion belongs "during phrase breaks in the solo, or when the soloist takes a
breath" — a gesture *into* the gap, with the standing caution about stepping on
the soloist. A player who actually stops is a different event: the floor is
open, and in a real session somebody takes it. The two-stage response as
shipped — surge to 0.9 for a phrase, then settle and wait — is the second of
these. The first (a fill answering a breath) exists in the engine only as the
drummer's phrase-end answers and the comp thinning from the form model (item
10, item 15), which run on the *form's* phrase grid, not on the player's actual
gaps.

**Prior art brackets the choice.** The systems that listen to an improviser
split on precisely this question. George Lewis's *Voyager* is deliberately
non-hierarchical — it adapts to the performer's "long term dynamics, density,
articulation" but plays as an independent participant, including when the human
is silent ([Communications of the ACM
retrospective](https://dl.acm.org/doi/fullHtml/10.1145/3583082); [Steinbeck,
"George Lewis's
Voyager"](https://paulsteinbeck.com/Paul%20Steinbeck_2019_George%20Lewis's%20Voyager.pdf)).
Biles's *GenJam* formalises the alternation instead: the system answers in
"trading fours." Pachet's [*Reflexive
Looper*](https://www.semanticscholar.org/paper/Reflexive-loopers-for-solo-musical-improvisation-Pachet-Roy/d464bd6733445815b5da0b6bfcdc178445d8b9d3)
gives a solo performer a rhythm section built from their own playing. Classical
accompaniment systems (score followers) sit at the servile extreme: when the
soloist stops, they wait. Live mode's takeover is a trading gesture on a
Voyager-style premise — the band is a participant with a claim on the room, not
a volume slider — while heat itself stays strictly follower-side. That split
(follow while you play, participate when you stop) is defensible from both
halves of the literature.

## Where the implementation and the literature disagree

One real tension, one caveat.

**The quiet threshold was in seconds; phrasing is in bars.** As shipped,
`QUIET_MS = 1500` was fixed, while the heat envelope's own fall time was chosen
so that "two bars of rest is phrasing, not stopping" (listen.js:45). At 120 bpm
a bar is 2s: the takeover armed inside a single bar of rest, well inside the
breath-length gaps the comping pedagogy says to *fill*, not seize — and at a
ballad tempo it armed mid-phrase-break. The `chorus` response setting mostly
hid this — the surge only lands if the player is still silent when the loop
point plans — but on `bar` it was audible as the band lunging at a long note's
release.

*Applied:* the window now counts **two bars of the tune being played**, floored
at the old 1.5s so a burner can never make the band twitchier than it already
was — `quietWindowMs` in listen.js, fed the bar length by the band, which is
the only party that knows the tempo and the meter. A 90 bpm ballad now waits
5.3s instead of 1.5s; 120 bpm waits 4s, which is exactly the envelope comment's
"two bars of rest is phrasing"; a 320 bpm waltz sits on the floor. Checked in
[live-heat.mjs](../test/checks/live-heat.mjs) ("THE BREATH").

The other half of the pedagogy's answer — a drummer's fill *into* the first
gap, the floor only after a phrase of silence — remains open. The fill
machinery (item 15's answer-in-the-hole) exists but is keyed to the comp's
onsets rather than to the player's silence, and a fill that answers a real
breath needs event insertion outside the build cycle, which nothing does yet.

**On speakers, the band hears itself.** Echo cancellation subtracts what went
to the speaker, the noise floor eats steady bleed, and headphones end the
problem — but a busy band on speakers at volume still reads as some heat of its
own (listen.js:10–25). The failure is bounded (the band runs a step livelier
than the room deserves) and one-sided by design: the same bleed through a pitch
tracker would be the band transcribing itself. Every claim in this document
assumes the synthetic-mic browser test; **nothing here has been played against
a real microphone in a real room yet**, and that test decides whether the
thresholds above are numbers or guesses.

## Sources

- Givan, ["Rethinking Interaction in Jazz Improvisation"](https://mtosmt.org/issues/mto.16.22.3/mto.16.22.3.givan.html), *Music Theory Online* 22.3 (2016)
- [Jazz Library, "Jazz Comping — A Complete Beginner's Guide"](https://jazz-library.com/articles/comping/)
- [CACM on Voyager and interactive improvisation systems](https://dl.acm.org/doi/fullHtml/10.1145/3583082); [Steinbeck, "George Lewis's Voyager" (2019)](https://paulsteinbeck.com/Paul%20Steinbeck_2019_George%20Lewis's%20Voyager.pdf)
- [Pachet & Roy, "Reflexive loopers for solo musical improvisation" (CHI 2013)](https://www.semanticscholar.org/paper/Reflexive-loopers-for-solo-musical-improvisation-Pachet-Roy/d464bd6733445815b5da0b6bfcdc178445d8b9d3)
- Stowell & Plumbley, "Adaptive whitening for improved real-time audio onset detection", ICMC 2007
- Berliner, *Thinking in Jazz* (1994) and Monson, *Saying Something* (1996) — the ethnographic ground under all of the above; see [Givan](https://mtosmt.org/issues/mto.16.22.3/mto.16.22.3.givan.html) for the critical reading
