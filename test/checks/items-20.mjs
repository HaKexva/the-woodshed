// item 20 (latin tumbao). Item 19 was reverted — the guitar rhythm pool and
// stretched chop read as wrong on the instrument; guitar-weight.mjs guards the
// restored part instead.
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

console.log("ITEM 20 — latin bass, tumbao vs the bossa line it used to borrow");
{
  const latin = SONGS.filter((s) => s.style === "latin" && (s.timeSignature ?? 4) === 4);
  console.log(`   ${latin.length} latin tunes in 4/4`);
  const s = latin[0];
  const ch = flat(s);
  const on = new Map();
  let ev = 0, downbeats = 0, chordStarts = 0, antic = 0, changes = 0;
  for (let r = 0; r < 80; r++) {
    const b = B._bassEvents.call(stub, ch, s.progression.length * 4, "latin", true, 4, "four", 1);
    ev += b.length;
    for (const e of b) on.set((e.beat % 4).toFixed(2), (on.get((e.beat % 4).toFixed(2)) ?? 0) + 1);
    // only where the harmony actually moves — a held chord has nothing to
    // announce, so counting it as a missed anticipation measures the songbook
    // rather than the generator
    ch.forEach((c, i) => {
      if (c.beats < 4) return;
      const prev = ch[(i - 1 + ch.length) % ch.length];
      if (prev.symbol === c.symbol || c.startBeat === 0) return;
      chordStarts++;
      if (b.some((e) => Math.abs(e.beat - c.startBeat) < 1e-6)) downbeats++;
      changes++;
      const hit = b.find((e) => Math.abs(e.beat - (c.startBeat - 0.5)) < 1e-6);
      if (hit && hit.midi % 12 === c.info.bassPc) antic++;
    });
  }
  const rows = [...on.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`   ${s.title} onsets  ${rows.map(([p, n]) => `${p}:${pct(n, ev)}`).join("  ")}`);
  console.log(`   notes/bar ${(ev / (s.progression.length * 80)).toFixed(2)}`);
  console.log(`   downbeat played on a full-bar chord: ${pct(downbeats, chordStarts)}   (bossa branch: 100%)`);
  console.log(`   chord anticipated on the & of 4 before it: ${pct(antic, changes)}`);
  check(downbeats / chordStarts < 0.55, `downbeat still played ${pct(downbeats, chordStarts)} of the time`);
  check(antic / changes > 0.5, `only ${pct(antic, changes)} of changes anticipated`);
  // no double attack of the tied note
  let dbl = 0;
  for (let r = 0; r < 40; r++) {
    const b = B._bassEvents.call(stub, ch, s.progression.length * 4, "latin", true, 4, "four", 1).sort((x, y) => x.beat - y.beat);
    for (let i = 1; i < b.length; i++) if (b[i].beat - b[i - 1].beat === 0.5 && b[i].midi === b[i - 1].midi) dbl++;
  }
  console.log(`   anticipation re-attacked on the downbeat: ${dbl} times in 40 choruses`);
  check(dbl === 0, `${dbl} re-attacks — the tie is not a tie`);
}

console.log("\nBOSSA UNCHANGED (it must not have inherited the tumbao)");
{
  const b = SONGS.find((s) => s.style === "bossa");
  const ch = flat(b);
  const ev = B._bassEvents.call(stub, ch, b.progression.length * 4, "bossa", true, 4, "four", 1);
  const on = [...new Set(ev.map((e) => (e.beat % 4).toFixed(2)))].sort();
  console.log(`   ${b.title} onsets ${on.join(", ")}`);
  check(on.includes("0.00"), "bossa lost its downbeat");
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
