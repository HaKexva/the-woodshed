// The whole suite. `node test/run.mjs`, or one check: `node test/run.mjs solo-key`.
//
// Each check is a standalone script that prints what it measured and exits
// non-zero if an invariant broke. They run in separate processes so one
// check's stubbing or module state cannot leak into the next.
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2];
const checks = readdirSync(join(here, "checks"))
  .filter((f) => f.endsWith(".mjs"))
  .filter((f) => !filter || f.includes(filter))
  .sort();

if (!checks.length) {
  console.error(filter ? `no check matches "${filter}"` : "no checks found");
  process.exit(1);
}

const run = (file) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, ["--import", join(here, "loader.mjs"), join(here, "checks", file)], {
      cwd: join(here, ".."),
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ file, code, out: out.trimEnd() }));
  });

const results = [];
for (const file of checks) results.push(await run(file));

const failed = results.filter((r) => r.code !== 0);
for (const r of results) {
  const last = r.out.split("\n").filter(Boolean).pop() ?? "(no output)";
  console.log(`${r.code === 0 ? "  ok  " : " FAIL "} ${r.file.replace(/\.mjs$/, "").padEnd(18)} ${last}`);
}

if (failed.length) {
  console.log(`\n${failed.length} of ${results.length} failed:\n`);
  for (const r of failed) console.log(`--- ${r.file} ---\n${r.out}\n`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks pass`);
process.exit(failed.length ? 1 : 0);
