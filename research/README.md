# Research notes

Background research for the woodshed, kept out of the app itself. Nothing here
ships; these are working notes that explain why the code looks the way it does
and what we considered building next.

Written during the Inspire-mode review (August 2026). Code line numbers refer to
commit `3cfde94` on the `solo-lab` branch — treat them as approximate once the
generator moves.

| File | What it covers |
|---|---|
| [solo-engine-audit.md](solo-engine-audit.md) | What the solo generator actually implements, where it sounds mechanical, and why |
| [solo-baseline-measurements.md](solo-baseline-measurements.md) | Measured statistics of the generated line, against published human baselines |
| [evaluation-and-metrics.md](evaluation-and-metrics.md) | How the literature measures generated jazz, what real players score, which failure modes listeners detect |
| [practice-tools-and-pedagogy.md](practice-tools-and-pedagogy.md) | What comparable tools do, how improvisers are actually taught, and what a static site can deliver |

## The short version

**Phrasing is the gap, not harmony.** Phrases average 0.89 bars against a 1.5–4.5
bar norm, half the form is silence, phrases land on a strong beat only 12% of the
time, and material essentially never recurs — 2% against a ≥10% norm. The line is
a series of short disconnected fragments that rarely resolve anywhere. The audit
traces all three of those to specific bugs rather than to missing design.

**But the harmony is too safe, not merely fine.** We play 66% chord tones; eight
transcribed bebop saxophonists play 50–54%, and the literature is explicit that
being *more* consonant than a human is itself a machine tell. Our eight player
styles are also harmonically indistinguishable from one another — they differ only
in density and rhythm.

**And the generator already knows more than it says.** It computes a voice-led
guide-tone thread, enclosures, chromatic approaches and phrase types, then throws
all of it away at the UI boundary, where the callback passes a single pitch class.
The most valuable near-term work may not be making the solo better but making it
**explain itself** — which also sidesteps the strongest objection in the pedagogy
literature, that computer-generated solos are poor models for imitation.
