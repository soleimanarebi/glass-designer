import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases, runCase } from "./src/harness";

const dir = join(dirname(fileURLToPath(import.meta.url)), "cases");
let failed = 0;
for (const { file, data } of loadCases(dir)) {
  const o = runCase(file, data);
  console.log(`${o.ok ? "PASS" : "FAIL"}  ${file}  ${o.name}`);
  for (const m of o.mismatches) console.log(`      ${m.check} ${m.field}: expected ${m.expected}, got ${m.actual}`);
  if (!o.ok) failed++;
}
console.log(failed ? `\n${failed} case(s) failed` : "\nAll validation cases match.");
process.exit(failed ? 1 : 0);
