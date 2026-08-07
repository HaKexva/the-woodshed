// item 13 — the form model
import { Band, formSections } from "../../js/band.js";
import { setBpm } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true, compColour: 1 });
const song = (t) => SONGS.find((x) => x.title === t);
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };
setBpm(140);

const oldEnds = (bars) => { const s = new Set(); for (let b = 0; b < bars; b++) if (b % 8 === 7 || b === bars - 1) s.add(b); return s; };
const newEnds = (s) => new Set(formSections(s).map((x) => x.start + x.bars - 1));

console.log("A. SECTION LAYOUT — a sample of forms, bar numbers 1-indexed");
for (const t of ["Blue Monk", "Autumn Leaves", "Afro Centric", "So What", "26-2", "Bluesette", "Take Five"]) {
  const s = song(t); if (!s) continue;
  const secs = formSections(s);
  const was = [...oldEnds(s.progression.length)].map((b) => b + 1).join(",");
  const now = [...newEnds(s)].map((b) => b + 1).join(",");
  console.log(`   ${t.padEnd(16)} ${String(s.progression.length).padStart(2)} bars → ${secs.map((x) => x.bars).join("/")}`);
  console.log(`   ${"".padEnd(16)}    fills at ${now}   (was ${was})`);
}

console.log("\nB. INVARIANTS over the whole songbook");
{
  let bad = 0, changed = 0, shortTail = 0;
  for (const s of SONGS) {
    const bars = s.progression.length;
    const secs = formSections(s);
    const sum = secs.reduce((a, x) => a + x.bars, 0);
    check(sum === bars, `${s.title}: sections sum to ${sum}, form is ${bars}`);
    if (sum !== bars) bad++;
    // contiguous, no gaps or overlaps
    let at = 0;
    for (const x of secs) { if (x.start !== at) { bad++; check(false, `${s.title}: gap at ${x.start}`); } at += x.bars; }
    if (secs.some((x) => x.bars < 3)) shortTail++;
    const a = [...oldEnds(bars)].join(","), b = [...newEnds(s)].join(",");
    if (a !== b) changed++;
  }
  console.log(`   ${SONGS.length} tunes · malformed ${bad} · sections shorter than 3 bars ${shortTail}`);
  console.log(`   tunes whose fill positions moved: ${changed} (${pct(changed, SONGS.length)})`);
  check(shortTail === 0, `${shortTail} tunes got a section under 3 bars`);
}

console.log("\nC. DECLARED SECTIONS override the default");
{
  const s = { progression: Array.from({ length: 32 }, () => [{ chord: "C", beats: 4 }]), sections: [
    { label: "A", bars: 8 }, { label: "A", bars: 8 }, { label: "B", bars: 8 }, { label: "A", bars: 8 },
  ] };
  const secs = formSections(s);
  console.log(`   declared AABA → ${secs.map((x) => `${x.label}${x.bars}`).join(" ")}`);
  check(secs.map((x) => x.label).join("") === "AABA", "labels lost");
  // a declaration that under-covers gets a tail
  const t = { progression: Array.from({ length: 20 }, () => [{ chord: "C", beats: 4 }]), sections: [{ label: "A", bars: 8 }] };
  const ts = formSections(t);
  console.log(`   declared 8 of 20 bars → ${ts.map((x) => `${x.label || "-"}${x.bars}`).join(" ")}`);
  check(ts.reduce((a, x) => a + x.bars, 0) === 20, "tail not added");
}

console.log("\nD. DRUMS actually fill at the new places (Blue Monk, 200 choruses)");
{
  const s = song("Blue Monk");
  const bars = s.progression.length;
  const hits = new Array(bars).fill(0);
  for (let r = 0; r < 200; r++) {
    const ev = B._drumEvents.call(stub, s, s.style, false, 4, {});
    for (let b = 0; b < bars; b++) {
      const inBar = ev.filter((e) => Math.floor(e.beat / 4) === b && (e.drum === "snare" || e.drum === "rim") && e.beat % 4 >= 2);
      if (inBar.length >= 2) hits[b]++;
    }
  }
  console.log(`   bar:      ${hits.map((_, i) => String(i + 1).padStart(4)).join("")}`);
  console.log(`   fill-ish: ${hits.map((h) => String(Math.round(h / 2)).padStart(4)).join("")}   (% of choruses)`);
  const phraseEnds = [3, 7, 11];
  const mid = [0, 1, 2, 4, 5, 6, 8, 9, 10];
  const avgEnd = phraseEnds.reduce((a, b) => a + hits[b], 0) / 3;
  const avgMid = mid.reduce((a, b) => a + hits[b], 0) / mid.length;
  console.log(`   mean at bars 4/8/12: ${(avgEnd / 2).toFixed(0)}%  ·  elsewhere: ${(avgMid / 2).toFixed(0)}%`);
  check(avgEnd > avgMid * 2, "phrase ends are not markedly busier than mid-phrase bars");
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
