import { mkdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";

const source = path.resolve("results.sarif");
const destinationDirectory = path.resolve("outputs", "security");
const destination = path.join(destinationDirectory, "gitleaks-results.sarif");

const sourceInfo = await stat(source).catch((error) => {
  if (error?.code === "ENOENT") {
    throw new Error("Gitleaks completed without producing its expected results.sarif report.");
  }
  throw error;
});
if (!sourceInfo.isFile()) throw new Error("The Gitleaks results.sarif output must be a file.");

const report = JSON.parse(await readFile(source, "utf8"));
if (!Array.isArray(report.runs)) throw new Error("The Gitleaks report is not valid SARIF output.");

const destinationExists = await stat(destination).then(() => true).catch((error) => {
  if (error?.code === "ENOENT") return false;
  throw error;
});
if (destinationExists) throw new Error(`Refusing to overwrite an existing security report: ${destination}`);

await mkdir(destinationDirectory, { recursive: true });
await rename(source, destination);
console.log(`Preserved Gitleaks report in ${path.relative(process.cwd(), destination)}.`);
