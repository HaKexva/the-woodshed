// Item 16: two-bar count-in, one above 200 bpm — and the form still starts
// exactly where the loop does.
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";
import { parts, clearParts } from "../stubs/tone.js";

const band = new Band({});
band.parts = [];
band.gains = {};
band.ctx = { currentTime: 0 };

const fail = [];
const barOf = (bbs) => Number(String(bbs).split(":")[0]);

const build = (song, countBars) => {
  band.song = song;
  band.soloOn = false;
  band._countBars = countBars;
  clearParts();
  band.parts = [];
  band._buildParts(song);
  return parts;
};

for (const countBars of [1, 2]) {
  for (const title of ["Blue Bossa", "'Round Midnight", "Take Five", "Someday My Prince Will Come"]) {
    const song = SONGS.find((s) => s.title.includes(title.replace("'", "")));
    if (!song) continue;
    const bpb = song.timeSignature ?? 4;
    const ps = build(song, countBars);

    // the count-in part is the one whose events carry count:true
    const count = ps.find((p) => p.events.some(([, e]) => e?.count));
    if (!count) { fail.push(`${title} @${countBars}: no count-in part`); continue; }

    const countBarsUsed = new Set(count.events.map(([bbs]) => barOf(bbs)));
    const want = new Set(Array.from({ length: countBars }, (_, i) => i));
    if ([...countBarsUsed].sort().join() !== [...want].sort().join()) {
      fail.push(`${title} @${countBars}: count-in occupies bars ${[...countBarsUsed]}, want ${[...want]}`);
    }

    // Nothing of the tune may *sound* before the loop point. The count-in's own
    // beat metadata does land there on purpose — it is what pulses the beat
    // lights while you are being counted in — so only note events count.
    const sounding = (e) => e && (e.midis || e.midi != null || e.drum);
    for (const p of ps) {
      if (p === count) continue;
      for (const [bbs, e] of p.events) {
        if (sounding(e) && barOf(bbs) < countBars) {
          fail.push(`${title} @${countBars}: ${e.drum ?? "note"} at bar ${barOf(bbs)}, before the loop point`);
        }
      }
    }

    // the lead-in bar is lighter than the bar against the downbeat
    if (countBars === 2) {
      const inBar = (b) => count.events.filter(([bbs]) => barOf(bbs) === b).length;
      if (!(inBar(0) < inBar(1))) fail.push(`${title}: lead-in bar has ${inBar(0)} clicks, final bar ${inBar(1)} — want fewer in the lead-in`);
      if (inBar(1) !== bpb) fail.push(`${title}: final count bar has ${inBar(1)} clicks, want ${bpb}`);
    }
  }
}

// The solo line must be shifted by the same count-in as the band. It had its
// own mapping that added one bar flat — right while the count-in was always one
// bar, a bar early once it could be two, which lit the score behind the
// playhead.
const PPQ = 192;
for (const countBars of [1, 2]) {
  for (const title of ["Blue Bossa", "'Round Midnight", "Someday My Prince Will Come"]) {
    const song = SONGS.find((s) => s.title.includes(title.replace("'", "")));
    if (!song) continue;
    const bpb = song.timeSignature ?? 4;
    band.soloOn = true;
    band._countBars = countBars;
    band._heldLine = null;
    band.parts = [];
    clearParts();
    band._buildParts(song);

    const solo = parts.find((p) => p.events.some(([pos, e]) => typeof pos === "string" && pos.endsWith("i") && e?.midi != null));
    if (!solo) { fail.push(`${title} @${countBars}: no solo part`); continue; }
    let worst = 0;
    for (const [pos, e] of solo.events) {
      const scheduled = Number(String(pos).slice(0, -1)) / PPQ; // ticks → beats
      worst = Math.max(worst, Math.abs(scheduled - (e.beat + bpb * countBars)));
    }
    // swing pre-compensation moves off-beat notes a little; a whole bar is not that
    if (worst > 0.5) fail.push(`${title} @${countBars}: solo offset is out by up to ${worst.toFixed(2)} beats, want the band's ${bpb * countBars}`);
  }
}
band.soloOn = false;

// the tempo rule itself
const tempoPick = (bpm) => (bpm >= 200 ? 1 : 2);
for (const [bpm, want] of [[80, 2], [120, 2], [199, 2], [200, 1], [280, 1]]) {
  if (tempoPick(bpm) !== want) fail.push(`${bpm} bpm → ${tempoPick(bpm)} bars, want ${want}`);
}

console.log(`checked ${[1, 2].length} count lengths across four tunes incl. 3/4 and 5/4`);
console.log(fail.length ? `FAIL\n  ${fail.join("\n  ")}` : "all checks pass");
process.exit(fail.length ? 1 : 0);
