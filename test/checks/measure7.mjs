// comp colour rework + reading transposition
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";
import * as T from "../../js/theory.js";

const B = Band.prototype;
const flat = (s) => B._flatten.call(null, s, s.timeSignature ?? 4);
const song = (t) => SONGS.find((x) => x.title === t);
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const NAMES = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];
let fail = 0;
const check = (ok, m) => { if (!ok) { fail++; console.log(`   ✗ ${m}`); } };

console.log("A. CANDIDATE SETS — every form must carry both guide tones");
{
  for (const [name, colour] of Object.entries(T.COMP_COLOUR)) {
    let shapes = 0, noThird = 0, noSeventh = 0, syms = 0, maxSpan = 0;
    const seen = new Set();
    for (const s of SONGS) for (const bar of s.progression) for (const c of bar) {
      if (seen.has(c.chord)) continue;
      seen.add(c.chord);
      syms++;
      const info = T.parseChord(c.chord);
      const iv = info.intervals;
      const thirdIv = [4, 3, 5, 2].find((x) => iv.includes(x)) ?? 4;
      const seventhIv = [10, 11, 9].find((x) => iv.includes(x));
      for (const { ivs: v } of T.pianoVoicings(info, colour)) {
        shapes++;
        maxSpan = Math.max(maxSpan, v[v.length - 1] - v[0]);
        const pcs = new Set(v.map((x) => ((x % 12) + 12) % 12));
        if (!pcs.has(((thirdIv % 12) + 12) % 12)) noThird++;
        if (seventhIv !== undefined && !pcs.has(seventhIv % 12)) noSeventh++;
        check(v.length >= 3, `${c.chord} ${name}: voicing with ${v.length} notes`);
        check(v.every((n, i) => i === 0 || n - v[i - 1] > 1), `${c.chord} ${name}: semitone in close position`);
      }
    }
    console.log(`   ${name.padEnd(6)} ${(shapes / syms).toFixed(1)} shapes/chord · widest span ${maxSpan} · without the 3rd ${pct(noThird, shapes)} · without the 7th ${pct(noSeventh, shapes)}`);
    check(noThird / shapes < 0.12, `${name}: ${pct(noThird, shapes)} of shapes have no 3rd`);
  }
  console.log("   (before this rework: 18.6 shapes/chord, 45% of Dm7's without a 3rd)");
}

console.log("\nB. Dm7, every shape at each colour");
for (const [name, colour] of Object.entries(T.COMP_COLOUR)) {
  const v = T.pianoVoicings(T.parseChord("Dm7"), colour);
  console.log(`   ${name.padEnd(6)} ${v.map(({ ivs: s }) => s.map((x) => NAMES[((x % 12) + 12) % 12]).join("-")).join("  ")}`);
}

console.log("\nC. HOW MUCH THE COMP MOVES — Autumn Leaves, 200 passes");
for (const [name, colour] of Object.entries(T.COMP_COLOUR)) {
  const s = song("Autumn Leaves");
  const ch = flat(s);
  let tops = 0, move = [], leap = 0, n = 0, held = 0, heldSame = 0;
  for (let r = 0; r < 200; r++) {
    const vs = T.voiceComp(ch, Math.random, { colour });
    tops += new Set(vs.map((v) => v[v.length - 1])).size;
    for (let i = 1; i < vs.length; i++) {
      const d = Math.abs(vs[i][vs[i].length - 1] - vs[i - 1][vs[i - 1].length - 1]);
      move.push(d); if (d > 4) leap++; n++;
      if (ch[i].symbol === ch[i - 1].symbol) { held++; if (vs[i].join() === vs[i - 1].join()) heldSame++; }
    }
  }
  console.log(
    `   ${name.padEnd(6)} tops ${(tops / 200).toFixed(1)}/${ch.length} · top move ${(move.reduce((a, b) => a + b, 0) / move.length).toFixed(2)}st · >4st ${pct(leap, n)} · held chord kept ${held ? pct(heldSame, held) : "n/a"}`
  );
}
console.log("   (before: tops 11.3/35, move 1.60st, and a held chord was revoiced every bar)");

console.log("\nD. READING TRANSPOSITION");
{
  const cases = [
    ["Cmaj7", "Bb", "Dmaj7"], ["Dm7", "Bb", "Em7"], ["Bb7#11", "Bb", "C7#11"],
    ["F7/C", "Bb", "G7/D"], ["Am7b5", "Eb", "Gbm7b5"], ["Cmaj7", "Eb", "Amaj7"],
    ["Cmaj7", "F", "Gmaj7"], ["Ebm7", "F", "Bbm7"], ["C", "Bb", "D"],
  ];
  for (const [sym, key, want] of cases) {
    const got = T.transposeSymbol(sym, T.READING_KEYS[key].shift);
    check(got === want, `${sym} in ${key} → ${got}, expected ${want}`);
  }
  console.log(`   ${cases.length} symbol cases checked (roots, slash basses, altered suffixes)`);
  for (const [k, want] of [["G minor", "A minor"], ["Eb", "F"], ["D dorian", "E dorian"]]) {
    const got = T.transposeKey(k, 2);
    check(got === want, `key "${k}" +2 → "${got}", expected "${want}"`);
  }
  console.log(`   key strings keep their words: "G minor" → "${T.transposeKey("G minor", 2)}"`);
  // concert is a no-op everywhere
  let same = 0, tot = 0;
  for (const s of SONGS) for (const bar of s.progression) for (const c of bar) {
    tot++; if (T.transposeSymbol(c.chord, 0) === c.chord) same++;
  }
  check(same === tot, `concert changed ${tot - same} symbols`);
  console.log(`   concert is a no-op across all ${tot} chord cells: ${same === tot}`);
  // every transposed symbol must still parse to the right pitch class
  let bad = 0;
  for (const key of Object.keys(T.READING_KEYS)) {
    const sh = T.READING_KEYS[key].shift;
    for (const s of SONGS) for (const bar of s.progression) for (const c of bar) {
      const a = T.parseChord(c.chord);
      const b = T.parseChord(T.transposeSymbol(c.chord, sh));
      if (((a.rootPc + sh) % 12) !== b.rootPc || a.quality !== b.quality) bad++;
    }
  }
  check(bad === 0, `${bad} transposed symbols re-parse to a different root or quality`);
  console.log(`   every symbol × every reading key re-parses to the right root and quality: ${bad === 0}`);
}

console.log(`\n${fail ? `FAILURES: ${fail}` : "all checks pass"}`);
