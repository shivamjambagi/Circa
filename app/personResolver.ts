import type { Graph, Person } from "./graphStore.ts";

export type PersonResolution =
  | { status: "matched"; person: Person; matchedBy: "self" | "selected" | "name" | "nickname" | "partial" }
  | { status: "ambiguous"; reference: string; candidates: Person[] }
  | { status: "missing"; reference: string };

export function normalizePersonReference(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[?.!,;:]+$/g, "")
    .replace(/^(?:the\s+person\s+called|person\s+called|called|named)\s+/i, "")
    .replace(/(?:'s|’s)$/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function uniqueOrAmbiguous(reference: string, people: Person[], matchedBy: "name" | "nickname" | "partial"): PersonResolution | null {
  const unique = [...new Map(people.map((person) => [person.id, person])).values()];
  if (unique.length === 1) return { status: "matched", person: unique[0], matchedBy };
  if (unique.length > 1) return { status: "ambiguous", reference, candidates: unique };
  return null;
}

export function resolvePersonReference(reference: string, graph: Graph, selectedPersonId = ""): PersonResolution {
  const normalized = normalizePersonReference(reference);
  const self = graph.people.find((person) => person.isSelf);
  if (/^(?:i|me|my|mine|myself|you|self)$/.test(normalized) && self) return { status: "matched", person: self, matchedBy: "self" };
  if (/^(?:this person|selected person|them|they|he|him|she|her)$/.test(normalized) && selectedPersonId) {
    const selected = graph.people.find((person) => person.id === selectedPersonId);
    if (selected) return { status: "matched", person: selected, matchedBy: "selected" };
  }
  const exactName = uniqueOrAmbiguous(reference, graph.people.filter((person) => normalizePersonReference(person.name) === normalized), "name");
  if (exactName) return exactName;
  const exactNickname = uniqueOrAmbiguous(reference, graph.people.filter((person) => person.nickname && normalizePersonReference(person.nickname) === normalized), "nickname");
  if (exactNickname) return exactNickname;
  if (normalized.length >= 2) {
    const partial = uniqueOrAmbiguous(reference, graph.people.filter((person) => {
      const name = normalizePersonReference(person.name);
      const nickname = normalizePersonReference(person.nickname || "");
      const first = name.split(" ")[0];
      return first === normalized || name.startsWith(`${normalized} `) || nickname.startsWith(normalized);
    }), "partial");
    if (partial) return partial;
  }
  return { status: "missing", reference };
}

export type MentionGroup = { reference: string; start: number; end: number; people: Person[]; kind: "person" | "self" | "selected" };

/** Finds graph-backed Person mentions without inventing identities from arbitrary words. */
export function findPersonMentions(text: string, graph: Graph, selectedPersonId = "") {
  const lower = text.toLowerCase();
  const mentions: MentionGroup[] = [];
  const aliases = new Map<string, Person[]>();
  for (const person of graph.people) {
    for (const alias of [person.name, person.nickname].filter(Boolean)) {
      const key = normalizePersonReference(alias);
      // “you” in a question addresses Circa; it is not a reliable named mention.
      if (person.isSelf && key === "you") continue;
      aliases.set(key, [...(aliases.get(key) ?? []), person]);
    }
  }
  for (const [alias, people] of [...aliases.entries()].sort((a, b) => b[0].length - a[0].length)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower))) {
      const start = match.index + match[1].length;
      const end = start + match[2].length;
      if (!mentions.some((item) => start < item.end && end > item.start)) mentions.push({ reference: text.slice(start, end), start, end, people, kind: "person" });
    }
  }
  const self = graph.people.find((person) => person.isSelf);
  if (self) {
    const selfMatch = lower.match(/\b(?:i|me|my|mine|myself)\b/);
    if (selfMatch?.index !== undefined) mentions.push({ reference: selfMatch[0], start: selfMatch.index, end: selfMatch.index + selfMatch[0].length, people: [self], kind: "self" });
  }
  if (selectedPersonId && /\b(?:this person|selected person)\b/i.test(text)) {
    const selected = graph.people.find((person) => person.id === selectedPersonId);
    const match = lower.match(/\b(?:this person|selected person)\b/);
    if (selected && match?.index !== undefined) mentions.push({ reference: match[0], start: match.index, end: match.index + match[0].length, people: [selected], kind: "selected" });
  }
  return mentions.sort((a, b) => a.start - b.start);
}
