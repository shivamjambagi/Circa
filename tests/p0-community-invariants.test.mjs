import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("members request deletion through proposals and cannot directly publish", async () => {
  const ui = await read("app/community/[projectId]/CommunityClient.tsx"); const rules = await read("firestore.rules");
  assert.match(ui, /Request removal/); assert.match(ui, /operation: "delete"/); assert.doesNotMatch(ui, /Delete my information|Delete my contact/);
  assert.match(rules, /allow delete: if adminAfter\(projectId\);/);
  assert.doesNotMatch(rules, /resource\.data\.createdBy == request\.auth\.uid/);
});

test("proposal review is versioned, immutable and produces moderation events", async () => {
  const repo = await read("app/cloud/communityRepository.ts"); const rules = await read("firestore.rules");
  assert.match(repo, /baseVersion/); assert.match(repo, /proposal is stale/); assert.match(repo, /proposal-approved/); assert.match(repo, /proposal-rejected/);
  assert.match(rules, /reviewedBy == request\.auth\.uid/); assert.match(rules, /reviewedAt == request\.time/); assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['status', 'reviewedBy', 'reviewedAt', 'reviewNote'\]\)/);
  assert.match(rules, /match \/moderationEvents/); assert.match(rules, /allow update, delete: if false/);
});

test("join-code lookup is server rate limited and raw code reads are denied", async () => {
  const route = await read("app/api/join-code/route.ts"); const invitations = await read("app/api/invitations/route.ts"); const rules = await read("firestore.rules");
  assert.match(route, /enforceSharedRateLimit/); assert.match(route, /readJsonBodyWithLimit/); assert.match(route, /cache-control/);
  assert.match(invitations, /randomBytes/); assert.match(invitations, /existing\.exists/); assert.match(invitations, /batch\.create/);
  assert.match(rules, /match \/joinCodes/); assert.match(rules, /allow get, list, create: if false/);
});

test("removed-member rejoin and owner preservation are explicit", async () => {
  const repo = await read("app/cloud/communityRepository.ts"); const rules = await read("firestore.rules");
  assert.match(repo, /membership-rejoined/); assert.match(repo, /alreadyMember: true/);
  assert.match(rules, /resource\.data\.status == 'removed'/); assert.match(rules, /validInvite\(request\.resource\.data\.joinedViaInviteId, projectId\)/);
  assert.match(rules, /allow delete: if false/); assert.match(rules, /request\.resource\.data\.ownerId == resource\.data\.ownerId/);
});
