import { createId } from "./graphStore.ts";
import type { GlobalPerson, Graph, Person, ProjectCategory, RelationshipDirection } from "./graphStore.ts";
import { ontologyConceptFor, relationshipVisualType } from "./composeOntology.ts";
import type { ComposeAmbiguity, ComposeDraft, ComposeDraftGroup, ComposeDraftPerson, ComposeDraftRelationship, ComposeFieldPatch, ComposeMode, ComposePersonField, ComposeSource } from "./composeEngine.ts";

export type SemanticCertainty = "explicit" | "safe-inference" | "ambiguous";
export type SemanticPolarity = "positive" | "negative";

export type SemanticEntity = {
  ref: string;
  kind: "person";
  displayName: string;
  aliases: string[];
  existingCandidateIds: string[];
  evidence: string[];
};

type SemanticClaimBase = {
  id: string;
  evidenceText: string;
  certainty: SemanticCertainty;
  polarity: SemanticPolarity;
  derived: boolean;
};

export type SemanticClaim =
  | (SemanticClaimBase & { type: "attribute"; subjectRef: string; field: Exclude<ComposePersonField, "name" | "manager" | "phone" | "email" | "linkedinUrl" | "githubUrl" | "howWeMet">; value: string })
  | (SemanticClaimBase & { type: "relationship"; subjectRef: string; objectRef: string; labels: string[]; direction: RelationshipDirection })
  | (SemanticClaimBase & { type: "reports_to"; subjectRef: string; objectRef: string })
  | (SemanticClaimBase & { type: "group_membership"; subjectRef: string; groupName: string; groupKind: "group" | "team" | "department" | "subject" })
  | (SemanticClaimBase & { type: "introduction"; subjectRef: string; objectRef: string; introducedByRef: string; labels: string[] })
  | (SemanticClaimBase & { type: "removal"; subjectRef: string; objectRef?: string; field?: ComposePersonField; labels?: string[]; value?: string });

export type SemanticAmbiguity = {
  id: string;
  question: string;
  kind: "person_reference" | "identity" | "meaning" | "conflict";
  claimId?: string;
  evidenceText?: string;
  options: Array<{ id: string; label: string; description?: string }>;
};

export type CircaSemanticInterpretation = {
  version: "circa-semantic-v1";
  entities: SemanticEntity[];
  claims: SemanticClaim[];
  ambiguities: SemanticAmbiguity[];
  warnings: string[];
};

const PERSON_FIELDS = new Set(["role", "company", "department", "team", "subject", "contextRole"]);
const CLAIM_TYPES = new Set(["attribute", "relationship", "reports_to", "group_membership", "introduction", "removal"]);

function limitedText(value: unknown, max = 240) { return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : ""; }
function stableRef(value: unknown) { return limitedText(value, 100).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, ""); }
function certainty(value: unknown): SemanticCertainty { return value === "safe-inference" || value === "ambiguous" ? value : "explicit"; }
function polarity(value: unknown): SemanticPolarity { return value === "negative" ? "negative" : "positive"; }

/** Validates provider output as untrusted data before it reaches the compiler. */
export function validateSemanticInterpretation(value: unknown): CircaSemanticInterpretation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.entities) || !Array.isArray(raw.claims) || raw.entities.length > 300 || raw.claims.length > 1000) return null;
  const entities: SemanticEntity[] = raw.entities.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>; const ref = stableRef(item.ref); const displayName = limitedText(item.displayName ?? item.name, 120);
    if (!ref || !displayName || ref === "self") return [];
    return [{ ref, kind: "person" as const, displayName, aliases: Array.isArray(item.aliases) ? item.aliases.map((alias) => limitedText(alias, 120)).filter(Boolean).slice(0, 12) : [], existingCandidateIds: [], evidence: Array.isArray(item.evidence) ? item.evidence.map((evidence) => limitedText(evidence, 300)).filter(Boolean).slice(0, 20) : [] }];
  });
  const validRefs = new Set(["self", ...entities.map((entity) => entity.ref)]);
  const claims = raw.claims.flatMap<SemanticClaim>((value, index): SemanticClaim[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>; const type = limitedText(item.type, 40); if (!CLAIM_TYPES.has(type)) return [];
    const subjectRef = stableRef(item.subjectRef ?? item.entityRef ?? item.employeeRef ?? item.personARef ?? item.personRef);
    const objectRef = stableRef(item.objectRef ?? item.managerRef ?? item.personBRef);
    const base: SemanticClaimBase = { id: stableRef(item.id) || `claim_${index + 1}`, evidenceText: limitedText(item.evidenceText, 500), certainty: certainty(item.certainty), polarity: polarity(item.polarity), derived: Boolean(item.derived) };
    if (!subjectRef || !validRefs.has(subjectRef)) return [];
    if (type === "attribute") {
      const field = limitedText(item.field, 40); const value = limitedText(item.value, 500);
      if (!PERSON_FIELDS.has(field) || (!value && base.polarity === "positive")) return [];
      return [{ ...base, type: "attribute" as const, subjectRef, field: field as Exclude<ComposePersonField, "name" | "manager" | "phone" | "email" | "linkedinUrl" | "githubUrl" | "howWeMet">, value }];
    }
    if (type === "relationship") {
      const labels = (Array.isArray(item.labels) ? item.labels : [item.label]).map((label) => limitedText(label, 120)).filter(Boolean).slice(0, 8);
      if (!objectRef || !validRefs.has(objectRef) || !labels.length) return [];
      const direction: RelationshipDirection = item.direction === "source-to-target" || item.direction === "target-to-source" ? item.direction : "undirected";
      return [{ ...base, type: "relationship" as const, subjectRef, objectRef, labels, direction }];
    }
    if (type === "reports_to") {
      if (!objectRef || !validRefs.has(objectRef)) return [];
      return [{ ...base, type: "reports_to" as const, subjectRef, objectRef }];
    }
    if (type === "group_membership") {
      const groupName = limitedText(item.groupName, 120); if (!groupName) return [];
      const groupKind = item.groupKind === "team" || item.groupKind === "department" || item.groupKind === "subject" ? item.groupKind : "group";
      return [{ ...base, type: "group_membership" as const, subjectRef, groupName, groupKind }];
    }
    if (type === "introduction") {
      const introducedByRef = stableRef(item.introducedByRef); if (!objectRef || !validRefs.has(objectRef) || !introducedByRef || !validRefs.has(introducedByRef)) return [];
      const labels = (Array.isArray(item.labels) ? item.labels : []).map((label) => limitedText(label, 120)).filter(Boolean).slice(0, 8);
      return [{ ...base, type: "introduction" as const, subjectRef, objectRef, introducedByRef, labels }];
    }
    const field = limitedText(item.field, 40) as ComposePersonField; const labels = (Array.isArray(item.labels) ? item.labels : []).map((label) => limitedText(label, 120)).filter(Boolean).slice(0, 8);
    return [{ ...base, type: "removal" as const, subjectRef, objectRef: objectRef && validRefs.has(objectRef) ? objectRef : undefined, field: field || undefined, labels: labels.length ? labels : undefined, value: limitedText(item.value, 500) || undefined }];
  });
  const ambiguities: SemanticAmbiguity[] = Array.isArray(raw.ambiguities) ? raw.ambiguities.slice(0, 50).flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>; const question = limitedText(item.question, 300); if (!question) return [];
    const kind = item.kind === "identity" || item.kind === "meaning" || item.kind === "conflict" ? item.kind : "person_reference";
    const options = Array.isArray(item.options) ? item.options.slice(0, 20).flatMap((option) => option && typeof option === "object" ? [{ id: stableRef((option as Record<string, unknown>).id), label: limitedText((option as Record<string, unknown>).label, 160), description: limitedText((option as Record<string, unknown>).description, 240) || undefined }] : []).filter((option) => option.id && option.label) : [];
    return [{ id: stableRef(item.id) || `ambiguity_${index + 1}`, question, kind, claimId: stableRef(item.claimId) || undefined, evidenceText: limitedText(item.evidenceText, 500) || undefined, options }];
  }) : [];
  return { version: "circa-semantic-v1", entities, claims, ambiguities, warnings: Array.isArray(raw.warnings) ? raw.warnings.map((warning) => limitedText(warning, 300)).filter(Boolean).slice(0, 30) : [] };
}

function normalized(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }
function position(index: number, total: number) { const angle = ((Math.PI * 2) / Math.max(total, 1)) * index - Math.PI / 2; const radius = 300 + (index % 3) * 52; return { x: 760 + Math.cos(angle) * radius, y: 480 + Math.sin(angle) * radius }; }

function localMatches(entity: SemanticEntity, people: Person[]) {
  const names = [entity.displayName, ...entity.aliases].map(normalized);
  return people.filter((person) => !person.isSelf && (names.includes(normalized(person.name)) || Boolean(person.nickname && names.includes(normalized(person.nickname)))));
}

function globalMatches(entity: SemanticEntity, people: GlobalPerson[]) {
  const names = [entity.displayName, ...entity.aliases].map(normalized);
  return people.filter((person) => names.includes(normalized(person.name)) || Boolean(person.nickname && names.includes(normalized(person.nickname))));
}

function unchangedFields(): ComposeDraftPerson["fieldPatches"] {
  return Object.fromEntries((["name", "role", "company", "department", "team", "manager", "subject", "contextRole", "phone", "email", "linkedinUrl", "githubUrl", "howWeMet"] as ComposePersonField[]).map((field) => [field, { action: "unchanged" }])) as ComposeDraftPerson["fieldPatches"];
}

function certaintyRank(value: SemanticCertainty) { return value === "ambiguous" ? 3 : value === "safe-inference" ? 2 : 1; }

export function compileSemanticInterpretation(interpretation: CircaSemanticInterpretation, args: {
  mode: Exclude<ComposeMode, "ask">;
  source?: ComposeSource;
  graph: Graph;
  globalPeople?: GlobalPerson[];
  category: ProjectCategory;
}): ComposeDraft {
  const warnings = [...interpretation.warnings];
  const ambiguities: ComposeAmbiguity[] = interpretation.ambiguities.map((item) => ({ ...item }));
  const people: ComposeDraftPerson[] = interpretation.entities.map((entity, index) => {
    const local = localMatches(entity, args.graph.people); const global = globalMatches(entity, args.globalPeople ?? []).filter((person) => !local.some((match) => match.globalId === person.id));
    const identityResolution = local.length === 1 ? "use-existing" as const : local.length > 1 ? "unresolved" as const : global.length === 1 ? "use-global" as const : global.length > 1 ? "unresolved" as const : args.mode === "change" ? "unresolved" as const : "create" as const;
    if (local.length > 1 || global.length > 1 || (args.mode === "change" && !local.length && !global.length)) {
      ambiguities.push({ id: `identity_${entity.ref}`, question: local.length + global.length ? `Which ${entity.displayName} did you mean?` : `I couldn't find an existing ${entity.displayName}.`, kind: "identity", evidenceText: entity.evidence[0], options: [...local.map((person) => ({ id: `existing:${person.id}`, label: person.name, description: person.role || person.team || person.company || "This Project" })), ...global.map((person) => ({ id: `global:${person.id}`, label: person.name, description: "Another Circa Project" })), ...(args.mode === "create" ? [{ id: "create", label: `Create a new ${entity.displayName}` }] : [])] });
    }
    const existing = local.length === 1 ? local[0] : undefined; const globalPerson = global.length === 1 ? global[0] : undefined;
    const fields = unchangedFields();
    fields.name = identityResolution === "create" || identityResolution === "use-global" ? { action: "set", value: entity.displayName } : { action: "unchanged" };
    return {
      id: createId("draft_person"), ref: `draft:${entity.ref}`, name: existing?.name ?? globalPerson?.name ?? entity.displayName,
      role: existing?.role ?? "", company: existing?.company ?? "", department: existing?.department ?? "", team: existing?.team ?? "", subject: existing?.subject ?? "", contextRole: existing?.contextRole ?? "", managerName: "",
      phone: existing?.phone ?? "", email: existing?.email ?? "", linkedinUrl: existing?.linkedinUrl ?? "", githubUrl: existing?.githubUrl ?? "", relationshipLabel: "", relationshipType: "friend", howWeMet: existing?.howWeMet ?? "",
      matchId: existing?.id ?? "", globalMatchId: globalPerson?.id, suggestedGlobalMatchIds: global.map((person) => person.id), globalContact: globalPerson ? { nickname: globalPerson.nickname, phone: globalPerson.phone, email: globalPerson.email, linkedinUrl: globalPerson.linkedinUrl, githubUrl: globalPerson.githubUrl } : undefined,
      suggestedMatchIds: local.map((person) => person.id), identityResolution, fieldPatches: fields, includeInOrgChart: null, selected: Boolean(entity.displayName), needsReview: identityResolution === "unresolved", ...position(index, interpretation.entities.length), evidenceText: [...entity.evidence], certainty: "explicit",
    };
  });
  const draftRef = new Map(people.map((person, index) => [interpretation.entities[index].ref, person.ref]));
  const draftPerson = (ref: string) => people.find((person) => person.ref === draftRef.get(ref));
  const resolveRef = (ref: string) => ref === "self" ? "self" : draftRef.get(ref) ?? "";
  const relationshipMap = new Map<string, ComposeDraftRelationship>();
  const groupMap = new Map<string, ComposeDraftGroup>();
  const positiveManagers = new Map<string, Set<string>>();

  const addEvidence = (ref: string, evidenceText: string, claimCertainty: SemanticCertainty) => {
    const person = draftPerson(ref); if (!person) return;
    if (evidenceText && !person.evidenceText?.includes(evidenceText)) person.evidenceText = [...(person.evidenceText ?? []), evidenceText];
    if (certaintyRank(claimCertainty) > certaintyRank(person.certainty ?? "explicit")) person.certainty = claimCertainty;
    if (claimCertainty === "ambiguous") person.needsReview = true;
  };
  const addRelationship = (claim: Extract<SemanticClaim, { type: "relationship" | "introduction" }>, action: "upsert" | "remove") => {
    const sourceRef = resolveRef(claim.subjectRef); const targetRef = resolveRef(claim.objectRef); if (!sourceRef || !targetRef || sourceRef === targetRef) { warnings.push(`A relationship from “${claim.evidenceText}” has an unresolved Person.`); return; }
    const labels = claim.type === "introduction" ? (claim.labels.length ? claim.labels : ["Introduced through"]) : claim.labels;
    const introducedByRef = claim.type === "introduction" ? resolveRef(claim.introducedByRef) : "";
    if (claim.type === "introduction" && !introducedByRef) { warnings.push(`The introducer in “${claim.evidenceText}” could not be resolved.`); return; }
    const pair = [sourceRef, targetRef].sort().join("|"); const key = `${action}:${pair}`; const current = relationshipMap.get(key);
    if (current) { current.labels = [...new Set([...current.labels, ...labels])].slice(0, 8); current.evidenceText = [current.evidenceText, claim.evidenceText].filter(Boolean).join(" | "); current.derived = current.derived && claim.derived; }
    else relationshipMap.set(key, { id: createId("draft_relationship"), sourceRef, targetRef, labels: [...new Set(labels)].slice(0, 8), direction: claim.type === "relationship" ? claim.direction : "undirected", strength: labels.some((label) => /best|close/i.test(label)) ? "close" : "normal", introducedByRef, selected: true, action, evidenceText: claim.evidenceText, certainty: claim.certainty, derived: claim.derived });
  };

  for (const claim of interpretation.claims) {
    addEvidence(claim.subjectRef, claim.evidenceText, claim.certainty);
    if (claim.type === "attribute") {
      const person = draftPerson(claim.subjectRef); if (!person) continue;
      const patch: ComposeFieldPatch = claim.polarity === "negative" ? (args.mode === "change" ? { action: "clear" } : { action: "unchanged" }) : { action: "set", value: claim.value };
      person.fieldPatches[claim.field] = patch; (person as unknown as Record<string, unknown>)[claim.field] = patch.action === "set" ? claim.value : patch.action === "clear" ? "" : (person as unknown as Record<string, unknown>)[claim.field];
      if (claim.field === "role" || claim.field === "company" || claim.field === "department" || claim.field === "team") person.includeInOrgChart = args.category === "business" ? true : person.includeInOrgChart;
    } else if (claim.type === "reports_to") {
      const person = draftPerson(claim.subjectRef); const managerRef = resolveRef(claim.objectRef); if (!person || !managerRef) continue;
      if (claim.polarity === "negative") {
        const existing = args.graph.people.find((candidate) => candidate.id === person.matchId);
        const manager = managerRef.startsWith("draft:") ? draftPerson(claim.objectRef) : undefined;
        const managerId = manager?.matchId;
        if (args.mode === "change" && existing?.reportsToPersonId && (!managerId || existing.reportsToPersonId === managerId)) person.fieldPatches.manager = { action: "clear" };
        continue;
      }
      const set = positiveManagers.get(claim.subjectRef) ?? new Set<string>(); set.add(managerRef); positiveManagers.set(claim.subjectRef, set);
      person.managerName = managerRef; person.fieldPatches.manager = { action: "set", value: managerRef }; person.includeInOrgChart = true;
    } else if (claim.type === "relationship") addRelationship(claim, claim.polarity === "negative" ? "remove" : "upsert");
    else if (claim.type === "introduction") addRelationship(claim, claim.polarity === "negative" ? "remove" : "upsert");
    else if (claim.type === "group_membership") {
      const person = draftPerson(claim.subjectRef); if (!person) continue;
      if (claim.groupKind !== "group") {
        const field = claim.groupKind as "team" | "department" | "subject";
        person.fieldPatches[field] = claim.polarity === "negative" && args.mode === "change" ? { action: "clear" } : claim.polarity === "positive" ? { action: "set", value: claim.groupName } : { action: "unchanged" };
        if (claim.polarity === "positive") (person as unknown as Record<string, unknown>)[field] = claim.groupName;
      }
      if (claim.polarity === "positive") {
        const key = normalized(claim.groupName); const current = groupMap.get(key) ?? { id: createId("draft_group"), name: claim.groupName, memberDraftIds: [], memberRefs: [], selected: true, evidenceText: [] };
        if (!current.memberRefs.includes(person.ref)) current.memberRefs.push(person.ref); current.memberDraftIds = current.memberRefs.map((ref) => people.find((candidate) => candidate.ref === ref)?.id ?? "").filter(Boolean); current.evidenceText = [...new Set([...(current.evidenceText ?? []), claim.evidenceText].filter(Boolean))]; groupMap.set(key, current);
      }
    } else if (claim.type === "removal") {
      const person = draftPerson(claim.subjectRef); if (!person || args.mode !== "change") continue;
      if (claim.field) person.fieldPatches[claim.field] = { action: "clear" };
      if (claim.objectRef && claim.labels?.length) addRelationship({ ...claim, type: "relationship", objectRef: claim.objectRef, labels: claim.labels, direction: "undirected" }, "remove");
    }
  }

  for (const [employeeRef, managers] of positiveManagers) if (managers.size > 1) {
    const person = draftPerson(employeeRef); if (person) { person.fieldPatches.manager = { action: "unchanged" }; person.managerName = ""; person.needsReview = true; }
    ambiguities.push({ id: `manager_conflict_${employeeRef}`, question: `You gave ${person?.name ?? employeeRef} more than one current manager. Which is current?`, kind: "conflict", options: [...managers].map((ref) => ({ id: ref, label: people.find((candidate) => candidate.ref === ref)?.name ?? ref })) });
  }
  for (const ambiguity of ambiguities) for (const person of people) if (ambiguity.options.some((option) => option.id === person.ref || option.id === person.matchId)) person.needsReview = true;
  const relationships = [...relationshipMap.values()]; const groups = [...groupMap.values()];
  const organisationLinks = people.filter((person) => person.fieldPatches.manager?.action === "set").length;
  return { id: createId("compose"), mode: args.mode, source: args.source ?? "describe", people, relationships, groups, ambiguities, warnings: [...new Set(warnings)], semanticSummary: { people: people.length, relationships: relationships.length, organisationLinks, groups: groups.length, derived: relationships.filter((relationship) => relationship.derived).length }, createdAt: new Date().toISOString() };
}

export function relationshipTypeForSemanticLabel(label: string, category: ProjectCategory) {
  return ontologyConceptFor(label, category)?.visualType ?? relationshipVisualType(label, category);
}
