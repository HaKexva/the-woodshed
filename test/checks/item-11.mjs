// item 11 — walking bass step/skip balance
import { Band } from "../../js/band.js";
import { setBpm } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";
import * as T from "../../js/theory.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true, compColour: 1 });
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);
const song = (t) => SONGS.find((x) => x.title === t);
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };
setBpm(140);

console.log("QUARTER-TO-QUARTER MOTION (transcribed walking bass: 60–70% step)");
for (const [name, colour] of Object.entries(T.COMP_COLOUR)) {
  let step = 0, skip = 0, leap = 0, tot = 0, rep = 0, chg = 0, root = 0;
  const hist = new Map();
  for (const title of ["Autumn Leaves", "Blue Monk", "26-2"]) {
    const s = song(title); if (!s) continue;
    const ch = flat(s);
    for (let r = 0; r < 60; r++) {
      const ev = B._bassEvents.call(stub, ch, s.progression.length * 4, s.style, false, 4, "four", colour);
      const q = ev.filter((e) => e.beat % 1 === 0);
      for (let i = 1; i < q.length; i++) {
        const d = Math.abs(q[i].midi - q[i - 1].midi);
        tot++;
        hist.set(d, (hist.get(d) ?? 0) + 1);
        if (d === 0) rep++;
        else if (d <= 2) step++;
        else if (d <= 5) skip++;
        else leap++;
      }
      for (const c of ch) {
        const hit = ev.find((e) => Math.abs(e.beat - c.startBeat) < 1e-6);
        if (!hit) continue;
        chg++; if (hit.midi % 12 === c.info.bassPc) root++;
      }
    }
  }
  console.log(
    `   ${name.padEnd(6)} step ${pct(step, tot).padStart(6)} · skip(3–5) ${pct(skip, tot).padStart(6)} · leap(6+) ${pct(leap, tot).padStart(5)} · repeat ${pct(rep, tot).padStart(5)} · root on the change ${pct(root, chg)}`
  );
  if (name === "warm") {
    check(skip / tot > 0.18, `warm skips only ${pct(skip, tot)}`);
    check(step / tot > 0.5 && step / tot < 0.78, `warm step share ${pct(step, tot)} outside 50–78%`);
    check(rep / tot < 0.03, `warm repeats ${pct(rep, tot)}`);
    const rows = [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${pct(v, tot).replace(".0%", "%")}`);
    console.log(`          intervals  ${rows.join(" ")}`);
  }
}
console.log("   (before: step 92.5% · skip 7.5% · leap 0% — the whole line was scalar)");

console.log("\nSTILL LEGAL — range, and the root still lands on the change");
{
  let out = 0, n = 0;
  for (const s of SONGS.slice(0, 120)) {
    const ch = flat(s);
    const ev = B._bassEvents.call(stub, ch, s.progression.length * (s.timeSignature ?? 4), s.style, ["bossa", "latin", "funk"].includes(s.style), s.timeSignature ?? 4, "four", 1);
    for (const e of ev) { n++; if (e.midi < 30 || e.midi > 52) out++; }
  }
  console.log(`   ${n} notes over 120 tunes · outside the instrument ${out}`);
  check(out === 0, `${out} bass notes outside F#1–E3`);
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
