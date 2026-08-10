import { labelsEquivalent, normalizeVocabulary, ontologyConceptFor } from "./composeOntology.ts";
import { findPersonMentions } from "./personResolver.ts";
import type { Graph, Person, ProjectCategory, Relationship } from "./graphStore.ts";

export type AskPathSegment = {
  fromPersonId: string;
  toPersonId: string;
  kind: "relationship" | "reporting";
  relationshipId?: string;
  labels: string[];
  direction?: "undirected" | "source-to-target" | "target-to-source";
  introducedByPersonId?: string;
  employeeId?: string;
  managerId?: string;
};

export type AskReportingEdge = { key: string; employeeId: string; managerId: string };

export type AskResult = {
  status: "result";
  personIds: string[];
  relationshipIds: string[];
  reportingEdges: AskReportingEdge[];
  pathSegments: AskPathSegment[];
  answer: string;
  label: string;
};

export type AskClarification = {
  id: string;
  question: string;
  options: Array<{ id: string; label: string; description?: string }>;
};

export type AskResponse = AskResult | { status: "clarification"; clarification: AskClarification } | { status: "error"; message: string };
export type AskOptions = { selectedPersonId?: string; resolutions?: Record<string, string>; category?: ProjectCategory };

type TraversalEdge = { from: string; to: string; segment: AskPathSegment };

function unique<T>(values: T[]) { return [...new Set(values)]; }
function personName(graph: Graph, id: string) { return graph.people.find((person) => person.id === id)?.name ?? "Unknown"; }
function reportingKey(employeeId: string, managerId: string) { return `reports:${employeeId}:${managerId}`; }
function edgeResult(args: Omit<AskResult, "status" | "personIds" | "relationshipIds" | "reportingEdges"> & { personIds: string[]; segments?: AskPathSegment[] }): AskResult {
  const segments = args.segments ?? args.pathSegments;
  return {
    status: "result",
    personIds: unique(args.personIds),
    relationshipIds: unique(segments.flatMap((segment) => segment.relationshipId ? [segment.relationshipId] : [])),
    reportingEdges: unique(segments.filter((segment) => segment.kind === "reporting" && segment.employeeId && segment.managerId).map((segment) => reportingKey(segment.employeeId!, segment.managerId!)))
      .map((key) => { const [, employeeId, managerId] = key.split(":"); return { key, employeeId, managerId }; }),
    pathSegments: segments,
    answer: args.answer,
    label: args.label,
  };
}

function relationshipSegment(relationship: Relationship, from: string, to: string): AskPathSegment {
  return { fromPersonId: from, toPersonId: to, kind: "relationship", relationshipId: relationship.id, labels: [...relationship.labels], direction: relationship.direction, introducedByPersonId: relationship.introducedByPersonId || undefined };
}

function graphEdges(graph: Graph): TraversalEdge[] {
  const edges: TraversalEdge[] = [];
  for (const relationship of graph.relationships) {
    edges.push({ from: relationship.sourceId, to: relationship.targetId, segment: relationshipSegment(relationship, relationship.sourceId, relationship.targetId) });
    edges.push({ from: relationship.targetId, to: relationship.sourceId, segment: relationshipSegment(relationship, relationship.targetId, relationship.sourceId) });
  }
  for (const employee of graph.people) if (employee.reportsToPersonId && graph.people.some((person) => person.id === employee.reportsToPersonId)) {
    const managerId = employee.reportsToPersonId;
    const base = { kind: "reporting" as const, labels: ["Reports to"], direction: "source-to-target" as const, employeeId: employee.id, managerId };
    edges.push({ from: employee.id, to: managerId, segment: { ...base, fromPersonId: employee.id, toPersonId: managerId } });
    edges.push({ from: managerId, to: employee.id, segment: { ...base, fromPersonId: managerId, toPersonId: employee.id } });
  }
  return edges;
}

export function findConnectionPath(graph: Graph, sourcePersonId: string, targetPersonId: string) {
  const edges = graphEdges(graph);
  const queue: Array<{ id: string; segments: AskPathSegment[] }> = [{ id: sourcePersonId, segments: [] }];
  const visited = new Set([sourcePersonId]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.id === targetPersonId) return current.segments;
    for (const edge of edges.filter((item) => item.from === current.id)) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push({ id: edge.to, segments: [...current.segments, edge.segment] });
    }
  }
  return [];
}

function personIdsFromSegments(sourceId: string, segments: AskPathSegment[]) {
  return unique([sourceId, ...segments.map((segment) => segment.toPersonId)]);
}

function describeSegment(segment: AskPathSegment, graph: Graph) {
  const from = personName(graph, segment.fromPersonId);
  const to = personName(graph, segment.toPersonId);
  if (segment.kind === "reporting") {
    const employee = personName(graph, segment.employeeId!);
    const manager = personName(graph, segment.managerId!);
    return segment.fromPersonId === segment.employeeId ? `${employee} reports to ${manager}` : `${manager} manages ${employee}`;
  }
  const labels = segment.labels.join(", ") || "a stored connection";
  return `${from} and ${to} are connected as ${labels}`;
}

function directSegments(graph: Graph, personId: string) {
  return graphEdges(graph).filter((edge) => edge.from === personId).map((edge) => edge.segment);
}

function directRelationship(graph: Graph, leftId: string, rightId: string) {
  return graph.relationships.find((relationship) => (relationship.sourceId === leftId && relationship.targetId === rightId) || (relationship.sourceId === rightId && relationship.targetId === leftId));
}

function details(person: Person) {
  return person.role || person.team || person.department || person.company || (person.isSelf ? "You" : "Person");
}

function resolveMentionedPeople(question: string, graph: Graph, options: AskOptions) {
  const groups = findPersonMentions(question, graph, options.selectedPersonId);
  const people: Person[] = [];
  for (const group of groups) {
    if (group.people.length === 1) { if (!people.some((person) => person.id === group.people[0].id)) people.push(group.people[0]); continue; }
    const id = `person:${normalizeVocabulary(group.reference)}`;
    const chosenId = options.resolutions?.[id];
    const chosen = group.people.find((person) => person.id === chosenId);
    if (chosen) { if (!people.some((person) => person.id === chosen.id)) people.push(chosen); continue; }
    return { people, clarification: { id, question: `Which ${group.reference.trim()} did you mean?`, options: group.people.map((person) => ({ id: person.id, label: person.name, description: details(person) })) } satisfies AskClarification };
  }
  return { people };
}

function requirePeople(question: string, people: Person[], count: number): AskResponse | null {
  if (people.length >= count) return null;
  return { status: "error", message: people.length ? "I need one more clear Person name to answer that from this map." : `I couldn't find a clear Person name in “${question.trim()}”.` };
}

function answerPath(graph: Graph, source: Person, target: Person, directOnly: boolean, questionIsCheck: boolean): AskResult {
  const relationship = directRelationship(graph, source.id, target.id);
  const employee = graph.people.find((person) => (person.id === source.id && person.reportsToPersonId === target.id) || (person.id === target.id && person.reportsToPersonId === source.id));
  const manager = employee ? graph.people.find((person) => person.id === employee.reportsToPersonId) : undefined;
  if (relationship) {
    const segment = relationshipSegment(relationship, source.id, target.id);
    const labels = relationship.labels.join(", ") || "a stored connection";
    return edgeResult({ personIds: [source.id, target.id], pathSegments: [segment], label: "Direct connection", answer: `${questionIsCheck ? "Yes. " : ""}${source.name} and ${target.name} are directly connected as ${labels}.` });
  }
  if (employee && manager) {
    const segment: AskPathSegment = { fromPersonId: source.id, toPersonId: target.id, kind: "reporting", labels: ["Reports to"], direction: "source-to-target", employeeId: employee.id, managerId: manager.id };
    return edgeResult({ personIds: [source.id, target.id], pathSegments: [segment], label: "Direct organisation link", answer: `${questionIsCheck ? "Yes. " : ""}${employee.name} reports directly to ${manager.name}.` });
  }
  if (directOnly) return edgeResult({ personIds: [source.id, target.id], pathSegments: [], label: "Direct connection", answer: `No direct connection is stored between ${source.name} and ${target.name}.` });
  const path = findConnectionPath(graph, source.id, target.id);
  if (!path.length) return edgeResult({ personIds: [source.id, target.id], pathSegments: [], label: "No stored path", answer: `No stored connection path currently links ${source.name} and ${target.name}.` });
  const ids = personIdsFromSegments(source.id, path);
  const via = ids.slice(1, -1).map((id) => personName(graph, id));
  const explanation = path.length <= 3 ? ` ${path.map((segment) => describeSegment(segment, graph)).join("; ")}.` : "";
  return edgeResult({ personIds: ids, pathSegments: path, label: "Connection path", answer: `${questionIsCheck ? "Yes. " : ""}${source.name} is connected to ${target.name}${via.length ? ` through ${via.join(" → ")}` : ""}.${explanation}`.replace("..", ".") });
}

function groupMembers(graph: Graph, term: string) {
  const normalized = normalizeVocabulary(term).replace(/^(?:the|same|my)\s+/, "").replace(/\s+(?:team|group|department|class)$/, "").trim();
  const groups = graph.groups.filter((group) => normalizeVocabulary(group.name) === normalized || normalizeVocabulary(group.name) === `${normalized} team`);
  return graph.people.filter((person) => groups.some((group) => person.groupIds.includes(group.id)) || [person.team, person.department, person.subject].some((value) => normalizeVocabulary(value) === normalized));
}

function managerChain(graph: Graph, start: Person) {
  const segments: AskPathSegment[] = [];
  const seen = new Set([start.id]);
  let employee = start;
  while (employee.reportsToPersonId && !seen.has(employee.reportsToPersonId)) {
    const manager = graph.people.find((person) => person.id === employee.reportsToPersonId);
    if (!manager) break;
    seen.add(manager.id);
    segments.push({ fromPersonId: employee.id, toPersonId: manager.id, kind: "reporting", labels: ["Reports to"], direction: "source-to-target", employeeId: employee.id, managerId: manager.id });
    employee = manager;
  }
  return segments;
}

function descendants(graph: Graph, manager: Person, directOnly: boolean) {
  const segments: AskPathSegment[] = [];
  const queue = [manager.id];
  const seen = new Set([manager.id]);
  while (queue.length) {
    const managerId = queue.shift()!;
    for (const employee of graph.people.filter((person) => person.reportsToPersonId === managerId)) {
      if (seen.has(employee.id)) continue;
      seen.add(employee.id);
      segments.push({ fromPersonId: employee.id, toPersonId: managerId, kind: "reporting", labels: ["Reports to"], direction: "source-to-target", employeeId: employee.id, managerId });
      if (!directOnly) queue.push(employee.id);
    }
    if (directOnly) break;
  }
  return segments;
}

export function answerGraphQuestion(question: string, graph: Graph, options: AskOptions = {}): AskResponse {
  const clean = question.trim();
  const normalized = normalizeVocabulary(clean);
  if (!clean) return { status: "error", message: "Ask a question about the People stored on this map." };
  const resolved = resolveMentionedPeople(clean, graph, options);
  if (resolved.clarification) return { status: "clarification", clarification: resolved.clarification };
  const people = resolved.people;

  if (/\b(?:who has no connections|who is disconnected|who's disconnected)\b/.test(normalized)) {
    const edges = graphEdges(graph);
    const ids = graph.people.filter((person) => !edges.some((edge) => edge.from === person.id)).map((person) => person.id);
    return edgeResult({ personIds: ids, pathSegments: [], label: "Disconnected People", answer: ids.length ? `${ids.map((id) => personName(graph, id)).join(", ")} ${ids.length === 1 ? "has" : "have"} no stored relationship or reporting links.` : "Everyone on this map has at least one stored relationship or reporting link." });
  }
  if (/\b(?:who isn't connected to me|who is not connected to me|not connected to me)\b/.test(normalized)) {
    const self = graph.people.find((person) => person.isSelf);
    if (!self) return { status: "error", message: "This map has no clear You card." };
    const connected = new Set([self.id]); const queue = [self.id]; const edges = graphEdges(graph);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of edges.filter((item) => item.from === current)) if (!connected.has(edge.to)) { connected.add(edge.to); queue.push(edge.to); }
    }
    const ids = graph.people.filter((person) => !connected.has(person.id)).map((person) => person.id);
    return edgeResult({ personIds: [self.id, ...ids], pathSegments: [], label: "Outside your component", answer: ids.length ? `${ids.map((id) => personName(graph, id)).join(", ")} ${ids.length === 1 ? "is" : "are"} not linked to you by any stored path.` : "Everyone on this map is linked to you by a stored path." });
  }

  if (/\b(?:reporting chain|management chain|who is above|who's above)\b/.test(normalized)) {
    const missing = requirePeople(clean, people, 1); if (missing) return missing;
    const chain = managerChain(graph, people[0]);
    const ids = personIdsFromSegments(people[0].id, chain);
    const answer = chain.length ? `${chain.map((segment) => `${personName(graph, segment.employeeId!)} reports to ${personName(graph, segment.managerId!)}`).join(", who ")}.` : `${people[0].name} has no stored reporting chain.`;
    return edgeResult({ personIds: ids, pathSegments: chain, label: "Reporting chain", answer });
  }

  if (/\b(?:who reports directly to|direct reports|who does .+ manage|who reports to)\b/.test(normalized)) {
    const missing = requirePeople(clean, people, 1); if (missing) return missing;
    const manager = people[0]; const segments = descendants(graph, manager, true); const ids = segments.map((segment) => segment.employeeId!);
    return edgeResult({ personIds: [manager.id, ...ids], pathSegments: segments, label: "Direct reports", answer: ids.length ? `${ids.map((id) => personName(graph, id)).join(", ")} ${ids.length === 1 ? "reports" : "report"} directly to ${manager.name}.` : `No direct reports are stored for ${manager.name}.` });
  }

  if (/\b(?:who works under|who is under|organisation branch|organization branch|who is below)\b/.test(normalized)) {
    const missing = requirePeople(clean, people, 1); if (missing) return missing;
    const manager = people[0]; const segments = descendants(graph, manager, false); const ids = unique(segments.map((segment) => segment.employeeId!));
    return edgeResult({ personIds: [manager.id, ...ids], pathSegments: segments, label: "Organisation branch", answer: ids.length ? `${ids.map((id) => personName(graph, id)).join(", ")} ${ids.length === 1 ? "is" : "are"} below ${manager.name} in the stored organisation chart.` : `No organisation descendants are stored under ${manager.name}.` });
  }

  if (/\b(?:who is .+ manager|who's .+ manager|who manages|report to|boss)\b/.test(normalized) && !/\b(?:how|connected|connection|relationship)\b/.test(normalized)) {
    const missing = requirePeople(clean, people, 1); if (missing) return missing;
    const person = people[0]; const manager = graph.people.find((candidate) => candidate.id === person.reportsToPersonId);
    const segments = manager ? managerChain(graph, person).slice(0, 1) : [];
    return edgeResult({ personIds: manager ? [person.id, manager.id] : [person.id], pathSegments: segments, label: "Manager", answer: manager ? `${manager.name} is stored as ${person.name}'s manager.` : `${person.name} has no manager assigned.` });
  }

  if (/\bintroduc(?:e|ed|er|tion)\b/.test(normalized)) {
    if (/\bwho (?:did|has)\b/.test(normalized) && people.length >= 1) {
      const introducer = people[0];
      const self = graph.people.find((person) => person.isSelf);
      const relevant = graph.relationships.filter((relationship) => relationship.introducedByPersonId === introducer.id && (!/\bme\b/.test(normalized) || Boolean(self && [relationship.sourceId, relationship.targetId].includes(self.id))));
      const ids = unique(relevant.flatMap((relationship) => [relationship.sourceId, relationship.targetId]));
      const named = ids.filter((id) => id !== self?.id).map((id) => personName(graph, id));
      const segments = relevant.map((relationship) => relationshipSegment(relationship, relationship.sourceId, relationship.targetId));
      return edgeResult({ personIds: unique([introducer.id, ...ids]), pathSegments: segments, label: "Introductions", answer: named.length ? `${introducer.name} is recorded as the introducer for ${named.join(", ")}.` : `No stored introductions are attributed to ${introducer.name}.` });
    }
    const missing = requirePeople(clean, people, 2); if (missing) return missing;
    const [left, right] = people; const relationship = directRelationship(graph, left.id, right.id);
    const introducer = relationship?.introducedByPersonId ? graph.people.find((person) => person.id === relationship.introducedByPersonId) : undefined;
    const segments = relationship ? [relationshipSegment(relationship, left.id, right.id)] : [];
    return edgeResult({ personIds: introducer ? [left.id, right.id, introducer.id] : [left.id, right.id], pathSegments: segments, label: "Introducer", answer: introducer ? `${introducer.name} is recorded as the person who introduced ${left.isSelf ? "you" : left.name} to ${right.isSelf ? "you" : right.name}.` : `No introducer is stored for ${left.name} and ${right.name}.` });
  }

  if (/\b(?:mutual|both know|connected to both|shared stored connection)\b/.test(normalized)) {
    const missing = requirePeople(clean, people, 2); if (missing) return missing;
    const [left, right] = people; const leftIds = new Set(directSegments(graph, left.id).map((segment) => segment.toPersonId)); const rightIds = new Set(directSegments(graph, right.id).map((segment) => segment.toPersonId));
    const ids = [...leftIds].filter((id) => rightIds.has(id) && id !== left.id && id !== right.id);
    const segments = [...directSegments(graph, left.id), ...directSegments(graph, right.id)].filter((segment) => ids.includes(segment.toPersonId));
    return edgeResult({ personIds: [left.id, right.id, ...ids], pathSegments: segments, label: "Mutual connections", answer: ids.length ? `${left.name} and ${right.name} ${ids.length === 1 ? "have one shared stored connection" : `have ${ids.length} shared stored connections`}: ${ids.map((id) => personName(graph, id)).join(", ")}.` : `${left.name} and ${right.name} have no shared direct stored connections.` });
  }

  if (/\b(?:what groups? is|what groups? are|same group|who else is in .+ group)\b/.test(normalized)) {
    const missing = requirePeople(clean, people, 1); if (missing) return missing;
    const person = people[0]; const groups = graph.groups.filter((group) => person.groupIds.includes(group.id));
    if (/\bsame group|who else\b/.test(normalized)) {
      const ids = graph.people.filter((candidate) => candidate.id !== person.id && candidate.groupIds.some((id) => person.groupIds.includes(id))).map((candidate) => candidate.id);
      return edgeResult({ personIds: [person.id, ...ids], pathSegments: [], label: "Shared groups", answer: ids.length ? `${ids.map((id) => personName(graph, id)).join(", ")} ${ids.length === 1 ? "shares" : "share"} a stored group with ${person.name}.` : `No one else shares a stored group with ${person.name}.` });
    }
    return edgeResult({ personIds: [person.id], pathSegments: [], label: "Groups", answer: groups.length ? `${person.name} is in ${groups.map((group) => group.name).join(", ")}.` : `${person.name} is not in a stored canvas group.` });
  }

  if (/\b(?:what team|what department|same team|same department|who else is in .+ team|who else is in .+ department)\b/.test(normalized)) {
    const missing = requirePeople(clean, people, 1); if (missing) return missing;
    const person = people[0]; const field = normalized.includes("department") ? "department" : "team"; const value = person[field];
    if (/\b(?:same|who else)\b/.test(normalized)) {
      const ids = value ? graph.people.filter((candidate) => candidate.id !== person.id && normalizeVocabulary(candidate[field]) === normalizeVocabulary(value)).map((candidate) => candidate.id) : [];
      return edgeResult({ personIds: [person.id, ...ids], pathSegments: [], label: field === "team" ? "Team" : "Department", answer: value ? `${ids.length ? ids.map((id) => personName(graph, id)).join(", ") : "No one else"} ${ids.length === 1 ? "is" : "are"} in ${person.name}'s ${field}, ${value}.` : `${person.name} has no stored ${field}.` });
    }
    return edgeResult({ personIds: [person.id], pathSegments: [], label: field === "team" ? "Team" : "Department", answer: value ? `${person.name} is in ${value}.` : `${person.name} has no stored ${field}.` });
  }

  if (/\b(?:who is in|show)\b/.test(normalized) && people.length === 0) {
    const raw = clean.replace(/^.*?\b(?:who is in|show)\b\s+/i, "").replace(/[?.!]+$/, ""); const members = groupMembers(graph, raw);
    if (!members.length) return { status: "error", message: `No stored group, team, department or subject clearly matches “${raw}”.` };
    return edgeResult({ personIds: members.map((person) => person.id), pathSegments: [], label: raw, answer: `${members.map((person) => person.name).join(", ")} ${members.length === 1 ? "matches" : "match"} ${raw}.` });
  }

  const relationshipConcept = ontologyConceptFor(normalized, options.category);
  if (/\b(?:who are|who is|who does)\b/.test(normalized) && people.length >= 1 && relationshipConcept?.kind === "relationship") {
    const person = people[0];
    const relationships = graph.relationships.filter((relationship) => [relationship.sourceId, relationship.targetId].includes(person.id) && relationship.labels.some((label) => labelsEquivalent(label, relationshipConcept.canonical, options.category)));
    const ids = relationships.map((relationship) => relationship.sourceId === person.id ? relationship.targetId : relationship.sourceId);
    const segments = relationships.map((relationship) => relationshipSegment(relationship, person.id, relationship.sourceId === person.id ? relationship.targetId : relationship.sourceId));
    return edgeResult({ personIds: [person.id, ...ids], pathSegments: segments, label: relationshipConcept.canonical, answer: ids.length ? `${ids.map((id) => personName(graph, id)).join(", ")} ${ids.length === 1 ? "is" : "are"} connected to ${person.name} as ${relationshipConcept.canonical}.` : `${person.name} has no stored ${relationshipConcept.canonical} connections.` });
  }

  if (/\b(?:who does|who is).*(?:know|connected)|show .+ connections|what connections\b/.test(normalized) && people.length >= 1 && !/\b(?:how|between|relationship with)\b/.test(normalized)) {
    const person = people[0]; const segments = directSegments(graph, person.id); const ids = unique(segments.map((segment) => segment.toPersonId));
    return edgeResult({ personIds: [person.id, ...ids], pathSegments: segments, label: "Direct connections", answer: ids.length ? `${person.name} is directly linked to ${ids.map((id) => personName(graph, id)).join(", ")} on this map.` : `${person.name} has no direct stored connections.` });
  }

  const directOnly = /\b(?:directly connected|direct connection|directly know)\b/.test(normalized);
  const pathQuestion = /\b(?:how|connection|connected|relationship|path|know|get to)\b/.test(normalized);
  if (pathQuestion || directOnly) {
    const missing = requirePeople(clean, people, 2); if (missing) return missing;
    return answerPath(graph, people[0], people[1], directOnly, /\b(?:does|are|is)\b/.test(normalized));
  }

  return { status: "error", message: "I couldn't map that to a stored graph question yet. Ask about a path, connection, introducer, manager, reports, group, team or disconnected People." };
}

export function suggestAskQuestions(graph: Graph) {
  const questions: string[] = [];
  const self = graph.people.find((person) => person.isSelf);
  const firstSelfEdge = self ? graphEdges(graph).find((edge) => edge.from === self.id) : undefined;
  if (self && firstSelfEdge) questions.push(`How do I know ${personName(graph, firstSelfEdge.to)}?`);
  const namedPeople = graph.people.filter((person) => !person.isSelf);
  const pathPair = namedPeople.flatMap((source, index) => namedPeople.slice(index + 1).map((target) => ({ source, target, path: findConnectionPath(graph, source.id, target.id) }))).find((item) => item.path.length >= 2);
  if (pathPair) questions.push(`How is ${pathPair.source.name} connected to ${pathPair.target.name}?`);
  const introducer = graph.people.find((person) => graph.relationships.some((relationship) => relationship.introducedByPersonId === person.id));
  if (introducer) questions.push(`Who has ${introducer.name} introduced?`);
  const manager = graph.people.find((person) => graph.people.some((candidate) => candidate.reportsToPersonId === person.id));
  if (manager) questions.push(`Who reports to ${manager.name}?`);
  const team = graph.people.find((person) => person.team)?.team;
  if (team) questions.push(`Show ${team}.`);
  return unique(questions).slice(0, 3);
}
