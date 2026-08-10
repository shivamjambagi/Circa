import assert from "node:assert/strict";
import test from "node:test";
import { answerGraphQuestion, findConnectionPath } from "../app/askEngine.ts";
import { createInitialGraph, type Graph, type Person, type Relationship } from "../app/graphStore.ts";

function askGraph(): Graph {
  const graph = createInitialGraph(); const self = graph.people[0]; self.name = "You";
  const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ ...self, id, globalId: `global-${id}`, name, nickname: "", isSelf: false, groupIds: [], reportsToPersonId: "", team: "", ...extra });
  graph.people.push(
    person("mumski", "Mumski", { groupIds: ["family"] }),
    person("sai", "Sai", { groupIds: ["family"] }),
    person("venkatesh", "Venkatesh", { nickname: "Ven" }),
    person("adam", "Adam"),
    person("maya", "Maya", { team: "Frontend", reportsToPersonId: "james" }),
    person("priya", "Priya", { team: "Frontend", reportsToPersonId: "maya" }),
    person("james", "James"),
    person("alex-design", "Alex", { role: "Designer" }),
    person("alex-engineering", "Alex", { role: "Engineer" }),
    person("noah", "Noah"),
    person("group-a", "Group A", { groupIds: ["only-group"] }),
    person("group-b", "Group B", { groupIds: ["only-group"] }),
  );
  graph.groups.push(
    { id: "family", name: "Family", color: "sage", x: 0, y: 0, width: 400, height: 300 },
    { id: "only-group", name: "Only Group", color: "blue", x: 0, y: 0, width: 400, height: 300 },
  );
  const now = new Date().toISOString();
  const edge = (id: string, sourceId: string, targetId: string, labels: string[], introducedByPersonId = ""): Relationship => ({ id, sourceId, targetId, labels, label: labels[0], semantic: labels[0], type: "friend", strength: "normal", direction: "undirected", introducedByPersonId, createdAt: now, updatedAt: now });
  graph.relationships.push(
    edge("r-self-mumski", self.id, "mumski", ["Mother", "Family"]),
    edge("r-mumski-sai", "mumski", "sai", ["Brother", "Sibling"]),
    edge("r-sai-ven", "sai", "venkatesh", ["Friend", "Old friend"]),
    edge("r-self-maya", self.id, "maya", ["Friend"], "adam"),
    edge("r-mumski-maya", "mumski", "maya", ["Friend"]),
    edge("r-sai-maya", "sai", "maya", ["Friend"]),
  );
  return graph;
}

function result(question: string, graph = askGraph()) {
  const response = answerGraphQuestion(question, graph, { category: "family" });
  assert.equal(response.status, "result", `expected result for ${question}`);
  return response.status === "result" ? response : null!;
}

test("Ask benchmarks resolve deterministic graph queries and exact visual segments", async (t) => {
  await t.test("1 self path", () => assert.ok(result("How do I know Mumski?").relationshipIds.includes("r-self-mumski")));
  await t.test("2 named path", () => assert.ok(result("How does Sai know Mumski?").relationshipIds.includes("r-mumski-sai")));
  await t.test("3 connected wording", () => assert.equal(result("How is Sai connected to Mumski?").pathSegments.length, 1));
  await t.test("4 relationship-between wording", () => assert.match(result("What is the relationship between Sai and Mumski?").answer, /Brother|Sibling/));
  await t.test("5 nickname resolution", () => assert.deepEqual(new Set(result("How does Ven know Sai?").personIds), new Set(["venkatesh", "sai"])));
  await t.test("6 duplicate name clarification", () => { const r = answerGraphQuestion("How is Alex connected to Sai?", askGraph()); assert.equal(r.status, "clarification"); if (r.status === "clarification") assert.equal(r.clarification.options.length, 2); });
  await t.test("7 introducer lookup", () => assert.match(result("Who introduced me to Maya?").answer, /Adam/));
  await t.test("8 introductions by Person", () => assert.match(result("Who did Adam introduce me to?").answer, /Maya/));
  await t.test("9 mutual connections", () => assert.ok(result("Who do Sai and Mumski both know?").personIds.includes("maya")));
  await t.test("10 direct connections", () => assert.ok(result("Who is Sai connected to?").personIds.includes("venkatesh")));
  await t.test("11 relationship filter", () => { const r = result("Who are Sai's friends?"); assert.ok(r.relationshipIds.includes("r-sai-ven")); assert.equal(r.relationshipIds.includes("r-mumski-sai"), false); });
  await t.test("12 manager", () => assert.match(result("Who manages Priya?").answer, /Maya/));
  await t.test("13 direct reports", () => assert.ok(result("Who does Maya manage?").personIds.includes("priya")));
  await t.test("14 descendants", () => { const r = result("Who works under James?"); assert.ok(r.personIds.includes("maya")); assert.ok(r.personIds.includes("priya")); });
  await t.test("15 reporting chain", () => { const r = result("What is Priya's reporting chain?"); assert.equal(r.reportingEdges.length, 2); assert.deepEqual(r.personIds, ["priya", "maya", "james"]); });
  await t.test("16 groups", () => assert.match(result("What groups is Sai in?").answer, /Family/));
  await t.test("17 same team", () => assert.ok(result("Who is in the same team as Maya?").personIds.includes("priya")));
  await t.test("18 no direct connections", () => assert.ok(result("Who has no connections?").personIds.includes("noah")));
  await t.test("19 outside self component", () => assert.ok(result("Who isn't connected to me?").personIds.includes("noah")));
  await t.test("20 no stored path is a valid answer", () => assert.match(result("How is Noah connected to Sai?").answer, /No stored connection path/));
  await t.test("21 unknown Person returns error and can keep Compose open", () => assert.equal(answerGraphQuestion("How is Zoya connected to Sai?", askGraph()).status, "error"));
  await t.test("22 exact relationship id", () => assert.deepEqual(result("How is Sai connected to Mumski?").relationshipIds, ["r-mumski-sai"]));
  await t.test("23 reporting participates in paths", () => { const r = result("How is Priya connected to James?"); assert.equal(r.reportingEdges.length, 2); assert.equal(r.relationshipIds.length, 0); });
  await t.test("24 group membership alone is not a path", () => assert.deepEqual(findConnectionPath(askGraph(), "group-a", "group-b"), []));
  await t.test("25 multiple labels are returned", () => assert.match(result("What is the relationship between Sai and Mumski?").answer, /Brother, Sibling/));
});

test("Ask variations are data-driven rather than memorised phrases", () => {
  assert.match(result("Can you show the connection path from Mumski to Venkatesh?").answer, /through/);
  assert.ok(result("Which people are below James in the organisation branch?").personIds.includes("priya"));
  assert.match(result("Who is Priya's boss?").answer, /Maya/);
});
