// plain / warm / hot across all four instruments.
//
// hot is an intensity setting, not a harmonic one — it reads warm's
// vocabulary and plays it harder and more often. So the thing to assert is
// that weight and anticipation move while the colour tones do not.
import { Band } from "../../js/band.js";
import { setBpm } from "../stubs/tone.js";
import { SONGS } from "../../js/songs.js";
import * as T from "../../js/theory.js";

const B = Band.prototype;
const stub = Object.assign(Object.create(B), { rideOn: true });
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);
const song = (t) => SONGS.find((x) => x.title === t);
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };

setBpm(140);
const s = song("Autumn Leaves");
const ch = flat(s);
const bars = s.progression.length;
const R = 80;
const rows = {};

for (const [name, colour] of Object.entries(T.COMP_COLOUR)) {
  let pNotes = 0, pExtras = 0, pV = 0, pCentre = 0, pVel = 0;
  let gEv = 0, gVar = 0, gPush = 0, gBreathe = 0;
  let bEv = 0, bSkip = 0, bRoot = 0, bChg = 0;
  let dBars = 0, dSnare = 0, dRim = 0, dFillBars = 0, dSkipBars = 0;

  for (let r = 0; r < R; r++) {
    const piano = B._pianoEvents.call(stub, ch, "swing", false, 4, colour);
    for (const e of piano) {
      pV++; pNotes += e.midis.length; pVel += e.vel;
      pCentre += e.midis.reduce((a, b) => a + b, 0) / e.midis.length;
    }
    // colour tones actually sounded
    const vs = T.voiceComp(ch, Math.random, { colour });
    vs.forEach((v, i) => {
      const iv = ch[i].info.intervals, root = ch[i].info.rootPc;
      const third = [4, 3, 5, 2].find((x) => iv.includes(x)) ?? 4;
      const fifth = [7, 6, 8].find((x) => iv.includes(x)) ?? 7;
      const sev = [10, 11, 9].find((x) => iv.includes(x));
      const core = new Set([0, third % 12, fifth % 12, sev === undefined ? -1 : sev % 12]);
      pExtras += v.filter((m) => !core.has(((m - root) % 12 + 12) % 12)).length;
    });

    const gtr = B._guitarEvents.call(stub, ch, s, "swing", false, 4, colour);
    gEv += gtr.length;
    gPush += gtr.filter((e) => e.beat % 4 === 3.5).length;
    const perBar = new Map();
    for (const e of gtr) perBar.set(Math.floor(e.beat / 4), (perBar.get(Math.floor(e.beat / 4)) ?? 0) + 1);
    gBreathe += [...perBar.values()].filter((n) => n <= 2).length;

    const bass = B._bassEvents.call(stub, ch, bars * 4, "swing", false, 4, "four", colour);
    bEv += bass.length;
    bSkip += bass.filter((e) => e.beat % 1 !== 0).length;
    for (const c of ch) {
      const hit = bass.find((e) => Math.abs(e.beat - c.startBeat) < 1e-6);
      if (!hit) continue;
      bChg++; if (hit.midi % 12 === c.info.bassPc) bRoot++;
    }

    const dr = B._drumEvents.call(stub, s, "swing", false, 4, { colour });
    const byBar = new Map();
    for (const e of dr) {
      const b = Math.floor(e.beat / 4);
      if (!byBar.has(b)) byBar.set(b, []);
      byBar.get(b).push(e);
      if (e.drum === "snare") dSnare++;
      if (e.drum === "rim") dRim++;
    }
    for (const [b, evs] of byBar) {
      dBars++;
      if (evs.some((e) => e.drum === "ride" && e.beat % 1 !== 0)) dSkipBars++;
      if ((b % 8 === 7 || b === bars - 1) && evs.filter((e) => e.drum === "snare" || e.drum === "rim").length >= 2) dFillBars++;
    }
  }

  rows[name] = {
    pianoNotes: pNotes / pV, pianoExtras: pExtras / (ch.length * R), pianoCentre: pCentre / pV,
    pianoVel: pVel / pV, piano: pV / (bars * R),
    gtr: gEv / (bars * R), gtrPush: gPush / (bars * R), gtrThin: gBreathe / (bars * R),
    bass: bEv / (bars * R), bassSkip: bSkip / bEv, bassRoot: bRoot / bChg,
    drSnare: (dSnare + dRim) / dBars, drRim: dRim / dBars, drFill: dFillBars / dBars, drSkip: dSkipBars / dBars,
  };
}

const f = (n, d = 2) => n.toFixed(d);
console.log("                    " + Object.keys(T.COMP_COLOUR).map((c) => c.padStart(9)).join(""));
const line = (label, key, d = 2) =>
  console.log(`   ${label.padEnd(20)}` + Object.keys(T.COMP_COLOUR).map((c) => f(rows[c][key], d).padStart(8)).join(""));
console.log("  PIANO");
line("notes per voicing", "pianoNotes");
line("colour tones/chord", "pianoExtras");
line("register centre", "pianoCentre", 1);
line("attacks per bar", "piano");
line("velocity", "pianoVel", 1);
console.log("  GUITAR");
line("attacks per bar", "gtr");
line("barline pushes/bar", "gtrPush", 3);
line("thinned bars/bar", "gtrThin", 3);
console.log("  BASS");
line("notes per bar", "bass");
line("8th-note skips", "bassSkip", 3);
line("root on the change", "bassRoot", 3);
console.log("  DRUMS");
line("comping hits/bar", "drSnare");
line("cross-sticks/bar", "drRim");
line("ride skip bars", "drSkip", 3);
line("fills taken", "drFill", 3);

console.log();
check(rows.warm.pianoExtras - rows.plain.pianoExtras > 0.5, "piano colour tones barely move");
check(rows.warm.gtr - rows.plain.gtr !== 0, "guitar identical across colours");
check(rows.warm.bassSkip > rows.plain.bassSkip * 1.6, "bass skips barely move");
check(rows.warm.drSnare > rows.plain.drSnare * 1.2, "drum comping barely moves");
check(rows.plain.drSkip < rows.warm.drSkip, "plain ride is not plainer");

// hot: the same chords, leaned on. Weight and anticipation move; the colour
// tones stay where warm left them, which is the whole point of the setting.
check(rows.hot.pianoVel > rows.warm.pianoVel + 4, "hot piano is not played harder");
check(rows.hot.gtrPush > rows.warm.gtrPush * 1.4, "hot guitar does not push the barline more");
check(rows.hot.bassSkip > rows.warm.bassSkip * 1.3, "hot bass does not fill more");
check(rows.hot.drSnare > rows.warm.drSnare * 1.1, "hot drums do not comp more");
check(rows.hot.drFill > rows.warm.drFill, "hot drummer does not take more fills");
check(Math.abs(rows.hot.pianoExtras - rows.warm.pianoExtras) < 0.25, "hot reopened the harmonic door warm closed");
console.log(fail ? `FAILURES: ${fail}` : "all four instruments respond across all three settings");
