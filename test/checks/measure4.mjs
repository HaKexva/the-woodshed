// after-the-change measurements for the voice-led comp voicings
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";
import { parseChord, pianoVoicings, voiceComp } from "../../js/theory.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true });
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const song = (t) => SONGS.find((s) => s.title === t);
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log(`   ✗ ${msg}`); } };

console.log("1. STRUCTURAL INVARIANTS over every distinct chord in the songbook");
{
  const syms = new Set();
  for (const s of SONGS) for (const bar of s.progression) for (const c of bar) syms.add(c.chord);
  let shapes = 0, minN = 99, maxSpan = 0, clusters = 0, small = 0;
  for (const sym of syms) {
    const info = parseChord(sym);
    const cands = pianoVoicings(info).map((x) => x.ivs);
    shapes += cands.length;
    check(cands.length >= 1, `${sym}: no candidate shapes`);
    for (const ivs of cands) {
      check(ivs.every((n, i) => i === 0 || n > ivs[i - 1]), `${sym}: stack not ascending`);
      if (ivs.some((n, i) => i > 0 && n - ivs[i - 1] === 1)) clusters++;
      minN = Math.min(minN, ivs.length);
      maxSpan = Math.max(maxSpan, ivs.at(-1) - ivs[0]);
      if (ivs.length < 3) small++;
    }
  }
  console.log(`   ${syms.size} distinct symbols · ${(shapes / syms.size).toFixed(1)} candidate shapes each`);
  console.log(`   semitone clusters: ${clusters}   (was 12 chords with no alternative)`);
  console.log(`   voicings under 3 notes: ${small}   (was 84 symbols, always)`);
  console.log(`   smallest voicing ${minN} notes · widest span ${maxSpan} semitones`);
}

console.log("\n2. PLACEMENT — every note in range, on a full-songbook pass");
{
  let lo = 999, hi = 0, n = 0, bad = 0;
  for (const s of SONGS) {
    for (const v of voiceComp(flat(s), Math.random)) {
      n++;
      lo = Math.min(lo, v[0]); hi = Math.max(hi, v.at(-1));
      if (v.some((m, i) => i > 0 && m - v[i - 1] === 1)) bad++;
      check(v.length >= 3, `voicing with ${v.length} notes`);
    }
  }
  console.log(`   ${n} voicings across ${SONGS.length} tunes · MIDI ${lo}–${hi}`);
  console.log(`   voicings containing a semitone: ${bad} (${pct(bad, n)})`);
}

console.log("\n3. TOP-VOICE VARIETY — the number that was 0.19");
{
  let tot = 0, n = 0;
  const eg = [];
  for (const s of SONGS) {
    const tops = voiceComp(flat(s), Math.random).map((v) => v.at(-1));
    tot += new Set(tops).size / tops.length; n++;
    if (["Autumn Leaves", "So What", "Impressions", "Blue Monk", "26-2"].includes(s.title))
      eg.push(`${s.title} ${new Set(tops).size}/${tops.length}`);
  }
  console.log(`   mean distinct top notes / chords: ${(tot / n).toFixed(2)}   (was 0.19)`);
  console.log(`   ${eg.join(" · ")}`);
  console.log(`   (was: Autumn Leaves 5/35 · So What 2/32 · Impressions 2/32 · Blue Monk 3/12)`);
}

console.log("\n4. VOICE LEADING — top-voice motion between consecutive chords");
{
  for (const title of ["Autumn Leaves", "26-2", "So What"]) {
    const s = song(title); if (!s) continue;
    let moves = [], leaps = 0;
    for (let take = 0; take < 40; take++) {
      const vs = voiceComp(flat(s), Math.random);
      for (let i = 1; i < vs.length; i++) {
        const d = Math.abs(vs[i].at(-1) - vs[i - 1].at(-1));
        moves.push(d);
        if (d > 4) leaps++;
      }
    }
    const avg = moves.reduce((a, b) => a + b, 0) / moves.length;
    console.log(`   ${title.padEnd(16)} avg top move ${avg.toFixed(2)} st · >4st in ${pct(leaps, moves.length)}`);
  }
  console.log(`   (was: Autumn Leaves 2.48 / 3.4% · 26-2 2.77 / 19.3% · So What 0 — it never moved)`);
}

console.log("\n5. CHORUS TO CHORUS — is the comp's top line still identical every time?");
{
  for (const title of ["Autumn Leaves", "So What"]) {
    const s = song(title);
    const lines = [];
    for (let c = 0; c < 6; c++) lines.push(voiceComp(flat(s), Math.random).map((v) => v.at(-1)).join(","));
    console.log(`   ${title.padEnd(16)} ${new Set(lines).size} distinct top lines over 6 choruses   (was 1)`);
  }
}

console.log("\n6. THE ANTICIPATION STILL MATCHES THE CHORD IT LANDS ON");
{
  // An anticipation *replaces* the next downbeat, so there is no event on the
  // change to compare against; what must match is the next chord's own events.
  const s = song("Autumn Leaves");
  const chords = flat(s);
  let checked = 0, approaches = 0;
  for (let take = 0; take < 40; take++) {
    const ev = B._pianoEvents.call(stub, chords, "swing", false, 4);
    for (let i = 0; i < chords.length - 1; i++) {
      const pushBeat = chords[i + 1].startBeat - 0.5;
      const push = ev.find((e) => Math.abs(e.beat - pushBeat) < 1e-6 && (e.dur === 0.9 || e.dur === 0.45));
      if (!push) continue;
      const end = chords[i + 2]?.startBeat ?? s.progression.length * 4;
      // skip the next chord's own anticipation — that one voices the chord after
      const own = ev.find((e) => e.beat >= chords[i + 1].startBeat && e.beat < end - 0.5);
      if (!own) continue;
      if (push.dur === 0.45) {
        approaches++;
        check(
          push.midis.join() === own.midis.map((m) => m + 1).join(),
          `chromatic approach at ${pushBeat} is not a semitone above the shape it resolves to`
        );
      } else {
        checked++;
        check(push.midis.join() === own.midis.join(), `anticipation at ${pushBeat} voices a different shape than the chord it announces`);
      }
    }
  }
  console.log(`   ${checked} anticipations and ${approaches} chromatic approaches compared`);
}

console.log("\n7. PIANO / GUITAR COLLISION — did the new register help or hurt?");
{
  const s = song("Autumn Leaves");
  let shared = 0, tot = 0;
  for (let t = 0; t < 20; t++) {
    const chords = flat(s);
    const p = B._pianoEvents.call(stub, chords, "swing", false, 4);
    const g = B._guitarEvents.call(stub, chords, s, "swing", false, 4);
    const gp = new Set(g.flatMap((e) => e.midis));
    const pp = new Set(p.flatMap((e) => e.midis));
    shared += [...pp].filter((m) => gp.has(m)).length;
    tot += pp.size;
  }
  console.log(`   piano pitches also played by guitar: ${pct(shared, tot)}   (was 7/15 = 46.7%)`);
}

console.log("\n8. RHYTHM UNCHANGED (the change is pitch only)");
{
  const s = song("Autumn Leaves");
  const acc = [];
  for (let c = 0; c < 8; c++) acc.push(...B._pianoEvents.call(stub, flat(s), "swing", false, 4).map((e) => (e.beat % 4).toFixed(2)));
  const m = new Map();
  for (const x of acc) m.set(x, (m.get(x) ?? 0) + 1);
  console.log(`   n=${acc.length} positions=${m.size}  ${[...m.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}:${pct(n, acc.length)}`).join(" ")}`);
  console.log(`   (was n=527 positions=7  0:16.3% 0.5:17.8% 1.5:17.1% 2:5.3% 2.5:13.5% 3:8.7% 3.5:21.3%)`);
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all invariants hold"}`);
