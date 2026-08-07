// What the key context actually changes, measured over the whole songbook.
import { SONGS } from "../../js/songs.js";
import { parseChord, keyContext, soloScaleSteps, soloScale } from "../../js/theory.js";

const pcsOf = (info, key) => soloScaleSteps(info, key).map((s) => (info.rootPc + s) % 12).sort((a, b) => a - b);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

let songs = 0, noKey = 0;
const modes = {};
let flipped = 0;               // bare label the progression read as minor
let beats = 0, changedBeats = 0, changedChords = 0, totalChords = 0;
const byMove = {};
const examples = {};

for (const song of SONGS) {
  songs++;
  const key = keyContext(song);
  if (!key) { noKey++; continue; }
  modes[key.mode] = (modes[key.mode] ?? 0) + 1;
  const bare = /^[A-G][b#]?$/.test(String(song.key).trim());
  if (bare && key.mode === "minor") flipped++;

  for (const bar of song.progression ?? []) {
    for (const cell of bar ?? []) {
      const info = parseChord(cell.chord);
      const b = cell.beats ?? 4;
      totalChords++; beats += b;
      const before = pcsOf(info, null);
      const after = pcsOf(info, key);
      if (same(before, after)) continue;
      changedChords++; changedBeats += b;
      const deg = (((info.rootPc - key.tonicPc) % 12) + 12) % 12;
      const tag = `${key.mode} · degree ${deg} · ${info.quality || "maj"} → ${soloScale(info, key).label}`;
      byMove[tag] = (byMove[tag] ?? 0) + b;
      if (!examples[tag]) examples[tag] = `${song.title} (${song.key}) ${info.symbol}`;
    }
  }
}

console.log(`songs ${songs} · no key ${noKey} · modes ${JSON.stringify(modes)}`);
console.log(`bare labels the progression read as minor: ${flipped}`);
console.log(`chord cells ${totalChords} · changed ${changedChords} (${(100 * changedChords / totalChords).toFixed(1)}%)`);
console.log(`beats ${beats} · changed ${changedBeats} (${(100 * changedBeats / beats).toFixed(1)}%)`);
console.log("\nwhat moved, by beats:");
for (const [tag, n] of Object.entries(byMove).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${tag.padEnd(46)} e.g. ${examples[tag]}`);
}

// --- the guards -----------------------------------------------------------
const fail = [];
const C = { tonicPc: 0, mode: "major", pcs: [0, 2, 4, 5, 7, 9, 11] };
const check = (sym, key, want, why) => {
  const got = soloScale(parseChord(sym), key).label;
  if (got !== want) fail.push(`${sym}: want ${want}, got ${got} — ${why}`);
};
check("FMaj7", C, "F lydian", "IV in C takes the key's B natural, not a natural 11");
check("CMaj7", C, "C major", "I is still ionian");
check("Dm7", C, "D dorian", "ii is unchanged");
check("G7", C, "G mixolydian", "V is unchanged");
check("Am7", C, "A aeolian", "vi takes the key's F natural");
check("Em7", C, "E phrygian", "iii takes the key's F natural");
check("Bm7b5", C, "B locrian", "vii is unchanged in name");
check("A7", C, "A mixolydian", "secondary dominant is not in the key — quality lookup stands");
check("Ab7", C, "Ab mixolydian", "tritone sub is not in the key");
check("EbMaj7", C, "Eb major", "a modulation target is not in the key");

const Cm = { tonicPc: 0, mode: "minor", pcs: [0, 2, 3, 5, 7, 8, 10] };
check("G7", Cm, "G phrygian dominant", "V7 of a minor key gets the key's own b9/#9/b13");
check("Cm7", Cm, "C aeolian", "the tonic minor");
check("AbMaj7", Cm, "Ab lydian", "bVI is lydian");
check("Bb7", Cm, "Bb mixolydian", "bVII7 is mixolydian");
check("Dm7b5", Cm, "D locrian", "ii-half-diminished");
check("G7#9", Cm, "G half-whole dim.", "a written #9 outranks the key");
check("G9", Cm, "G mixolydian", "a written natural 9 outranks the key");

// nothing may claim a chord whose own tones are outside the key
for (const song of SONGS.slice(0, 120)) {
  const key = keyContext(song);
  if (!key) continue;
  for (const bar of song.progression ?? []) for (const cell of bar ?? []) {
    const info = parseChord(cell.chord);
    const pool = new Set(pcsOf(info, key));
    for (const iv of info.intervals) {
      if (!pool.has((info.rootPc + iv) % 12)) {
        fail.push(`${song.title}: ${info.symbol} chord tone ${(info.rootPc + iv) % 12} outside its own scale`);
      }
    }
  }
}

console.log(fail.length ? `\nFAIL\n  ${fail.join("\n  ")}` : "\nall guards pass");
process.exit(fail.length ? 1 : 0);
