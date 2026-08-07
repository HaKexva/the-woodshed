// The guitar is back to what it was: Freddie Green quarters, one chop length,
// its own register. This asserts the revert stuck and records what the piano's
// floor move buys on its own.
import { Band } from "../../js/band.js";
import { setBpm } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true, compColour: 1 });
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);
const song = (t) => SONGS.find((x) => x.title === t);
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };
setBpm(140);

const s = song("Autumn Leaves");
const ch = flat(s);
const bars = s.progression.length;

console.log("GUITAR — restored to the part that was there before");
{
  const durs = new Set();
  const onsets = new Map();
  let lo = 999, hi = 0, ev = 0, ring = 0;
  const perBar = new Map();
  for (let r = 0; r < 80; r++) {
    const g = B._guitarEvents.call(stub, ch, s, "swing", false, 4, 1);
    const counts = new Map();
    for (const e of g) {
      ev++; ring += e.dur * e.midis.length;
      durs.add(e.dur.toFixed(3));
      onsets.set((e.beat % 4).toFixed(2), (onsets.get((e.beat % 4).toFixed(2)) ?? 0) + 1);
      for (const m of e.midis) { lo = Math.min(lo, m); hi = Math.max(hi, m); }
      const b = Math.floor(e.beat / 4);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    for (const n of counts.values()) perBar.set(n, (perBar.get(n) ?? 0) + 1);
  }
  const rows = [...onsets.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`   onsets ${rows.map(([p, n]) => `${p}:${pct(n, ev)}`).join("  ")}`);
  console.log(`   chop length: ${[...durs].join(", ")} beats (was 0.42, then 0.75 stretched)`);
  console.log(`   register ${lo}–${hi}`);
  console.log(`   note-beats sounding per bar ${(ring / (bars * 80)).toFixed(2)}   (5.44 while the chop was stretched)`);
  console.log(`   attacks per bar ${[...perBar.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${pct(v, bars * 80)}`).join("  ")}`);
  // two: the chop, and the &-of-4 push at a hardcoded 0.3 that predates this branch
  check(durs.size <= 2, `${durs.size} chop lengths — the stretch is back`);
  check([...durs][0] === "0.280", `chop is ${[...durs][0]}, not 0.280`);
  check(lo === 43 && hi <= 66, `register ${lo}–${hi} is not the original band`);
  // the only non-quarter is the &-of-4 push, which predates this branch
  const offGrid = rows.filter(([p]) => Number(p) % 1 !== 0);
  check(offGrid.every(([p]) => p === "3.50"), `unexpected off-grid onsets: ${offGrid.map(([p]) => p).join(",")}`);
}

console.log("\nPIANO / GUITAR overlap — what the piano's floor move buys alone");
{
  let shared = 0, tot = 0;
  for (let r = 0; r < 60; r++) {
    const p = B._pianoEvents.call(stub, ch, "swing", false, 4, 1);
    const g = B._guitarEvents.call(stub, ch, s, "swing", false, 4, 1);
    const pp = new Set(p.flatMap((e) => e.midis));
    const gp = new Set(g.flatMap((e) => e.midis));
    shared += [...pp].filter((m) => gp.has(m)).length;
    tot += pp.size;
  }
  console.log(`   piano pitches also played by guitar: ${pct(shared, tot)}`);
  console.log(`   (46.7% before any of this · 13.7% when the guitar was moved too, which sounded wrong)`);
  check(shared / tot < 0.35, `overlap ${pct(shared, tot)} — the piano floor move did not hold`);
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
