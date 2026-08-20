import { spawnSync } from "node:child_process";

const label = process.argv.slice(2).join(" ") || "worktree check";

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr.trim()}`);
  }
  return result.stdout.trimEnd();
}

const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
const diff = git(["diff", "--name-status"]);
const untracked = git(["ls-files", "--others", "--exclude-standard"]);

console.log(`[clean-worktree] ${label}`);
console.log("git status --porcelain:");
console.log(status || "(clean)");
console.log("git diff --name-status:");
console.log(diff || "(none)");
console.log("untracked generated files:");
console.log(untracked || "(none)");

if (status) throw new Error(`The Git worktree is dirty during ${label}.`);
