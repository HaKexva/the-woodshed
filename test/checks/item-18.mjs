// item 18 — the feel is a control, not a property of the tune
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

const FEELS = ["swing", "ballad", "blues", "modal", "bossa", "latin", "funk"];

console.log("1. THE GETTERS — a tune's style until something overrides it");
{
  const mk = (songStyle, override, songFeel) =>
    Object.assign(Object.create(B), {
      song: { style: songStyle, ...(songFeel ? { feel: songFeel } : {}) },
      feelOverride: override,
    });
  const cases = [
    ["swing tune, no override", mk("swing", null), "swing", false],
    ["bossa tune, no override", mk("bossa", null), "bossa", true],
    ["swing tune forced bossa", mk("swing", "bossa"), "bossa", true],
    ["bossa tune forced swing", mk("bossa", "swing"), "swing", false],
    ["latin tune forced ballad", mk("latin", "ballad"), "ballad", false],
    ["tune declaring its own feel", mk("swing", null, "straight"), "swing", true],
    ["declared feel loses to override", mk("swing", "latin", "swing"), "latin", true],
  ];
  for (const [label, b, wantFeel, wantStraight] of cases) {
    const gotFeel = Object.getOwnPropertyDescriptor(B, "feel").get.call(b);
    const gotStraight = Object.getOwnPropertyDescriptor(B, "straight").get.call(b);
    check(gotFeel === wantFeel, `${label}: feel ${gotFeel}, wanted ${wantFeel}`);
    check(gotStraight === wantStraight, `${label}: straight ${gotStraight}, wanted ${wantStraight}`);
  }
  console.log(`   ${cases.length} cases checked, including a tune that declares its own feel`);
}

console.log("\n2. EVERY FEEL REACHES EVERY GENERATOR");
{
  const s = song("Autumn Leaves"); // a plain swing tune
  const ch = flat(s);
  const bars = s.progression.length;
  console.log("   Autumn Leaves, played each way:");
  const sigs = new Map();
  for (const feel of FEELS) {
    const straight = ["bossa", "latin", "funk"].includes(feel);
    const stub = Object.assign(Object.create(B), {
      rideOn: true, compColour: 1, _chorus: 1, song: s, feelOverride: feel,
    });
    const p = B._pianoEvents.call(stub, ch, feel, straight, 4, 1);
    const g = B._guitarEvents.call(stub, ch, s, feel, straight, 4, 1);
    const b = B._bassEvents.call(stub, ch, bars * 4, feel, straight, 4, "four", 1);
    const d = B._drumEvents.call(stub, s, feel, straight, 4, { colour: 1, energy: 1 });
    const off = (evs) => [...new Set(evs.map((e) => (e.beat % 4).toFixed(2)))].sort().join(",");
    const sig = [off(p), off(g), off(b), d.filter((e) => e.drum === "rim").length > 0, off(d)].join("|");
    sigs.set(feel, sig);
    console.log(
      `     ${feel.padEnd(7)} piano ${(p.length / bars).toFixed(1)}/bar · gtr ${(g.length / bars).toFixed(1)} · bass ${(b.length / bars).toFixed(1)} · drums ${(d.length / bars).toFixed(1)}`
    );
  }
  const distinct = new Set(sigs.values()).size;
  console.log(`   distinct rhythmic signatures across the seven feels: ${distinct}/7`);
  check(distinct >= 6, `only ${distinct} of 7 feels produce a distinct part`);
}

console.log("\n3. THE DEAD BRANCHES ARE REACHABLE NOW");
{
  const byStyle = new Map();
  for (const s of SONGS) byStyle.set(s.style, (byStyle.get(s.style) ?? 0) + 1);
  console.log("   tunes tagged with each style, i.e. who could reach that branch before:");
  for (const f of FEELS) {
    const n = byStyle.get(f) ?? 0;
    console.log(`     ${f.padEnd(7)} ${String(n).padStart(3)} tunes  ${pct(n, SONGS.length).padStart(6)}  →  now all ${SONGS.length}`);
  }
  check((byStyle.get("blues") ?? 0) === 1, "the blues branch was not down to one tune");
}

console.log("\n4. THE DEFAULT IS UNCHANGED — auto must play what it always played");
{
  let differ = 0, n = 0;
  for (const s of SONGS.slice(0, 80)) {
    const bpb = s.timeSignature ?? 4;
    const ch = flat(s);
    const straight = ["bossa", "latin", "funk"].includes(s.style);
    const auto = Object.assign(Object.create(B), { rideOn: true, compColour: 1, _chorus: 1, song: s, feelOverride: null });
    const feel = Object.getOwnPropertyDescriptor(B, "feel").get.call(auto);
    const isStraight = Object.getOwnPropertyDescriptor(B, "straight").get.call(auto);
    n++;
    if (feel !== s.style || isStraight !== straight) differ++;
  }
  console.log(`   ${n} tunes: feel and straight resolve exactly as the old code did · differences ${differ}`);
  check(differ === 0, `${differ} tunes resolve differently under auto`);
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
