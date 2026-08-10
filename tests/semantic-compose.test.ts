import assert from "node:assert/strict";
import test from "node:test";
import { applyComposeDraftToGraph } from "../app/composeEngine.ts";
import { interpretNaturalLanguage } from "../app/localSemanticInterpreter.ts";
import { compileSemanticInterpretation, validateSemanticInterpretation, type SemanticClaim } from "../app/composeSemantics.ts";
import { createInitialGraph, type ProjectCategory } from "../app/graphStore.ts";

function interpretation(text: string, category: ProjectCategory = "business", mode: "create" | "change" = "create", graph = createInitialGraph()) {
  return interpretNaturalLanguage(text, { mode, category, graph });
}

function relationships(claims: SemanticClaim[]) { return claims.filter((claim): claim is Extract<SemanticClaim, { type: "relationship" }> => claim.type === "relationship"); }
function reports(claims: SemanticClaim[]) { return claims.filter((claim): claim is Extract<SemanticClaim, { type: "reports_to" }> => claim.type === "reports_to"); }
function attributes(claims: SemanticClaim[]) { return claims.filter((claim): claim is Extract<SemanticClaim, { type: "attribute" }> => claim.type === "attribute"); }
function hasAttribute(claims: SemanticClaim[], person: string, field: string, value: string) { return attributes(claims).some((claim) => claim.subjectRef === person && claim.field === field && claim.value === value); }
function hasReport(claims: SemanticClaim[], employee: string, manager: string, polarity = "positive") { return reports(claims).some((claim) => claim.subjectRef === employee && claim.objectRef === manager && claim.polarity === polarity); }
function hasLabel(claims: SemanticClaim[], person: string, label: string) { return relationships(claims).some((claim) => [claim.subjectRef, claim.objectRef].includes(person) && claim.labels.includes(label)); }

test("30 common-English semantic benchmarks compile compositionally", async (t) => {
  await t.test("1 simple friend", () => assert.equal(hasLabel(interpretation("Adam is my friend.").claims, "adam", "Friend"), true));
  await t.test("2 coordinated independent predicates", () => { const r = interpretation("Adam is my friend and Maya is my colleague."); assert.equal(hasLabel(r.claims, "adam", "Friend"), true); assert.equal(hasLabel(r.claims, "maya", "Colleague"), true); });
  await t.test("3 shared plural relationship", () => { const r = interpretation("Maya and Daniel are my friends."); assert.equal(hasLabel(r.claims, "maya", "Friend"), true); assert.equal(hasLabel(r.claims, "daniel", "Friend"), true); });
  await t.test("4 respectively binds positionally", () => { const r = interpretation("Maya and Daniel lead frontend and backend respectively."); assert.equal(hasAttribute(r.claims, "maya", "team", "Frontend"), true); assert.equal(hasAttribute(r.claims, "daniel", "team", "Backend"), true); });
  await t.test("5 plural discourse reference", () => { const r = interpretation("Maya and Daniel are my colleagues. They both report to James."); assert.equal(hasReport(r.claims, "maya", "james"), true); assert.equal(hasReport(r.claims, "daniel", "james"), true); });
  await t.test("6 singular pronoun resolves from discourse", () => assert.equal(hasReport(interpretation("James is CTO. Maya reports to him.").claims, "maya", "james"), true));
  await t.test("7 genuinely ambiguous pronoun is not guessed", () => { const r = interpretation("Maya and Priya met James. She reports to him."); assert.equal(r.ambiguities.some((item) => /She/.test(item.question)), true); assert.equal(reports(r.claims).length, 0); });
  await t.test("8 active introduction", () => { const r = interpretation("Adam introduced me to Maya."); const claim = r.claims.find((item) => item.type === "introduction"); assert.deepEqual(claim && [claim.subjectRef, claim.objectRef, claim.introducedByRef], ["self", "maya", "adam"]); });
  await t.test("9 passive introduction", () => { const r = interpretation("Maya was introduced to me by Adam."); const claim = r.claims.find((item) => item.type === "introduction"); assert.deepEqual(claim && [claim.subjectRef, claim.objectRef, claim.introducedByRef], ["maya", "self", "adam"]); });
  await t.test("10 through provenance", () => { const claim = interpretation("I know Maya through Adam.").claims.find((item) => item.type === "introduction"); assert.equal(claim?.introducedByRef, "adam"); });
  await t.test("11 role and relationship stay separate", () => { const r = interpretation("Maya is a developer and my friend."); assert.equal(hasAttribute(r.claims, "maya", "role", "Developer"), true); assert.equal(hasLabel(r.claims, "maya", "Friend"), true); });
  await t.test("12 works together is colleague, not reporting", () => { const r = interpretation("Sarah and James work together."); assert.equal(hasLabel(r.claims, "sarah", "Colleague"), true); assert.equal(reports(r.claims).length, 0); });
  await t.test("13 manages inverts to employee reports-to manager", () => assert.equal(hasReport(interpretation("Sarah manages James.").claims, "james", "sarah"), true));
  await t.test("14 works under is reporting in Business", () => assert.equal(hasReport(interpretation("James works under Sarah.").claims, "james", "sarah"), true));
  await t.test("15 works with never invents a manager", () => assert.equal(reports(interpretation("James works with Sarah.").claims).length, 0));
  await t.test("16 former manager is superseded by current manager", () => { const r = interpretation("Priya used to report to Daniel but now reports to Maya."); assert.equal(hasReport(r.claims, "priya", "maya"), true); assert.equal(hasReport(r.claims, "priya", "daniel"), false); });
  await t.test("17 correction replaces earlier manager", () => { const r = interpretation("Daniel reports to James - actually Maya."); assert.equal(hasReport(r.claims, "daniel", "maya"), true); assert.equal(hasReport(r.claims, "daniel", "james"), false); });
  await t.test("18 negation is a reviewed removal claim", () => assert.equal(hasReport(interpretation("Maya does not report to James.", "business", "change").claims, "maya", "james", "negative"), true));
  await t.test("19 role-only Change emits no unrelated semantic fields", () => { const r = interpretation("Change Maya's role to Senior Developer.", "business", "change"); assert.equal(hasAttribute(r.claims, "maya", "role", "Senior Developer"), true); assert.equal(attributes(r.claims).length, 1); });
  await t.test("20 team membership does not create a human relationship", () => { const r = interpretation("Maya and Adam are in Frontend."); assert.equal(r.claims.filter((claim) => claim.type === "group_membership").length, 2); assert.equal(relationships(r.claims).length, 0); });
  await t.test("21 multiple labels remain one semantic connection", () => { const r = interpretation("Maya is my friend, classmate and project partner.", "school"); const edge = relationships(r.claims)[0]; assert.deepEqual(new Set(edge.labels), new Set(["Friend", "Classmate", "Project Partner"])); });
  await t.test("22 teacher and subject are separate facts", () => { const r = interpretation("Mr Ahmed teaches me Computer Science.", "school"); assert.equal(hasLabel(r.claims, "mr_ahmed", "Teacher"), true); assert.equal(hasAttribute(r.claims, "mr_ahmed", "subject", "Computer Science"), true); });
  await t.test("23 parent language keeps family meaning", () => { const r = interpretation("Mumski is my mum.", "family"); assert.equal(hasLabel(r.claims, "mumski", "Mother"), true); });
  await t.test("24 possessive family and safe uncle inference", () => { const r = interpretation("Mumski is my mum and Sai is her brother.", "family"); assert.equal(hasLabel(r.claims, "sai", "Brother"), true); assert.equal(relationships(r.claims).some((claim) => claim.derived && claim.labels.includes("Uncle")), true); assert.equal(r.ambiguities.length, 0); });
  await t.test("25 category-specific custom relationship", () => assert.equal(hasLabel(interpretation("Rohan is my sparring partner.", "other").claims, "rohan", "Sparring Partner"), true));
  await t.test("26 missing punctuation retains two role-plus-friend frames", () => { const r = interpretation("Akshatha CFO my friend Venkatesh CEO my friend", "other"); assert.equal(hasAttribute(r.claims, "akshatha", "role", "CFO"), true); assert.equal(hasAttribute(r.claims, "venkatesh", "role", "CEO"), true); assert.equal(hasLabel(r.claims, "akshatha", "Friend"), true); assert.equal(hasLabel(r.claims, "venkatesh", "Friend"), true); });
  await t.test("27 imperfect dictation composes relationship, team and reporting", () => { const r = interpretation("maya collegue she work frontend under james"); assert.equal(hasLabel(r.claims, "maya", "Colleague"), true); assert.equal(hasAttribute(r.claims, "maya", "team", "Frontend"), true); assert.equal(hasReport(r.claims, "maya", "james"), true); });
  await t.test("28 compact executive list and plural ellipsis", () => { const r = interpretation("Sarah is CEO, James CTO, Maya frontend lead, Daniel backend lead. both of them report james"); assert.equal(hasAttribute(r.claims, "sarah", "role", "CEO"), true); assert.equal(hasAttribute(r.claims, "maya", "team", "Frontend"), true); assert.equal(hasReport(r.claims, "maya", "james"), true); assert.equal(hasReport(r.claims, "daniel", "james"), true); });
  await t.test("29 relationship vocabulary typo is corrected without rewriting names", () => assert.equal(hasLabel(interpretation("Maya is my freind").claims, "maya", "Friend"), true));
  await t.test("30 uncertain works-for meaning produces a clarification", () => { const r = interpretation("Maya works for James."); assert.equal(r.ambiguities.some((item) => item.kind === "meaning"), true); assert.equal(reports(r.claims).length, 0); });
});

test("multi-sentence, correction and unseen language variations preserve semantics", () => {
  const paragraph = interpretation("Sarah is CEO of Acme. James is the CTO and reports to her. Maya and Daniel lead frontend and backend respectively and both report to James. Maya is also an old friend of mine and she introduced me to Priya. Priya used to be on Daniel's team but moved to Maya's team recently.");
  assert.equal(hasAttribute(paragraph.claims, "sarah", "company", "Acme"), true);
  assert.equal(hasReport(paragraph.claims, "james", "sarah"), true);
  assert.equal(hasReport(paragraph.claims, "maya", "james"), true);
  assert.equal(paragraph.claims.some((claim) => claim.type === "introduction" && claim.introducedByRef === "maya" && [claim.subjectRef, claim.objectRef].includes("priya")), true);
  assert.equal(paragraph.claims.some((claim) => claim.type === "group_membership" && claim.subjectRef === "priya" && claim.groupName === "Frontend"), true);
  assert.equal(hasReport(paragraph.claims, "priya", "maya"), false);

  const correction = interpretation("James runs engineering. Maya and Daniel report to him. Actually Daniel doesn't - Daniel reports directly to Sarah.");
  assert.equal(hasReport(correction.claims, "maya", "james"), true);
  assert.equal(hasReport(correction.claims, "daniel", "sarah"), true);
  assert.equal(hasReport(correction.claims, "daniel", "james"), false);

  const variations = interpretation("Leila and Noor are both my mates. The two of them report to Priya.");
  assert.equal(hasLabel(variations.claims, "leila", "Friend"), true);
  assert.equal(hasReport(variations.claims, "noor", "priya"), true);
});

test("hard pronoun, natural family and no-hallucination benchmarks stay conservative", () => {
  const pronoun = interpretation("Maya introduced Priya to Sarah. She reports to James.");
  assert.equal(pronoun.ambiguities.some((item) => /She/.test(item.question) && item.options.length === 3), true);
  assert.equal(reports(pronoun.claims).length, 0);

  const family = interpretation("Mumski is my mum. Her brother is Sai. Sai's son is Ven.", "family");
  assert.equal(hasLabel(family.claims, "mumski", "Mother"), true);
  assert.equal(hasLabel(family.claims, "sai", "Brother"), true);
  assert.equal(hasLabel(family.claims, "ven", "Child"), true);
  assert.equal(relationships(family.claims).some((claim) => claim.derived && claim.labels.includes("Uncle")), true);
  assert.equal(relationships(family.claims).some((claim) => claim.derived && claim.labels.includes("Cousin")), true);

  const work = interpretation("Sarah works at Acme with Maya.");
  assert.equal(hasAttribute(work.claims, "sarah", "company", "Acme"), true);
  assert.equal(hasAttribute(work.claims, "maya", "company", "Acme"), true);
  assert.equal(hasLabel(work.claims, "maya", "Colleague"), true);
  assert.equal(attributes(work.claims).some((claim) => ["CEO", "Developer"].includes(claim.value)), false);
  assert.equal(reports(work.claims).length, 0);
});

test("complete natural paragraph composes present facts without storing former context", () => {
  const r = interpretation("Maya and Daniel lead frontend and backend respectively. They're both under James. Maya is also an old friend of mine, she introduced me to Priya, and Priya used to work with Daniel but she's moved over to Maya's team now.");
  assert.equal(hasAttribute(r.claims, "maya", "team", "Frontend"), true);
  assert.equal(hasAttribute(r.claims, "daniel", "team", "Backend"), true);
  assert.equal(hasReport(r.claims, "maya", "james"), true);
  assert.equal(hasReport(r.claims, "daniel", "james"), true);
  assert.equal(hasLabel(r.claims, "maya", "Friend"), true);
  assert.equal(r.claims.some((claim) => claim.type === "introduction" && claim.introducedByRef === "maya" && [claim.subjectRef, claim.objectRef].includes("priya")), true);
  assert.equal(r.claims.some((claim) => claim.type === "group_membership" && claim.subjectRef === "priya" && claim.groupName === "Frontend"), true);
  assert.equal(hasReport(r.claims, "priya", "maya"), false);
});

test("validated semantics compile to reviewed drafts; only Apply mutates a graph", () => {
  const graph = createInitialGraph(); const before = JSON.stringify(graph);
  const raw = { version: "circa-semantic-v1", entities: [{ ref: "maya", displayName: "Maya", aliases: [], evidence: ["Maya is my friend"] }], claims: [{ id: "c1", type: "relationship", subjectRef: "self", objectRef: "maya", labels: ["Friend"], direction: "undirected", evidenceText: "Maya is my friend", certainty: "explicit", polarity: "positive", derived: false }], ambiguities: [], warnings: [] };
  const validated = validateSemanticInterpretation(raw); assert.ok(validated);
  const draft = compileSemanticInterpretation(validated, { mode: "create", graph, category: "personal" });
  assert.equal(JSON.stringify(graph), before, "interpretation and compilation must not mutate the source graph");
  assert.equal(draft.people.length, 1); assert.equal(draft.relationships.length, 1);
  const applied = applyComposeDraftToGraph(draft, graph, "personal");
  assert.equal(applied.graph.people.some((person) => person.name === "Maya"), true);
  assert.equal(applied.graph.relationships.some((edge) => edge.labels.includes("Friend")), true);
});

test("provider validation rejects dangling claims instead of hallucinating People", () => {
  const validated = validateSemanticInterpretation({ version: "circa-semantic-v1", entities: [], claims: [{ id: "bad", type: "reports_to", subjectRef: "made_up", objectRef: "also_missing", evidenceText: "", certainty: "explicit", polarity: "positive" }], ambiguities: [], warnings: [] });
  assert.ok(validated); assert.equal(validated.claims.length, 0); assert.equal(validated.entities.length, 0);
});
