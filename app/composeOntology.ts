import type { ProjectCategory, RelationshipDirection, RelationshipType } from "./graphStore.ts";

export type OntologyConcept = {
  canonical: string;
  aliases: string[];
  kind: "relationship" | "reporting" | "role";
  direction: RelationshipDirection;
  visualType: RelationshipType;
  categories?: ProjectCategory[];
};

const TYPO_WORDS: Record<string, string> = {
  freind: "friend",
  freinds: "friends",
  collegue: "colleague",
  collegues: "colleagues",
  coworker: "coworker",
  maneger: "manager",
  mentour: "mentor",
  recruter: "recruiter",
  cousion: "cousin",
  buisness: "business",
  parnter: "partner",
};

export const RELATIONSHIP_ONTOLOGY: OntologyConcept[] = [
  { canonical: "Close Friend", aliases: ["best friend", "best mate", "close friend", "closest friend"], kind: "relationship", direction: "undirected", visualType: "very-close" },
  { canonical: "Friend", aliases: ["friend", "friends", "mate", "mates", "pal", "old friend", "school friend", "childhood friend", "online friend", "family friend", "friend from work", "friend from university"], kind: "relationship", direction: "undirected", visualType: "friend" },
  { canonical: "Colleague", aliases: ["colleague", "colleagues", "coworker", "co-worker", "workmate", "works with", "work together", "worked with", "professional contact"], kind: "relationship", direction: "undirected", visualType: "professional" },
  { canonical: "Classmate", aliases: ["classmate", "class mate", "same class", "in my class"], kind: "relationship", direction: "undirected", visualType: "friend", categories: ["school"] },
  { canonical: "Project Partner", aliases: ["project partner", "lab partner"], kind: "relationship", direction: "undirected", visualType: "close", categories: ["school", "business", "other"] },
  { canonical: "Business Partner", aliases: ["business partner", "cofounder", "co-founder"], kind: "relationship", direction: "undirected", visualType: "professional", categories: ["business", "other"] },
  { canonical: "Neighbour", aliases: ["neighbour", "neighbor"], kind: "relationship", direction: "undirected", visualType: "friend" },
  { canonical: "Mentor", aliases: ["mentor", "mentors", "mentored", "mentored by"], kind: "relationship", direction: "source-to-target", visualType: "close" },
  { canonical: "Teacher", aliases: ["teacher", "teaches", "tutor", "form tutor", "instructor"], kind: "relationship", direction: "source-to-target", visualType: "professional", categories: ["school", "community", "other"] },
  { canonical: "Coach", aliases: ["coach", "trainer", "coaches"], kind: "relationship", direction: "source-to-target", visualType: "professional", categories: ["community", "school", "other"] },
  { canonical: "Teammate", aliases: ["teammate", "team mate", "team member", "bandmate", "club member", "volunteer", "committee member"], kind: "relationship", direction: "undirected", visualType: "friend" },
  { canonical: "Sparring Partner", aliases: ["sparring partner"], kind: "relationship", direction: "undirected", visualType: "close", categories: ["other", "community"] },
  { canonical: "Recruiter", aliases: ["recruiter"], kind: "relationship", direction: "source-to-target", visualType: "professional", categories: ["business"] },
  { canonical: "Client", aliases: ["client", "customer"], kind: "relationship", direction: "undirected", visualType: "professional", categories: ["business"] },
  { canonical: "Parent", aliases: ["parent", "mother", "mum", "mom", "mummy", "father", "dad"], kind: "relationship", direction: "source-to-target", visualType: "family", categories: ["family"] },
  { canonical: "Mother", aliases: ["mother", "mum", "mom", "mummy", "mumski"], kind: "relationship", direction: "source-to-target", visualType: "family", categories: ["family"] },
  { canonical: "Father", aliases: ["father", "dad", "daddy"], kind: "relationship", direction: "source-to-target", visualType: "family", categories: ["family"] },
  { canonical: "Sibling", aliases: ["sibling", "brother", "sister"], kind: "relationship", direction: "undirected", visualType: "family", categories: ["family"] },
  { canonical: "Brother", aliases: ["brother"], kind: "relationship", direction: "undirected", visualType: "family", categories: ["family"] },
  { canonical: "Sister", aliases: ["sister"], kind: "relationship", direction: "undirected", visualType: "family", categories: ["family"] },
  { canonical: "Child", aliases: ["child", "son", "daughter"], kind: "relationship", direction: "source-to-target", visualType: "family", categories: ["family"] },
  { canonical: "Uncle", aliases: ["uncle"], kind: "relationship", direction: "source-to-target", visualType: "family", categories: ["family"] },
  { canonical: "Aunt", aliases: ["aunt", "auntie"], kind: "relationship", direction: "source-to-target", visualType: "family", categories: ["family"] },
  { canonical: "Cousin", aliases: ["cousin"], kind: "relationship", direction: "undirected", visualType: "family", categories: ["family"] },
  { canonical: "Grandparent", aliases: ["grandmother", "grandma", "nan", "grandfather", "grandad"], kind: "relationship", direction: "source-to-target", visualType: "family", categories: ["family"] },
  { canonical: "Partner", aliases: ["partner", "wife", "husband", "spouse"], kind: "relationship", direction: "undirected", visualType: "family" },
  { canonical: "Manager", aliases: ["manager", "line manager", "boss", "reports to", "reports into", "works under", "direct report", "managed by", "manages"], kind: "reporting", direction: "source-to-target", visualType: "professional", categories: ["business"] },
];

function plain(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalises relationship vocabulary only. It is never used to rewrite a Person name. */
export function normalizeVocabulary(value: string) {
  return plain(value).split(" ").map((word) => TYPO_WORDS[word] ?? word).join(" ");
}

export function ontologyConceptFor(value: string, category?: ProjectCategory) {
  const normalized = normalizeVocabulary(value);
  return RELATIONSHIP_ONTOLOGY
    .flatMap((concept) => concept.aliases.map((alias) => ({ concept, alias: normalizeVocabulary(alias) })))
    .filter(({ alias }) => normalized === alias || normalized.includes(alias))
    .sort((a, b) => Number(Boolean(b.concept.categories?.includes(category!))) - Number(Boolean(a.concept.categories?.includes(category!))) || b.alias.length - a.alias.length)[0]?.concept;
}

export function relationshipConceptsIn(value: string, category?: ProjectCategory) {
  const normalized = ` ${normalizeVocabulary(value)} `;
  const matches = RELATIONSHIP_ONTOLOGY
    // Category changes ranking and suggestions, never the meaning of a relationship
    // the user stated explicitly (a colleague can appear in a Family Project, etc.).
    .filter((concept) => concept.kind === "relationship")
    .filter((concept) => concept.aliases.some((alias) => normalized.includes(` ${normalizeVocabulary(alias)} `)))
    .sort((a, b) => Number(Boolean(b.categories?.includes(category!))) - Number(Boolean(a.categories?.includes(category!))) || Math.max(...b.aliases.map((alias) => alias.length)) - Math.max(...a.aliases.map((alias) => alias.length)));
  const result: OntologyConcept[] = [];
  for (const match of matches) if (!result.some((item) =>
    item.canonical === match.canonical
    || (match.canonical === "Friend" && item.canonical === "Close Friend")
    || (match.canonical === "Partner" && item.canonical !== "Partner" && item.canonical.endsWith("Partner"))
  )) result.push(match);
  return result;
}

export function relationshipVisualType(label: string, category: ProjectCategory): RelationshipType {
  return ontologyConceptFor(label, category)?.visualType ?? (category === "family" ? "family" : category === "business" ? "professional" : "friend");
}

export function labelsEquivalent(left: string, right: string, category?: ProjectCategory) {
  const a = ontologyConceptFor(left, category)?.canonical ?? normalizeVocabulary(left);
  const b = ontologyConceptFor(right, category)?.canonical ?? normalizeVocabulary(right);
  return a.toLowerCase() === b.toLowerCase();
}

export function ontologyForProvider(category: ProjectCategory, customLabels: string[] = []) {
  return [...new Set([
    ...RELATIONSHIP_ONTOLOGY.filter((item) => !item.categories || item.categories.includes(category)).map((item) => item.canonical),
    ...customLabels.map((label) => label.trim()).filter(Boolean),
  ])];
}
