// Does the band repeat itself over a long listen?
//
// A tune left running is the normal case here — somebody puts it on and works —
// so the question is not whether two bars differ but whether twelve choruses
// do. The band was already random bar to bar; what it had no vocabulary for was
// *contrast*: the arc was four choruses long and identical every time round,
// nobody ever sat out for longer than a phrase, and the bass had two feels.
//
// Randomness inside one narrow distribution is what sameness sounds like.
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";

const CHORUSES = 12;
const f = (n, d = 1) => n.toFixed(d);
const pct = (n, d) => `${f((100 * n) / d)}%`;
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };

// A bar's rhythm, as the set of positions something is struck — the drums keyed
// by which drum, so a kick and a hat on one beat are not the same bar.
const barSigs = (events, bpb, bars, keyed) => {
  const byBar = new Map();
  for (const e of events) {
    const bar = Math.floor(e.beat / bpb);
    const off = Math.round((e.beat - bar * bpb) * 4) / 4;
    if (!byBar.has(bar)) byBar.set(bar, []);
    byBar.get(bar).push(keyed ? `${off}:${e.drum}` : off);
  }
  return Array.from({ length: bars }, (_, b) => (byBar.get(b) ?? []).join(","));
};

const run = (title) => {
  const song = SONGS.find((s) => s.title === title);
  const b = new Band({});
  b.song = song;
  b.soloOn = true;
  b.pinBand = true;
  b.takeSeed = 0x5eed;
  const bpb = song.timeSignature ?? 4;
  const bars = song.progression.length;
  const sigs = { piano: [], guitar: [], bass: [], drums: [] };
  const energies = [];
  const feels = [];
  let chorusOff = 0;
  for (let c = 0; c < CHORUSES; c++) {
    b._chorus = c;
    const plan = b._planChorusFrom(song);
    const arr = b._arrangement(song, plan.style, b.straight);
    energies.push(arr.energy);
    feels.push(arr.bassFeel);
    if (arr.layOut.piano.size >= bars || arr.layOut.guitar.size >= bars) chorusOff++;
    for (const p of Object.keys(sigs)) sigs[p].push(barSigs(plan.ev[p], bpb, bars, p === "drums"));
  }
  return { title, bars, sigs, energies, feels, chorusOff };
};

console.log("TWELVE CHORUSES — how much of it is the same bar again");
// The bass walks quarters for a living, so its ceiling is higher than the
// others': what matters there is that it is not ALWAYS walking them.
const CEILING = { piano: 0.35, guitar: 0.35, bass: 0.8, drums: 0.4 };
for (const title of ["Autumn Leaves", "Blue Bossa", "So What"]) {
  const r = run(title);
  console.log(`  ${title}`);
  for (const p of ["piano", "guitar", "bass", "drums"]) {
    const flat = r.sigs[p].flat().filter((s) => s.length);
    const counts = new Map();
    for (const s of flat) counts.set(s, (counts.get(s) ?? 0) + 1);
    const top = Math.max(...counts.values()) / flat.length;
    let same = 0, pairs = 0;
    for (let c = 1; c < CHORUSES; c++) {
      for (let i = 0; i < r.bars; i++) { pairs++; if (r.sigs[p][c - 1][i] === r.sigs[p][c][i]) same++; }
    }
    console.log(
      `   ${p.padEnd(7)} ${counts.size} distinct bar-rhythms · commonest ${pct(top, 1)} of bars · ` +
      `repeats last chorus ${pct(same, pairs)}`
    );
    check(top <= CEILING[p], `${title}: the ${p} plays one bar rhythm ${pct(top, 1)} of the time`);
  }
}

console.log("\nTHE ARC IS LONGER THAN THE LOOP — chorus 5 was chorus 1, exactly");
{
  const r = run("Autumn Leaves");
  console.log(`   energy: ${r.energies.map((e) => f(e, 2)).join(" ")}`);
  const firstFour = r.energies.slice(0, 4).join();
  check(r.energies.slice(4, 8).join() !== firstFour, "choruses 5–8 repeat 1–4 exactly");
  check(new Set(r.energies).size >= 6, `only ${new Set(r.energies).size} distinct energies in twelve choruses`);
}

console.log("\nTHE BASS HAS MORE THAN TWO FEELS");
{
  const al = run("Autumn Leaves");
  const sw = run("So What");
  console.log(`   Autumn Leaves: ${al.feels.join(" ")}`);
  console.log(`   So What:       ${sw.feels.join(" ")}`);
  const all = new Set([...al.feels, ...sw.feels]);
  check(all.has("two") && all.has("four"), "the old two feels are gone");
  check(all.has("broken") || all.has("pedal"), "neither broken time nor the pedal ever comes up");
}

console.log("\nSOMEBODY SITS OUT A WHOLE CHORUS — not just a phrase of one");
{
  let off = 0;
  for (const title of ["Autumn Leaves", "So What", "Blue Bossa"]) off += run(title).chorusOff;
  console.log(`   ${off} whole-chorus lay-outs across 36 choruses`);
  check(off >= 1, "nobody ever sat a chorus out");
  check(off <= 12, `${off} of 36 choruses had somebody out — that is a duo, not an arrangement`);
}

console.log();
console.log(fail ? `FAILURES: ${fail}` : "twelve choruses, and the band is doing something different in them");
process.exit(fail ? 1 : 0);
