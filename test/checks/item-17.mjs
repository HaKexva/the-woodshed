// Item 17: the solo generator should not run when nobody will hear it.
// Measures the build cost on the loop-wrap path with the soloist off vs on.
import { Band } from "../../js/band.js";
import { SONGS } from "../../js/songs.js";

const band = new Band({});
band.parts = [];
band.gains = {};
band.ctx = { currentTime: 0 };

const songs = ["'Round Midnight", "26-2", "All the Things You Are", "Blue Bossa", "Cherokee"]
  .map((t) => SONGS.find((s) => s.title.includes(t.replace("'", ""))) ?? SONGS.find((s) => s.title.includes(t)))
  .filter(Boolean);

let soloBuilds = 0;
const realSolo = Band.prototype._soloEvents;
Band.prototype._soloEvents = function (...a) {
  soloBuilds++;
  return realSolo.apply(this, a);
};

const time = (song, soloOn) => {
  band.song = song;
  band.soloOn = soloOn;
  band._heldLine = null;
  // warm up first — the first song otherwise pays for the whole file's JIT and
  // reads as the *slowest* configuration whichever one happens to run first
  for (let i = 0; i < 6; i++) { band._chorus = i; band._buildParts(song); }
  band._heldLine = null;
  soloBuilds = 0; // the warm-up's builds are not the ones under test
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 12; i++) {
    band._chorus = i;
    band._buildParts(song);
  }
  return Number(process.hrtime.bigint() - t0) / 1e6 / 12;
};

const fail = [];
let offTotal = 0, onTotal = 0;
console.log("per _buildParts, ms (12 choruses each):");
for (const song of songs) {
  soloBuilds = 0;
  const off = time(song, false);
  const offBuilds = soloBuilds;
  soloBuilds = 0;
  const on = time(song, true);
  const onBuilds = soloBuilds;
  offTotal += off; onTotal += on;
  console.log(`  ${song.title.padEnd(26)} solo off ${off.toFixed(1).padStart(6)}  ·  solo on ${on.toFixed(1).padStart(6)}  ·  saved ${(100 * (1 - off / on)).toFixed(0)}%`);
  if (offBuilds !== 0) fail.push(`${song.title}: solo generated ${offBuilds}x with the soloist off`);
  if (onBuilds !== 12) fail.push(`${song.title}: solo generated ${onBuilds}x with the soloist on, want 12`);
}
console.log(`  ${"mean".padEnd(26)} solo off ${(offTotal / songs.length).toFixed(1).padStart(6)}  ·  solo on ${(onTotal / songs.length).toFixed(1).padStart(6)}  ·  saved ${(100 * (1 - offTotal / onTotal)).toFixed(0)}%`);

// the write-only cache is gone
if ("_soloEventsCache" in band) fail.push("_soloEventsCache still set");

// with the soloist off nothing may reference a solo line
band.soloOn = false;
band._buildParts(songs[0]);
if (band.soloPart) fail.push("soloPart built with the soloist off");

console.log(fail.length ? `FAIL\n  ${fail.join("\n  ")}` : "all checks pass");
process.exit(fail.length ? 1 : 0);
