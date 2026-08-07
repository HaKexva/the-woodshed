// Item 23: the whole band is reproducible, not only the soloist.
//
// The point is not determinism for its own sake. It is that a change to a
// generator can be compared against the version before it, rather than against
// an average over takes — which is most of why the guitar took three attempts.
//
// Two contracts, because there are two situations:
//
//   · No soloist. The rhythm section is reproducible from the take and the
//     chorus, with no ceremony at all.
//   · With a soloist. The line carries motifs from one chorus to the next so it
//     can quote itself, and the band listens to the line — busy bars thin the
//     comp, phrase ends give the drummer somewhere to answer. So the whole
//     performance is reproducible from a *fresh* take, which is exactly what
//     newTake() prepares by clearing the remembered material.
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";

const band = new Band({});
band.gains = {}; band.ctx = { currentTime: 0 }; band.parts = [];

const fail = [];
const titles = ["Blue Bossa", "'Round Midnight", "All the Things You Are", "Take Five"];
const songs = titles
  .map((t) => [t, SONGS.find((s) => s.title.includes(t.replace("'", "")))])
  .filter(([t, s]) => s || fail.push(`${t}: not in the songbook`));

const rhythm = (plan) =>
  ["piano", "guitar", "bass", "drums"]
    .map((k) => (plan.ev[k] ?? []).map((e) => `${e.beat}:${e.midis ?? e.midi ?? e.drum}:${e.vel}`).join(","))
    .join("|");

/** A plan. `fresh` clears remembered material, the way newTake() does. */
const plan = (song, seed, chorus, { solo, fresh }) => {
  band.soloOn = solo;
  band.song = song;
  band.takeSeed = seed;
  band._chorus = chorus;
  band._heldLine = null;
  if (fresh) band._soloMotif = null;
  return band._planChorus(song);
};

// ---- the band alone ------------------------------------------------------
for (const [title, song] of songs) {
  const opts = { solo: false, fresh: false };
  const a = rhythm(plan(song, 0x4f2a, 2, opts));
  if (rhythm(plan(song, 0x4f2a, 2, opts)) !== a) fail.push(`${title}: same take and chorus gave two different bands`);

  plan(song, 0x9999, 7, opts); // unrelated work in between
  if (rhythm(plan(song, 0x4f2a, 2, opts)) !== a) fail.push(`${title}: the band changed after an unrelated chorus was planned`);

  if (rhythm(plan(song, 0x4f2a, 3, opts)) === a) fail.push(`${title}: chorus 3 is identical to chorus 2 — the chorus is not in the seed`);
  if (rhythm(plan(song, 0x4f2b, 2, opts)) === a) fail.push(`${title}: a different take gave the same band`);
}

// ---- the whole performance, from a fresh take ----------------------------
const whole = (p) => rhythm(p) + "//" + p.soloEvents.map((e) => `${e.beat}:${e.midi}`).join(",");
for (const [title, song] of songs) {
  const opts = { solo: true, fresh: true };
  const a = whole(plan(song, 0x4f2a, 2, opts));
  plan(song, 0x1234, 9, opts);
  if (whole(plan(song, 0x4f2a, 2, opts)) !== a) fail.push(`${title}: the performance is not reproducible from a fresh take`);
}

// ---- band and line must not move in lockstep -----------------------------
// If they shared a seed, changing the take would shift both together and
// neither could be varied against the other.
const [, bb] = songs[0];
const at = (seed) => {
  const p = plan(bb, seed, 0, { solo: true, fresh: true });
  return { band: rhythm(p), solo: p.soloEvents.map((e) => e.beat).join(",") };
};
const s1 = at(1);
const s2 = at(2);
if (s1.band === s2.band && s1.solo === s2.solo) fail.push("band and line both unchanged across two seeds");

console.log(`${songs.length} tunes · band reproducible on its own, performance reproducible from a fresh take`);
console.log(fail.length ? `FAIL\n  ${fail.join("\n  ")}` : "all checks pass");
process.exit(fail.length ? 1 : 0);
