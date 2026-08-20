import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const specialSuites = new Map([
  ["firestore-rules.test.ts", "test:firestore"],
  ["rendered-html.test.mjs", "test:critical"],
]);
const allTests = readdirSync("tests").filter((name) => /\.test\.(?:ts|mjs)$/.test(name)).sort();
const unitTests = allTests.filter((name) => !specialSuites.has(name));

if (!unitTests.length) throw new Error("No unit/static tests were discovered.");
for (const [name] of specialSuites) {
  if (!allTests.includes(name)) throw new Error(`Expected specialised suite tests/${name} is missing.`);
}

console.log(`Running ${unitTests.length} automatically discovered unit/static test files.`);
for (const [name, command] of specialSuites) console.log(`Allocated tests/${name} to npm run ${command}.`);
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-concurrency=1", ...unitTests.map((name) => `tests/${name}`)], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
