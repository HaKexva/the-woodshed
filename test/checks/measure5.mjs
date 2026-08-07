// items 3 (ride weights) and 8 (two-feel), before/after
import { Band } from "../../js/band.js";
import { setBpm } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true });
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const song = (t) => SONGS.find((x) => x.title === t);
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };

console.log("ITEM 3 — RIDE, across tempos (30 choruses each)");
for (const bpm of [70, 88, 100, 140, 200, 260]) {
  setBpm(bpm);
  const s = song("Autumn Leaves");
  let bars = 0, skipBars = 0, ride = 0, hat = 0, kick = 0, snare = 0;
  for (let c = 0; c < 30; c++) {
    const ev = B._drumEvents.call(stub, s, "swing", false, 4, {});
    const byBar = new Map();
    for (const e of ev) {
      const b = Math.floor(e.beat / 4);
      if (!byBar.has(b)) byBar.set(b, []);
      byBar.get(b).push(e);
      if (e.drum === "ride") ride++;
      if (e.drum === "hat") hat++;
      if (e.drum === "kick") kick++;
      if (e.drum === "snare") snare++;
    }
    for (const [, evs] of byBar) { bars++; if (evs.some((e) => e.drum === "ride" && e.beat % 1 !== 0)) skipBars++; }
  }
  console.log(
    `   ${String(bpm).padStart(3)} bpm  skip-note bars ${pct(skipBars, bars).padStart(6)}  ` +
    `ride ${(ride / bars).toFixed(2)}/bar  hat ${(hat / bars).toFixed(2)}  kick ${(kick / bars).toFixed(2)}  snare ${(snare / bars).toFixed(2)}`
  );
  if (bpm >= 100) check(skipBars / bars > 0.55, `${bpm} bpm: skip bars ${pct(skipBars, bars)} below target`);
  if (bpm === 70) check(skipBars / bars > 0.55, `70 bpm still gated: ${pct(skipBars, bars)}`);
}
setBpm(120);
console.log("   (was: ~30% at every tempo above 95 bpm, and 0% below it)");

console.log("\nITEM 8 — TWO-FEEL bass, one chorus of Autumn Leaves");
{
  const s = song("Autumn Leaves");
  const chords = flat(s);
  for (const feel of ["four", "two"]) {
    let notes = 0, onBeat = new Map(), rootOnChange = 0, changes = 0;
    for (let r = 0; r < 30; r++) {
      const ev = B._bassEvents.call(stub, chords, s.progression.length * 4, "swing", false, 4, feel);
      notes += ev.length;
      for (const e of ev) { const p = (e.beat % 4).toFixed(2); onBeat.set(p, (onBeat.get(p) ?? 0) + 1); }
      for (const c of chords) {
        const hit = ev.find((e) => Math.abs(e.beat - c.startBeat) < 1e-6);
        if (!hit) continue;
        changes++;
        if (hit.midi % 12 === c.info.bassPc) rootOnChange++;
      }
    }
    const rows = [...onBeat.entries()].sort((a, b) => a[0] - b[0]);
    console.log(`   ${feel.padEnd(5)} ${(notes / (s.progression.length * 30)).toFixed(2)} notes/bar · root on the change ${pct(rootOnChange, changes)}`);
    console.log(`         ${rows.map(([p, n]) => `${p}:${pct(n, notes)}`).join("  ")}`);
  }
  // a two-feel must still put a note on every chord change
  const chordsHit = [];
  for (let r = 0; r < 30; r++) {
    const ev = B._bassEvents.call(stub, chords, s.progression.length * 4, "swing", false, 4, "two");
    for (const c of chords) chordsHit.push(ev.some((e) => Math.abs(e.beat - c.startBeat) < 1e-6));
  }
  check(chordsHit.every(Boolean), "two-feel misses a chord change");
  console.log(`   every chord change gets a bass note in two: ${chordsHit.every(Boolean)}`);
}

console.log("\nITEM 8 — DRUMS follow the bass feel");
{
  const s = song("Autumn Leaves");
  for (const bassFeel of ["four", "two"]) {
    let bars = 0, kick = 0, snare = 0, skipBars = 0;
    for (let c = 0; c < 40; c++) {
      const ev = B._drumEvents.call(stub, s, "swing", false, 4, { bassFeel });
      const byBar = new Map();
      for (const e of ev) {
        const b = Math.floor(e.beat / 4);
        if (!byBar.has(b)) byBar.set(b, []);
        byBar.get(b).push(e);
        if (e.drum === "kick") kick++;
        if (e.drum === "snare") snare++;
      }
      for (const [, evs] of byBar) { bars++; if (evs.some((e) => e.drum === "ride" && e.beat % 1 !== 0)) skipBars++; }
    }
    console.log(`   bass in ${bassFeel.padEnd(5)} → kick ${(kick / bars).toFixed(2)}/bar · snare ${(snare / bars).toFixed(2)} · skip-note bars ${pct(skipBars, bars)}`);
  }
}

console.log("\nOTHER STYLES UNTOUCHED (feel must not leak)");
{
  for (const [title, style, straight] of [["Adam's Apple", "funk", true], ["Blue Monk", "blues", false], ["So What", "modal", false]]) {
    const s = song(title); if (!s) continue;
    const chords = flat(s);
    const a = B._bassEvents.call(stub, chords, s.progression.length * 4, style, straight, 4, "four").length;
    const b = B._bassEvents.call(stub, chords, s.progression.length * 4, style, straight, 4, "two").length;
    const walks = !straight && style !== "ballad";
    console.log(`   ${title.padEnd(14)} (${style}) four=${a} notes  two=${b} notes  ${walks ? "walks → two-feel applies" : "own line → feel must not reach it"}`);
    if (!walks) {
      // These branches pick their riff shape at random, so counts differ run to
      // run whatever the feel is. What must hold is that neither call produces
      // a *two-feel* — half notes on 1 and 3 and nothing else.
      for (const f of ["four", "two"]) {
        const ev = B._bassEvents.call(stub, chords, s.progression.length * 4, style, straight, 4, f);
        const offs = new Set(ev.map((e) => (e.beat % 4).toFixed(2)));
        const twoShaped = ev.length / s.progression.length < 2.5 && [...offs].every((o) => o === "0.00" || o === "2.00");
        check(!twoShaped, `${title}: feel="${f}" produced a two-feel in a style that owns its own line`);
      }
    }
  }
  // ballad
  const bal = SONGS.find((s) => s.style === "ballad");
  const bc = flat(bal);
  const x = B._bassEvents.call(stub, bc, bal.progression.length * 4, "ballad", false, 4, "four").length;
  const y = B._bassEvents.call(stub, bc, bal.progression.length * 4, "ballad", false, 4, "two").length;
  check(x === y, "ballad bass changed with the feel");
  console.log(`   ${bal.title.padEnd(14)} (ballad) four=${x} two=${y}`);
}

console.log("\nPER-CHORUS SCHEDULE the buildParts rule produces");
{
  const rule = (chorus, r) => (!chorus || (chorus % 4 === 3 && r < 0.6) ? "two" : "four");
  console.log("   chorus:  " + [0, 1, 2, 3, 4, 5, 6, 7].map((c) => String(c).padStart(5)).join(""));
  console.log("   feel:    " + [0, 1, 2, 3, 4, 5, 6, 7].map((c) => rule(c, 0.3).padStart(5)).join(""));
  console.log("   (chorus 3 and 7 are the quiet ones of the four-chorus wave; they take two 60% of the time)");
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
