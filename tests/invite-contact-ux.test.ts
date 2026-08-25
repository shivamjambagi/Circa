import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildContactSearchSuggestions, contactMatchesSelectedCategory, contactSearchReducer } from "../app/community/contactSearchState.ts";
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

const contactSources = [
  { category: "Plumbing and Heating", contactKey: "services:pipe-care", listTitle: "Local services", title: "Pipe Care" },
  { category: "Electrician", contactKey: "services:sparks", listTitle: "Local services", title: "Plumbing Advice Electrical" },
];
const normalizeSuggestion = (value: string) => value.toLocaleLowerCase().trim();

test("partial category query shows the complete category suggestion", () => {
  const suggestions = buildContactSearchSuggestions(contactSources, "Pl", normalizeSuggestion);
  assert.ok(suggestions.some((suggestion) => suggestion.kind === "category" && suggestion.label === "Plumbing and Heating"));
  assert.match(communityClientSource, /buildContactSearchSuggestions/);
});

test("selecting a category commits its complete label to Contacts search", () => {
  const searching = { query: "Pl", selectedCategory: null, suggestionsOpen: true };
  const selected = contactSearchReducer(searching, { type: "choose-category", label: "Plumbing and Heating" });
  assert.equal(selected.query, "Plumbing and Heating");
  assert.equal(selected.selectedCategory, "Plumbing and Heating");
});

test("selecting a category closes Contacts suggestions", () => {
  const selected = contactSearchReducer({ query: "Pl", selectedCategory: null, suggestionsOpen: true }, { type: "choose-category", label: "Plumbing and Heating" });
  assert.equal(selected.suggestionsOpen, false);
});

test("selected category filters contacts by exact category rather than the previous fuzzy query", () => {
  const visible = contactSources.filter((contact) => contactMatchesSelectedCategory(contact.category, contact.listTitle, "Plumbing and Heating"));
  assert.deepEqual(visible.map((contact) => contact.contactKey), ["services:pipe-care"]);
  assert.equal(contactMatchesSelectedCategory("Electrician", "Plumbing and Heating", "Plumbing and Heating"), false);
  assert.equal(contactMatchesSelectedCategory(undefined, "Plumbing and Heating", "Plumbing and Heating"), true);
  assert.match(communityClientSource, /search\.selectedCategory[\s\S]*contactMatchesSelectedCategory/);
});

test("Contacts search input remains rendered after category selection", () => {
  const selected = contactSearchReducer({ query: "Pl", selectedCategory: null, suggestionsOpen: true }, { type: "choose-category", label: "Plumbing and Heating" });
  assert.equal(selected.query, "Plumbing and Heating");
  assert.match(communityClientSource, /<input role="combobox"[^>]*value=\{query\}/);
  assert.doesNotMatch(communityClientSource, /search\.suggestionsOpen[^\n]*<input role="combobox"[^>]*value=\{query\}/);
});

test("editing Contacts search after category selection clears exact-category mode", () => {
  const selected = { query: "Plumbing and Heating", selectedCategory: "Plumbing and Heating", suggestionsOpen: false };
  const edited = contactSearchReducer(selected, { type: "change", query: "Plumb" });
  assert.deepEqual(edited, { query: "Plumb", selectedCategory: null, suggestionsOpen: true });
});

test("existing contact-suggestion selection still opens the contact and closes suggestions", () => {
  const selected = contactSearchReducer({ query: "Pipe", selectedCategory: "Plumbing and Heating", suggestionsOpen: true }, { type: "choose-contact", label: "Pipe Care" });
  assert.deepEqual(selected, { query: "Pipe Care", selectedCategory: null, suggestionsOpen: false });
  assert.match(communityClientSource, /suggestion\.kind === "category"/);
  assert.match(communityClientSource, /setSelected\(matchingContact\)/);
  assert.match(communityClientSource, /dispatchSearch\(\{ type: "close" \}\); setSelected\(entry\)/);
});

test("mobile pointer selection prevents blur from cancelling the suggestion click", () => {
  const optionStart = communityClientSource.indexOf("key={`${suggestion.kind}:${suggestion.label}`}");
  const optionEnd = communityClientSource.indexOf("{suggestion.label}</button>", optionStart);
  const option = communityClientSource.slice(optionStart, optionEnd);
  assert.ok(optionStart >= 0 && optionEnd > optionStart, "typed suggestion option must be rendered");
  assert.match(option, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(option, /onPointerUp=\{\(\) => chooseSearchSuggestion\(suggestion\)\}/);
  assert.match(option, /onClick=\{\(\) => chooseSearchSuggestion\(suggestion\)\}/);
  assert.ok(option.indexOf("onPointerDown") < option.indexOf("onPointerUp") && option.indexOf("onPointerUp") < option.indexOf("onClick"));
  assert.match(communityClientSource, /onFocus=\{\(\) => dispatchSearch\(\{ type: "focus" \}\)\}/);
  assert.match(communityClientSource, /event\.key === "Escape"/);
  assert.match(communityClientSource, /!event\.currentTarget\.contains\(event\.relatedTarget\)/);
});
