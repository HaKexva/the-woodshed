// Every chord quality the parser knows, against the chord-scale table:
// which ones fall through to the mixolydian default, and does the scale it
// lands on even contain the notes the symbol spells?
import fs from "node:fs";
import { parseChord, soloScaleSteps, soloScale } from "../../js/theory.js";

// read as a file, not imported: this check inspects the source tables
const src = fs.readFileSync(new URL("../../js/theory.js", import.meta.url), "utf8");
const block = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const keysOf = (text) => [...text.matchAll(/(?:^|[{,]\s*)(?:"([^"]*)"|([A-Za-z][A-Za-z0-9#b]*))\s*:/gm)]
  .map((m) => m[1] ?? m[2]);

const qualities = keysOf(block("const QUALITIES = {", "const QUALITY_KEYS"));
const mapped = new Set(keysOf(block("const SCALE_FOR_QUALITY = {", "/** Scale steps")));

const rows = [];
for (const q of qualities) {
  const info = parseChord("C" + q);
  if (info.quality !== q) continue; // parser normalised it to something else
  const steps = soloScaleSteps(info, null);
  const pool = new Set(steps.map((s) => (info.rootPc + s) % 12));
  const missing = info.intervals.filter((iv) => !pool.has((info.rootPc + iv) % 12));
  rows.push({ q, mapped: mapped.has(q), scale: soloScale(info, null).label, missing });
}

const unmapped = rows.filter((r) => !r.mapped);
const broken = rows.filter((r) => r.missing.length);
console.log(`qualities ${rows.length} · unmapped ${unmapped.length} · scale misses a chord tone: ${broken.length}`);
console.log("\nunmapped (fall through to mixolydian):");
for (const r of unmapped) console.log(`  ${("C" + r.q).padEnd(12)} → ${r.scale.padEnd(20)} missing ${r.missing.join(",") || "none"}`);
for (const r of broken) console.log(`  ${("C" + r.q).padEnd(12)} → ${r.scale.padEnd(20)} missing ${r.missing.join(",")}`);
console.log(broken.length
  ? `\n${broken.length} qualities get a scale missing their own notes`
  : "\nevery quality's scale contains the chord");
process.exit(broken.length ? 1 : 0);
