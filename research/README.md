# Research notes

Background research for the woodshed, kept out of the app itself. Nothing here
ships; these are working notes that explain why the code looks the way it does
and what we considered building next.

Written during the Inspire-mode review (August 2026), then extended by the
Session-mode review. Code line numbers in the solo documents refer to commit
`3cfde94` on the `solo-lab` branch; the two session documents refer to
`worktree-session-review`. Treat all of them as approximate once the code moves.

| File | What it covers |
|---|---|
| [session-todo.md](session-todo.md) | Everything the session review turned up, as one ranked work list with status |
| [backing-band-audit.md](backing-band-audit.md) | What the four rhythm-section generators play, measured — where the variety is real and where it is a constant |
| [guitar-comping.md](guitar-comping.md) | What Freddie Green actually played, against what our guitar plays — and why two attempts to fix it by ear missed |
| [session-as-practice-tool.md](session-as-practice-tool.md) | Whether session mode is a good practice room for a player whose instrument is not the browser |
| [solo-engine-audit.md](solo-engine-audit.md) | What the solo generator actually implements, where it sounds mechanical, and why |
| [solo-baseline-measurements.md](solo-baseline-measurements.md) | Measured statistics of the generated line, against published human baselines |
| [evaluation-and-metrics.md](evaluation-and-metrics.md) | How the literature measures generated jazz, what real players score, which failure modes listeners detect |
| [practice-tools-and-pedagogy.md](practice-tools-and-pedagogy.md) | What comparable tools do, how improvisers are actually taught, and what a static site can deliver |
| [solo-fixes-applied.md](solo-fixes-applied.md) | What was changed in the generator as a result, with before/after numbers |
| [songbook-sourcing.md](songbook-sourcing.md) | Where chord changes for a larger songbook can come from, and what the licences actually say |
| [solo-vocabulary-plan.md](solo-vocabulary-plan.md) | Why the line still reads as random after the fixes, and the vocabulary/cadence/rendition plan that follows |

## The short version — session mode

**The band's rhythm was varied and its pitch was a constant.** Every chord mapped
to exactly one piano voicing and two guitar voicings, deterministically, forever.
Consecutive choruses of the comp overlapped by only 0.15 (Jaccard) and every bit
of that difference was rhythm. The measured consequence: across all 447 tunes the
piano's top voice averaged 0.19 distinct notes per chord — *So What* got **two top
notes across thirty-two chords**, identical in every chorus of every take. The
piano half of this is fixed (item 2 in the work list, applied — 0.34 now, with
*better* voice leading than before); the guitar's two shapes are not.

**The swing ride is backwards.** The canonical jazz ride figure plays in 15% of
bars; a pattern with no beat 2 at all plays in 40%; below 95 bpm the skip note is
gated off entirely. Kick feathering and hi-hat are right.

**The two levers meant to shape a chorus don't.** `bwave` keeps 94.6–100% of comp
events and moves velocity ±3.6 — inaudible. `role` implements "laying out" as
keeping a random 55% of an instrument's events, which sounds like dropout.

**The practice tools were built for the wrong soloist.** Tempo ramp and chord
breaks are implemented, correct, and hidden inside `#inspire-panel`. `duck()` —
the code that gets the band out of a soloist's way — is gated on `soloOn`, so it
never runs for a human. And there is no transposition anywhere, which for a horn
player is close to disqualifying.

## The short version — inspire mode

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

## Status

The generator fixes from this research are applied on the `solo-lab` branch —
see [solo-fixes-applied.md](solo-fixes-applied.md) for what moved. The findings
about surfacing per-note harmonic function in the UI, and the drill designs
(coloration quiz, fixed trading, practice ramp, limitation modes), are not built.

Nothing from the session review is built. Its two cheapest items are worth
calling out because neither needs any music modelling: moving the tempo ramp and
chord breaks into the session transport, and making `pianoVoicing` voice-lead
from the previous chord instead of returning one fixed shape per symbol.

Statistics in the two session documents are reproducible: stub Tone and smplr,
import `js/band.js` in Node, and call the event builders off `Band.prototype`.
`_bassEvents` and `_drumEvents` need a `this` (a `rideOn` flag and the transport
bpm); the other two do not.
