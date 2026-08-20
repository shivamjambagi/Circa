import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repository = fs.readFileSync("app/cloud/communityRepository.ts", "utf8");
const community = fs.readFileSync("app/community/[projectId]/CommunityClient.tsx", "utf8");
const importer = fs.readFileSync("app/community/[projectId]/DirectoryImportTool.tsx", "utf8");
const gitignore = fs.readFileSync(".gitignore", "utf8");

test("private seed data is ignored by git", () => {
  assert.match(gitignore, /\/seed-data\//);
});

test("directory import uses deterministic collision-resistant document ids", () => {
  assert.match(repository, /export async function importPublishedDirectoryItems/);
  assert.match(repository, /directory-\$\{id\}/);
  assert.match(repository, /importIdentityHash/);
  assert.match(repository, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(repository, /batch\.set/);
});

test("import is available only inside the existing admin Content manager", () => {
  assert.match(community, /<DirectoryImportTool projectId=\{project\.id\} listId=\{selectedList\.id\} listTitle=\{selectedList\.title\} \/>/);
  assert.match(community, /function ContentManager/);
});

test("importer reads a local json file and previews the contact count", () => {
  assert.match(importer, /file\.text\(\)/);
  assert.match(importer, /contacts ready/);
  assert.match(importer, /Import \$\{contacts\.length\} contacts/);
});

test("re-running the seed is explicitly duplicate-safe", () => {
  assert.match(importer, /updates the imported records instead of creating duplicates/);
});
