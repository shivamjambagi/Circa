import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyWorkspace,
  createInitialGraph,
  createProject,
  deleteGlobalPerson,
  mergeProjectGraph,
  LocalProjectGraphStore,
  LocalWorkspaceStore,
  MAX_WORKSPACE_BACKUP_BYTES,
  normalizeGraph,
  normalizeWorkspace,
  parseWorkspaceBackup,
  readWorkspaceBackupFile,
  serializeWorkspace,
  validPersonName,
} from "../app/graphStore.ts";
import { applyComposeDraftToGraph, createImportDraft, hasReportingCycle, type ComposeDraft, type ComposeDraftPerson } from "../app/composeEngine.ts";
import { calculateFitViewport, layoutOrganisation } from "../app/orgLayout.ts";
import { parseSpokenPerson } from "../app/voiceParser.ts";
import { calculateWorkspaceSize, resizeCanvasRect } from "../app/canvasGeometry.ts";

function draftPerson(name: string, ref: string): ComposeDraftPerson {
  return {
    id: `id-${ref}`, ref, name, role: "", company: "", department: "", team: "", subject: "", contextRole: "", managerName: "", phone: "", email: "", linkedinUrl: "", githubUrl: "", relationshipLabel: "", relationshipType: "friend", howWeMet: "",
    matchId: "", suggestedMatchIds: [], identityResolution: "create", fieldPatches: { name: { action: "set", value: name }, manager: { action: "unchanged" } }, includeInOrgChart: null,
    selected: true, needsReview: false, x: 400, y: 300,
  };
}

function draft(people: ComposeDraftPerson[]): ComposeDraft {
  return { id: "compose-test", mode: "create", source: "paste", people, relationships: [], groups: [], warnings: [], createdAt: new Date().toISOString() };
}

test("v2 graph migration repairs nested records and keeps exactly one self", () => {
  const now = new Date().toISOString();
  const graph = normalizeGraph({
    version: 1,
    people: [
      { ...createInitialGraph().people[0], isSelf: true },
      { ...createInitialGraph().people[0], id: "duplicate-self", isSelf: true },
      { id: "maya", globalId: "global-maya", name: "Maya", x: 1, y: 2, groupId: "studio", reportsToPersonId: "missing", createdAt: now, updatedAt: now },
      null,
    ],
    groups: [{ id: "studio", name: "Studio", x: 0, y: 0, width: 300, height: 200, color: "blue" }, { nope: true }],
    relationships: [{ id: "edge", sourceId: "person_self", targetId: "maya", type: "close", label: "Mentor", createdAt: now, updatedAt: now }, { sourceId: "missing", targetId: "maya" }],
    notes: [{ id: "note", text: "Project-only context", x: 1, y: 2, color: "yellow", createdAt: now, updatedAt: now }, null],
    viewport: { x: 0, y: 0, zoom: 99 },
  });
  assert.equal(graph.version, 2);
  assert.equal(graph.people.filter((person) => person.isSelf).length, 1);
  assert.deepEqual(graph.people.find((person) => person.id === "maya")?.groupIds, ["studio"]);
  assert.equal(graph.people.find((person) => person.id === "maya")?.reportsToPersonId, "");
  assert.deepEqual(graph.relationships[0].labels, ["Mentor"]);
  assert.equal(graph.relationships[0].strength, "close");
  assert.equal(graph.relationships.length, 1);
  assert.equal(graph.viewport.zoom, 2.4);
});

test("workspace v3 separates global identity from project notes and fixes active project", () => {
  const project = createProject("People", "personal");
  const maya = { ...createInitialGraph().people[0], id: "maya", globalId: "global-maya", name: "Maya", isSelf: false, notes: "Only in this project" };
  project.graph.people.push(maya);
  const workspace = normalizeWorkspace({ version: 2, projects: [project], folders: [], globalPeople: [{ ...maya, id: "global-maya", notes: "legacy global leak" }], activeProjectId: "missing" });
  assert.ok(workspace);
  assert.equal(workspace?.version, 3);
  assert.equal(workspace?.activeProjectId, project.id);
  assert.equal("notes" in (workspace?.globalPeople[0] ?? {}), false);
  assert.equal(workspace?.projects[0].graph.people.find((person) => person.id === "maya")?.notes, "Only in this project");
});

test("global delete cascades people, threads and manager references across projects", () => {
  const project = createProject("Work", "business");
  const now = new Date().toISOString();
  const self = project.graph.people[0];
  const maya = { ...self, id: "maya", globalId: "global-maya", name: "Maya", isSelf: false };
  const dan = { ...self, id: "dan", globalId: "global-dan", name: "Dan", isSelf: false, reportsToPersonId: "maya" };
  project.graph.people.push(maya, dan);
  project.graph.relationships.push({ id: "edge", sourceId: "maya", targetId: "dan", type: "friend", label: "Colleague", labels: ["Colleague"], semantic: "Colleague", strength: "normal", direction: "undirected", introducedByPersonId: "", createdAt: now, updatedAt: now });
  const workspace = { ...createEmptyWorkspace(), projects: [project], globalPeople: [{ id: "global-maya", name: "Maya", nickname: "", phone: "", email: "", githubUrl: "", linkedinUrl: "", createdAt: now, updatedAt: now }], activeProjectId: project.id };
  const next = deleteGlobalPerson(workspace, "global-maya");
  assert.equal(next.projects[0].graph.people.some((person) => person.id === "maya"), false);
  assert.equal(next.projects[0].graph.people.find((person) => person.id === "dan")?.reportsToPersonId, "");
  assert.equal(next.projects[0].graph.relationships.length, 0);
});

test("deleting an introducer clears attribution without deleting endpoint relationships", () => {
  const project = createProject("Introductions", "personal");
  const now = new Date().toISOString(); const base = project.graph.people[0];
  const introducer = { ...base, id: "introducer", globalId: "global-introducer", name: "Alex", isSelf: false };
  const maya = { ...base, id: "maya", globalId: "global-maya", name: "Maya", isSelf: false };
  project.graph.people.push(introducer, maya);
  project.graph.relationships.push({ id: "edge", sourceId: base.id, targetId: maya.id, type: "friend", label: "Friend", labels: ["Friend"], semantic: "Friend", strength: "normal", direction: "undirected", introducedByPersonId: introducer.id, createdAt: now, updatedAt: now });
  const workspace = { ...createEmptyWorkspace(), projects: [project], globalPeople: [introducer, maya].map(({ globalId: id, name, nickname, phone, email, githubUrl, linkedinUrl, createdAt, updatedAt }) => ({ id, name, nickname, phone, email, githubUrl, linkedinUrl, createdAt, updatedAt })), activeProjectId: project.id };
  const next = deleteGlobalPerson(workspace, introducer.globalId);
  assert.equal(next.projects[0].graph.relationships.length, 1);
  assert.equal(next.projects[0].graph.relationships[0].introducedByPersonId, "");
});

test("backup round-trip is normalized", () => {
  const workspace = createEmptyWorkspace();
  const parsed = parseWorkspaceBackup(serializeWorkspace(workspace));
  assert.equal(parsed.version, 3);
  assert.deepEqual(parsed.projects, []);
});

test("backup files are size-capped before their contents are read", async () => {
  let read = false;
  await assert.rejects(() => readWorkspaceBackupFile({ size: MAX_WORKSPACE_BACKUP_BYTES + 1, text: async () => { read = true; return "{}"; } }), /up to 10 MB/);
  assert.equal(read, false);
});

test("old workspace shapes and 50-500 person workspaces normalize and round-trip", () => {
  const oldProject = createProject("Legacy", "personal");
  const legacy = normalizeWorkspace({ version: 2, revision: 1, projects: [{ ...oldProject, projectMode: undefined, schemaVersion: undefined, graph: { ...oldProject.graph, version: 1 } }], folders: [], activeProjectId: oldProject.id });
  assert.equal(legacy?.version, 3); assert.equal(legacy?.projects[0].graph.version, 2);
  for (const count of [50, 100, 250, 500]) {
    const project = createProject(`Stress ${count}`, "business"); const base = project.graph.people[0];
    project.graph.people.push(...Array.from({ length: count }, (_, index) => ({ ...base, id: `person-${index}`, globalId: `global-${index}`, name: `Person ${index}`, isSelf: false, x: 100 + index * 3, y: 200 + index * 2 })));
    const workspace = normalizeWorkspace({ ...createEmptyWorkspace(), projects: [project], folders: [], activeProjectId: project.id });
    assert.ok(workspace); const restored = parseWorkspaceBackup(serializeWorkspace(workspace!));
    assert.equal(restored.projects[0].graph.people.filter((person) => !person.isSelf).length, count);
  }
});

test("oversized local workspaces fail with actionable quota recovery copy", async () => {
  const memory = new Map<string, string>();
  const localStorage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); }, clear: () => memory.clear(), key: (index: number) => [...memory.keys()][index] ?? null, get length() { return memory.size; } };
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { localStorage, sessionStorage: localStorage, dispatchEvent() {} };
  try {
    const project = createProject("Full", "personal");
    project.graph.notes = Array.from({ length: 650 }, (_, index) => ({ id: `note-${index}`, text: "x".repeat(8000), color: "yellow" as const, x: index, y: index, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    await assert.rejects(() => new LocalWorkspaceStore().saveWorkspace({ ...createEmptyWorkspace(), projects: [project], activeProjectId: project.id }), /too large|local storage is full/i);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test("org layout is deterministic and centers a manager above its subtree", () => {
  const base = createInitialGraph().people[0];
  const manager = { ...base, id: "manager", globalId: "g-manager", name: "Manager", isSelf: false };
  const left = { ...base, id: "left", globalId: "g-left", name: "Left", isSelf: false, reportsToPersonId: "manager" };
  const right = { ...base, id: "right", globalId: "g-right", name: "Right", isSelf: false, reportsToPersonId: "manager" };
  const first = layoutOrganisation([right, manager, left], new Set());
  const second = layoutOrganisation([left, right, manager], new Set());
  assert.deepEqual([...first.positions], [...second.positions]);
  const managerX = first.positions.get("manager")?.x ?? 0;
  const childMidpoint = ((first.positions.get("left")?.x ?? 0) + (first.positions.get("right")?.x ?? 0)) / 2;
  assert.equal(managerX, childMidpoint);
});

test("large Group dimensions are preserved without an artificial maximum", () => {
  const graph = normalizeGraph({ ...createInitialGraph(), groups: [{ id: "large", name: "Engineering", color: "sage", x: 120, y: 80, width: 5000, height: 3200 }] });
  assert.equal(graph.groups[0].width, 5000);
  assert.equal(graph.groups[0].height, 3200);
});

test("Group resize converts screen movement at any zoom and has minimums but no maximum", () => {
  const atQuarterZoom = resizeCanvasRect({ x: 100, y: 80, width: 400, height: 300, direction: "se", screenDeltaX: 650, screenDeltaY: 425, zoom: .25, minWidth: 220, minHeight: 160 });
  assert.deepEqual(atQuarterZoom, { x: 100, y: 80, width: 3000, height: 2000 });
  const atOneFifty = resizeCanvasRect({ x: 100, y: 80, width: 3000, height: 2000, direction: "nw", screenDeltaX: 4200, screenDeltaY: 3000, zoom: 1.5, minWidth: 220, minHeight: 160 });
  assert.deepEqual(atOneFifty, { x: 2880, y: 1920, width: 220, height: 160 });
});

test("logical workspace expands for large and negatively positioned Groups", () => {
  const large = calculateWorkspaceSize([{ x: 200, y: 100, width: 5000, height: 2500 }], 1800, 1100);
  assert.ok(large.width > 5200);
  assert.ok(large.height > 2600);
  const movedLeft = calculateWorkspaceSize([{ x: -2600, y: -900, width: 800, height: 500 }], 1800, 1100);
  assert.ok(movedLeft.width > 3000);
  assert.ok(movedLeft.height > 1800);
});

test("Compose role-only change preserves the existing manager", () => {
  const graph = createInitialGraph();
  const base = graph.people[0];
  const daniel = { ...base, id: "daniel", globalId: "g-daniel", name: "Daniel", isSelf: false };
  const priya = { ...base, id: "priya", globalId: "g-priya", name: "Priya", role: "Developer", reportsToPersonId: "daniel", isSelf: false };
  graph.people.push(daniel, priya);
  const person = { ...draftPerson("Priya", "existing:priya"), matchId: "priya", identityResolution: "use-existing" as const, role: "Senior Developer", fieldPatches: { name: { action: "unchanged" as const }, role: { action: "set" as const, value: "Senior Developer" }, manager: { action: "unchanged" as const } } };
  const result = applyComposeDraftToGraph({ ...draft([person]), mode: "change" }, graph, "business");
  assert.equal(result.error, undefined);
  assert.equal(result.graph.people.find((item) => item.id === "priya")?.role, "Senior Developer");
  assert.equal(result.graph.people.find((item) => item.id === "priya")?.reportsToPersonId, "daniel");
  assert.equal(result.operations.length, 1);
});

test("Compose explicit manager clear produces one clear operation", () => {
  const graph = createInitialGraph(); const base = graph.people[0];
  graph.people.push({ ...base, id: "daniel", globalId: "g-daniel", name: "Daniel", isSelf: false }, { ...base, id: "priya", globalId: "g-priya", name: "Priya", reportsToPersonId: "daniel", isSelf: false });
  const person = { ...draftPerson("Priya", "existing:priya"), matchId: "priya", identityResolution: "use-existing" as const, fieldPatches: { name: { action: "unchanged" as const }, manager: { action: "clear" as const } } };
  const result = applyComposeDraftToGraph({ ...draft([person]), mode: "change" }, graph, "business");
  assert.equal(result.graph.people.find((item) => item.id === "priya")?.reportsToPersonId, "");
  assert.deepEqual(result.operations.map((operation) => operation.type), ["CLEAR_MANAGER"]);
});

test("duplicate names require an explicit identity choice", () => {
  const graph = createInitialGraph(); const base = graph.people[0];
  graph.people.push({ ...base, id: "alex-design", globalId: "g1", name: "Alex Smith", role: "Designer", isSelf: false }, { ...base, id: "alex-engineering", globalId: "g2", name: "Alex Smith", role: "Engineer", isSelf: false });
  const person = { ...draftPerson("Alex Smith", "draft:alex"), identityResolution: "unresolved" as const, suggestedMatchIds: ["alex-design", "alex-engineering"] };
  const result = applyComposeDraftToGraph({ ...draft([person]), mode: "change" }, graph, "business");
  assert.match(result.error ?? "", /Choose whether|Which Alex Smith/);
  assert.equal(result.graph, graph);
});

test("Business Compose keeps a human relationship alongside organisation data", () => {
  const graph = createInitialGraph();
  const proposal = createImportDraft({ text: "Akshatha - CFO - relationship: Friend", source: "paste", mode: "create", category: "business", existingPeople: graph.people });
  const result = applyComposeDraftToGraph(proposal, graph, "business");
  const akshatha = result.graph.people.find((person) => person.name === "Akshatha");
  assert.equal(akshatha?.role, "CFO");
  assert.equal(akshatha?.includeInOrgChart, true);
  assert.equal(result.graph.relationships.some((relationship) => relationship.targetId === akshatha?.id && relationship.labels.includes("Friend")), true);
});

test("Compose relationship refs create Friend, introduction and Mentor proposals", () => {
  const graph = createInitialGraph();
  const adam = draftPerson("Adam", "draft:adam"); const maya = draftPerson("Maya", "draft:maya"); const daniel = draftPerson("Daniel", "draft:daniel");
  const proposal: ComposeDraft = { ...draft([adam, maya, daniel]), relationships: [
    { id: "r1", sourceRef: "self", targetRef: "draft:adam", labels: ["Friend"], direction: "undirected", strength: "normal", introducedByRef: "", selected: true },
    { id: "r2", sourceRef: "self", targetRef: "draft:maya", labels: ["Introduced through"], direction: "undirected", strength: "normal", introducedByRef: "draft:adam", selected: true },
    { id: "r3", sourceRef: "draft:maya", targetRef: "draft:daniel", labels: ["Mentor"], direction: "source-to-target", strength: "normal", introducedByRef: "", selected: true },
  ] };
  const result = applyComposeDraftToGraph(proposal, graph, "personal");
  assert.equal(result.error, undefined);
  assert.equal(result.graph.relationships.length, 3);
  assert.equal(result.graph.relationships.find((relationship) => relationship.labels.includes("Introduced through"))?.introducedByPersonId, result.graph.people.find((person) => person.name === "Adam")?.id);
  assert.equal(result.graph.relationships.find((relationship) => relationship.labels.includes("Mentor"))?.direction, "source-to-target");
});

test("voice name-only input never invents a relationship and categories are explicit", () => {
  assert.deepEqual(parseSpokenPerson("Her name is Maya.", "business"), { name: "Maya", howWeMet: "", relationshipDetected: false, relationshipType: null, relationshipLabel: "" });
  assert.equal(parseSpokenPerson("Her name is Maya and she is my colleague.", "business")?.relationshipLabel, "Colleague");
  assert.equal(parseSpokenPerson("His name is Adam and he is my classmate.", "school")?.relationshipLabel, "Classmate");
  assert.equal(parseSpokenPerson("Her name is Sarah and she is my coach.", "community")?.relationshipLabel, "Coach");
});

test("blank Person names are rejected without replacing the stored name", () => {
  assert.equal(validPersonName("   "), null);
  assert.equal(validPersonName(" Maya "), "Maya");
  assert.equal(validPersonName("x".repeat(140))?.length, 120);
});

test("merging a graph never changes activeProjectId and viewport-only changes do not touch Project updatedAt", () => {
  const projectA = createProject("A", "personal"); const projectB = createProject("B", "personal");
  const workspace = { ...createEmptyWorkspace(), projects: [projectA, projectB], activeProjectId: projectB.id };
  const movedViewport = { ...projectA.graph, viewport: { x: 200, y: -100, zoom: .7 } };
  const next = mergeProjectGraph(workspace, projectA.id, movedViewport);
  assert.equal(next.activeProjectId, projectB.id);
  assert.equal(next.projects[0].updatedAt, projectA.updatedAt);
});

test("backup restore candidate is validated without mutating the current Workspace", () => {
  const current = { ...createEmptyWorkspace(), projects: [createProject("Current", "personal")] };
  const backup = { ...createEmptyWorkspace(), projects: [createProject("Restored", "school")] };
  const parsed = parseWorkspaceBackup(serializeWorkspace(backup));
  assert.equal(parsed.projects[0].name, "Restored");
  assert.equal(current.projects[0].name, "Current");
});

test("Org Fit uses the full zoom range for very large visible bounds", () => {
  const viewport = calculateFitViewport([{ x: 0, y: 0, width: 5000, height: 3000 }], 1200, 800);
  assert.ok(viewport);
  assert.equal(viewport?.zoom, .25);
});

test("external Business contacts stay out of Org Chart and company filters exclude unrelated self", () => {
  const base = createInitialGraph().people[0];
  const self = { ...base, name: "Shivam", role: "CEO", company: "Acme" };
  const employee = { ...base, id: "barclays", globalId: "g-barclays", name: "Maya", company: "Barclays", includeInOrgChart: true, isSelf: false };
  const recruiter = { ...base, id: "lucy", globalId: "g-lucy", name: "Lucy", company: "", includeInOrgChart: false, isSelf: false };
  const all = layoutOrganisation([self, employee, recruiter], new Set());
  assert.equal(all.positions.has("lucy"), false);
  const filtered = layoutOrganisation([self, employee, recruiter], new Set(), "Barclays");
  assert.equal(filtered.positions.has(self.id), false);
  assert.equal(filtered.positions.has("barclays"), true);
});

test("Compose group member refs resolve to the intended temporary People", () => {
  const graph = createInitialGraph(); const maya = draftPerson("Maya", "draft:maya");
  const proposal = { ...draft([maya]), groups: [{ id: "g", name: "Frontend", memberDraftIds: [], memberRefs: ["draft:maya"], selected: true }] };
  const result = applyComposeDraftToGraph(proposal, graph, "business");
  const group = result.graph.groups.find((item) => item.name === "Frontend");
  assert.equal(result.graph.people.find((person) => person.name === "Maya")?.groupIds.includes(group?.id ?? ""), true);
});

test("reporting cycle detection remains deterministic", () => {
  assert.equal(hasReportingCycle([{ id: "a", reportsToPersonId: "b" }, { id: "b", reportsToPersonId: "a" }]), true);
  assert.equal(hasReportingCycle([{ id: "a", reportsToPersonId: "" }, { id: "b", reportsToPersonId: "a" }]), false);
});

test("same-Project stale tabs cannot silently overwrite a newer save", async () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); }, clear: () => memory.clear(), key: (index: number) => [...memory.keys()][index] ?? null, get length() { return memory.size; } };
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { localStorage: storage, sessionStorage: storage, dispatchEvent() {} };
  try {
    const project = createProject("Shared", "personal"); project.graph.updatedAt = "2020-01-01T00:00:00.000Z";
    const workspaceStore = new LocalWorkspaceStore(); await workspaceStore.saveWorkspace({ ...createEmptyWorkspace(), projects: [project], activeProjectId: project.id });
    const tabA = new LocalProjectGraphStore(project.id); const tabB = new LocalProjectGraphStore(project.id);
    const graphA = await tabA.loadGraph(); const graphB = await tabB.loadGraph();
    await tabB.saveGraph({ ...graphB, notes: [{ id: "note-b", text: "Newer", color: "yellow", x: 1, y: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
    await assert.rejects(() => tabA.saveGraph({ ...graphA, onboardingComplete: true }), /changed in another tab/);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test("Paste List keeps compatibility with hyphen, en dash and em dash separators", () => {
  for (const separator of ["-", "–", "—"]) {
    const proposal = createImportDraft({ text: `Sarah Jones ${separator} CEO`, source: "paste", mode: "create", category: "business", existingPeople: [] });
    assert.equal(proposal.people[0]?.role, "CEO");
  }
});
