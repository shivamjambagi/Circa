export type NetworkPerson = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  linkedinProfileUrl: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
  identityKey: string | null;
  identityFingerprint?: string | null;
  ownerUid?: string;
  visibility?: "private" | "project";
};

export type NetworkEdge = {
  id: string;
  sourcePersonId: string;
  targetPersonId: string;
  relationshipType: string;
  provenance: string;
  ownerUid?: string;
  visibility?: "private" | "project";
};

export type LinkedInPreview = {
  headers: string[];
  recognisedFields: string[];
  unrecognisedFields: string[];
  people: Omit<NetworkPerson, "id">[];
  invalidRows: number;
  duplicates: number;
};

const HEADER_MAP: Record<string, keyof Omit<NetworkPerson, "id" | "displayName" | "identityKey">> = {
  firstname: "firstName", first: "firstName", givenname: "firstName",
  lastname: "lastName", last: "lastName", surname: "lastName", familyname: "lastName",
  publicprofileurl: "linkedinProfileUrl", profileurl: "linkedinProfileUrl", linkedinurl: "linkedinProfileUrl", url: "linkedinProfileUrl",
  emailaddress: "email", email: "email", company: "company", organisation: "company", organization: "company",
  position: "position", title: "position", jobtitle: "position", connectedon: "connectedOn", connectiondate: "connectedOn",
};

function normaliseHeader(value: string) { return value.toLowerCase().replace(/^\ufeff/, "").replace(/[^a-z0-9]/g, ""); }
function clean(value: unknown, max = 500) { const next = String(value ?? "").trim(); return next ? next.slice(0, max) : null; }

export function parseCsvRows(input: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') { if (quoted && input[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && input[index + 1] === "\n") index += 1; row.push(field); if (row.some((value) => value.trim())) rows.push(row); row = []; field = ""; }
    else field += char;
  }
  row.push(field); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function normalizeLinkedInUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return value.trim();
    const match = url.pathname.match(/^\/in\/([^/]+)/i);
    if (!match) return `https://www.linkedin.com${url.pathname.replace(/\/+$/, "")}`;
    return `https://www.linkedin.com/in/${match[1].toLowerCase()}`;
  } catch { return value.trim() || null; }
}

export function parseLinkedInExport(input: string): LinkedInPreview {
  if (!input.trim()) throw new Error("This file is empty.");
  const rows = parseCsvRows(input);
  const headerIndex = rows.findIndex((row) => row.map(normaliseHeader).some((header) => header === "firstname" || header === "lastname") && row.map(normaliseHeader).some((header) => header.includes("profileurl") || header === "company" || header === "position" || header === "connectedon"));
  if (headerIndex < 0) throw new Error("I couldn't find connection data in this file.");
  const headers = rows[headerIndex].map((value) => value.trim());
  const fields = headers.map((header) => HEADER_MAP[normaliseHeader(header)] || null);
  const recognisedFields = [...new Set(fields.filter((field): field is NonNullable<typeof field> => Boolean(field)))];
  const unrecognisedFields = headers.filter((_, index) => !fields[index]);
  const people: Omit<NetworkPerson, "id">[] = []; let invalidRows = 0; let duplicates = 0; const seen = new Set<string>();
  for (const row of rows.slice(headerIndex + 1)) {
    const record: Partial<Omit<NetworkPerson, "id">> = {};
    fields.forEach((field, index) => { if (field) (record as Record<string, unknown>)[field] = clean(row[index]); });
    const firstName = clean(record.firstName, 120); const lastName = clean(record.lastName, 120); const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const linkedinProfileUrl = normalizeLinkedInUrl(record.linkedinProfileUrl); const email = clean(record.email, 180)?.toLowerCase() || null;
    if (!displayName && !linkedinProfileUrl && !email) { invalidRows += 1; continue; }
    const identityKey = linkedinProfileUrl ? `linkedin:${linkedinProfileUrl.toLowerCase()}` : email ? `email:${email}` : null;
    if (identityKey && seen.has(identityKey)) { duplicates += 1; continue; }
    if (identityKey) seen.add(identityKey);
    people.push({ displayName: displayName || email || "Unnamed connection", firstName, lastName, linkedinProfileUrl, email, company: clean(record.company, 180), position: clean(record.position, 180), connectedOn: clean(record.connectedOn, 80), identityKey });
  }
  if (!people.length) throw new Error("I couldn't find usable connection rows in this file.");
  return { headers, recognisedFields: recognisedFields.map(String), unrecognisedFields, people, invalidRows, duplicates };
}

export function findShortestPaths(edges: NetworkEdge[], sourceId: string, targetId: string, maxPaths = 3) {
  if (!sourceId || !targetId) return [] as string[][];
  if (sourceId === targetId) return [[sourceId]];
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edge.sourcePersonId || !edge.targetPersonId || edge.sourcePersonId === edge.targetPersonId) continue;
    if (!adjacency.has(edge.sourcePersonId)) adjacency.set(edge.sourcePersonId, new Set());
    if (!adjacency.has(edge.targetPersonId)) adjacency.set(edge.targetPersonId, new Set());
    adjacency.get(edge.sourcePersonId)!.add(edge.targetPersonId); adjacency.get(edge.targetPersonId)!.add(edge.sourcePersonId);
  }
  const distance = new Map([[sourceId, 0]]); const queue = [sourceId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]; const nextDistance = (distance.get(current) || 0) + 1;
    for (const next of [...(adjacency.get(current) || [])].sort()) if (!distance.has(next)) { distance.set(next, nextDistance); queue.push(next); }
  }
  const targetDistance = distance.get(targetId); if (targetDistance === undefined) return [] as string[][];
  const maxDistance = targetDistance;
  const results: string[][] = [];
  function visit(current: string, path: string[]) {
    if (results.length >= maxPaths) return;
    if (current === targetId) { results.push(path); return; }
    const currentDistance = distance.get(current)!;
    for (const next of [...(adjacency.get(current) || [])].sort()) if (distance.get(next) === currentDistance + 1 && (distance.get(next) || 0) <= maxDistance) visit(next, [...path, next]);
  }
  visit(sourceId, [sourceId]);
  return results;
}

export function resolveNetworkPerson(query: string, people: NetworkPerson[], selfId = "") {
  const normal = query.trim().toLowerCase();
  if (["i", "me", "myself", "you"].includes(normal) && selfId) return { status: "resolved" as const, person: people.find((person) => person.id === selfId) || null, matches: [] as NetworkPerson[] };
  const exact = people.filter((person) => person.displayName.toLowerCase() === normal);
  if (exact.length === 1) return { status: "resolved" as const, person: exact[0], matches: exact };
  if (exact.length > 1) return { status: "ambiguous" as const, person: null, matches: exact };
  const partial = people.filter((person) => person.displayName.toLowerCase().includes(normal));
  if (partial.length === 1) return { status: "resolved" as const, person: partial[0], matches: partial };
  return { status: partial.length > 1 ? "ambiguous" as const : "missing" as const, person: null, matches: partial };
}

export function answerNetworkQuestion(question: string, people: NetworkPerson[], edges: NetworkEdge[], selfId: string) {
  const normal = question.trim().replace(/[?.!]+$/g, "");
  const patterns = [/how (?:am i|is (.+?)) connected to (.+)$/i, /(?:shortest|known) path (?:from (.+?) )?to (.+)$/i, /(?:connection|path) to (.+)$/i, /who could potentially introduce me to (.+)$/i, /do i have any known connection to (.+)$/i];
  let sourceText = "me"; let targetText = "";
  for (const pattern of patterns) { const match = normal.match(pattern); if (!match) continue; if (match.length >= 3 && match[2]) { sourceText = match[1] || "me"; targetText = match[2]; } else targetText = match[1]; break; }
  if (!targetText) return { status: "unsupported" as const, answer: "Ask for a known pathway to a person in this Network.", paths: [] as string[][] };
  const source = resolveNetworkPerson(sourceText, people, selfId); const target = resolveNetworkPerson(targetText, people, selfId);
  if (source.status === "ambiguous" || target.status === "ambiguous") return { status: "ambiguous" as const, answer: "Which person did you mean?", matches: (source.status === "ambiguous" ? source.matches : target.matches), paths: [] as string[][] };
  if (!source.person || !target.person) return { status: "missing" as const, answer: "Circa couldn't find one of those people in this Network.", paths: [] as string[][] };
  const paths = findShortestPaths(edges, source.person.id, target.person.id);
  if (!paths.length) return { status: "no-path" as const, answer: "Circa couldn't find a known pathway between these people using the connections available to this Network.", paths };
  const byId = new Map(people.map((person) => [person.id, person])); const names = paths[0].map((id) => byId.get(id)?.displayName || "Unknown");
  return { status: "found" as const, answer: `Circa found a ${paths[0].length - 1}-step known connection pathway: ${names.join(" → ")}.`, paths };
}
