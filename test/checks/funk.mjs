// Funk: what makes the rhythm section read as funk rather than as swing with
// the eighths straightened out.
//
// The feedback this answers came from a working keyboard player: the funk bass
// "should have more variation, not just walking", and the keys should be
// electric. Both are checked here in the only way they can be without ears —
// the shape of what the generators emit, and which instrument the style picks.
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true });
const song = (t) => SONGS.find((s) => s.title === t);
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);
const f = (n, d = 2) => n.toFixed(d);
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };

const measure = (title, choruses = 16) => {
  const s = song(title);
  const chords = flat(s);
  const bpb = s.timeSignature ?? 4;
  const bars = s.progression.length;
  const total = bars * bpb;
  let n = 0, ghosts = 0, dur = 0, sixteenths = 0, same = 0, pairs = 0, out = 0;
  for (let k = 0; k < choruses; k++) {
    const ev = B._bassEvents.call(stub, chords, total, "funk", true, bpb, "four", 1);
    const byBar = new Map();
    for (const e of ev) {
      n++;
      if (e.vel <= 24) ghosts++;
      dur += e.dur;
      if (e.beat < 0 || e.beat >= total || e.midi < 30 || e.midi > 52) out++;
      const bar = Math.floor(e.beat / bpb);
      const off = Math.round((e.beat - bar * bpb) * 4) / 4;
      if (off % 0.5 !== 0) sixteenths++;
      if (!byBar.has(bar)) byBar.set(bar, []);
      // the lean into a change lives on the last sixteenth; the figure is what
      // comes before it
      if (off < 3.75) byBar.get(bar).push(off);
    }
    for (let b = 1; b < bars; b++) {
      pairs++;
      if ((byBar.get(b - 1) ?? []).join() === (byBar.get(b) ?? []).join()) same++;
    }
  }
  return {
    perBar: n / choruses / bars, ghost: ghosts / n, dur: dur / n,
    six: sixteenths / n, rep: same / pairs, out,
  };
};

console.log("THE FIGURE — a funk bass repeats itself and leaves holes");
{
  // one chord per bar for four bars at a time: the case where a real bassist
  // plays the same thing four times and varies the fourth
  const m = measure("Watermelon Man");
  console.log(`   ${f(m.perBar)} notes/bar · ghosts ${f(100 * m.ghost, 1)}% · mean length ${f(m.dur)} beats`);
  console.log(`   off the eighth-note grid: ${f(100 * m.six, 1)}%   ·   bar repeats the bar before: ${f(100 * m.rep, 1)}%`);
  check(m.out === 0, `${m.out} notes outside the form or the instrument`);
  check(m.rep > 0.5, `the figure only held for ${f(100 * m.rep, 1)}% of bars — that is a line, not a riff`);
  check(m.rep < 0.95, "the figure never varies at all");
  check(m.six > 0.2, `only ${f(100 * m.six, 1)}% of notes are off the eighth grid`);
  check(m.ghost > 0.12, `ghost notes are ${f(100 * m.ghost, 1)}% of the line`);
  check(m.dur < 0.5, `mean note ${f(m.dur)} beats — the legato pass is gluing the holes shut`);
}

console.log("\nAGAINST THE WALK — the same tune, the same bars, in swing");
{
  const s = song("Watermelon Man");
  const chords = flat(s);
  const ev = B._bassEvents.call(stub, chords, 64, "swing", false, 4, "four", 1);
  const dur = ev.reduce((a, e) => a + e.dur, 0) / ev.length;
  console.log(`   walking: ${f(ev.length / 16)} notes/bar · mean length ${f(dur)} beats`);
  check(dur > 0.7, "the walking line stopped being legato — the shared pass moved");
}

console.log("\nTHE KEYBOARD — funk does not comp on a concert grand");
{
  const keys = Object.assign(Object.create(B), {
    grandOn: true, pianoGrand: "grand", pianoEP: "ep",
  });
  keys._lastStyle = "swing";
  keys._applyPiano();
  check(keys.piano === "grand", `swing comps on ${keys.piano}`);
  keys._lastStyle = "funk";
  keys._applyPiano();
  check(keys.piano === "ep", `funk comps on ${keys.piano}`);
  console.log("   swing → grand · funk → electric");

  // and the style switch is what moves it, not a reload
  const band = Object.assign(Object.create(B), {
    grandOn: true, pianoGrand: "grand", pianoEP: "ep", _bassOverride: true,
  });
  band._applyStyleBass("funk");
  check(band.piano === "ep", "changing the feel to funk left the grand in place");
}

console.log("\nTHE TUNE'S OWN KICKS — the band hits the figure, then gets out of the way");
{
  const s = {
    title: "test",
    timeSignature: 4,
    progression: [[{ chord: "F7", beats: 4 }], [{ chord: "F7", beats: 4 }],
                  [{ chord: "Bb7", beats: 4 }], [{ chord: "F7", beats: 4 }]],
    figure: {
      cells: [{ bars: [0], hits: [[0], [2.5]] }, { bars: [1], hits: [[1.5]] }],
      breaks: [[2, 2, 2]],
    },
  };
  const chords = flat(s);
  const groove = () => ({
    piano: [], guitar: [], bass: [], drums: [],
    ...Object.fromEntries(["piano", "guitar", "bass", "drums"].map((p) => [
      p, Array.from({ length: 16 }, (_, i) => ({ beat: i, dur: 0.5, vel: 50, midi: 40, midis: [60], drum: "hat" })),
    ])),
  });

  const band = Object.assign(Object.create(B), { compColour: 1 });
  const head = groove();
  band._applyFigure(head, s, chords, 4, 16, 0);
  const inBreak = (e) => e.beat >= 10 && e.beat < 12;
  const parts = ["piano", "guitar", "bass", "drums"];
  console.log(`   head chorus: ${parts.map((p) => `${p} ${head[p].length}`).join(" · ")}`);
  check(parts.every((p) => !head[p].some(inBreak)), "somebody kept playing through the break");
  for (const beat of [0, 2.5, 5.5]) {
    check(head.piano.some((e) => e.beat === beat && e.vel > 70), `no piano punch at beat ${beat}`);
    check(head.bass.some((e) => e.beat === beat && e.vel > 70), `no bass punch at beat ${beat}`);
    check(head.drums.filter((e) => e.beat === beat).length >= 2, `the kit did not punch at beat ${beat}`);
  }
  check(head.piano.filter((e) => Math.abs(e.beat - 2.5) < 0.25).length === 1, "the punch flams against the comp");
  check(parts.every((p) => head[p].every((e, i, a) => !i || a[i - 1].beat <= e.beat)), "events came back out of order");

  // and the figure is an arrangement, not a loop: it belongs to the head and
  // every fourth chorus, not to every time round
  const solos = groove();
  band._applyFigure(solos, s, chords, 4, 16, 1);
  check(solos.piano.length === 16 && solos.piano.every((e) => e.vel === 50), "chorus 2 played the head's kicks");
  const fourth = groove();
  band._applyFigure(fourth, s, chords, 4, 16, 4);
  check(fourth.piano.some((e) => e.vel > 70), "the fourth chorus did not take the tune back");
  console.log("   chorus 1 ✓ · chorus 2 plain ✓ · chorus 5 ✓");

  // a tune with no figure is untouched
  const plain = groove();
  band._applyFigure(plain, { ...s, figure: undefined }, chords, 4, 16, 0);
  check(plain.piano.length === 16, "a tune with no figure lost events anyway");
}

console.log("\nTHE FIGURE IS THE TUNE — Cantaloupe Island's keys play it and nothing else");
{
  const s = song("Cantaloupe Island");
  const chords = flat(s);
  const groove = () => Object.fromEntries(["piano", "guitar", "bass", "drums"].map((p) => [
    p, Array.from({ length: 64 }, (_, i) => ({ beat: i, dur: 0.5, vel: 50, midi: 40, midis: [60], drum: "hat" })),
  ]));
  const band = Object.assign(Object.create(B), { compColour: 1 });
  const ev = groove();
  band._applyFigure(ev, s, chords, 4, 64, 0);

  // bar 1: rest on the downbeat, then the & of 1, 2, 3, 4 and the & of 4
  const bar0 = ev.piano.filter((e) => e.beat < 4).map((e) => e.beat);
  console.log(`   bar 1 keys: ${bar0.join(" ")}`);
  check(bar0.join() === "0.5,1,2,3,3.5", `bar 1 played ${bar0.join(" ")}`);
  // bars 9-12 drop to two attacks
  const bar8 = ev.piano.filter((e) => e.beat >= 32 && e.beat < 36).map((e) => e.beat - 32);
  console.log(`   bar 9 keys: ${bar8.join(" ")}`);
  check(bar8.join() === "0,1.5", `bar 9 played ${bar8.join(" ")}`);
  // the rhythm section is not in the figure, so it keeps its groove
  check(ev.bass.length === 64 && ev.drums.length === 64, "the figure took the rhythm section with it");
  check(ev.guitar.filter((e) => e.beat < 4).length === 5, "the guitar did not follow the keys");
}

console.log();
console.log(fail ? `FAILURES: ${fail}` : "the funk bass holds a figure, and the keys are electric");
process.exit(fail ? 1 : 0);
