import { NextResponse } from "next/server";
import type { ComposeDraft, ComposeDraftPerson, ComposeDraftRelationship, ComposeFieldPatch } from "../../composeEngine";
import { compileSemanticInterpretation, validateSemanticInterpretation } from "../../composeSemantics";
import { composeProviderInstruction } from "../../composeSystemPrompt";
import { interpretNaturalLanguage } from "../../localSemanticInterpreter";
import { ontologyForProvider } from "../../composeOntology";
import { createId, createInitialGraph } from "../../graphStore";
import type { GlobalPerson, Graph, Person, ProjectCategory, RelationshipDirection, RelationshipStrength, RelationshipType } from "../../graphStore";

const RELATIONSHIP_TYPES = new Set<RelationshipType>(["very-close", "close", "friend", "acquaintance", "professional", "family"]);
const requests = new Map<string, { count: number; resetAt: number }>();

function externalProviderStatus() {
  const provider = process.env.AI_PROVIDER;
  const endpoint = process.env.AI_API_URL;
  let validEndpoint = false;
  try { const url = endpoint ? new URL(endpoint) : null; validEndpoint = Boolean(url && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))); } catch { validEndpoint = false; }
  return { available: provider === "custom-http" && validEndpoint, provider: provider === "custom-http" ? "custom-http" : "none" };
}

export async function GET() {
  const external = externalProviderStatus();
  return NextResponse.json({ available: true, provider: external.available ? external.provider : "local-semantic", externalProviderAvailable: external.available }, { headers: { "cache-control": "no-store" } });
}

function text(value: unknown, limit = 180) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function fieldPatch(raw: Record<string, unknown>, field: string, aliases: string[] = []): ComposeFieldPatch {
  const patches = raw.fieldPatches && typeof raw.fieldPatches === "object" ? raw.fieldPatches as Record<string, unknown> : {};
  const explicit = patches[field];
  if (explicit && typeof explicit === "object") {
    const item = explicit as Record<string, unknown>;
    if (item.action === "clear") return { action: "clear" };
    if (item.action === "set") return { action: "set", value: text(item.value, 500) };
    return { action: "unchanged" };
  }
  const key = [field, ...aliases].find((candidate) => Object.prototype.hasOwnProperty.call(raw, candidate));
  if (!key) return { action: "unchanged" };
  if (raw[key] === null) return { action: "clear" };
  const value = text(raw[key], 500);
  return value ? { action: "set", value } : { action: "clear" };
}

function validatePerson(value: unknown, index: number, selectedPersonId: string, knownIds: Set<string>): ComposeDraftPerson | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = text(raw.name, 100);
  if (!name) return null;
  const relationshipType = RELATIONSHIP_TYPES.has(raw.relationshipType as RelationshipType) ? raw.relationshipType as RelationshipType : "friend";
  const angle = index * 1.85 - .65;
  const id = createId("draft_person");
  const rawRef = text(raw.ref, 100).replace(/[^a-zA-Z0-9_-]/g, "") || `person_${index + 1}`;
  const suggested = text(raw.matchId);
  const trustedSelected = Boolean(selectedPersonId && suggested === selectedPersonId && knownIds.has(suggested));
  return {
    id, ref: `draft:${rawRef}`,
    name,
    role: text(raw.role),
    company: text(raw.company),
    department: text(raw.department),
    team: text(raw.team),
    subject: text(raw.subject),
    contextRole: text(raw.contextRole),
    managerName: text(raw.managerName ?? raw.manager),
    phone: text(raw.phone, 80),
    email: text(raw.email),
    linkedinUrl: text(raw.linkedinUrl, 300),
    githubUrl: text(raw.githubUrl, 300),
    relationshipLabel: text(raw.relationshipLabel),
    relationshipType,
    howWeMet: text(raw.howWeMet, 300),
    matchId: trustedSelected ? suggested : "",
    suggestedMatchIds: suggested && knownIds.has(suggested) ? [suggested] : [],
    identityResolution: trustedSelected ? "use-existing" : suggested && knownIds.has(suggested) ? "unresolved" : "create",
    fieldPatches: {
      name: fieldPatch(raw, "name"), role: fieldPatch(raw, "role"), company: fieldPatch(raw, "company"), department: fieldPatch(raw, "department"), team: fieldPatch(raw, "team"), subject: fieldPatch(raw, "subject"), contextRole: fieldPatch(raw, "contextRole"),
      manager: fieldPatch(raw, "manager", ["managerName"]), phone: fieldPatch(raw, "phone"), email: fieldPatch(raw, "email"), linkedinUrl: fieldPatch(raw, "linkedinUrl"), githubUrl: fieldPatch(raw, "githubUrl"), howWeMet: fieldPatch(raw, "howWeMet"),
    },
    includeInOrgChart: typeof raw.includeInOrgChart === "boolean" ? raw.includeInOrgChart : null,
    selected: true,
    needsReview: Boolean(raw.needsReview),
    x: 760 + Math.cos(angle) * (300 + (index % 3) * 45),
    y: 480 + Math.sin(angle) * (300 + (index % 3) * 45),
  };
}

function validateDraft(value: unknown, mode: "create" | "change", body: Record<string, unknown>): ComposeDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.people) || raw.people.length > 300) return null;
  const graph = body.graph && typeof body.graph === "object" ? body.graph as Record<string, unknown> : {};
  const knownPeople = Array.isArray(graph.people) ? graph.people : [];
  const knownIds = new Set(knownPeople.flatMap((person) => person && typeof person === "object" && typeof (person as Record<string, unknown>).id === "string" ? [(person as Record<string, unknown>).id as string] : []));
  const selectedPersonId = text(body.selectedPersonId);
  const people = raw.people.map((person, index) => validatePerson(person, index, selectedPersonId, knownIds)).filter((person): person is ComposeDraftPerson => Boolean(person));
  const refMap = new Map(people.map((person) => [person.ref.replace(/^draft:/, ""), person.ref]));
  for (const person of people) {
    const managerPatch = person.fieldPatches.manager;
    if (managerPatch?.action !== "set" || !managerPatch.value) continue;
    const rawManagerRef = String(managerPatch.value);
    person.fieldPatches.manager = {
      ...managerPatch,
      value: refMap.get(rawManagerRef) ?? (knownIds.has(rawManagerRef) ? `existing:${rawManagerRef}` : rawManagerRef),
    };
  }
  const groups = Array.isArray(raw.groups) ? raw.groups.slice(0, 80).flatMap((group) => {
    if (!group || typeof group !== "object") return [];
    const item = group as Record<string, unknown>;
    const name = text(item.name, 100);
    if (!name) return [];
    const rawRefs = Array.isArray(item.memberRefs) ? item.memberRefs : Array.isArray(item.memberDraftIds) ? item.memberDraftIds : [];
    const memberRefs = rawRefs.flatMap((ref) => typeof ref === "string" ? [refMap.get(ref) ?? ref] : []);
    return [{ id: createId("draft_group"), name, memberDraftIds: [], memberRefs, selected: true }];
  }) : [];
  const relationships: ComposeDraftRelationship[] = Array.isArray(raw.relationships) ? raw.relationships.slice(0, 500).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const sourceRaw = text(item.sourceRef, 120); const targetRaw = text(item.targetRef, 120);
    const sourceRef = sourceRaw === "self" ? "self" : refMap.get(sourceRaw) ?? (knownIds.has(sourceRaw) ? `existing:${sourceRaw}` : sourceRaw);
    const targetRef = targetRaw === "self" ? "self" : refMap.get(targetRaw) ?? (knownIds.has(targetRaw) ? `existing:${targetRaw}` : targetRaw);
    const labels = Array.isArray(item.labels) ? item.labels.map((label) => text(label, 120)).filter(Boolean).slice(0, 8) : [text(item.label, 120)].filter(Boolean);
    if (!sourceRef || !targetRef || !labels.length) return [];
    const direction: RelationshipDirection = item.direction === "source-to-target" || item.direction === "target-to-source" ? item.direction : "undirected";
    const strength: RelationshipStrength = item.strength === "very-close" || item.strength === "close" || item.strength === "light" ? item.strength : "normal";
    const viaRaw = text(item.introducedByRef, 120);
    return [{ id: createId("draft_relationship"), sourceRef, targetRef, labels, direction, strength, introducedByRef: refMap.get(viaRaw) ?? viaRaw, selected: true }];
  }) : [];
  return {
    id: createId("compose"), mode, source: "describe", people, relationships, groups,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map((warning) => text(warning, 240)).filter(Boolean).slice(0, 20) : [],
    createdAt: new Date().toISOString(),
  };
}

function projectCategory(value: unknown): ProjectCategory {
  return value === "school" || value === "business" || value === "family" || value === "community" || value === "other" ? value : "personal";
}

function graphContext(value: unknown): Graph {
  const base = createInitialGraph();
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  const people: Person[] = Array.isArray(raw.people) ? raw.people.slice(0, 300).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>; const id = text(item.id, 120); const name = text(item.name, 120); if (!id || !name) return [];
    return [{ id, globalId: text(item.globalId, 120) || id, name, nickname: text(item.nickname, 120), phone: "", email: "", githubUrl: "", linkedinUrl: "", notes: "", howWeMet: "", groupId: "", groupIds: Array.isArray(item.groupIds) ? item.groupIds.map((id) => text(id, 120)).filter(Boolean).slice(0, 80) : [], lastInteraction: "", role: text(item.role), company: text(item.company), department: text(item.department), team: text(item.team), reportsToPersonId: text(item.reportsToPersonId, 120), includeInOrgChart: Boolean(item.includeInOrgChart), yearGroup: text(item.yearGroup), subject: text(item.subject), knownSince: "", sharedInterests: "", contextRole: text(item.contextRole), x: 0, y: 0, accent: "blue" as const, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), isSelf: Boolean(item.isSelf) }];
  }) : [];
  const relationships = Array.isArray(raw.relationships) ? raw.relationships.slice(0, 1000).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>; const id = text(item.id, 120); const sourceId = text(item.sourceId, 120); const targetId = text(item.targetId, 120); if (!id || !sourceId || !targetId) return [];
    const labels = Array.isArray(item.labels) ? item.labels.map((label) => text(label, 120)).filter(Boolean).slice(0, 8) : [text(item.semantic ?? item.label, 120)].filter(Boolean);
    const direction: RelationshipDirection = item.direction === "source-to-target" || item.direction === "target-to-source" ? item.direction : "undirected";
    const strength: RelationshipStrength = item.strength === "very-close" || item.strength === "close" || item.strength === "light" ? item.strength : "normal";
    const type: RelationshipType = RELATIONSHIP_TYPES.has(item.type as RelationshipType) ? item.type as RelationshipType : "friend";
    return [{ id, sourceId, targetId, type, label: labels[0] ?? "Connection", labels, semantic: text(item.semantic, 120) || labels[0] || "Connection", strength, direction, introducedByPersonId: text(item.introducedByPersonId, 120), createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }];
  }) : [];
  const groups = Array.isArray(raw.groups) ? raw.groups.slice(0, 100).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>; const id = text(item.id, 120); const name = text(item.name, 120); return id && name ? [{ id, name, color: "blue" as const, x: 0, y: 0, width: 600, height: 360 }] : [];
  }) : [];
  return { ...base, people, relationships, groups };
}

function globalPeopleContext(value: unknown): GlobalPerson[] {
  return Array.isArray(value) ? value.slice(0, 300).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>; const id = text(item.id, 120); const name = text(item.name, 120); if (!id || !name) return [];
    return [{ id, name, nickname: text(item.nickname, 120), phone: "", email: "", githubUrl: "", linkedinUrl: "", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }];
  }) : [];
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 65_536) return NextResponse.json({ error: "That Compose request is too large. Use CSV for larger imports." }, { status: 413, headers: { "cache-control": "no-store" } });
  const client = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now = Date.now(); const bucket = requests.get(client);
  if (!bucket || bucket.resetAt < now) requests.set(client, { count: 1, resetAt: now + 60_000 });
  else if (bucket.count >= 20) return NextResponse.json({ error: "Compose is receiving too many requests. Wait a minute and try again." }, { status: 429, headers: { "cache-control": "no-store", "retry-after": "60" } });
  else bucket.count += 1;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "The Compose request was not valid JSON." }, { status: 400 }); }
  const prompt = text(body.text, 12_000);
  const mode = body.mode === "change" ? "change" : "create";
  if (!prompt) return NextResponse.json({ error: "Add a description before creating a draft." }, { status: 400 });
  const graph = graphContext(body.graph);
  const globals = globalPeopleContext(body.globalPeople);
  const rawProject = body.project && typeof body.project === "object" ? body.project as Record<string, unknown> : {};
  const category = projectCategory(rawProject.category);
  const customCategoryName = text(rawProject.customCategoryName, 120);
  const customLabels = Array.isArray(rawProject.customRelationshipLabels) ? rawProject.customRelationshipLabels.map((label) => text(label, 120)).filter(Boolean).slice(0, 80) : [];
  const resolutions = body.resolutions && typeof body.resolutions === "object" ? Object.fromEntries(Object.entries(body.resolutions as Record<string, unknown>).slice(0, 50).flatMap(([id, value]) => {
    const key = text(id, 120); const choice = text(value, 120); return key && choice ? [[key, choice]] : [];
  })) : {};
  const external = externalProviderStatus();

  if (!external.available) {
    const interpretation = interpretNaturalLanguage(prompt, { mode, category, customCategoryName, graph, resolutions });
    const draft = compileSemanticInterpretation(interpretation, { mode, source: "describe", graph, globalPeople: globals, category });
    return NextResponse.json({ draft, engine: "local-semantic" }, { headers: { "cache-control": "no-store" } });
  }

  const provider = process.env.AI_PROVIDER;
  const endpoint = process.env.AI_API_URL;
  if (provider !== "custom-http" || !endpoint) return NextResponse.json({ error: "The configured Compose provider is incomplete." }, { status: 503 });
  const system = composeProviderInstruction({ mode, category, customCategoryName, fields: ["role", "company", "department", "team", "subject", "contextRole", "manager"], relationshipLabels: ontologyForProvider(category, customLabels) });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {}) },
      body: JSON.stringify({
        task: "circa_semantic_interpretation",
        mode,
        system,
        instruction: system,
        userDescription: prompt,
        prompt,
        context: {
          project: { category, customCategoryName, relationshipLabels: ontologyForProvider(category, customLabels) },
          selectedPersonId: text(body.selectedPersonId, 120),
          people: graph.people.map(({ id, name, nickname, role, company, department, team, subject, contextRole, reportsToPersonId, isSelf }) => ({ id, name, nickname, role, company, department, team, subject, contextRole, reportsToPersonId, isSelf })),
          relationships: graph.relationships.map(({ id, sourceId, targetId, labels, direction, introducedByPersonId }) => ({ id, sourceId, targetId, labels, direction, introducedByPersonId })),
          groups: graph.groups.map(({ id, name }) => ({ id, name })),
          globalPeople: globals.map(({ id, name, nickname }) => ({ id, name, nickname })),
          ambiguityResolutions: resolutions,
        },
        responseShape: { version: "circa-semantic-v1", entities: [{ ref: "temporary_ref", kind: "person", displayName: "string", aliases: [], evidence: [] }], claims: [{ id: "claim_1", type: "attribute | relationship | reports_to | group_membership | introduction | removal", subjectRef: "temporary_ref | self", objectRef: "temporary_ref | self", field: "role | company | department | team | subject | contextRole", value: "string", labels: ["string"], groupName: "string", groupKind: "group | team | department | subject", introducedByRef: "temporary_ref", direction: "undirected | source-to-target | target-to-source", polarity: "positive | negative", certainty: "explicit | safe-inference | ambiguous", derived: false, evidenceText: "exact source span" }], ambiguities: [{ id: "ambiguity_1", question: "string", kind: "person_reference | identity | meaning | conflict", claimId: "optional", options: [{ id: "temporary_ref", label: "string" }] }], warnings: [] },
      }),
      signal: controller.signal,
    });
    const payload = await response.json() as { interpretation?: unknown; semantic?: unknown; draft?: unknown; result?: unknown; error?: string };
    if (!response.ok) return NextResponse.json({ error: payload.error || "The configured Compose provider could not complete the request." }, { status: 502 });
    const semantic = validateSemanticInterpretation(payload.interpretation ?? payload.semantic ?? payload.result ?? payload);
    if (semantic) {
      const draft = compileSemanticInterpretation(semantic, { mode, source: "describe", graph, globalPeople: globals, category });
      return NextResponse.json({ draft, engine: "external-semantic" }, { headers: { "cache-control": "no-store" } });
    }
    const legacyDraft = validateDraft(payload.draft, mode, body);
    if (legacyDraft) return NextResponse.json({ draft: legacyDraft, engine: "legacy-provider", warning: "Provider should migrate to circa-semantic-v1." }, { headers: { "cache-control": "no-store" } });
    return NextResponse.json({ error: "The provider returned a semantic proposal Circa could not safely validate." }, { status: 502 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.name === "AbortError" ? "Compose took too long. Your map was not changed." : "The configured Compose provider could not be reached. Your map was not changed." }, { status: 502 });
  } finally { clearTimeout(timeout); }
}
