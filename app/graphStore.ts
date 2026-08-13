import { MIN_GROUP_HEIGHT, MIN_GROUP_WIDTH } from "./canvasGeometry.ts";

export type RelationshipType =
  | "very-close"
  | "close"
  | "friend"
  | "acquaintance"
  | "professional"
  | "family";

export type RelationshipStrength = "very-close" | "close" | "normal" | "light";
export type RelationshipDirection = "undirected" | "source-to-target" | "target-to-source";

export type Accent =
  | "blue" | "sage" | "peach" | "lilac" | "yellow"
  | "rose" | "mint" | "aqua" | "coral" | "graphite";

export type ProjectCategory = "personal" | "school" | "business" | "family" | "community" | "other";
export type ProjectMode = "map" | "community" | "network";

/** Identity/contact fields shared between projects. Project notes deliberately do not live here. */
export type GlobalPerson = {
  id: string;
  name: string;
  nickname: string;
  phone: string;
  email: string;
  githubUrl: string;
  linkedinUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type Person = Omit<GlobalPerson, "id"> & {
  id: string;
  globalId: string;
  notes: string;
  howWeMet: string;
  /** @deprecated v2 compatibility; groupIds is canonical. */
  groupId: string;
  groupIds: string[];
  lastInteraction: string;
  role: string;
  company: string;
  department: string;
  team: string;
  reportsToPersonId: string;
  includeInOrgChart: boolean;
  yearGroup: string;
  subject: string;
  knownSince: string;
  sharedInterests: string;
  contextRole: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  accent: Accent;
  createdVia?: "manual" | "compose" | "csv" | "linkedin";
  isSelf?: boolean;
};

export type Relationship = {
  id: string;
  sourceId: string;
  targetId: string;
  /** Visual compatibility field. Meaning is stored separately in labels/semantic. */
  type: RelationshipType;
  /** @deprecated v2 compatibility; labels is canonical. */
  label?: string;
  labels: string[];
  semantic: string;
  strength: RelationshipStrength;
  direction: RelationshipDirection;
  introducedByPersonId: string;
  createdAt: string;
  updatedAt: string;
};

export type Group = {
  id: string;
  name: string;
  color: Accent;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasNote = {
  id: string;
  text: string;
  color: Accent;
  x: number;
  y: number;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
};

export type Graph = {
  version: 2;
  people: Person[];
  relationships: Relationship[];
  groups: Group[];
  notes: CanvasNote[];
  viewport: { x: number; y: number; zoom: number };
  onboardingComplete: boolean;
  updatedAt: string;
};

export type CircaProject = {
  id: string;
  name: string;
  projectMode: ProjectMode;
  schemaVersion: number;
  category: ProjectCategory;
  customCategoryName: string;
  folderId: string;
  archived: boolean;
  favourite: boolean;
  customRelationshipLabels: string[];
  graph: Graph;
  createdAt: string;
  updatedAt: string;
};

export type CircaFolder = { id: string; name: string; createdAt: string; updatedAt: string };

export type Workspace = {
  version: 3;
  revision: number;
  projects: CircaProject[];
  folders: CircaFolder[];
  globalPeople: GlobalPerson[];
  activeProjectId: string;
  updatedAt: string;
};

export interface GraphStore {
  loadGraph(): Promise<Graph>;
  saveGraph(graph: Graph): Promise<void>;
  forceSaveGraph(graph: Graph): Promise<void>;
  saveGraphNow(graph: Graph): void;
  clearGraph(): Promise<void>;
  loadContacts(): Promise<GlobalPerson[]>;
}

export interface WorkspaceStore {
  loadWorkspace(): Promise<Workspace>;
  saveWorkspace(workspace: Workspace): Promise<Workspace>;
  restoreWorkspace(workspace: Workspace): Promise<Workspace>;
}

export const STORAGE_KEY = "circa_graph_v1";
export const LEGACY_WORKSPACE_STORAGE_KEY = "circa_workspace_v2";
export const WORKSPACE_STORAGE_KEY = "circa_workspace_v3";
export const WORKSPACE_BACKUP_KEY = "circa_workspace_backup_v2";
export const WORKSPACE_RECOVERY_KEY = "circa_workspace_recovery_v10";
const TAB_SESSION_STORAGE_KEY = "circa_tab_session_id";
let fallbackTabSessionId = "";

export function getTabSessionId() {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY);
    if (!id) { id = createId("tab"); window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, id); }
    return id;
  } catch {
    if (!fallbackTabSessionId) fallbackTabSessionId = createId("tab");
    return fallbackTabSessionId;
  }
}

const ACCENTS = new Set<Accent>(["blue", "sage", "peach", "lilac", "yellow", "rose", "mint", "aqua", "coral", "graphite"]);
const RELATIONSHIP_TYPES = new Set<RelationshipType>(["very-close", "close", "friend", "acquaintance", "professional", "family"]);

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function text(value: unknown, fallback = "", max = 2000) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, max) : fallback;
}

export function validPersonName(value: unknown) {
  const name = text(value, "", 120).trim();
  return name || null;
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function iso(value: unknown, fallback: string) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function contact(id: string, name: string, now: string): GlobalPerson {
  return { id, name, nickname: "", phone: "", email: "", githubUrl: "", linkedinUrl: "", createdAt: now, updatedAt: now };
}

function strengthFromType(type: RelationshipType): RelationshipStrength {
  if (type === "very-close") return "very-close";
  if (type === "close") return "close";
  if (type === "acquaintance") return "light";
  return "normal";
}

export function createInitialGraph(): Graph {
  const now = new Date().toISOString();
  return {
    version: 2,
    people: [{
      ...contact("person_self", "You", now), id: "person_self", globalId: "global_self", notes: "", howWeMet: "",
      groupId: "", groupIds: [], lastInteraction: "", role: "", company: "", department: "", team: "",
      reportsToPersonId: "", includeInOrgChart: true, yearGroup: "", subject: "", knownSince: "", sharedInterests: "",
      contextRole: "", x: 560, y: 330, accent: "yellow", createdVia: "manual", isSelf: true,
    }],
    relationships: [], groups: [], notes: [], viewport: { x: 0, y: 0, zoom: 1 }, onboardingComplete: false, updatedAt: now,
  };
}

export function createEmptyWorkspace(): Workspace {
  const now = new Date().toISOString();
  return { version: 3, revision: 0, projects: [], folders: [], globalPeople: [], activeProjectId: "", updatedAt: now };
}

export function createProject(name: string, category: ProjectCategory, customCategoryName = "", projectMode: ProjectMode = "map"): CircaProject {
  const now = new Date().toISOString();
  return { id: createId("project"), name: name.trim().slice(0, 80) || "Untitled project", projectMode, schemaVersion: 1, category, customCategoryName: customCategoryName.slice(0, 80), folderId: "", archived: false, favourite: false, customRelationshipLabels: [], graph: createInitialGraph(), createdAt: now, updatedAt: now };
}

function normalizeGlobalPerson(value: unknown, now: string): GlobalPerson | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = text(raw.name, "", 120).trim();
  if (!name) return null;
  const id = text(raw.id, createId("global"), 160);
  return { id, name, nickname: text(raw.nickname, "", 120), phone: text(raw.phone, "", 80), email: text(raw.email, "", 180), githubUrl: text(raw.githubUrl, "", 500), linkedinUrl: text(raw.linkedinUrl, "", 500), createdAt: iso(raw.createdAt, now), updatedAt: iso(raw.updatedAt, now) };
}

function normalizePerson(value: unknown, now: string, index: number): Person | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const isSelf = Boolean(raw.isSelf);
  const name = text(raw.name, isSelf ? "You" : "", 120).trim();
  if (!name) return null;
  const id = text(raw.id, createId("person"), 160);
  const legacyGroupId = text(raw.groupId, "", 160);
  const groupIds = Array.isArray(raw.groupIds) ? [...new Set(raw.groupIds.map((item) => text(item, "", 160)).filter(Boolean))] : legacyGroupId ? [legacyGroupId] : [];
  return {
    id, globalId: text(raw.globalId, isSelf ? "global_self" : createId("global"), 160), name,
    nickname: text(raw.nickname, "", 120), phone: text(raw.phone, "", 80), email: text(raw.email, "", 180), githubUrl: text(raw.githubUrl, "", 500), linkedinUrl: text(raw.linkedinUrl, "", 500),
    notes: text(raw.notes, "", 8000), howWeMet: text(raw.howWeMet, "", 500), groupId: groupIds[0] ?? "", groupIds,
    lastInteraction: text(raw.lastInteraction, "", 40), role: text(raw.role, "", 180), company: text(raw.company, "", 180), department: text(raw.department, "", 180), team: text(raw.team, "", 180), reportsToPersonId: text(raw.reportsToPersonId, "", 160), includeInOrgChart: raw.includeInOrgChart !== false,
    yearGroup: text(raw.yearGroup, "", 100), subject: text(raw.subject, "", 180), knownSince: text(raw.knownSince, "", 100), sharedInterests: text(raw.sharedInterests, "", 500), contextRole: text(raw.contextRole, "", 180),
    x: finite(raw.x, 520 + (index % 5) * 170), y: finite(raw.y, 300 + Math.floor(index / 5) * 210), width: typeof raw.width === "number" ? Math.min(420, Math.max(96, finite(raw.width, 134))) : undefined, height: typeof raw.height === "number" ? Math.min(420, Math.max(110, finite(raw.height, 164))) : undefined,
    accent: ACCENTS.has(raw.accent as Accent) ? raw.accent as Accent : isSelf ? "yellow" : "blue",
    createdVia: raw.createdVia === "compose" || raw.createdVia === "csv" || raw.createdVia === "linkedin" ? raw.createdVia : "manual", isSelf,
    createdAt: iso(raw.createdAt, now), updatedAt: iso(raw.updatedAt, now),
  };
}

function normalizeRelationship(value: unknown, personIds: Set<string>, now: string): Relationship | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const sourceId = text(raw.sourceId, "", 160); const targetId = text(raw.targetId, "", 160);
  if (!sourceId || !targetId || sourceId === targetId || !personIds.has(sourceId) || !personIds.has(targetId)) return null;
  const type = RELATIONSHIP_TYPES.has(raw.type as RelationshipType) ? raw.type as RelationshipType : "friend";
  const legacyLabel = text(raw.label, "", 120).trim();
  const labels = Array.isArray(raw.labels) ? [...new Set(raw.labels.map((item) => text(item, "", 120).trim()).filter(Boolean))].slice(0, 8) : legacyLabel ? [legacyLabel] : [relationshipLabels[type]];
  const direction: RelationshipDirection = raw.direction === "source-to-target" || raw.direction === "target-to-source" ? raw.direction : "undirected";
  const strength: RelationshipStrength = raw.strength === "very-close" || raw.strength === "close" || raw.strength === "light" || raw.strength === "normal" ? raw.strength : strengthFromType(type);
  const introducedByPersonId = personIds.has(text(raw.introducedByPersonId)) ? text(raw.introducedByPersonId) : "";
  return { id: text(raw.id, createId("relationship"), 160), sourceId, targetId, type, label: labels[0], labels, semantic: text(raw.semantic, labels[0] ?? relationshipLabels[type], 120), strength, direction, introducedByPersonId, createdAt: iso(raw.createdAt, now), updatedAt: iso(raw.updatedAt, now) };
}

function normalizeGroup(value: unknown): Group | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>; const name = text(raw.name, "", 120).trim();
  if (!name) return null;
  return { id: text(raw.id, createId("group"), 160), name, color: ACCENTS.has(raw.color as Accent) ? raw.color as Accent : "sage", x: finite(raw.x, 220), y: finite(raw.y, 180), width: Math.max(MIN_GROUP_WIDTH, finite(raw.width, 650)), height: Math.max(MIN_GROUP_HEIGHT, finite(raw.height, 390)) };
}

function normalizeNote(value: unknown, now: string): CanvasNote | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>; const noteText = text(raw.text, "", 8000).trim();
  if (!noteText) return null;
  return { id: text(raw.id, createId("note"), 160), text: noteText, color: ACCENTS.has(raw.color as Accent) ? raw.color as Accent : "yellow", x: finite(raw.x, 800), y: finite(raw.y, 170), width: typeof raw.width === "number" ? Math.min(600, Math.max(110, finite(raw.width, 155))) : undefined, height: typeof raw.height === "number" ? Math.min(500, Math.max(80, finite(raw.height, 118))) : undefined, createdAt: iso(raw.createdAt, now), updatedAt: iso(raw.updatedAt, now) };
}

function breakReportingCycles(people: Person[]) {
  const byId = new Map(people.map((person) => [person.id, person]));
  for (const person of people) {
    if (!person.reportsToPersonId || !byId.has(person.reportsToPersonId) || person.reportsToPersonId === person.id) { person.reportsToPersonId = ""; continue; }
    const seen = new Set([person.id]); let next = byId.get(person.reportsToPersonId);
    while (next?.reportsToPersonId) {
      if (seen.has(next.id)) { person.reportsToPersonId = ""; break; }
      seen.add(next.id); next = byId.get(next.reportsToPersonId);
    }
  }
}

export function normalizeGraph(value: unknown): Graph {
  const now = new Date().toISOString();
  if (!value || typeof value !== "object") return createInitialGraph();
  const raw = value as Record<string, unknown>;
  const people = (Array.isArray(raw.people) ? raw.people : []).map((item, index) => normalizePerson(item, now, index)).filter((item): item is Person => Boolean(item));
  const selfCandidates = people.filter((person) => person.isSelf);
  if (!selfCandidates.length) people.unshift(createInitialGraph().people[0]);
  else selfCandidates.slice(1).forEach((person) => { person.isSelf = false; if (person.globalId === "global_self") person.globalId = createId("global"); });
  const self = people.find((person) => person.isSelf)!; self.name = self.name || "You"; self.includeInOrgChart = true;
  const groups = (Array.isArray(raw.groups) ? raw.groups : []).map(normalizeGroup).filter((item): item is Group => Boolean(item));
  const groupIds = new Set(groups.map((group) => group.id));
  for (const person of people) { person.groupIds = person.groupIds.filter((id) => groupIds.has(id)); person.groupId = person.groupIds[0] ?? ""; }
  breakReportingCycles(people);
  const personIds = new Set(people.map((person) => person.id));
  const relationships = (Array.isArray(raw.relationships) ? raw.relationships : []).map((item) => normalizeRelationship(item, personIds, now)).filter((item): item is Relationship => Boolean(item));
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).map((item) => normalizeNote(item, now)).filter((item): item is CanvasNote => Boolean(item));
  const viewportRaw = raw.viewport && typeof raw.viewport === "object" ? raw.viewport as Record<string, unknown> : {};
  return { version: 2, people, relationships, groups, notes, viewport: { x: finite(viewportRaw.x, 0), y: finite(viewportRaw.y, 0), zoom: Math.min(2.4, Math.max(.25, finite(viewportRaw.zoom, 1))) }, onboardingComplete: Boolean(raw.onboardingComplete), updatedAt: iso(raw.updatedAt, now) };
}

function globalFromPerson(person: Person): GlobalPerson {
  return { id: person.globalId, name: person.name, nickname: person.nickname, phone: person.phone, email: person.email, githubUrl: person.githubUrl, linkedinUrl: person.linkedinUrl, createdAt: person.createdAt, updatedAt: person.updatedAt };
}

function applyGlobal(person: Person, global: GlobalPerson): Person {
  return { ...person, name: global.name, nickname: global.nickname, phone: global.phone, email: global.email, githubUrl: global.githubUrl, linkedinUrl: global.linkedinUrl, updatedAt: global.updatedAt };
}

function globalsFromProjects(projects: CircaProject[]) {
  const map = new Map<string, GlobalPerson>();
  for (const project of projects) for (const person of project.graph.people) if (!person.isSelf) map.set(person.globalId, globalFromPerson(person));
  return [...map.values()];
}

export function normalizeWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.projects) || !Array.isArray(raw.folders)) return null;
  const now = new Date().toISOString();
  const projects: CircaProject[] = raw.projects.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const project = item as Record<string, unknown>; const name = text(project.name, "Untitled project", 80).trim() || "Untitled project";
    const category = ["personal", "school", "business", "family", "community", "other"].includes(String(project.category)) ? project.category as ProjectCategory : "personal";
    const projectMode: ProjectMode = project.projectMode === "community" || project.projectMode === "network" ? project.projectMode : "map";
    return [{ id: text(project.id, createId("project"), 160), name, projectMode, schemaVersion: Math.max(1, Math.floor(finite(project.schemaVersion, 1))), category, customCategoryName: text(project.customCategoryName, "", 80), folderId: text(project.folderId, "", 160), archived: Boolean(project.archived), favourite: Boolean(project.favourite), customRelationshipLabels: Array.isArray(project.customRelationshipLabels) ? [...new Set(project.customRelationshipLabels.map((label) => text(label, "", 120).trim()).filter(Boolean))].slice(0, 40) : [], graph: normalizeGraph(project.graph), createdAt: iso(project.createdAt, now), updatedAt: iso(project.updatedAt, now) }];
  });
  const folders: CircaFolder[] = raw.folders.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const folder = item as Record<string, unknown>; const name = text(folder.name, "", 80).trim();
    return name ? [{ id: text(folder.id, createId("folder"), 160), name, createdAt: iso(folder.createdAt, now), updatedAt: iso(folder.updatedAt, now) }] : [];
  });
  const folderIds = new Set(folders.map((folder) => folder.id)); projects.forEach((project) => { if (project.folderId && !folderIds.has(project.folderId)) project.folderId = ""; });
  const parsedGlobals = (Array.isArray(raw.globalPeople) ? raw.globalPeople : []).map((item) => normalizeGlobalPerson(item, now)).filter((item): item is GlobalPerson => Boolean(item));
  const globalMap = new Map((parsedGlobals.length ? parsedGlobals : globalsFromProjects(projects)).map((person) => [person.id, person]));
  for (const project of projects) project.graph.people = project.graph.people.map((person) => person.isSelf ? person : globalMap.has(person.globalId) ? applyGlobal(person, globalMap.get(person.globalId)!) : (globalMap.set(person.globalId, globalFromPerson(person)), person));
  const requestedActive = text(raw.activeProjectId, "", 160); const activeProjectId = projects.some((project) => project.id === requestedActive && !project.archived) ? requestedActive : projects.find((project) => !project.archived)?.id ?? projects[0]?.id ?? "";
  return { version: 3, revision: Math.max(0, Math.floor(finite(raw.revision, 0))), projects, folders, globalPeople: [...globalMap.values()], activeProjectId, updatedAt: iso(raw.updatedAt, now) };
}

function migrateLegacyGraph(raw: string): Workspace {
  const now = new Date().toISOString(); let graph = createInitialGraph();
  try { graph = normalizeGraph(JSON.parse(raw)); } catch { /* the caller can still open a safe workspace */ }
  const project: CircaProject = { id: createId("project"), name: "My Network", projectMode: "map", schemaVersion: 1, category: "personal", customCategoryName: "", folderId: "", archived: false, favourite: false, customRelationshipLabels: [], graph, createdAt: now, updatedAt: graph.updatedAt };
  return { version: 3, revision: 0, projects: [project], folders: [], globalPeople: globalsFromProjects([project]), activeProjectId: project.id, updatedAt: now };
}

export function serializeWorkspace(workspace: Workspace) {
  return JSON.stringify(normalizeWorkspace(workspace) ?? createEmptyWorkspace(), null, 2);
}

export function parseWorkspaceBackup(raw: string): Workspace {
  const parsed = normalizeWorkspace(JSON.parse(raw));
  if (!parsed) throw new Error("This file is not a valid Circa workspace backup.");
  return parsed;
}

function readLocalWorkspace(): Workspace {
  if (typeof window === "undefined") return createEmptyWorkspace();
  const current = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (current) {
    try { const normalized = normalizeWorkspace(JSON.parse(current)); if (normalized) return normalized; }
    catch { /* try the retained migration backup below */ }
  }
  const v2 = window.localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
  if (v2) {
    if (!window.localStorage.getItem(WORKSPACE_BACKUP_KEY)) window.localStorage.setItem(WORKSPACE_BACKUP_KEY, v2);
    try { const normalized = normalizeWorkspace(JSON.parse(v2)); if (normalized) { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(normalized)); return normalized; } }
    catch { /* try the retained backup */ }
  }
  const retained = window.localStorage.getItem(WORKSPACE_BACKUP_KEY);
  if (retained) {
    try { const normalized = normalizeWorkspace(JSON.parse(retained)); if (normalized) { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(normalized)); return normalized; } }
    catch { /* continue to the oldest graph migration */ }
  }
  const legacy = window.localStorage.getItem(STORAGE_KEY);
  if (legacy) { const migrated = migrateLegacyGraph(legacy); window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(migrated)); return migrated; }
  return createEmptyWorkspace();
}

function writeLocalWorkspace(workspace: Workspace, projectId = "") {
  if (typeof window === "undefined") return workspace;
  const current = (() => { try { return readLocalWorkspace(); } catch { return createEmptyWorkspace(); } })();
  const saved: Workspace = { ...(normalizeWorkspace(workspace) ?? createEmptyWorkspace()), revision: Math.max(current.revision, workspace.revision) + 1, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(saved));
  window.dispatchEvent(new CustomEvent("circa-workspace-saved", { detail: { revision: saved.revision, updatedAt: saved.updatedAt, projectId } }));
  if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("circa-workspace"); channel.postMessage({ revision: saved.revision, updatedAt: saved.updatedAt, projectId, source: getTabSessionId() }); channel.close(); }
  return saved;
}

export class LocalWorkspaceStore implements WorkspaceStore {
  async loadWorkspace() {
    try { return readLocalWorkspace(); }
    catch (error) { throw new Error(error instanceof Error ? `Circa could not read local data: ${error.message}` : "Circa could not read local data."); }
  }
  async saveWorkspace(workspace: Workspace) {
    try { return writeLocalWorkspace(workspace); }
    catch (error) { throw new Error(error instanceof Error ? `Circa could not save locally: ${error.message}` : "Circa could not save locally."); }
  }
  async restoreWorkspace(workspace: Workspace) {
    if (typeof window === "undefined") return normalizeWorkspace(workspace) ?? createEmptyWorkspace();
    try {
      const current = readLocalWorkspace();
      window.localStorage.setItem(WORKSPACE_RECOVERY_KEY, JSON.stringify(current));
      return writeLocalWorkspace({ ...workspace, revision: Math.max(current.revision, workspace.revision) });
    } catch (error) {
      throw new Error(error instanceof Error ? `Circa could not restore that backup: ${error.message}` : "Circa could not restore that backup.");
    }
  }
}

function graphContent(graph: Graph) {
  return { people: graph.people, relationships: graph.relationships, groups: graph.groups, notes: graph.notes, onboardingComplete: graph.onboardingComplete };
}

/** Merge a Project graph without mutating Workspace navigation state. */
export function mergeProjectGraph(workspace: Workspace, projectId: string, graph: Graph) {
  const now = new Date().toISOString();
  const globals = new Map(workspace.globalPeople.map((person) => [person.id, person]));
  for (const person of graph.people) if (!person.isSelf) globals.set(person.globalId, globalFromPerson(person));
  const projects = workspace.projects.map((project) => {
    if (project.id === projectId) {
      const contentChanged = JSON.stringify(graphContent(project.graph)) !== JSON.stringify(graphContent(graph));
      const graphUpdatedAt = contentChanged ? now : project.graph.updatedAt;
      return { ...project, graph: normalizeGraph({ ...graph, updatedAt: graphUpdatedAt }), updatedAt: contentChanged ? now : project.updatedAt };
    }
    return { ...project, graph: { ...project.graph, people: project.graph.people.map((person) => !person.isSelf && globals.has(person.globalId) ? applyGlobal(person, globals.get(person.globalId)!) : person) } };
  });
  return { ...workspace, projects, globalPeople: [...globals.values()], updatedAt: now };
}

export class LocalProjectGraphStore implements GraphStore {
  private projectId: string;
  private workspaceStore: LocalWorkspaceStore;
  private lastProjectUpdatedAt = "";
  constructor(projectId: string, workspaceStore = new LocalWorkspaceStore()) { this.projectId = projectId; this.workspaceStore = workspaceStore; }
  async loadGraph() {
    const workspace = await this.workspaceStore.loadWorkspace();
    const project = workspace.projects.find((item) => item.id === this.projectId);
    this.lastProjectUpdatedAt = project?.graph.updatedAt ?? "";
    return project?.graph ?? createInitialGraph();
  }
  private assertCurrent(workspace: Workspace) {
    const current = workspace.projects.find((project) => project.id === this.projectId)?.graph.updatedAt ?? "";
    if (this.lastProjectUpdatedAt && current && current !== this.lastProjectUpdatedAt) throw new Error("This Project changed in another tab.");
  }
  private write(workspace: Workspace, graph: Graph) {
    const next = mergeProjectGraph(workspace, this.projectId, graph);
    const saved = writeLocalWorkspace(next, this.projectId);
    this.lastProjectUpdatedAt = saved.projects.find((project) => project.id === this.projectId)?.graph.updatedAt ?? "";
  }
  async saveGraph(graph: Graph) { const workspace = await this.workspaceStore.loadWorkspace(); this.assertCurrent(workspace); this.write(workspace, graph); }
  async forceSaveGraph(graph: Graph) { const workspace = await this.workspaceStore.loadWorkspace(); this.lastProjectUpdatedAt = ""; this.write(workspace, graph); }
  saveGraphNow(graph: Graph) { const workspace = readLocalWorkspace(); this.assertCurrent(workspace); this.write(workspace, graph); }
  async clearGraph() { await this.saveGraph(createInitialGraph()); }
  async loadContacts() { return (await this.workspaceStore.loadWorkspace()).globalPeople; }
}

export function deleteGlobalPerson(workspace: Workspace, globalId: string): Workspace {
  const projects = workspace.projects.map((project) => {
    const removedIds = new Set(project.graph.people.filter((person) => person.globalId === globalId && !person.isSelf).map((person) => person.id));
    const people = project.graph.people.filter((person) => !removedIds.has(person.id)).map((person) => removedIds.has(person.reportsToPersonId) ? { ...person, reportsToPersonId: "" } : person);
    const relationships = project.graph.relationships.filter((relationship) => !removedIds.has(relationship.sourceId) && !removedIds.has(relationship.targetId) && !removedIds.has(relationship.introducedByPersonId));
    return { ...project, graph: { ...project.graph, people, relationships, updatedAt: new Date().toISOString() } };
  });
  return { ...workspace, projects, globalPeople: workspace.globalPeople.filter((person) => person.id !== globalId), updatedAt: new Date().toISOString() };
}

export function createWorkspaceStore(): WorkspaceStore { return new LocalWorkspaceStore(); }
export function createGraphStore(projectId: string): GraphStore { return new LocalProjectGraphStore(projectId); }

export const relationshipLabels: Record<RelationshipType, string> = { "very-close": "Very close", close: "Close", friend: "Friend", acquaintance: "Acquaintance", professional: "Professional", family: "Family" };
