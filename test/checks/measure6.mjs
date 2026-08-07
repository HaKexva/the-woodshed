// drum feedback: no sub-8th snare runs in the swing family, more cross-stick
import { Band } from "../../js/band.js";
import { setBpm } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true });
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const song = (t) => SONGS.find((x) => x.title === t);
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };

console.log("SUB-8TH CONTENT in the swing family (any onset off the 0.5 grid)");
for (const bpm of [80, 120, 180, 240]) {
  setBpm(bpm);
  const bad = new Map();
  let ev = 0;
  for (const title of ["Autumn Leaves", "Blue Monk", "So What", "Bluesette"]) {
    const s = song(title); if (!s) continue;
    for (let c = 0; c < 60; c++) {
      for (const e of B._drumEvents.call(stub, s, s.style, false, s.timeSignature ?? 4, {})) {
        ev++;
        const frac = Math.round((e.beat % 1) * 1000) / 1000;
        if (frac !== 0 && frac !== 0.5) bad.set(frac, (bad.get(frac) ?? 0) + 1);
      }
    }
  }
  const rows = [...bad.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`   ${String(bpm).padStart(3)} bpm  ${ev} events · off-grid ${[...bad.values()].reduce((a, b) => a + b, 0)}  ${rows.map(([f, n]) => `${f}:${n}`).join(" ") || "(none)"}`);
  // only the triplet figure may remain: .33 / .67
  const illegal = rows.filter(([f]) => ![0.333, 0.667, 0.33, 0.67].includes(f));
  check(illegal.length === 0, `${bpm} bpm: sub-8th onsets remain at ${illegal.map(([f]) => f).join(", ")}`);
}
setBpm(140);

console.log("\nSTICK CLICKS — rim hits per bar, swing family");
{
  const s = song("Autumn Leaves");
  for (const bassFeel of ["four", "two"]) {
    let bars = 0, rim = 0, snare = 0, rimBars = 0;
    for (let c = 0; c < 60; c++) {
      const ev = B._drumEvents.call(stub, s, "swing", false, 4, { bassFeel });
      const byBar = new Map();
      for (const e of ev) {
        const b = Math.floor(e.beat / 4);
        if (!byBar.has(b)) byBar.set(b, []);
        byBar.get(b).push(e);
        if (e.drum === "rim") rim++;
        if (e.drum === "snare") snare++;
      }
      for (const [, evs] of byBar) { bars++; if (evs.some((e) => e.drum === "rim")) rimBars++; }
    }
    console.log(`   bass in ${bassFeel.padEnd(5)} → rim ${(rim / bars).toFixed(2)}/bar · snare ${(snare / bars).toFixed(2)}/bar · bars with a click ${pct(rimBars, bars)}`);
  }
  console.log("   (before: rim 0.02/bar in swing — it only appeared in two fill figures)");
}

console.log("\nOTHER STYLES UNCHANGED (funk 16ths, bossa/latin clave must survive)");
{
  for (const [title, style, straight] of [["Adam's Apple", "funk", true], ["Blue Bossa", "latin", true]]) {
    const s = song(title); if (!s) { console.log(`   (${title} not in songbook)`); continue; }
    const ev = B._drumEvents.call(stub, s, style, straight, 4, {});
    const offs = new Set(ev.map((e) => Math.round((e.beat % 1) * 100) / 100));
    const rim = ev.filter((e) => e.drum === "rim").length;
    console.log(`   ${title.padEnd(14)} (${style}) onsets ${[...offs].sort().join(", ")} · rim ${rim}`);
    if (style === "funk") check([...offs].some((o) => o === 0.25 || o === 0.75), "funk lost its 16th ghost notes");
  }
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
