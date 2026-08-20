import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();
const collector = path.join(root, "scripts", "collect-gitleaks-report.mjs");
const cleanlinessCheck = path.join(root, "scripts", "check-clean-worktree.mjs");

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

test("Gitleaks report is retained under ignored outputs without masking other Git changes", async () => {
  const temporaryRepository = await mkdtemp(path.join(os.tmpdir(), "circa-ci-hygiene-"));
  try {
    assert.equal(run("git", ["init", "--quiet"], temporaryRepository).status, 0);
    assert.equal(run("git", ["config", "user.email", "ci-test@circa.invalid"], temporaryRepository).status, 0);
    assert.equal(run("git", ["config", "user.name", "Circa CI Test"], temporaryRepository).status, 0);
    await writeFile(path.join(temporaryRepository, ".gitignore"), "/outputs/\n");
    assert.equal(run("git", ["add", ".gitignore"], temporaryRepository).status, 0);
    assert.equal(run("git", ["commit", "--quiet", "-m", "baseline"], temporaryRepository).status, 0);

    await writeFile(path.join(temporaryRepository, "results.sarif"), JSON.stringify({ version: "2.1.0", runs: [] }));
    assert.equal(run("git", ["status", "--porcelain"], temporaryRepository).stdout.trim(), "?? results.sarif");

    const collected = run(process.execPath, [collector], temporaryRepository);
    assert.equal(collected.status, 0, collected.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(temporaryRepository, "outputs", "security", "gitleaks-results.sarif"), "utf8")),
      { version: "2.1.0", runs: [] },
    );
    assert.equal(run(process.execPath, [cleanlinessCheck, "after Gitleaks"], temporaryRepository).status, 0);

    await writeFile(path.join(temporaryRepository, "unexpected.txt"), "must remain visible to Git\n");
    const dirty = run(process.execPath, [cleanlinessCheck, "regression proof"], temporaryRepository);
    assert.notEqual(dirty.status, 0);
    assert.match(`${dirty.stdout}\n${dirty.stderr}`, /\?\? unexpected\.txt/);
  } finally {
    await rm(temporaryRepository, { recursive: true, force: true });
  }
});
