import { createId } from "./graphStore.ts";
import type { Accent, Graph, Person, ProjectCategory, Relationship, RelationshipDirection, RelationshipStrength, RelationshipType } from "./graphStore.ts";

export type ComposeMode = "create" | "change" | "ask";
export type ComposeSource = "describe" | "paste" | "csv";

export type ComposeFieldAction = "unchanged" | "set" | "clear";
export type ComposeFieldPatch = { action: ComposeFieldAction; value?: string };
export type ComposePersonField = "name" | "role" | "company" | "department" | "team" | "manager" | "subject" | "contextRole" | "phone" | "email" | "linkedinUrl" | "githubUrl" | "howWeMet";
export type ComposeIdentityResolution = "create" | "use-existing" | "use-global" | "unresolved";

export type ComposeDraftPerson = {
  id: string;
  ref: string;
  name: string;
  role: string;
  company: string;
  department: string;
  team: string;
  subject: string;
  contextRole: string;
  managerName: string;
  phone: string;
  email: string;
  linkedinUrl: string;
  githubUrl: string;
  relationshipLabel: string;
  relationshipType: RelationshipType;
  howWeMet: string;
  matchId: string;
  globalMatchId?: string;
  suggestedGlobalMatchIds?: string[];
  globalContact?: { nickname: string; phone: string; email: string; linkedinUrl: string; githubUrl: string };
  suggestedMatchIds: string[];
  identityResolution: ComposeIdentityResolution;
  fieldPatches: Partial<Record<ComposePersonField, ComposeFieldPatch>>;
  includeInOrgChart: boolean | null;
  selected: boolean;
  needsReview: boolean;
  x: number;
  y: number;
  evidenceText?: string[];
  certainty?: "explicit" | "safe-inference" | "ambiguous";
};

export type ComposeDraftRelationship = {
  id: string;
  sourceRef: string;
  targetRef: string;
  labels: string[];
  direction: RelationshipDirection;
  strength: RelationshipStrength;
  introducedByRef: string;
  selected: boolean;
  action?: "upsert" | "remove";
  evidenceText?: string;
  certainty?: "explicit" | "safe-inference" | "ambiguous";
  derived?: boolean;
};

export type ComposeDraftGroup = {
  id: string;
  name: string;
  memberDraftIds: string[];
  memberRefs: string[];
  selected: boolean;
  evidenceText?: string[];
};

export type ComposeAmbiguity = {
  id: string;
  question: string;
  kind: "person_reference" | "identity" | "meaning" | "conflict";
  options: Array<{ id: string; label: string; description?: string }>;
  resolvedOptionId?: string;
  evidenceText?: string;
};

export type ComposeDraft = {
  id: string;
  mode: Exclude<ComposeMode, "ask">;
  source: ComposeSource;
  people: ComposeDraftPerson[];
  relationships: ComposeDraftRelationship[];
  groups: ComposeDraftGroup[];
  ambiguities?: ComposeAmbiguity[];
  warnings: string[];
  semanticSummary?: { people: number; relationships: number; organisationLinks: number; groups: number; derived: number };
  createdAt: string;
};

export type ComposeOperation =
  | { type: "ADD_PERSON"; draftRef: string; name: string }
  | { type: "UPDATE_NAME" | "SET_ROLE" | "CLEAR_ROLE" | "SET_COMPANY" | "CLEAR_COMPANY" | "SET_DEPARTMENT" | "CLEAR_DEPARTMENT" | "SET_TEAM" | "CLEAR_TEAM" | "SET_MANAGER" | "CLEAR_MANAGER" | "SET_SUBJECT" | "CLEAR_SUBJECT" | "SET_CONTEXT_ROLE" | "CLEAR_CONTEXT_ROLE"; personId: string; value?: string }
  | { type: "ADD_RELATIONSHIP" | "UPDATE_RELATIONSHIP"; relationshipId: string }
  | { type: "REMOVE_RELATIONSHIP"; relationshipId: string }
  | { type: "CREATE_GROUP"; groupId: string }
  | { type: "ADD_TO_GROUP"; personId: string; groupId: string };

type ImportRow = Record<string, string>;

const MAX_IMPORT_ROWS = 300;
const ACCENTS: Accent[] = ["blue", "sage", "peach", "lilac", "yellow", "rose", "mint", "aqua", "coral", "graphite"];

function cleanCell(value: string) {
  return value.trim().replace(/\u0000/g, "");
}

function normalizeHeader(value: string) {
  return cleanCell(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function valueFor(row: ImportRow, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value) return cleanCell(value);
  }
  return "";
}

function isUnsafeSpreadsheetCell(value: string) {
  // Leading + is valid for international phone numbers; only executable formula prefixes are blocked.
  return /^[=@]/.test(value.trim());
}

function validEmail(value: string) { return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function validProfileUrl(value: string, host: "github.com" | "linkedin.com") {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === host || url.hostname === `www.${host}`); }
  catch { return false; }
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cleanCell(cell)); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cleanCell(cell));
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  row.push(cleanCell(cell));
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function listRows(text: string): ImportRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_IMPORT_ROWS + 1)
    .map((line) => {
      const parts = line.split(/\s+(?:—|–|-)\s+/).map(cleanCell);
      const name = parts.shift() ?? "";
      let role = "";
      let manager = "";
      let company = "";
      let department = "";
      let team = "";
      let relationship = "";
      let how = "";
      for (const part of parts) {
        const managerMatch = part.match(/^(?:reports?\s+to|manager)\s*:?\s*(.+)$/i);
        const companyMatch = part.match(/^company\s*:?\s*(.+)$/i);
        const departmentMatch = part.match(/^(?:department|dept)\s*:?\s*(.+)$/i);
        const teamMatch = part.match(/^team\s*:?\s*(.+)$/i);
        const relationshipMatch = part.match(/^(?:relationship|relation)\s*:?\s*(.+)$/i);
        const howMatch = part.match(/^(?:met|how we met)\s*:?\s*(.+)$/i);
        if (managerMatch) manager = managerMatch[1];
        else if (companyMatch) company = companyMatch[1];
        else if (departmentMatch) department = departmentMatch[1];
        else if (teamMatch) team = teamMatch[1];
        else if (relationshipMatch) relationship = relationshipMatch[1];
        else if (howMatch) how = howMatch[1];
        else if (!role) role = part;
      }
      return { name, role, manager, company, department, team, relationship, "how we met": how };
    });
}

function csvRows(text: string) {
  const parsed = parseCsvRows(text);
  if (parsed.length < 2) return { rows: [] as ImportRow[], headers: [] as string[] };
  const headers = parsed[0].map(normalizeHeader);
  const rows = parsed.slice(1, MAX_IMPORT_ROWS + 2).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cleanCell(cells[index] ?? "")])));
  return { rows, headers };
}

function findExistingCandidates(name: string, email: string, people: Person[]) {
  const normalizedName = name.toLowerCase();
  const normalizedEmail = email.toLowerCase();
  const exactEmail = normalizedEmail ? people.filter((person) => !person.isSelf && person.email.toLowerCase() === normalizedEmail) : [];
  const exactName = people.filter((person) => !person.isSelf && person.name.toLowerCase() === normalizedName);
  return { exactEmail, exactName };
}

function patchFor(value: string): ComposeFieldPatch { return value ? { action: "set", value } : { action: "unchanged" }; }

function relationshipFromLabel(label: string, category: ProjectCategory): RelationshipType {
  const value = label.toLowerCase();
  if (/best|very close/.test(value)) return "very-close";
  if (/close|partner|mentor/.test(value)) return "close";
  if (/acquaintance|known through|met through/.test(value)) return "acquaintance";
  if (/parent|sibling|cousin|aunt|uncle|family|relative|child|grandparent/.test(value) || category === "family") return "family";
  if (/manager|colleague|client|teacher|professional|reports/.test(value) || category === "business") return "professional";
  return "friend";
}

function organicPosition(index: number, total: number) {
  const angle = ((Math.PI * 2) / Math.max(total, 1)) * index - Math.PI / 2;
  const radius = 300 + (index % 3) * 52;
  return { x: 760 + Math.cos(angle) * radius, y: 480 + Math.sin(angle) * radius };
}

export function createImportDraft(args: {
  text: string;
  source: Exclude<ComposeSource, "describe">;
  mode: Exclude<ComposeMode, "ask">;
  category: ProjectCategory;
  existingPeople: Person[];
}): ComposeDraft {
  const { text, source, mode, category, existingPeople } = args;
  const parsed = source === "csv" ? csvRows(text) : { rows: listRows(text), headers: [] as string[] };
  const rows = parsed.rows;
  const warnings: string[] = [];
  if (rows.length > MAX_IMPORT_ROWS) warnings.push(`Imports are limited to ${MAX_IMPORT_ROWS} people at a time.`);
  if (source === "csv" && parsed.headers.length && !parsed.headers.some((header) => ["name", "full name", "person", "employee"].includes(header))) warnings.push("Choose a CSV with a Name, Full Name or Employee column.");
  const seen = new Map<string, number>();
  const people = rows.slice(0, MAX_IMPORT_ROWS).map((row, index) => {
    const name = valueFor(row, ["name", "full name", "person", "employee"]);
    const role = valueFor(row, ["role", "job title", "title", "position"]);
    const managerName = valueFor(row, ["manager", "reports to", "reports_to", "line manager"]);
    const company = valueFor(row, ["company", "organisation", "organization"]);
    const department = valueFor(row, ["department", "dept", "division"]);
    const team = valueFor(row, ["team"]);
    const phone = valueFor(row, ["phone", "phone number", "mobile"]);
    const email = valueFor(row, ["email", "email address"]);
    const linkedinUrl = valueFor(row, ["linkedin", "linkedin url"]);
    const githubUrl = valueFor(row, ["github", "github url"]);
    const relationshipLabel = valueFor(row, ["relationship", "relation"]);
    const howWeMet = valueFor(row, ["how we met", "context"]);
    const candidates = findExistingCandidates(name, email, existingPeople);
    const trustedExisting = candidates.exactEmail.length === 1 ? candidates.exactEmail[0] : undefined;
    const possibleMatches = [...new Set([...candidates.exactEmail, ...candidates.exactName].map((person) => person.id))];
    const duplicateCount = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), duplicateCount);
    const position = organicPosition(index, rows.length);
    const unsafe = Object.values(row).some(isUnsafeSpreadsheetCell);
    const invalidContact = !validEmail(email) || !validProfileUrl(linkedinUrl, "linkedin.com") || !validProfileUrl(githubUrl, "github.com");
    const id = createId("draft_person");
    const managerPatch: ComposeFieldPatch = managerName ? { action: "set", value: managerName } : { action: "unchanged" };
    return {
      id, ref: `draft:${id}`, name, role, company, department, team, subject: "", contextRole: "", managerName, phone, email, linkedinUrl, githubUrl,
      relationshipLabel, relationshipType: relationshipFromLabel(relationshipLabel, category), howWeMet,
      matchId: trustedExisting?.id ?? "", suggestedMatchIds: possibleMatches,
      identityResolution: trustedExisting ? "use-existing" as const : possibleMatches.length ? "unresolved" as const : "create" as const,
      fieldPatches: { name: patchFor(name), role: patchFor(role), company: patchFor(company), department: patchFor(department), team: patchFor(team), manager: managerPatch, phone: patchFor(phone), email: patchFor(email), linkedinUrl: patchFor(linkedinUrl), githubUrl: patchFor(githubUrl), howWeMet: patchFor(howWeMet) },
      includeInOrgChart: category === "business" && Boolean(role || company || department || team || managerName) ? true : null,
      selected: Boolean(name) && !unsafe, needsReview: !name || unsafe || invalidContact || duplicateCount > 1 || (possibleMatches.length > 0 && !trustedExisting),
      ...position,
    };
  });
  if (!people.length) warnings.push(source === "csv" ? "No data rows were found in that CSV." : "Add one person per line, for example: Maya Patel - Designer - reports to Sarah Jones");
  if (people.some((person) => !person.name)) warnings.push("Some rows are missing a name and will not be applied.");
  if (people.some((person) => person.needsReview)) warnings.push("A few rows need review before they can be applied.");
  if (people.some((person) => !validEmail(person.email) || !validProfileUrl(person.linkedinUrl, "linkedin.com") || !validProfileUrl(person.githubUrl, "github.com"))) warnings.push("Some contact fields are not valid email, LinkedIn or GitHub values.");
  if (people.some((person) => person.suggestedMatchIds.length)) warnings.push("Possible existing People are marked for your decision. Circa will not overwrite one automatically.");
  const names = new Set(people.map((person) => person.name.toLowerCase()));
  for (const person of people) if (person.managerName && !names.has(person.managerName.toLowerCase()) && !existingPeople.some((existing) => existing.name.toLowerCase() === person.managerName.toLowerCase())) warnings.push(`Manager “${person.managerName}” could not be matched.`);
  const groupNames = [...new Set(people.map((person) => person.team || person.department).filter(Boolean))];
  const groups = groupNames.map((name) => {
    const members = people.filter((person) => person.team === name || person.department === name);
    return { id: createId("draft_group"), name, memberDraftIds: members.map((person) => person.id), memberRefs: members.map((person) => person.ref), selected: true };
  });
  const relationships: ComposeDraftRelationship[] = people.filter((person) => person.relationshipLabel).map((person) => ({ id: createId("draft_relationship"), sourceRef: "self", targetRef: person.ref, labels: [person.relationshipLabel], direction: "undirected", strength: "normal", introducedByRef: "", selected: true }));
  return { id: createId("compose"), mode, source, people, relationships, groups, warnings: [...new Set(warnings)], createdAt: new Date().toISOString() };
}

function currentPatch(person: ComposeDraftPerson, field: ComposePersonField): ComposeFieldPatch {
  const explicit = person.fieldPatches?.[field];
  if (explicit) return explicit;
  const legacyValue = field === "manager" ? person.managerName : String(person[field as keyof ComposeDraftPerson] ?? "");
  return legacyValue ? { action: "set", value: legacyValue } : { action: "unchanged" };
}

function resolveNamedPerson(people: Person[], name: string) {
  const matches = people.filter((person) => person.name.trim().toLowerCase() === name.trim().toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}

export function applyComposeDraftToGraph(draft: ComposeDraft, graph: Graph, category: ProjectCategory): { graph: Graph; operations: ComposeOperation[]; error?: string } {
  const now = new Date().toISOString();
  const nextPeople = graph.people.map((person) => ({ ...person, groupIds: [...person.groupIds] }));
  const nextRelationships = graph.relationships.map((relationship) => ({ ...relationship, labels: [...relationship.labels] }));
  const nextGroups = graph.groups.map((group) => ({ ...group }));
  const operations: ComposeOperation[] = [];
  const resolved = new Map<string, string>();
  const selected = draft.people.filter((person) => person.selected && person.name.trim());
  const self = nextPeople.find((person) => person.isSelf);
  if (self) resolved.set("self", self.id);
  for (const person of nextPeople) { resolved.set(`existing:${person.id}`, person.id); resolved.set(person.id, person.id); }

  for (const [index, item] of selected.entries()) {
    const cleanName = item.name.trim().slice(0, 120);
    if (!cleanName) return { graph, operations: [], error: "Every proposed Person needs a name." };
    let existing: Person | undefined;
    if (item.identityResolution === "use-existing" && item.matchId) existing = nextPeople.find((person) => person.id === item.matchId);
    else if (item.identityResolution === "use-global" && !item.globalMatchId) return { graph, operations: [], error: `Choose a valid existing Person for ${cleanName}.` };
    else if (item.identityResolution === "unresolved") return { graph, operations: [], error: `Choose whether to use an existing Person or create a new one for ${cleanName}.` };
    else if (draft.mode === "change") {
      const matches = nextPeople.filter((person) => !person.isSelf && person.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (matches.length > 1) return { graph, operations: [], error: `Which ${cleanName}? Choose the existing Person before applying.` };
      existing = matches[0];
      if (!existing) return { graph, operations: [], error: `Circa could not find one existing ${cleanName} to change.` };
    }

    if (!existing) {
      const person: Person = {
        id: createId("person"), globalId: item.identityResolution === "use-global" && item.globalMatchId ? item.globalMatchId : createId("global"),
        name: cleanName, nickname: item.globalContact?.nickname ?? "", phone: item.globalContact?.phone ?? "", email: item.globalContact?.email ?? "", githubUrl: item.globalContact?.githubUrl ?? "", linkedinUrl: item.globalContact?.linkedinUrl ?? "", notes: "", howWeMet: "", groupId: "", groupIds: [], lastInteraction: "",
        role: "", company: "", department: "", team: "", reportsToPersonId: "",
        includeInOrgChart: item.includeInOrgChart ?? (category === "business" && Boolean(item.role || item.company || item.department || item.team || item.managerName)),
        yearGroup: "", subject: "", knownSince: "", sharedInterests: "", contextRole: "",
        x: item.x, y: item.y, accent: ACCENTS[index % ACCENTS.length], createdVia: draft.source === "csv" ? "csv" : "compose", createdAt: now, updatedAt: now,
      };
      nextPeople.push(person); existing = person;
      operations.push({ type: "ADD_PERSON", draftRef: item.ref || `draft:${item.id}`, name: cleanName });
    }
    resolved.set(item.ref || `draft:${item.id}`, existing.id);
    resolved.set(item.id, existing.id);

    const setTextField = (field: Exclude<ComposePersonField, "manager" | "name">, setType: ComposeOperation["type"], clearType: ComposeOperation["type"]) => {
      const patch = currentPatch(item, field);
      const previous = String(existing![field as keyof Person] ?? "");
      const nextValue = patch.action === "clear" ? "" : patch.action === "set" ? String(patch.value ?? "").trim() : previous;
      if (nextValue === previous) return;
      (existing as unknown as Record<string, unknown>)[field] = nextValue;
      operations.push({ type: nextValue ? setType : clearType, personId: existing!.id, value: nextValue } as ComposeOperation);
    };
    const namePatch = currentPatch(item, "name");
    if (namePatch.action === "set" && cleanName !== existing.name) { existing.name = cleanName; operations.push({ type: "UPDATE_NAME", personId: existing.id, value: cleanName }); }
    setTextField("role", "SET_ROLE", "CLEAR_ROLE");
    setTextField("company", "SET_COMPANY", "CLEAR_COMPANY");
    setTextField("department", "SET_DEPARTMENT", "CLEAR_DEPARTMENT");
    setTextField("team", "SET_TEAM", "CLEAR_TEAM");
    setTextField("subject", "SET_SUBJECT", "CLEAR_SUBJECT");
    setTextField("contextRole", "SET_CONTEXT_ROLE", "CLEAR_CONTEXT_ROLE");
    for (const field of ["phone", "email", "linkedinUrl", "githubUrl", "howWeMet"] as const) {
      const patch = currentPatch(item, field);
      if (patch.action !== "unchanged") (existing as unknown as Record<string, unknown>)[field] = patch.action === "clear" ? "" : String(patch.value ?? "").trim();
    }
    existing.updatedAt = now;
  }

  for (const item of selected) {
    const personId = resolved.get(item.ref || `draft:${item.id}`) ?? resolved.get(item.id);
    const person = nextPeople.find((candidate) => candidate.id === personId);
    if (!person) continue;
    const managerPatch = currentPatch(item, "manager");
    if (managerPatch.action === "unchanged") continue;
    if (managerPatch.action === "clear") {
      if (person.reportsToPersonId) operations.push({ type: "CLEAR_MANAGER", personId: person.id });
      person.reportsToPersonId = "";
      continue;
    }
    const managerValue = String(managerPatch.value ?? item.managerName).trim();
    const managerId = resolved.get(managerValue) ?? resolved.get(`draft:${managerValue}`) ?? resolveNamedPerson(nextPeople, managerValue)?.id;
    if (!managerId) return { graph, operations: [], error: `Manager ${managerValue || "selection"} could not be matched safely.` };
    if (managerId !== person.reportsToPersonId) operations.push({ type: "SET_MANAGER", personId: person.id, value: managerId });
    person.reportsToPersonId = managerId;
    person.includeInOrgChart = true;
  }
  if (hasReportingCycle(nextPeople)) return { graph, operations: [], error: "That would create a circular reporting structure." };

  for (const [index, draftGroup] of draft.groups.filter((group) => group.selected).entries()) {
    let group = nextGroups.find((item) => item.name.toLowerCase() === draftGroup.name.trim().toLowerCase());
    if (!group) {
      group = { id: createId("group"), name: draftGroup.name.trim().slice(0, 120), color: ACCENTS[index % ACCENTS.length], x: 230 + index * 55, y: 160 + index * 38, width: 650, height: 390 };
      nextGroups.push(group); operations.push({ type: "CREATE_GROUP", groupId: group.id });
    }
    for (const ref of draftGroup.memberRefs?.length ? draftGroup.memberRefs : draftGroup.memberDraftIds) {
      const person = nextPeople.find((candidate) => candidate.id === (resolved.get(ref) ?? resolved.get(`draft:${ref}`)));
      if (person && !person.groupIds.includes(group.id)) { person.groupIds.push(group.id); person.groupId = person.groupIds[0] ?? ""; operations.push({ type: "ADD_TO_GROUP", personId: person.id, groupId: group.id }); }
    }
  }

  for (const proposal of (draft.relationships ?? []).filter((relationship) => relationship.selected)) {
    const sourceId = resolved.get(proposal.sourceRef);
    const targetId = resolved.get(proposal.targetRef);
    if (!sourceId || !targetId || sourceId === targetId) return { graph, operations: [], error: "A proposed relationship could not be matched safely." };
    const introducedByPersonId = proposal.introducedByRef ? (resolved.get(proposal.introducedByRef) ?? "") : "";
    const labels = [...new Set(proposal.labels.map((label) => label.trim()).filter(Boolean))].slice(0, 8);
    if (!labels.length) continue;
    const existing = nextRelationships.find((relationship) => (relationship.sourceId === sourceId && relationship.targetId === targetId) || (relationship.sourceId === targetId && relationship.targetId === sourceId));
    if (proposal.action === "remove") {
      if (!existing) continue;
      const remove = new Set(labels.map((label) => label.toLowerCase()));
      const remaining = existing.labels.filter((label) => !remove.has(label.toLowerCase()));
      if (remaining.length) {
        existing.labels = remaining; existing.label = remaining[0]; existing.semantic = remaining[0]; existing.updatedAt = now;
      } else {
        const index = nextRelationships.findIndex((relationship) => relationship.id === existing.id);
        if (index >= 0) nextRelationships.splice(index, 1);
      }
      operations.push({ type: "REMOVE_RELATIONSHIP", relationshipId: existing.id });
      continue;
    }
    if (existing) {
      existing.labels = [...new Set([...existing.labels, ...labels])]; existing.label = existing.labels[0]; existing.semantic = existing.labels[0]; existing.direction = proposal.direction; existing.strength = proposal.strength; existing.introducedByPersonId = introducedByPersonId; existing.updatedAt = now;
      operations.push({ type: "UPDATE_RELATIONSHIP", relationshipId: existing.id });
    } else {
      const type = relationshipFromLabel(labels[0], category);
      const relationship: Relationship = { id: createId("relationship"), sourceId, targetId, type, label: labels[0], labels, semantic: labels[0], strength: proposal.strength, direction: proposal.direction, introducedByPersonId, createdAt: now, updatedAt: now };
      nextRelationships.push(relationship); operations.push({ type: "ADD_RELATIONSHIP", relationshipId: relationship.id });
    }
  }

  return { graph: { ...graph, people: nextPeople, relationships: nextRelationships, groups: nextGroups, onboardingComplete: graph.onboardingComplete || nextPeople.length > 1, updatedAt: now }, operations };
}

export function countComposeOperations(draft: ComposeDraft, graph: Graph, category: ProjectCategory) {
  const result = applyComposeDraftToGraph(draft, graph, category);
  return { count: result.operations.length, error: result.error };
}

export function hasReportingCycle(people: Array<Pick<Person, "id" | "reportsToPersonId">>) {
  const parent = new Map(people.map((person) => [person.id, person.reportsToPersonId]));
  for (const person of people) {
    const seen = new Set<string>();
    let current = person.id;
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parent.get(current) ?? "";
    }
  }
  return false;
}

export function accentForDraft(index: number) {
  return ACCENTS[index % ACCENTS.length];
}
