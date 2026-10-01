// Does the line read as a solo, or as a generator making plausible noise?
//
// The engine had every harmonic detail right and still produced something the
// owner described as "not really a solo". Measured, the reason was shape, not
// pitch: three of the four voices were parameterised to play shorter and rest
// more than any transcribed solo does, and the one that shipped by default was
// among them — 3.5 notes a bar, silent 44% of the time, phrases of nine notes
// against the corpus eighteen.
//
// The reference bands are js/solo-metrics.js REF, which cite their sources.
// They are targets to sit near, not to maximise: scoring *better* than a human
// on consonance is itself the machine tell.
import { Band, SOLO_STYLES, voiceFor } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";
import { analyze, REF } from "../../js/solo-metrics.js";

const TUNES = ["Autumn Leaves", "Blue Bossa", "So What", "All The Things You Are"];
const CHORUSES = 6;
const f = (n, d = 2) => n.toFixed(d);
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };

// Fixed take seeds, not fresh ones. A take's whole line comes out of its seed,
// so measuring with a random one makes every comparison an average over
// different music — which is how a parameter change can look like an
// improvement twice and a regression the third time.
const SEEDS = [0x5eed, 0x1234, 0xbeef, 0x2b2b];

const measure = (voice) => {
  const acc = {};
  let n = 0;
  for (const title of TUNES) {
    const song = SONGS.find((s) => s.title === title);
    if (!song) continue;
    for (const seed of SEEDS) {
    const b = new Band({});
    b.song = song;
    b.soloOn = true;
    b.pinBand = true;
    b.takeSeed = seed;
    if (voice) b.soloStyleName = voice;
    for (let c = 0; c < CHORUSES; c++) {
      b._chorus = c;
      const p = b._planChorusFrom(song);
      const m = analyze({ events: p.soloEvents, chords: p.chords, totalBeats: p.totalBeats, bpb: p.bpb });
      for (const k in m) if (typeof m[k] === "number") acc[k] = (acc[k] ?? 0) + m[k];
      n++;
    }
    }
  }
  for (const k in acc) acc[k] /= n;
  return acc;
};

// The ones that say "this is a line a person played" rather than "these notes
// fit the chord". Pitch-level metrics are left to the lab page: they were
// already inside their bands when the line still did not read as a solo.
const SHAPE = ["notesPerBar", "restRatio", "phraseNotes", "phraseBars", "thirds", "motifRecurrence"];

console.log("EVERY VOICE PLAYS A LINE — not a signature impression of one");
for (const voice of ["parker", "silver", "singer"]) {
  const m = measure(voice);
  console.log(
    `   ${voice.padEnd(7)} ${f(m.notesPerBar)} notes/bar · rest ${f(m.restRatio)} · ` +
    `phrase ${f(m.phraseNotes, 1)} notes over ${f(m.phraseBars)} bars · thirds ${f(m.thirds)}`
  );
  for (const k of SHAPE) {
    // The thirds band is the arpeggio's share of intervals in the Weimar Jazz
    // Database — instrumental jazz. The singing voice is measured against 7,352
    // sung folk melodies instead, which move by step and come straight back
    // after a skip; holding it to a horn player's arpeggio rate would be asking
    // it to stop being the thing it is.
    if (voice === "singer" && k === "thirds") continue;
    const [lo, hi] = REF[k];
    check(m[k] >= lo && m[k] <= hi, `${voice}: ${k} ${f(m[k])} outside ${lo}–${hi}`);
  }
}

console.log("\nTHE TAKE PICKS THE PLAYER — the dropdown did, and its default was the weak one");
{
  // Same seed, same voice, every time: a take has to play back identically or
  // writing one down means nothing.
  const seeds = [1, 2, 3, 99, 12345, 777777];
  for (const s of seeds) check(voiceFor(s) === voiceFor(s), `voice for seed ${s} is not stable`);
  const rolled = new Set(Array.from({ length: 400 }, (_, i) => voiceFor(i * 2654435761)));
  console.log(`   400 seeds roll: ${[...rolled].sort().join(" · ")}`);
  check(rolled.size >= 3, `only ${rolled.size} voices ever come up`);
  check(!rolled.has("monk"), "monk is back in the roll — it cannot reach the human bands");
  check(SOLO_STYLES.monk, "monk should stay available by hand, for the lab page");
  // and a fresh band is already somebody, without anyone choosing
  const b = new Band({});
  check(SOLO_STYLES[b.soloStyleName], `a new band has no voice: ${b.soloStyleName}`);
}

console.log("\nTHE DRUMMER HEARS THE PHRASE — wherever the line stops, however it ends");
{
  // phraseEnds used to mean "a note held 1.1 beats or longer", so a voice with
  // short articulation handed the drummer nothing to answer.
  for (const voice of ["parker", "silver", "singer"]) {
    const song = SONGS.find((s) => s.title === "Blue Monk"); // twelve bars, the tightest case
    const b = new Band({});
    b.song = song;
    b.soloOn = true;
    b.pinBand = true;
    b.soloStyleName = voice;
    let worst = Infinity;
    for (let c = 0; c < CHORUSES; c++) {
      b._chorus = c;
      const ends = [];
      const line = [...b._planChorusFrom(song).soloEvents].sort((a, z) => a.beat - z.beat);
      for (let i = 0; i < line.length - 1; i++) {
        if (line[i + 1].beat - (line[i].beat + line[i].dur) >= 1) ends.push(line[i].beat);
      }
      worst = Math.min(worst, ends.length);
    }
    console.log(`   ${voice.padEnd(7)} quietest chorus of a 12-bar blues still ends ${worst} phrases`);
    check(worst >= 1, `${voice}: a whole chorus went by with no phrase end to answer`);
  }
}

console.log();
console.log(fail ? `FAILURES: ${fail}` : "the line breathes, runs on, and comes back to something");
process.exit(fail ? 1 : 0);
