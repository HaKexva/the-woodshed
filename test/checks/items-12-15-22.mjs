// item 12 (per-chorus arrangement), 15 (drums answer the comp), 22 (odd meters)
import { Band } from "../../js/band.js";
import { setBpm } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";

const B = Band.prototype;
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);
const song = (t) => SONGS.find((x) => x.title === t);
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };
setBpm(140);

const mkBand = (chorus) => Object.assign(Object.create(B), { rideOn: true, compColour: 1, _chorus: chorus });

console.log("ITEM 12 — the per-chorus plan");
{
  const s = song("Autumn Leaves");
  const counts = {};
  const leads = new Map();
  let laidOutChoruses = 0, runs = 400;
  for (let r = 0; r < runs; r++) {
    const stub = mkBand(r % 4);
    const p = B._arrangement.call(stub, s, "swing", false);
    leads.set(p.lead, (leads.get(p.lead) ?? 0) + 1);
    if (p.layOut.piano.size || p.layOut.guitar.size) laidOutChoruses++;
    (counts[r % 4] ??= []).push(p.energy);
  }
  console.log(`   energy by chorus: ${[0, 1, 2, 3].map((c) => `${c}:${counts[c][0]}`).join("  ")}   (bwave was 0.92/1/1.1/0.82)`);
  console.log(`   lead: ${[...leads.entries()].map(([k, v]) => `${k} ${pct(v, runs)}`).join(" · ")}`);
  console.log(`   choruses where somebody sits out a whole phrase: ${pct(laidOutChoruses, runs)}`);
  check(new Set([0, 1, 2, 3].map((c) => counts[c][0])).size === 4, "energy is not distinct per chorus");

  // a lay-out must be contiguous bars, not scattered
  let scattered = 0, seen = 0;
  for (let r = 0; r < 200; r++) {
    const p = B._arrangement.call(mkBand(1 + (r % 3)), s, "swing", false);
    for (const who of ["piano", "guitar"]) {
      const bars = [...p.layOut[who]].sort((a, b) => a - b);
      if (!bars.length) continue;
      seen++;
      if (bars[bars.length - 1] - bars[0] + 1 !== bars.length) scattered++;
    }
  }
  console.log(`   lay-outs measured ${seen}, non-contiguous ${scattered}`);
  check(scattered === 0, `${scattered} lay-outs are scattered bars rather than a phrase`);
}

console.log("\n   what that does to the comp, per chorus");
{
  const s = song("Autumn Leaves");
  const ch = flat(s);
  const bars = s.progression.length;
  for (const chorus of [0, 1, 2, 3]) {
    let ev = 0, vel = 0, silent = 0, R = 60;
    for (let r = 0; r < R; r++) {
      const stub = mkBand(chorus);
      const plan = B._arrangement.call(stub, s, "swing", false);
      const raw = B._pianoEvents.call(stub, ch, "swing", false, 4, 1);
      const shaped = raw
        .filter((e) => !plan.layOut.piano.has(Math.floor(e.beat / 4)))
        .filter(() => Math.random() < 0.6 + 0.4 * plan.energy)
        .map((e) => ({ ...e, vel: Math.max(16, Math.round(e.vel + (plan.energy - 0.78) * 24)) }));
      ev += shaped.length;
      for (const e of shaped) vel += e.vel;
      const hit = new Set(shaped.map((e) => Math.floor(e.beat / 4)));
      silent += bars - hit.size;
    }
    console.log(`   chorus ${chorus}: ${(ev / (bars * 60)).toFixed(2)} piano attacks/bar · mean vel ${(vel / ev).toFixed(1)} · silent bars ${(silent / 60).toFixed(1)}/${bars}`);
  }
  console.log("   (before: every chorus 1.9 attacks/bar, velocity within 3.6, and never a silent bar)");
}

console.log("\nITEM 15 — does the drummer land on what the piano played?");
{
  const s = song("Autumn Leaves");
  const ch = flat(s);
  let onComp = 0, tot = 0, onCompBlind = 0, totBlind = 0;
  for (let r = 0; r < 120; r++) {
    const stub = mkBand(2);
    const piano = B._pianoEvents.call(stub, ch, "swing", false, 4, 1);
    const compBeats = piano.map((e) => e.beat);
    const set = new Set(compBeats.map((b) => b.toFixed(2)));
    const withComp = B._drumEvents.call(stub, s, "swing", false, 4, { colour: 1, energy: 1, compBeats });
    for (const e of withComp) {
      if (e.drum !== "snare" && e.drum !== "rim") continue;
      const off = e.beat % 4;
      if (off === 0 || off === 1 || off === 3) continue; // fills and backbeats
      tot++;
      if (set.has(e.beat.toFixed(2)) || set.has((e.beat - 0.5).toFixed(2))) onComp++;
    }
    const blind = B._drumEvents.call(stub, s, "swing", false, 4, { colour: 1, energy: 1 });
    for (const e of blind) {
      if (e.drum !== "snare" && e.drum !== "rim") continue;
      const off = e.beat % 4;
      if (off === 0 || off === 1 || off === 3) continue;
      totBlind++;
      if (set.has(e.beat.toFixed(2)) || set.has((e.beat - 0.5).toFixed(2))) onCompBlind++;
    }
  }
  console.log(`   comping hits that reinforce or answer the piano: ${pct(onComp, tot)}`);
  console.log(`   the same drummer given no comp to listen to:      ${pct(onCompBlind, totBlind)}`);
  check(onComp / tot > onCompBlind / totBlind + 0.15, `only ${pct(onComp, tot)} vs ${pct(onCompBlind, totBlind)} by chance`);
}

console.log("\nITEM 22 — odd meters");
{
  for (const title of ["Bluesette", "Take Five"]) {
    const s = song(title);
    if (!s) { console.log(`   (${title} missing)`); continue; }
    const bpb = s.timeSignature ?? 4;
    const ch = flat(s);
    const stub = mkBand(2);
    const drums = B._drumEvents.call(stub, s, s.style, false, bpb, { colour: 1, energy: 1 });
    const piano = B._pianoEvents.call(stub, ch, s.style, false, bpb, 1);
    const bass = B._bassEvents.call(stub, ch, s.progression.length * bpb, s.style, false, bpb, "four", 1);
    const at = (evs, f) => [...new Set(evs.filter(f ?? (() => true)).map((e) => ((e.beat % bpb) + bpb) % bpb))].sort((a, b) => a - b);
    console.log(`   ${title} (${bpb}/4)`);
    console.log(`     ride   ${at(drums, (e) => e.drum === "ride").join(", ")}`);
    console.log(`     hat    ${at(drums, (e) => e.drum === "hat").join(", ")}`);
    console.log(`     piano  ${at(piano).join(", ")}`);
    console.log(`     bass   ${at(bass).join(", ")}`);
    const rideAt = at(drums, (e) => e.drum === "ride");
    check(rideAt.some((o) => o >= bpb - 1), `${title}: ride never reaches the last beat`);
    check(rideAt.some((o) => o % 1 !== 0), `${title}: ride has no skip note`);
    const pianoAt = at(piano);
    check(pianoAt.some((o) => o >= bpb - 1.5), `${title}: piano never plays the tail of the bar`);
  }
  // six, which has no dedicated pool
  const six = SONGS.find((s) => (s.timeSignature ?? 4) === 6);
  if (six) {
    const drums = B._drumEvents.call(mkBand(1), six, six.style, false, 6, { colour: 1, energy: 1 });
    const rideAt = [...new Set(drums.filter((e) => e.drum === "ride").map((e) => e.beat % 6))].sort((a, b) => a - b);
    console.log(`   ${six.title} (6/4) ride ${rideAt.join(", ")}`);
    check(rideAt.some((o) => o >= 5), `${six.title}: ride stops before the bar does`);
  }
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
