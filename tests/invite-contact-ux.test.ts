import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildContactSearchSuggestions, contactMatchesCategoryFilter, contactSearchReducer } from "../app/community/contactSearchState.ts";
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
  { category: "Plumbing and Heating", contactKey: "services:pipe-care", listTitle: "Local services", title: "Pipe Care", phone: "07000 111111", services: "Boiler repairs", notes: "Emergency call-outs" },
  { category: "Plumbing and Heating", contactKey: "services:warm-home", listTitle: "Local services", title: "Warm Home Boilers", phone: "07000 222222", services: "Heating", notes: "Weekdays" },
  { category: "Plastering", contactKey: "services:smooth-walls", listTitle: "Local services", title: "Smooth Walls Ltd", phone: "07000 333333", services: "Interior walls", notes: "Plaster specialist" },
  { category: "Patio / Paving", contactKey: "services:stone-patio", listTitle: "Local services", title: "Stone Patio Co", phone: "07000 444444", services: "Garden paving", notes: "Outdoor work" },
  { category: "Electrician", contactKey: "services:sparks", listTitle: "Local services", title: "Plumbing Advice Electrical", phone: "07000 555555", services: "Plumbing-friendly rewires", notes: "Ask for the plumbing offer" },
];
const normalizeSuggestion = (value: string) => value.toLocaleLowerCase().trim();

test("partial query returns unique category suggestions only", () => {
  const suggestions = buildContactSearchSuggestions(contactSources, "Pl", normalizeSuggestion);
  assert.deepEqual(suggestions.map((suggestion) => suggestion.label), ["Plumbing and Heating", "Plastering"]);
  assert.ok(suggestions.every((suggestion) => suggestion.kind === "category"));
  assert.match(communityClientSource, /buildContactSearchSuggestions/);
});

test("individual contact data never appears as an autocomplete suggestion", () => {
  for (const forbiddenQuery of ["Pipe Care", "Warm Home", "07000", "Boiler repairs", "Emergency call-outs", "Local services"]) {
    assert.deepEqual(buildContactSearchSuggestions(contactSources, forbiddenQuery, normalizeSuggestion), []);
  }
  assert.doesNotMatch(communityClientSource, /type: "choose-contact"/);
  assert.doesNotMatch(communityClientSource, /contactKey: `\$\{list\.id\}:\$\{item\.id\}`/);
  assert.match(communityClientSource, /aria-label="Category suggestions"/);
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
  assert.match(communityClientSource, /<input role="combobox"[^>]*value=\{query\}/);
  assert.doesNotMatch(communityClientSource, /search\.suggestionsOpen[^\n]*<input role="combobox"[^>]*value=\{query\}/);
});

test("selecting a category does not open an individual contact", () => {
  const chooserStart = communityClientSource.indexOf("function chooseSearchSuggestion");
  const chooserEnd = communityClientSource.indexOf("return <section className=\"contacts-view\"", chooserStart);
  const chooser = communityClientSource.slice(chooserStart, chooserEnd);
  assert.ok(chooserStart >= 0 && chooserEnd > chooserStart, "category suggestion chooser must be present");
  assert.match(chooser, /dispatchSearch\(\{ type: "choose-category", label: suggestion\.label \}\)/);
  assert.doesNotMatch(chooser, /setSelected|setDraft|contactKey|matchingContact/);
});

test("selected category filters the list to every exact-category contact", () => {
  const visible = contactSources.filter((contact) => contactMatchesCategoryFilter(contact.category, "Pl", "Plumbing and Heating", normalizeSuggestion));
  assert.deepEqual(visible.map((contact) => contact.contactKey), ["services:pipe-care", "services:warm-home"]);
  assert.equal(contactMatchesCategoryFilter("Electrician", "Pl", "Plumbing and Heating", normalizeSuggestion), false);
  assert.match(communityClientSource, /contactMatchesCategoryFilter\(item\.category \|\| list\.title, query, search\.selectedCategory, normalizeSearch\)/);
});

test("a contact is opened only when the user manually chooses its filtered row", () => {
  const tableStart = communityClientSource.indexOf("<div className=\"contact-table\"");
  const tableEnd = communityClientSource.indexOf("{message &&", tableStart);
  const table = communityClientSource.slice(tableStart, tableEnd);
  assert.ok(tableStart >= 0 && tableEnd > tableStart, "Contacts result table must be rendered");
  assert.match(table, /className="contact-row"[\s\S]*onClick=\{\(\) => \{ dispatchSearch\(\{ type: "close" \}\); setSelected\(entry\)/);
});

test("editing Contacts search after category selection clears exact-category mode", () => {
  const selected = { query: "Plumbing and Heating", selectedCategory: "Plumbing and Heating", suggestionsOpen: false };
  const edited = contactSearchReducer(selected, { type: "change", query: "Plumb" });
  assert.deepEqual(edited, { query: "Plumb", selectedCategory: null, suggestionsOpen: true });
});

test("clearing Contacts search restores every contact", () => {
  const cleared = contactSearchReducer({ query: "Plumbing and Heating", selectedCategory: "Plumbing and Heating", suggestionsOpen: false }, { type: "change", query: "" });
  assert.deepEqual(cleared, { query: "", selectedCategory: null, suggestionsOpen: false });
  const visible = contactSources.filter((contact) => contactMatchesCategoryFilter(contact.category, cleared.query, cleared.selectedCategory, normalizeSuggestion));
  assert.equal(visible.length, contactSources.length);
});

test("mobile pointer selection prevents blur from cancelling the suggestion click", () => {
  const optionStart = communityClientSource.indexOf("key={suggestion.label}");
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
