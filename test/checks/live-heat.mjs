// Live mode: what the room does to the arrangement.
//
// The microphone half of this cannot be checked here — it needs a device and a
// room. What can be checked is the half that matters to the band: that heat
// replaces the written four-chorus arc, that it spans the same range the arc
// spans so nothing downstream sees a number it has never seen before, and that
// the range is wide enough to hear once it reaches the drums.
import { Band } from "../../js/band.js";
import { quietWindowMs, NoteMeter } from "../../js/listen.js";
import { setBpm, setNow, getTransport } from "../stubs/tone.js";
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
  // A stand-in clock: the band reads Tone.now() to decide whether the phrase
  // it took is over — a moment, not a tick, so a takeover armed near the loop
  // point still ends — and the stub's clock does not move on its own.
  setBpm(120);
  setNow(0);
  const stub = Object.assign(Object.create(B), {
    rideOn: true, compColour: 1, playing: false, paused: false,
    song, _songCtx: { bpb: 4 }, liveHeat: null,
  });

  stub.setLiveHeat(0.2);            // a player barely there
  check(stub.heatNow === 0.2, `heat is ${stub.heatNow}, not the room's 0.2`);

  stub.setRoomQuiet(true);          // and now not there at all
  check(stub.heatNow === 0.9, `the band did not take the floor: ${stub.heatNow}`);
  const secPerBar = 2; // four beats at 120
  console.log(`   took the floor for ${stub._takeOverUntil / secPerBar} bars at 0.9`);
  check(stub._takeOverUntil / secPerBar === 8, "a 32-bar form did not get eight bars");

  setNow(stub._takeOverUntil + 0.01); // the phrase is over
  check(stub.heatNow === 0.5, `the band did not settle: ${stub.heatNow}`);

  stub.setRoomQuiet(false);          // the player is back
  check(stub.heatNow === 0.2, `the room did not get it back: ${stub.heatNow}`);
  setNow(0);
}

console.log("\nTHE SHORT FORM — a boundary past the loop point belongs to the loop point");
{
  // A 15-bar form with a two-bar count-in loops over ticks that stop one bar
  // short of the next four-bar multiple. A rebuild aimed there would build a
  // generation gated to a window that never opens — while the wrap closes the
  // one that was sounding. The band went silent at the end of every chorus.
  setBpm(120);
  setNow(0);
  const t = getTransport();
  const barTicks = t.PPQ * 4;
  const built = [];
  const stub = Object.assign(Object.create(B), {
    liveResponse: "phrase",
    song: { progression: new Array(15).fill("C") },
    _songCtx: { bpb: 4 },
    _countBars: 2,
    _buildParts: (song, plan, handAt) => built.push(handAt),
  });

  // bar 5 of the form: the next boundary is the form's own bar 8, three bars on
  t.ticks = (2 + 5) * barTicks;
  stub._liveRebuild();
  check(built.length === 1, "a mid-form rebuild did not build");
  console.log(`   from bar 5, hand-over lands ${f(built[0] / 2, 1)} bars on`);
  check(Math.abs(built[0] - 6) < 0.01, `hand-over aimed ${f(built[0] ?? -1)}s out — not the form's own phrase`);

  // the last bar: the next four-bar multiple is past the loop point
  t.ticks = Math.round((2 + 14.5) * barTicks);
  stub._liveRebuild();
  check(built.length === 1, "a boundary past the loop point still built a generation");
  t.ticks = 0;
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

console.log("\nTHE GENERATED SOLOIST — the same ear, fed notes instead of air");
{
  const quiets = [];
  const m = new NoteMeter({ barMs: () => 2000, active: () => true, onQuiet: (q) => quiets.push(q) });
  m.stop(); // drive the clock by hand instead
  let now = 0;
  for (; now < 4000; now += 250) m.note(96, now); // two bars of busy eighths at 120
  const busy = m.heat;
  console.log(`   two busy bars  →  heat ${f(busy)}`);
  check(busy > 0.5, `a busy line only reached ${f(busy)}`);
  check(m.quiet === false, "playing did not clear the quiet state");
  for (; now < 8300; now += 100) m._tick(now); // then the line lays out
  console.log(`   two bars' rest →  heat ${f(m.heat)}, quiet ${m.quiet}`);
  check(m.quiet === true, "a two-bar rest did not read as laying out");
  check(m.heat < busy - 0.2, "heat did not fall through the rest");
  check(quiets.join() === "false,true", `quiet flips were ${quiets.join()}`);
}

console.log();
console.log(fail ? `FAILURES: ${fail}` : "the room drives the arrangement, over the arc's own range");
process.exit(fail ? 1 : 0);
