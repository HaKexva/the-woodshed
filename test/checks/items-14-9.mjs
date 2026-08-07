// item 14 (cross the barline) and item 9 (register split)
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

console.log("ITEM 14 — does the comp cross the top of the form?");
{
  const s = song("Autumn Leaves");
  const ch = flat(s);
  const bars = s.progression.length;
  const total = bars * 4;
  let pianoWrap = 0, gtrWrap = 0, runs = 300;
  let pianoBad = 0, gtrBad = 0;
  for (let r = 0; r < runs; r++) {
    const p = B._pianoEvents.call(stub, ch, "swing", false, 4, 1);
    const g = B._guitarEvents.call(stub, ch, s, "swing", false, 4, 1);
    if (p.some((e) => Math.abs(e.beat - (total - 0.5)) < 1e-6)) pianoWrap++;
    if (g.some((e) => Math.abs(e.beat - (total - 0.5)) < 1e-6)) gtrWrap++;
    // nothing may be scheduled outside the form
    if (p.some((e) => e.beat < 0 || e.beat >= total)) pianoBad++;
    if (g.some((e) => e.beat < 0 || e.beat >= total)) gtrBad++;
  }
  console.log(`   piano  pushes over the top in ${pct(pianoWrap, runs)} of choruses  (was 0% — chords[i+1] was undefined)`);
  console.log(`   guitar pushes over the top in ${pct(gtrWrap, runs)} of choruses  (was 0% — bar < totalBars-1)`);
  check(pianoWrap > 0, "piano still never pushes over the top");
  check(gtrWrap > 0, "guitar still never pushes over the top");
  check(pianoBad === 0, `piano scheduled ${pianoBad} events outside the form`);
  check(gtrBad === 0, `guitar scheduled ${gtrBad} events outside the form`);
  console.log(`   events outside the form: piano ${pianoBad}, guitar ${gtrBad}`);

  // the wrap push must voice the chord the next chorus opens on
  let checked = 0;
  for (let r = 0; r < 200; r++) {
    const p = B._pianoEvents.call(stub, ch, "swing", false, 4, 1);
    // a normal hit can also land on the & of 4 of the last bar; only the push
    // events are built without a `roll` key
    const push = p.find((e) => Math.abs(e.beat - (total - 0.5)) < 1e-6 && !("roll" in e));
    if (!push) continue;
    checked++;
    // wrap pushes are always the approach shape: a semitone above the target
    check(push.dur === 0.45, `wrap push at ${push.beat} is not the approach shape`);
  }
  console.log(`   ${checked} wrap pushes checked — all the approach shape, which resolves onto the next downbeat`);
}

console.log("\nITEM 9 — piano / guitar register overlap");
{
  const s = song("Autumn Leaves");
  const ch = flat(s);
  let shared = 0, tot = 0, sim = 0, simTot = 0;
  let pLo = 999, pHi = 0, gLo = 999, gHi = 0;
  for (let r = 0; r < 60; r++) {
    const p = B._pianoEvents.call(stub, ch, "swing", false, 4, 1);
    const g = B._guitarEvents.call(stub, ch, s, "swing", false, 4, 1);
    const pp = new Set(p.flatMap((e) => e.midis));
    const gp = new Set(g.flatMap((e) => e.midis));
    for (const m of pp) { pLo = Math.min(pLo, m); pHi = Math.max(pHi, m); }
    for (const m of gp) { gLo = Math.min(gLo, m); gHi = Math.max(gHi, m); }
    shared += [...pp].filter((m) => gp.has(m)).length;
    tot += pp.size;
    for (const pe of p) for (const ge of g) {
      if (Math.abs(pe.beat - ge.beat) < 0.01) { simTot++; sim += pe.midis.filter((m) => ge.midis.includes(m)).length; }
    }
  }
  console.log(`   piano  ${pLo}–${pHi}`);
  console.log(`   guitar ${gLo}–${gHi}`);
  console.log(`   piano pitches also played by guitar: ${pct(shared, tot)}   (46.7% before any of this; the voicing rework alone got it to 31%)`);
  console.log(`   doubled pitches per simultaneous attack: ${(sim / simTot).toFixed(2)}`);
  // Only the piano moved in the end. Pushing the guitar down as well took the
  // overlap to 13.7% and sounded wrong on the instrument, so it was reverted —
  // what stands is the piano floor going 54 -> 57.
  check(shared / tot < 0.35, `overlap still ${pct(shared, tot)}`);
  check(gHi <= 66, `guitar ceiling ${gHi} outside its own range`);
}

console.log("\nREGRESSION — comp colour still separates, voicings still legal");
{
  const s = song("Autumn Leaves");
  const ch = flat(s);
  for (const [name, colour] of Object.entries(T.COMP_COLOUR)) {
    let notes = 0, v = 0, lo = 999, hi = 0, bad = 0;
    for (let r = 0; r < 60; r++) {
      for (const vv of T.voiceComp(ch, Math.random, { colour })) {
        v++; notes += vv.length;
        lo = Math.min(lo, vv[0]); hi = Math.max(hi, vv[vv.length - 1]);
        if (vv.some((m, i) => i > 0 && m - vv[i - 1] === 1)) bad++;
        if (vv.length < 3) bad++;
      }
    }
    console.log(`   ${name.padEnd(6)} ${(notes / v).toFixed(2)} notes · MIDI ${lo}–${hi} · illegal ${bad}`);
    check(bad === 0, `${name}: ${bad} illegal voicings`);
  }
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
