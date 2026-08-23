import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contactSearchReducer, initialContactSearchState } from "../app/community/contactSearchState.ts";
import { activeInviteMembershipDestination } from "../app/join/inviteMembership.ts";

const communityInvite = { projectId: "community-one", projectMode: "community" as const, status: "active" };
const joinClientSource = readFileSync("app/join/JoinClient.tsx", "utf8");
const communityClientSource = readFileSync("app/community/[projectId]/CommunityClient.tsx", "utf8");
const repositorySource = readFileSync("app/cloud/communityRepository.ts", "utf8");

test("existing member opening an invitation resolves directly to the Community", () => {
  assert.equal(activeInviteMembershipDestination(communityInvite, { role: "member", status: "active" }), "/community/community-one");
  assert.match(joinClientSource, /getMembership\(invite\.projectId, user\.uid\)/);
  assert.match(joinClientSource, /router\.replace\(destination\)/);
  assert.match(joinClientSource, /checkingExistingMembership/);
});

test("signed-in non-member still receives the Join Community flow", () => {
  assert.equal(activeInviteMembershipDestination(communityInvite, null), null);
  assert.equal(activeInviteMembershipDestination(communityInvite, { role: "member", status: "removed" }), null);
  assert.match(joinClientSource, /else setMembershipResolution\("join"\)/);
  assert.match(joinClientSource, /if \(!invite \|\| !consent \|\| invite\.status !== "active"\) return/);
  assert.match(joinClientSource, /returnTo=\$\{encodeURIComponent\(`\/join\/\$\{invite\.token\}`\)\}/);
  assert.equal(activeInviteMembershipDestination({ ...communityInvite, status: "revoked" }, { role: "member", status: "active" }), null);
});

test("Community owner opening an invitation resolves directly to the Community", () => {
  assert.equal(activeInviteMembershipDestination(communityInvite, { role: "owner", status: "active" }), "/community/community-one");
});

test("an existing active membership is not duplicated by a repeated join", () => {
  const branchStart = repositorySource.indexOf("if (existing.exists() && existing.data().status === \"active\")");
  const branchEnd = repositorySource.indexOf("const joinedAt", branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart, "existing-member transaction branch must remain present");
  const existingMemberBranch = repositorySource.slice(branchStart, branchEnd);
  assert.match(repositorySource, /memberRef = doc\(db, "projects", invite\.projectId, "members", user\.uid\)/);
  assert.match(existingMemberBranch, /alreadyMember: true/);
  assert.doesNotMatch(existingMemberBranch, /transaction\.set\(memberRef/);
});

test("Contacts suggestions appear while the user searches", () => {
  const searching = contactSearchReducer(initialContactSearchState, { type: "change", query: "electrician" });
  assert.deepEqual(searching, { query: "electrician", suggestionsOpen: true });
  assert.match(communityClientSource, /search\.suggestionsOpen && suggestions\.length > 0/);
});

test("choosing a Contacts suggestion closes suggestions and opens a matching contact", () => {
  const searching = { query: "elect", suggestionsOpen: true };
  assert.deepEqual(contactSearchReducer(searching, { type: "choose", query: "Electrician" }), { query: "Electrician", suggestionsOpen: false });
  assert.match(communityClientSource, /setSelected\(matchingContact\)/);
  assert.match(communityClientSource, /dispatchSearch\(\{ type: "close" \}\); setSelected\(entry\)/);
});

test("Contacts search input remains rendered after a result is selected", () => {
  const selected = contactSearchReducer({ query: "electrician", suggestionsOpen: true }, { type: "choose", query: "Northside Electrical" });
  assert.equal(selected.query, "Northside Electrical");
  assert.equal(selected.suggestionsOpen, false);
  assert.match(communityClientSource, /<input role="combobox"[^>]*value=\{query\}/);
  assert.doesNotMatch(communityClientSource, /search\.suggestionsOpen[^\n]*<input role="combobox"[^>]*value=\{query\}/);
});

test("focusing or editing Contacts search again reopens suggestions", () => {
  const selected = { query: "Electrician", suggestionsOpen: false };
  assert.equal(contactSearchReducer(selected, { type: "focus" }).suggestionsOpen, true);
  assert.equal(contactSearchReducer(selected, { type: "change", query: "Electricians" }).suggestionsOpen, true);
  assert.match(communityClientSource, /onFocus=\{\(\) => dispatchSearch\(\{ type: "focus" \}\)\}/);
  assert.match(communityClientSource, /event\.key === "Escape"/);
  assert.match(communityClientSource, /!event\.currentTarget\.contains\(event\.relatedTarget\)/);
});
