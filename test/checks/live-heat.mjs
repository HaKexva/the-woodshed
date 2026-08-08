// Live mode: what the room does to the arrangement.
//
// The microphone half of this cannot be checked here — it needs a device and a
// room. What can be checked is the half that matters to the band: that heat
// replaces the written four-chorus arc, that it spans the same range the arc
// spans so nothing downstream sees a number it has never seen before, and that
// the range is wide enough to hear once it reaches the drums.
import { Band } from "../../js/band.js";
import { quietWindowMs } from "../../js/listen.js";
import { setBpm, getTransport } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";

const B = Band.prototype;
const song = SONGS.find((s) => s.title === "Autumn Leaves");
const f = (n, d = 2) => n.toFixed(d);
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };
setBpm(140);

const arrange = (liveHeat, chorus) =>
  B._arrangement.call(
    Object.assign(Object.create(B), { rideOn: true, compColour: 1, liveHeat, _chorus: chorus }),
    song,
    "swing",
    false
  );

console.log("THE WRITTEN ARC — what plays when nobody is listening");
{
  const wave = [0, 1, 2, 3].map((c) => arrange(null, c).energy);
  console.log(`   energy by chorus  ${wave.map((e) => f(e)).join("  ")}`);
  check(wave.join() === "0.55,0.78,1,0.5", `the arc moved: ${wave.join()}`);
}

console.log("\nTHE ROOM — heat replaces the arc, over the same range");
{
  const rows = [0, 0.25, 0.5, 0.75, 1].map((h) => [h, arrange(h, 0).energy]);
  for (const [h, e] of rows) console.log(`   heat ${f(h)}  →  energy ${f(e)}`);
  check(rows[0][1] === 0.5, "heat 0 is not the bottom of the arc's range");
  check(rows[4][1] === 1, "heat 1 is not the top of the arc's range");
  // and it is the room, not the chorus count, once live
  const sameAcrossChoruses = [0, 1, 2, 3].every((c) => arrange(0.6, c).energy === arrange(0.6, 0).energy);
  check(sameAcrossChoruses, "the arc is still moving underneath the room");
}

console.log("\nWHAT THAT BUYS — the drummer at the two ends of the range");
{
  const stub = Object.assign(Object.create(B), { rideOn: true, compColour: 1 });
  const bars = song.progression.length;
  const measure = (energy) => {
    let ev = 0, vel = 0, n = 0;
    for (let r = 0; r < 40; r++) {
      const dr = B._drumEvents.call(stub, song, "swing", false, 4, { colour: 1, energy });
      ev += dr.length;
      for (const e of dr) { vel += e.vel; n++; }
    }
    return { perBar: ev / (bars * 40), vel: vel / n };
  };
  const cold = measure(0.5);
  const hot = measure(1);
  console.log(`   heat 0 → ${f(cold.perBar)} hits/bar at ${f(cold.vel, 1)}`);
  console.log(`   heat 1 → ${f(hot.perBar)} hits/bar at ${f(hot.vel, 1)}`);
  check(hot.vel > cold.vel + 1, "the drummer plays the two ends at the same weight");
}

console.log("\nTHE FLOOR — what happens when the player stops");
{
  // A stand-in transport: the band reads ticks off it to decide whether the
  // phrase it took is over, and the stub's clock does not move on its own.
  setBpm(120);
  const t = getTransport();
  const stub = Object.assign(Object.create(B), {
    rideOn: true, compColour: 1, playing: false, paused: false,
    song, _songCtx: { bpb: 4 }, liveHeat: null,
  });

  stub.setLiveHeat(0.2);            // a player barely there
  check(stub.heatNow === 0.2, `heat is ${stub.heatNow}, not the room's 0.2`);

  const start = t.ticks;
  stub.setRoomQuiet(true);          // and now not there at all
  check(stub.heatNow === 0.9, `the band did not take the floor: ${stub.heatNow}`);
  const bars = (t.PPQ * 4);
  console.log(`   took the floor for ${(stub._takeOverUntil - start) / bars} bars at 0.9`);
  check((stub._takeOverUntil - start) / bars === 8, "a 32-bar form did not get eight bars");

  t.ticks = stub._takeOverUntil + 1; // the phrase is over
  check(stub.heatNow === 0.5, `the band did not settle: ${stub.heatNow}`);

  stub.setRoomQuiet(false);          // the player is back
  check(stub.heatNow === 0.2, `the room did not get it back: ${stub.heatNow}`);
  t.ticks = start;
}

console.log("\nTHE BREATH — the quiet window counts bars, not seconds");
{
  // Phrasing is in bars: a breath between phrases on a ballad outlasts a whole
  // bar on a burner, so the takeover waits two bars of the tune being played,
  // floored at the old fixed 1.5s (research/live-mode.md).
  check(quietWindowMs(null) === 1500, "no tune yet did not fall back to the floor");

  const stub = Object.assign(Object.create(B), { _songCtx: { bpb: 4 } });
  setBpm(90);
  console.log(`   90bpm in 4   →  bar ${f(stub.barMs, 0)}ms, window ${f(quietWindowMs(stub.barMs), 0)}ms`);
  check(Math.round(stub.barMs) === 2667, `a 90bpm bar is ${stub.barMs}ms`);
  check(quietWindowMs(stub.barMs) > stub.barMs, "one bar of ballad rest loses the floor");

  setBpm(120);
  check(quietWindowMs(stub.barMs) === 2 * stub.barMs, "the window is not two bars of the tune");

  // a burner can never make the band twitchier than the fixed value did
  setBpm(320);
  stub._songCtx = { bpb: 3 };
  console.log(`   320bpm in 3  →  bar ${f(stub.barMs, 0)}ms, window ${f(quietWindowMs(stub.barMs), 0)}ms`);
  check(quietWindowMs(stub.barMs) === 1500, "a fast waltz got under the floor");

  check(Object.assign(Object.create(B), {}).barMs === null, "barMs invented a bar with no tune");
  setBpm(120);
}

console.log();
console.log(fail ? `FAILURES: ${fail}` : "the room drives the arrangement, over the arc's own range");
process.exit(fail ? 1 : 0);
