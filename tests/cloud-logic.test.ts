import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queryCommunity } from "../app/shared/communityQueryEngine.ts";
import { answerNetworkQuestion, findShortestPaths, normalizeLinkedInUrl, parseLinkedInExport, resolveNetworkPerson, type NetworkEdge, type NetworkPerson } from "../app/shared/networkEngine.ts";
import { createProject, normalizeWorkspace } from "../app/graphStore.ts";

describe("LinkedIn export parsing is schema-driven and conservative", () => {
  const csv = `Notes about your export\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On,Ignored Field\nSai,Patel,https://www.linkedin.com/in/Sai-Patel/?trk=abc,,"Acme, Ltd",Engineer,10 Aug 2026,x\nSai,Patel,https://linkedin.com/in/sai-patel,,,,,duplicate\nAlex,Smith,,,,Designer,,\nAlex,Smith,,,,Founder,,\nBad,,,,,,,`;
  const preview = parseLinkedInExport(csv);

  it("normalises flexible headers, quoted CSV and LinkedIn URLs", () => {
    assert.equal(preview.people[0].linkedinProfileUrl, "https://www.linkedin.com/in/sai-patel");
    assert.equal(preview.people[0].company, "Acme, Ltd");
    assert.ok(preview.recognisedFields.includes("linkedinProfileUrl"));
    assert.deepEqual(preview.unrecognisedFields, ["Ignored Field"]);
  });

  it("deduplicates strong identities but never merges duplicate names alone", () => {
    assert.equal(preview.duplicates, 1);
    assert.equal(preview.people.filter((person) => person.displayName === "Alex Smith").length, 2);
  });

  it("rejects a file without connection fields", () => {
    assert.throws(() => parseLinkedInExport("hello,world\nfoo,bar"), /couldn't find connection data/i);
  });

  it("normalises only LinkedIn profile URLs", () => {
    assert.equal(normalizeLinkedInUrl("linkedin.com/in/Test-Person/?trk=x"), "https://www.linkedin.com/in/test-person");
    assert.equal(normalizeLinkedInUrl("https://example.com/in/Test?x=1"), "https://example.com/in/Test?x=1");
  });
});

describe("Network pathways come only from supplied graph edges", () => {
  const people: NetworkPerson[] = [
    { id: "A", displayName: "You", firstName: null, lastName: null, linkedinProfileUrl: null, email: null, company: null, position: null, connectedOn: null, identityKey: "circa:self" },
    { id: "B", displayName: "Adam Khan", firstName: null, lastName: null, linkedinProfileUrl: null, email: null, company: "Acme", position: "Designer", connectedOn: null, identityKey: "b" },
    { id: "C", displayName: "Maya Patel", firstName: null, lastName: null, linkedinProfileUrl: null, email: null, company: "North", position: "Founder", connectedOn: null, identityKey: "c" },
    { id: "D", displayName: "Sarah Johnson", firstName: null, lastName: null, linkedinProfileUrl: null, email: null, company: "Circa", position: "Engineer", connectedOn: null, identityKey: "d" },
    { id: "E", displayName: "Eve Ross", firstName: null, lastName: null, linkedinProfileUrl: null, email: null, company: null, position: null, connectedOn: null, identityKey: "e" },
  ];
  const edge = (id: string, sourcePersonId: string, targetPersonId: string): NetworkEdge => ({ id, sourcePersonId, targetPersonId, relationshipType: "linkedin-connection", provenance: "linkedin-import" });
  const edges = [edge("1", "A", "B"), edge("2", "B", "C"), edge("3", "C", "D"), edge("4", "A", "E"), edge("5", "E", "C"), edge("duplicate", "A", "B")];

  it("returns deterministic multiple shortest paths, direct, same and no-path cases", () => {
    assert.deepEqual(findShortestPaths(edges, "A", "D"), [["A", "B", "C", "D"], ["A", "E", "C", "D"]]);
    assert.deepEqual(findShortestPaths(edges, "A", "B"), [["A", "B"]]);
    assert.deepEqual(findShortestPaths(edges, "A", "A"), [["A"]]);
    assert.deepEqual(findShortestPaths(edges, "A", "missing"), []);
  });

  it("answers natural pathway variations through the graph engine", () => {
    const result = answerNetworkQuestion("Do I have any known connection to Sarah Johnson?", people, edges, "A");
    assert.equal(result.status, "found");
    assert.match(result.answer, /3-step known connection pathway/);
  });

  it("reports duplicate-name ambiguity instead of guessing", () => {
    const duplicates = [...people, { ...people[1], id: "B2", company: "Other" }];
    assert.equal(resolveNetworkPerson("Adam Khan", duplicates).status, "ambiguous");
  });

  it("does not infer an edge from shared company or position", () => {
    assert.deepEqual(findShortestPaths([], "B", "C"), []);
  });
});

describe("Community answers are grounded in the approved records supplied", () => {
  const approved = [
    { listId: "bins", listTitle: "Bins", itemId: "green", title: "Green bin", details: "Collected tomorrow morning", category: "Recycling" },
    { listId: "contacts", listTitle: "Useful contacts", itemId: "electric", title: "Pat's Electrics", details: "Local electrician", phone: "0161 555 0100" },
  ];
  it("finds tolerant bin and contact questions", () => {
    assert.match(queryCommunity("what bin is tomorrow please", approved).answer, /Green bin/);
    assert.match(queryCommunity("could you show me an electrician?", approved).answer, /Pat's Electrics/);
  });
  it("does not hallucinate absent information", () => {
    assert.match(queryCommunity("when is the next concert", approved).answer, /couldn't find/i);
  });
});

it("legacy local projects normalise to map mode without losing graph data", () => {
  const project = createProject("Local", "personal");
  const legacy = { version: 3, revision: 2, projects: [{ ...project, projectMode: undefined, schemaVersion: undefined }], folders: [], globalPeople: [], activeProjectId: project.id, updatedAt: project.updatedAt };
  const normal = normalizeWorkspace(legacy)!;
  assert.equal(normal.projects[0].projectMode, "map");
  assert.equal(normal.projects[0].graph.people.length, project.graph.people.length);
});
