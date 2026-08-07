// Item 10: with a human out front the band should still leave the phrase ends
// open and answer into them. Both mechanisms used to be gated on soloOn, so
// they switched off exactly when the listening mattered.
import { Band, formSections } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";
import { parts, clearParts } from "../stubs/tone.js";

const band = new Band({});
band.gains = {};
band.ctx = { currentTime: 0 };

// what the drummer was handed
let drumOpts = null;
const realDrums = Band.prototype._drumEvents;
Band.prototype._drumEvents = function (song, style, straight, bpb, opts) {
  drumOpts = opts;
  return realDrums.call(this, song, style, straight, bpb, opts);
};

const build = (song, soloOn) => {
  band.song = song;
  band.soloOn = soloOn;
  band._heldLine = null;
  band.parts = [];
  clearParts();
  band._buildParts(song);
  return parts;
};

const phraseEndBars = (song) => {
  const ends = new Set();
  let at = 0;
  for (const sec of formSections(song)) { ends.add(at + sec.bars - 1); at += sec.bars; }
  return ends;
};

const titles = ["Blue Monk", "All the Things You Are", "'Round Midnight", "Autumn Leaves"];
const fail = [];
const TAKES = 60;

console.log("a human is soloing — comp events per bar, phrase-end bars vs the rest:");
for (const title of titles) {
  const song = SONGS.find((s) => s.title.includes(title.replace("'", "")));
  if (!song) { fail.push(`${title}: not in the songbook`); continue; }
  const bpb = song.timeSignature ?? 4;
  const ends = phraseEndBars(song);
  const bars = song.progression.length;

  let endHits = 0, otherHits = 0;
  let handed = 0;
  for (let take = 0; take < TAKES; take++) {
    band._chorus = take;
    const ps = build(song, false);
    handed = (drumOpts?.phraseEnds ?? []).length;
    for (const p of ps) {
      for (const [, e] of p.events) {
        if (!e?.midis || e.beat == null) continue; // piano + guitar comp only
        (ends.has(Math.floor(e.beat / bpb)) ? endHits++ : otherHits++);
      }
    }
  }
  const endBars = ends.size, otherBars = bars - ends.size;
  const endDen = endHits / (endBars * TAKES);
  const otherDen = otherHits / (otherBars * TAKES);
  console.log(
    `  ${title.padEnd(24)} ${String(bars).padStart(2)} bars · ${endBars} phrase ends · ` +
    `end ${endDen.toFixed(2)}/bar vs rest ${otherDen.toFixed(2)}/bar · ${((1 - endDen / otherDen) * 100).toFixed(0)}% thinner`
  );
  if (handed === 0) fail.push(`${title}: the drummer was handed no phrase ends with a human soloing`);
  if (!(endDen < otherDen)) fail.push(`${title}: the comp is not thinner at phrase ends (${endDen.toFixed(2)} vs ${otherDen.toFixed(2)})`);
}

// and the generated soloist still drives them from its own line
console.log("\nthe generated soloist still supplies its own:");
for (const title of titles) {
  const song = SONGS.find((s) => s.title.includes(title.replace("'", "")));
  if (!song) continue;
  build(song, true);
  const n = (drumOpts?.phraseEnds ?? []).length;
  console.log(`  ${title.padEnd(24)} ${n} phrase ends from the line`);
  if (n === 0) fail.push(`${title}: generated soloist produced no phrase ends`);
}

console.log(fail.length ? `\nFAIL\n  ${fail.join("\n  ")}` : "\nall checks pass");
process.exit(fail.length ? 1 : 0);
