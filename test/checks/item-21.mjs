// Item 21: the band actually moves. Transposing the song rather than shifting
// notes on the way out means the chords, the key context and the soloist all
// have to land in the same place.
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";
import { parseChord, keyContext } from "../../js/theory.js";

const band = new Band({});
band.gains = {}; band.ctx = { currentTime: 0 }; band.parts = [];
band.soloOn = true;

const fail = [];
const song = SONGS.find((s) => s.title.includes("Blue Bossa"));
band.song = song;

const rootsOf = (plan) => plan.chords.map((c) => c.info.rootPc);
const planAt = (chorus) => { band._chorus = chorus; band._heldLine = null; return band._planChorus(song); };

// --- a fixed shift moves every chord by the same interval ------------------
band.setKey({ shift: 0, step: 0 });
const base = rootsOf(planAt(0));
for (const by of [1, 3, 5, 7, 11]) {
  band.setKey({ shift: by, step: 0 });
  const moved = rootsOf(planAt(0));
  if (moved.length !== base.length) { fail.push(`shift ${by}: chord count changed`); continue; }
  const bad = moved.filter((pc, i) => pc !== (base[i] + by) % 12);
  if (bad.length) fail.push(`shift ${by}: ${bad.length} chords did not move by ${by}`);
}

// --- the key context moves with it ---------------------------------------
band.setKey({ shift: 0, step: 0 });
const baseKey = keyContext(song);
for (const by of [2, 5, 9]) {
  band.setKey({ shift: by, step: 0 });
  const k = planAt(0).key;
  if (!k) { fail.push(`shift ${by}: no key context`); continue; }
  if (k.tonicPc !== (baseKey.tonicPc + by) % 12) fail.push(`shift ${by}: tonic ${k.tonicPc}, want ${(baseKey.tonicPc + by) % 12}`);
  if (k.mode !== baseKey.mode) fail.push(`shift ${by}: mode became ${k.mode}, want ${baseKey.mode}`);
}

// --- the soloist plays in the new key, not the old ------------------------
band.setKey({ shift: 0, step: 0 });
const pcsOf = (plan) => new Set(plan.soloEvents.map((e) => e.midi % 12));
const home = pcsOf(planAt(0));
band.setKey({ shift: 6, step: 0 });
const away = pcsOf(planAt(0));
const overlap = [...away].filter((p) => home.has(p)).length;
if (overlap === away.size) fail.push("the solo line did not move with the key at all");

// --- stepping visits the keys it should ----------------------------------
const visited = (step, choruses = 24) => {
  band.setKey({ shift: 0, step });
  return new Set(Array.from({ length: choruses }, (_, c) => band.shiftFor(c))).size;
};
for (const [step, want] of [[1, 12], [5, 12], [7, 12], [3, 4], [6, 2], [0, 1]]) {
  const got = visited(step);
  if (got !== want) fail.push(`step ${step} visits ${got} keys, want ${want}`);
}

// --- a step actually changes the chart chorus to chorus -------------------
band.setKey({ shift: 0, step: 5 });
const c0 = rootsOf(planAt(0))[0];
const c1 = rootsOf(planAt(1))[0];
if (c1 !== (c0 + 5) % 12) fail.push(`stepping: chorus 1 root ${c1}, want ${(c0 + 5) % 12}`);

// --- and "as written" really is untouched --------------------------------
band.setKey({ shift: 0, step: 0 });
const again = rootsOf(planAt(0));
if (again.join() !== base.join()) fail.push("returning to as-written did not restore the original chart");
const sym = planAt(0).chords[0].info.symbol;
if (sym !== parseChord(song.progression[0][0].chord).symbol) fail.push(`as written spells ${sym}, want ${song.progression[0][0].chord}`);

console.log(`checked fixed shifts, key context, the solo line, and stepping over 24 choruses`);
console.log(fail.length ? `FAIL\n  ${fail.join("\n  ")}` : "all checks pass");
process.exit(fail.length ? 1 : 0);
