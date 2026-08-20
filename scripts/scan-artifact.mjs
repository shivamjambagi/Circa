import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

async function files(path) { return (await readdir(path, { withFileTypes: true })).flatMap((entry) => entry.isDirectory() ? [] : [join(path, entry.name)]); }
async function walk(path) { const entries = await readdir(path, { withFileTypes: true }); const output = []; for (const entry of entries) output.push(...(entry.isDirectory() ? await walk(join(path, entry.name)) : [join(path, entry.name)])); return output; }

const clientFiles = await walk("dist/client");
const sourceMaps = clientFiles.filter((path) => path.endsWith(".map"));
if (sourceMaps.length) throw new Error(`Production client source maps are not allowed: ${sourceMaps.join(", ")}`);
const forbidden = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /FIREBASE_SERVICE_ACCOUNT_JSON/, /AI_API_KEY/, /RATE_LIMIT_HMAC_SECRET/, /PASTE_MINIFIED_SERVICE_ACCOUNT_JSON_OR_USE_ADC/];
const violations = [];
for (const path of clientFiles.filter((item) => [".js", ".json", ".html", ".txt"].includes(extname(item)))) { const content = await readFile(path, "utf8"); if (forbidden.some((pattern) => pattern.test(content))) violations.push(path); }
if (violations.length) throw new Error(`Server secret material or identifiers reached client assets: ${violations.join(", ")}`);
if (!(await files("dist/client")).some((path) => path.endsWith("release.json"))) throw new Error("Release metadata is missing from client artifact.");
console.log(`Scanned ${clientFiles.length} client artifact files: no server secrets or source maps found.`);
