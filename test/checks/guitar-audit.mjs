// The guitar part against what the sources describe. Voice leading is measured
// on the underlying voicings; density on the events actually emitted, since
// ghosting means the two are no longer the same thing.
import { Band } from "../../js/band.js";
import { setBpm } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";
import * as T from "../../js/theory.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true, compColour: 1 });
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);
const song = (t) => SONGS.find((x) => x.title === t);
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };
setBpm(140);

console.log("1. SHAPES AVAILABLE PER CHORD");
{
  const NAMES = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];
  for (const sym of ["Dm7", "G7", "Cmaj7"]) {
    const v = T.guitarVoicings(T.parseChord(sym));
    console.log(`   ${sym.padEnd(7)} ${v.length} shapes: ${v.map((s) => s.map((x) => NAMES[((x % 12) + 12) % 12]).join("-")).join("  ")}`);
  }
  check(T.guitarVoicings(T.parseChord("Dm7")).length >= 4, "fewer than 4 shapes for Dm7 (was 2)");
}

console.log("\n2. VOICE LEADING on the underlying voicings");
{
  for (const title of ["Autumn Leaves", "26-2", "So What"]) {
    const s = song(title);
    const ch = flat(s);
    const moves = [], commons = [];
    let leaps = 0;
    const tops = new Set();
    for (let r = 0; r < 40; r++) {
      const vs = T.guitarComp(ch, Math.random);
      vs.forEach((v) => tops.add(v[v.length - 1]));
      for (let i = 1; i < vs.length; i++) {
        const d = Math.abs(vs[i].at(-1) - vs[i - 1].at(-1));
        moves.push(d);
        if (d > 4) leaps++;
        commons.push(vs[i].filter((m) => vs[i - 1].includes(m)).length);
      }
    }
    console.log(
      `   ${title.padEnd(15)} top move ${avg(moves)} st · >4st ${pct(leaps, moves.length).padStart(6)} · common tones/change ${avg(commons)} · ${tops.size} distinct top notes`
    );
    if (title === "Autumn Leaves") {
      check(Number(avg(commons)) > 1.0, `common tones ${avg(commons)} — sources make this the organising principle`);
      check(leaps / moves.length < 0.15, `${pct(leaps, moves.length)} leaping past a fourth (was 20.9%)`);
      check(Number(avg(moves)) < 2.2, `top move ${avg(moves)} st`);
    }
    if (title === "So What") check(tops.size > 3, `So What still frozen at ${tops.size} top notes`);
  }
  console.log("   (before: Autumn Leaves 2.50 st · 20.9% · 0.74 common · So What 2 top notes)");
}

console.log("\n3. WHAT ACTUALLY SOUNDS — ghosting and density");
{
  const s = song("Autumn Leaves");
  const ch = flat(s);
  const bars = s.progression.length;
  for (const [name, colour] of Object.entries(T.COMP_COLOUR)) {
    const sizes = new Map();
    let ev = 0, ring = 0, accFull = 0, accN = 0;
    for (let r = 0; r < 60; r++) {
      for (const e of B._guitarEvents.call(stub, ch, s, "swing", false, 4, colour)) {
        ev++; ring += e.dur * e.midis.length;
        sizes.set(e.midis.length, (sizes.get(e.midis.length) ?? 0) + 1);
        const b = e.beat % 4;
        if (b === 1 || b === 3) { accN++; if (e.midis.length === 3) accFull++; }
      }
    }
    console.log(
      `   ${name.padEnd(6)} ${[...sizes.entries()].sort().map(([k, v]) => `${k}:${pct(v, ev)}`).join(" ")} · note-beats/bar ${(ring / (bars * 60)).toFixed(2)} · full shape on 2&4 ${pct(accFull, accN)}`
    );
    if (name === "warm") {
      check(accFull / accN > 0.95, `the accent is not the full shape (${pct(accFull, accN)})`);
      check((sizes.get(3) ?? 0) / ev < 0.7, `still ${pct(sizes.get(3) ?? 0, ev)} full triads`);
    }
  }
  console.log("   (before: 3 notes on 100% of attacks · 3.32 note-beats/bar)");
}

console.log("\n4. STILL IN ITS OWN REGISTER, AND OFF THE PIANO");
{
  const s = song("Autumn Leaves");
  const ch = flat(s);
  let lo = 999, hi = 0, shared = 0, tot = 0;
  for (let r = 0; r < 60; r++) {
    const g = B._guitarEvents.call(stub, ch, s, "swing", false, 4, 1);
    const p = B._pianoEvents.call(stub, ch, "swing", false, 4, 1);
    for (const e of g) for (const m of e.midis) { lo = Math.min(lo, m); hi = Math.max(hi, m); }
    const gp = new Set(g.flatMap((e) => e.midis));
    const pp = new Set(p.flatMap((e) => e.midis));
    shared += [...pp].filter((m) => gp.has(m)).length;
    tot += pp.size;
  }
  console.log(`   guitar ${lo}–${hi} · piano pitches also played by guitar ${pct(shared, tot)}`);
  check(lo >= 43 && hi <= 66, `register ${lo}–${hi} left the band`);
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
