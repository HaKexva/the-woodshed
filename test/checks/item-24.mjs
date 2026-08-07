// Item 24: generation moves a chorus early; only scheduling lands on the loop
// point. Measures what the wrap actually costs, planned vs unplanned.
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";
import { clearParts } from "../stubs/tone.js";

const band = new Band({});
band.parts = [];
band.gains = {};
band.ctx = { currentTime: 0 };
band.soloOn = true; // the expensive case
band._countBars = 2;

const titles = ["'Round Midnight", "26-2", "All the Things You Are", "Cherokee", "Blue Bossa"];
const fail = [];

const ms = (fn, n) => {
  for (let i = 0; i < 8; i++) fn(i); // warm up
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn(i);
  return Number(process.hrtime.bigint() - t0) / 1e6 / n;
};

let oldTotal = 0, newTotal = 0;
console.log("cost at the loop point, ms per wrap (soloist on):");
for (const title of titles) {
  const song = SONGS.find((s) => s.title.includes(title.replace("'", "")));
  if (!song) { fail.push(`${title}: not found`); continue; }
  band.song = song;

  // before: the wrap generated and scheduled
  const whole = ms((i) => { band._chorus = i; band._heldLine = null; clearParts(); band._buildParts(song); }, 60);
  // after: the wrap only schedules a plan made mid-chorus
  const sched = ms((i) => {
    band._chorus = i; band._heldLine = null;
    const plan = band._planChorus(song);
    clearParts();
    band._buildParts(song, plan);
  }, 60);
  // the scheduling half alone — plan built outside the timed region
  const plans = [];
  for (let i = 0; i < 68; i++) { band._chorus = i; band._heldLine = null; plans.push(band._planChorus(song)); }
  let k = 0;
  const onlySched = ms(() => { clearParts(); band._buildParts(song, plans[k++ % plans.length]); }, 60);

  oldTotal += whole; newTotal += onlySched;
  console.log(
    `  ${title.padEnd(24)} was ${whole.toFixed(2).padStart(5)}  ·  now ${onlySched.toFixed(2).padStart(5)}  ·  ` +
    `${((1 - onlySched / whole) * 100).toFixed(0)}% off the critical path`
  );
  void sched;
  if (!(onlySched < whole)) fail.push(`${title}: scheduling alone (${onlySched.toFixed(2)}) is not cheaper than generate+schedule (${whole.toFixed(2)})`);
}
console.log(`  ${"mean".padEnd(24)} was ${(oldTotal / titles.length).toFixed(2).padStart(5)}  ·  now ${(newTotal / titles.length).toFixed(2).padStart(5)}  ·  ${((1 - newTotal / oldTotal) * 100).toFixed(0)}% off the critical path`);

// --- behaviour must be unchanged ------------------------------------------
const song = SONGS.find((s) => s.title.includes("Round Midnight"));
band.song = song;

// a plan passed in is the one that gets scheduled
band._chorus = 3;
const plan = band._planChorus(song);
const pianoBeats = plan.ev.piano.map((e) => e.beat).join(",");
clearParts();
band._buildParts(song, plan);
if (plan.ev.piano.map((e) => e.beat).join(",") !== pianoBeats) fail.push("scheduling mutated the plan's events");

// a settings rebuild throws away a stale plan
band._nextPlan = band._planChorus(song);
band._buildParts(song);
if (band._nextPlan !== null) fail.push("a rebuild with no plan did not discard _nextPlan");

// switching the soloist discards it too
band.playing = false;
band._nextPlan = band._planChorus(song);
band.setSolo(false);
if (band._nextPlan !== null) fail.push("setSolo did not discard _nextPlan");
band.setSolo(true);

// planning ahead must not disturb the chorus counter
band._chorus = 7;
band._planChorus(song);
if (band._chorus !== 7) fail.push(`_planChorus moved the chorus counter to ${band._chorus}`);

console.log(fail.length ? `\nFAIL\n  ${fail.join("\n  ")}` : "\nall checks pass");
process.exit(fail.length ? 1 : 0);
