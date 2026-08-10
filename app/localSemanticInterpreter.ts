import { normalizeVocabulary, relationshipConceptsIn } from "./composeOntology.ts";
import type { CircaSemanticInterpretation, SemanticAmbiguity, SemanticClaim, SemanticCertainty, SemanticEntity, SemanticPolarity } from "./composeSemantics.ts";
import type { Graph, ProjectCategory, RelationshipDirection } from "./graphStore.ts";

type Context = { mode: "create" | "change"; category: ProjectCategory; customCategoryName?: string; graph: Graph; resolutions?: Record<string, string> };
type DistributiveClaimInput<T> = T extends SemanticClaim ? Omit<T, "id" | "certainty" | "polarity" | "derived"> & { certainty?: SemanticCertainty; polarity?: SemanticPolarity; derived?: boolean } : never;
type ClaimInput = DistributiveClaimInput<SemanticClaim>;

const NAME = String.raw`(?:Mr\s+|Mrs\s+|Ms\s+|Dr\s+)?[A-Z][A-Za-z'’-]*(?:\s+(?!(?:CEO|CTO|CFO|COO|Founder|Developer|Designer|Engineer|Recruiter|Teacher|Tutor|Instructor|Coach|Manager|Director)\b)[A-Z][A-Za-z'’-]*)?`;
const PERSON_OR_PRONOUN = String.raw`(?:${NAME}|[Ii]|[Mm]e|[Mm]yself|[Hh]e|[Hh]im|[Hh]is|[Ss]he|[Hh]er|[Tt]hey|[Tt]hem|[Bb]oth|[Tt]he other two|[Tt]he two of them|[Aa]ll three)`;
const TITLE = String.raw`(?:CEO|CTO|CFO|COO|[Ff]ounder|[Dd]eveloper|[Dd]esigner|[Ee]ngineer|[Rr]ecruiter|[Tt]eacher|[Tt]utor|[Ii]nstructor|[Cc]oach|[Ff]rontend [Ll]ead|[Bb]ackend [Ll]ead|[Pp]roduct [Ll]ead|[Tt]eam [Ll]ead|[Mm]anager|[Dd]irector|[Hh]ead of [A-Za-z ]+)`;
const RESERVED_NAMES = new Set(["They", "They're", "They’re", "Both", "Her", "His", "She", "She's", "She’s", "He", "He's", "He’s", "I", "CEO", "CTO", "CFO", "COO", "Actually", "Now"]);

function tidyName(value: string) {
  return value.trim().replace(/^[,;:\s]+|[,;:.\s]+$/g, "").replace(/(?:'s|’s)$/i, "").replace(/^(?:and|also)\s+/i, "");
}

function refSlug(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "person";
}

function canonicalTitle(value: string) {
  const clean = value.trim().replace(/^(?:a|an|the)\s+/i, "");
  if (/^[a-z]+ lead$/i.test(clean)) return clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return clean.replace(/\b(?:ceo|cto|cfo|coo)\b/gi, (title) => title.toUpperCase()).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isSelf(value: string) { return /^(?:i|me|my|myself|you|self)$/i.test(value.trim()); }
function isPluralPronoun(value: string) { return /^(?:they|them|both|the other two|the two of them|all three)$/i.test(value.trim()); }
function isSingularPronoun(value: string) { return /^(?:he|him|his|she|her|hers)$/i.test(value.trim()); }

export function interpretNaturalLanguage(text: string, context: Context): CircaSemanticInterpretation {
  const source = text.replace(/\r/g, "").trim().slice(0, 12_000);
  const entities = new Map<string, SemanticEntity>();
  const claims: SemanticClaim[] = [];
  const ambiguities: SemanticAmbiguity[] = [];
  const warnings: string[] = [];
  let lastSingular: string | null = null;
  let lastPlural: string[] = [];
  let lastObject: string | null = null;
  let claimIndex = 0;

  const entity = (rawName: string, evidenceText = source) => {
    const displayName = tidyName(rawName);
    if (!displayName || isSelf(displayName)) return "self";
    const existing = context.graph.people.filter((person) => [person.name, person.nickname].filter(Boolean).some((value) => value.toLowerCase() === displayName.toLowerCase()));
    const display = existing.length === 1 ? existing[0].name : displayName;
    let ref = refSlug(display);
    if (entities.has(ref) && entities.get(ref)?.displayName.toLowerCase() !== display.toLowerCase()) {
      let suffix = 2; while (entities.has(`${ref}_${suffix}`)) suffix += 1; ref = `${ref}_${suffix}`;
    }
    const current = entities.get(ref);
    if (current) { if (evidenceText && !current.evidence.includes(evidenceText)) current.evidence.push(evidenceText); }
    else entities.set(ref, { ref, kind: "person", displayName: display, aliases: existing.length === 1 && existing[0].nickname ? [existing[0].nickname] : [], existingCandidateIds: [], evidence: evidenceText ? [evidenceText] : [] });
    return ref;
  };

  const ambiguity = (question: string, refs: string[], evidenceText: string) => {
    const id = `ambiguity_${ambiguities.length + 1}`;
    const chosen = context.resolutions?.[id];
    if (chosen && refs.includes(chosen)) return chosen;
    ambiguities.push({ id, question, kind: "person_reference", evidenceText, options: refs.map((ref) => ({ id: ref, label: entities.get(ref)?.displayName ?? ref })) });
    return "";
  };

  const resolve = (raw: string, evidenceText: string, sentenceRefs: string[] = []) => {
    const value = tidyName(raw);
    if (isSelf(value)) return ["self"];
    if (isPluralPronoun(value)) {
      if (lastPlural.length) return [...lastPlural];
      const chosen = ambiguity(`Who does “${value}” refer to?`, sentenceRefs, evidenceText); return chosen ? [chosen] : [];
    }
    if (isSingularPronoun(value)) {
      if (sentenceRefs.length === 1) return [sentenceRefs[0]];
      if (lastSingular) return [lastSingular];
      const chosen = ambiguity(`Who does “${value}” refer to?`, sentenceRefs, evidenceText); return chosen ? [chosen] : [];
    }
    const ref = entity(value, evidenceText); return [ref];
  };

  const add = (input: ClaimInput) => {
    const claim = { ...input, id: `claim_${++claimIndex}`, certainty: input.certainty ?? "explicit", polarity: input.polarity ?? "positive", derived: input.derived ?? false } as SemanticClaim;
    const key = JSON.stringify({ type: claim.type, subjectRef: "subjectRef" in claim ? claim.subjectRef : "", objectRef: "objectRef" in claim ? claim.objectRef : "", field: "field" in claim ? claim.field : "", value: "value" in claim ? claim.value : "", labels: "labels" in claim ? claim.labels : [], groupName: "groupName" in claim ? claim.groupName : "", introducedByRef: "introducedByRef" in claim ? claim.introducedByRef : "", polarity: claim.polarity });
    if (!claims.some((item) => JSON.stringify({ type: item.type, subjectRef: "subjectRef" in item ? item.subjectRef : "", objectRef: "objectRef" in item ? item.objectRef : "", field: "field" in item ? item.field : "", value: "value" in item ? item.value : "", labels: "labels" in item ? item.labels : [], groupName: "groupName" in item ? item.groupName : "", introducedByRef: "introducedByRef" in item ? item.introducedByRef : "", polarity: item.polarity }) === key)) claims.push(claim);
  };

  const removeSupersededManager = (subjectRef: string) => {
    for (let index = claims.length - 1; index >= 0; index -= 1) if (claims[index].type === "reports_to" && claims[index].subjectRef === subjectRef && claims[index].polarity === "positive") claims.splice(index, 1);
  };

  const addRelationship = (subjectRef: string, objectRef: string, labels: string[], evidenceText: string, direction: RelationshipDirection = "undirected", polarity: SemanticPolarity = "positive", certainty: SemanticCertainty = "explicit", derived = false) => {
    if (!subjectRef || !objectRef || subjectRef === objectRef || !labels.length) return;
    add({ type: "relationship", subjectRef, objectRef, labels, direction, evidenceText, polarity, certainty, derived });
  };

  const addReporting = (employeeRef: string, managerRef: string, evidenceText: string, polarity: SemanticPolarity = "positive", correction = false) => {
    if (!employeeRef || !managerRef || employeeRef === managerRef) return;
    if (correction) removeSupersededManager(employeeRef);
    add({ type: "reports_to", subjectRef: employeeRef, objectRef: managerRef, evidenceText, polarity, certainty: "explicit", derived: false });
  };

  const addAttribute = (subjectRef: string, field: "role" | "company" | "department" | "team" | "subject" | "contextRole", value: string, evidenceText: string, polarity: SemanticPolarity = "positive") => {
    if (subjectRef && value.trim()) add({ type: "attribute", subjectRef, field, value: value.trim(), evidenceText, polarity, certainty: "explicit", derived: false });
  };

  // Register graph-backed names first so lowercase nicknames and first names remain identity-safe.
  for (const person of context.graph.people) if (!person.isSelf && new RegExp(`\\b${person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(source)) entity(person.name, source);

  // Respectively is compiled positionally rather than applying both values to both People.
  const leadRespectively = new RegExp(`(${NAME})\\s+and\\s+(${NAME})\\s+(?:lead|leads)\\s+([A-Za-z][A-Za-z ]*?)\\s+and\\s+([A-Za-z][A-Za-z ]*?)\\s+respectively`, "g");
  for (const match of source.matchAll(leadRespectively)) {
    const left = entity(match[1], match[0]); const right = entity(match[2], match[0]); const leftTeam = canonicalTitle(match[3]); const rightTeam = canonicalTitle(match[4]);
    addAttribute(left, "team", leftTeam, match[0]); addAttribute(left, "role", `${leftTeam} Lead`, match[0]); addAttribute(right, "team", rightTeam, match[0]); addAttribute(right, "role", `${rightTeam} Lead`, match[0]); lastPlural = [left, right]; lastSingular = null;
  }
  const roleRespectively = new RegExp(`(${NAME})\\s+and\\s+(${NAME})\\s+(?:are|are the|serve as)\\s+(${TITLE})\\s+and\\s+(${TITLE})\\s+respectively`, "g");
  for (const match of source.matchAll(roleRespectively)) {
    const left = entity(match[1], match[0]); const right = entity(match[2], match[0]); addAttribute(left, "role", canonicalTitle(match[3]), match[0]); addAttribute(right, "role", canonicalTitle(match[4]), match[0]); lastPlural = [left, right]; lastSingular = null;
  }

  const sentences = source.replace(/\s+[—–-]\s+(?=(?:actually|sorry|i mean|correction)\b)/gi, ". ").split(/(?<=[.!?;])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const evidence = sentence.replace(/[.!?;]+$/, "");
    const priorPlural = [...lastPlural];
    const priorSingular: string | null = lastSingular;
    const priorObject: string | null = lastObject;
    const sentenceNames: string[] = [];
    const sentenceLeadRefs: string[] = [];
    const sentenceDiscourseRefs: string[] = [];
    const initialName = sentence.match(new RegExp(`^\\s*(${NAME})`));
    const sentenceSubjectRef = initialName && !/^(?:change|update|set)\b/i.test(sentence) && !RESERVED_NAMES.has(tidyName(initialName[1]).split(/\s+/)[0]) ? entity(initialName[1], evidence) : "";

    // Introductions and "met through" provenance.
    const introduced = sentence.match(new RegExp(`(${PERSON_OR_PRONOUN})\\s+(?:introduced|connected)\\s+(${PERSON_OR_PRONOUN})\\s+(?:to|with)\\s+(${PERSON_OR_PRONOUN})`));
    if (introduced) {
      const localSubject = sentenceSubjectRef ? [sentenceSubjectRef] : sentenceNames;
      const introducer = resolve(introduced[1], evidence, localSubject)[0]; const left = resolve(introduced[2], evidence, localSubject)[0]; const right = resolve(introduced[3], evidence, localSubject)[0];
      if (introducer && left && right) { add({ type: "introduction", subjectRef: left, objectRef: right, introducedByRef: introducer, labels: [], evidenceText: evidence, certainty: "explicit", polarity: "positive", derived: false }); sentenceDiscourseRefs.push(...[introducer, left, right].filter((ref) => ref !== "self")); }
    }
    const introducedPassive = sentence.match(new RegExp(`(${PERSON_OR_PRONOUN})\\s+was introduced to\\s+(${PERSON_OR_PRONOUN})\\s+by\\s+(${PERSON_OR_PRONOUN})`));
    if (introducedPassive) {
      const left = resolve(introducedPassive[1], evidence, sentenceNames)[0]; const right = resolve(introducedPassive[2], evidence, sentenceNames)[0]; const introducer = resolve(introducedPassive[3], evidence, sentenceNames)[0];
      if (left && right && introducer) { add({ type: "introduction", subjectRef: left, objectRef: right, introducedByRef: introducer, labels: [], evidenceText: evidence, certainty: "explicit", polarity: "positive", derived: false }); sentenceDiscourseRefs.push(...[left, right, introducer].filter((ref) => ref !== "self")); }
    }
    const through = sentence.match(new RegExp(`(?:I|me|myself|${NAME})\\s+(?:know|met)\\s+(${NAME})\\s+(?:through|via)\\s+(${NAME})`));
    if (through) {
      const left = /^i|me|myself/i.test(sentence) ? "self" : resolve(sentence.match(new RegExp(`^(${NAME})`))?.[1] ?? "self", evidence, sentenceNames)[0]; const right = entity(through[1], evidence); const introducer = entity(through[2], evidence);
      add({ type: "introduction", subjectRef: left, objectRef: right, introducedByRef: introducer, labels: [], evidenceText: evidence, certainty: "explicit", polarity: "positive", derived: false });
    }

    // Current reporting; former statements are deliberately not compiled as current state.
    const compoundReporting = new RegExp(`(${NAME})\\s+and\\s+(${NAME})\\s+(?:both\\s+)?(?:report|reports|work|works)\\s+(?:directly\\s+)?(?:to|under)\\s+(${PERSON_OR_PRONOUN})`, "g");
    for (const match of sentence.matchAll(compoundReporting)) {
      const manager = resolve(match[3], evidence, priorSingular ? [priorSingular] : priorPlural)[0];
      const employees = [entity(match[1], evidence), entity(match[2], evidence)];
      for (const employee of employees) addReporting(employee, manager, evidence);
      lastPlural = employees;
    }
    const contractedPluralUnder = sentence.match(new RegExp(`(?:[Tt]hey(?:'re|’re| are)\\s+both|[Bb]oth\\s+of\\s+them)\\s+(?:work\\s+)?under\\s+(${NAME})`));
    if (contractedPluralUnder && priorPlural.length) for (const employee of priorPlural) addReporting(employee, entity(contractedPluralUnder[1], evidence), evidence);
    const ellipsisReporting = sentence.match(new RegExp(`(${NAME})\\b.*?\\band\\s+(?:now\\s+)?reports?\\s+(?:directly\\s+)?to\\s+(${PERSON_OR_PRONOUN})`));
    if (ellipsisReporting) addReporting(entity(ellipsisReporting[1], evidence), resolve(ellipsisReporting[2], evidence, priorSingular ? [priorSingular] : priorPlural)[0], evidence);
    const reportingPattern = new RegExp(`(${PERSON_OR_PRONOUN})(?:\\s+(?:now|currently))?\\s+(does not|doesn't|isn't)?\\s*(?:reports?|report)\\s+(?:directly\\s+)?(?:to|into)?\\s*(${PERSON_OR_PRONOUN})`, "g");
    for (const match of sentence.matchAll(reportingPattern)) {
      const before = sentence.slice(Math.max(0, match.index! - 18), match.index! + match[0].length).toLowerCase(); if (/used to|formerly|previously/.test(before) && !/but now|now reports/.test(before)) continue;
      const antecedents = priorPlural.length > 1 ? priorPlural : priorSingular ? [priorSingular] : sentenceNames;
      const subjects = resolve(match[1], evidence, antecedents); const managerAntecedents = isSingularPronoun(match[3]) && priorObject ? [priorObject] : antecedents; const manager = resolve(match[3], evidence, managerAntecedents)[0]; const negative = Boolean(match[2]); const correction = /actually|sorry|i mean|rather|correction/i.test(sentence);
      for (const subject of subjects) addReporting(subject, manager, evidence, negative ? "negative" : "positive", correction);
    }
    const underPattern = new RegExp(`(${PERSON_OR_PRONOUN})\\s+(does not|doesn't)?\\s*(?:works?|is)\\s+(?:directly\\s+)?under\\s+(${PERSON_OR_PRONOUN})`, "g");
    for (const match of sentence.matchAll(underPattern)) {
      const antecedents = priorPlural.length > 1 ? priorPlural : priorSingular ? [priorSingular] : sentenceNames;
      for (const subject of resolve(match[1], evidence, antecedents)) addReporting(subject, resolve(match[3], evidence, antecedents)[0], evidence, match[2] ? "negative" : "positive");
    }
    const managesPattern = new RegExp(`(${NAME})\\s+(?:manages|is manager for)\\s+(.+?)(?:[.!?;]|$)`);
    const manages = sentence.match(managesPattern);
    if (manages) {
      const manager = entity(manages[1], evidence); const names = [...manages[2].matchAll(new RegExp(NAME, "g"))].map((match) => entity(match[0], evidence)); for (const employee of names) addReporting(employee, manager, evidence);
    }
    const possessiveManager = sentence.match(new RegExp(`(${NAME})(?:'s|’s)\\s+(?:manager|boss|line manager)\\s+is\\s+(${NAME})`));
    if (possessiveManager) addReporting(entity(possessiveManager[1], evidence), entity(possessiveManager[2], evidence), evidence);
    const inverseManager = sentence.match(new RegExp(`(${NAME})\\s+is\\s+(${NAME})(?:'s|’s)\\s+(?:manager|boss|line manager)`));
    if (inverseManager) addReporting(entity(inverseManager[2], evidence), entity(inverseManager[1], evidence), evidence);
    const worksFor = sentence.match(new RegExp(`(${NAME})\\s+(?:works?|worked)\\s+for\\s+(${NAME})`));
    if (worksFor && !/now|new manager|line manager|directly/i.test(sentence)) {
      const id = `meaning_${ambiguities.length + 1}`; const choice = context.resolutions?.[id]; const subject = entity(worksFor[1], evidence); const object = entity(worksFor[2], evidence);
      if (choice === "reports_to") addReporting(subject, object, evidence);
      else if (choice === "professional") addRelationship(subject, object, ["Professional contact"], evidence);
      else if (choice !== "works_at") ambiguities.push({ id, question: `What did you mean by “${worksFor[1]} works for ${worksFor[2]}”?`, kind: "meaning", evidenceText: evidence, options: [{ id: "reports_to", label: `Reports directly to ${worksFor[2]}` }, { id: "works_at", label: `Works at ${worksFor[2]}'s company` }, { id: "professional", label: "Professional connection only" }] });
    }

    // Shared and singular human relationships use the central ontology.
    const attachToSelf = (subject: string, concepts: ReturnType<typeof relationshipConceptsIn>) => {
      const labels = concepts.map((concept) => concept.canonical);
      if (!labels.length) return;
      const primary = concepts[0];
      if (primary.canonical === "Child") addRelationship("self", subject, labels, evidence, "source-to-target");
      else if (primary.direction === "source-to-target") addRelationship(subject, "self", labels, evidence, "source-to-target");
      else addRelationship("self", subject, labels, evidence, primary.direction);
    };
    const pluralRelationship = sentence.match(new RegExp(`(${NAME})\\s+and\\s+(${NAME})\\s+(?:are|are both)\\s+my\\s+(.+?)(?:[.!?;]|$)`));
    if (pluralRelationship) {
      const refs = [entity(pluralRelationship[1], evidence), entity(pluralRelationship[2], evidence)]; const concepts = relationshipConceptsIn(pluralRelationship[3], context.category); for (const ref of refs) attachToSelf(ref, concepts); lastPlural = refs;
    }
    const tripleRelationship = sentence.match(new RegExp(`(${NAME})\\s*,\\s*(${NAME})\\s+and\\s+(${NAME})\\s+(?:are|are all)\\s+my\\s+(.+?)(?:[.!?;]|$)`));
    if (tripleRelationship) {
      const refs = [entity(tripleRelationship[1], evidence), entity(tripleRelationship[2], evidence), entity(tripleRelationship[3], evidence)]; const concepts = relationshipConceptsIn(tripleRelationship[4], context.category); for (const ref of refs) attachToSelf(ref, concepts); lastPlural = refs;
    }
    const singularRelationship = new RegExp(`(${NAME})\\s+(?:is|was)?\\s*(?:also\\s+)?my\\s+(.+?)(?=(?:[.;]|\\s+and\\s+${NAME}\\s+(?:is|was)|$))`, "g");
    for (const match of sentence.matchAll(singularRelationship)) if (!RESERVED_NAMES.has(tidyName(match[1]).split(/\\s+/)[0])) attachToSelf(entity(match[1], evidence), relationshipConceptsIn(match[2], context.category));
    const ofMineRelationship = new RegExp(`(${NAME})\\s+(?:is|was)\\s+(?:also\\s+)?(?:an?\\s+)?(.+?)\\s+of\\s+mine(?=[,.;]|\\s+and\\s+|$)`, "g");
    for (const match of sentence.matchAll(ofMineRelationship)) attachToSelf(entity(match[1], evidence), relationshipConceptsIn(match[2], context.category));
    const roleAndRelationship = new RegExp(`(${NAME})\\s+is\\s+(?:a|an|the)?\\s*(${TITLE})\\s+and\\s+my\\s+(.+?)(?:[.!?;]|$)`, "g");
    for (const match of sentence.matchAll(roleAndRelationship)) {
      const ref = entity(match[1], evidence); addAttribute(ref, "role", canonicalTitle(match[2]), evidence); attachToSelf(ref, relationshipConceptsIn(match[3], context.category));
    }
    const worksWith = sentence.match(new RegExp(`(${NAME})\\s+(?:works?|worked)\\s+(?:together\\s+)?with\\s+(${NAME})|(${NAME})\\s+and\\s+(${NAME})\\s+work\\s+together`));
    if (worksWith) addRelationship(entity(worksWith[1] ?? worksWith[3], evidence), entity(worksWith[2] ?? worksWith[4], evidence), ["Colleague"], evidence);

    // Possessive family and relationship wording preserves factual direction.
    const sameSentenceFamilyOwner = sentence.match(new RegExp(`^\\s*(${NAME})\\s+is\\s+my\\s+(?:mother|mum|mom|father|dad|parent)`));
    const familyOwnerRef = sameSentenceFamilyOwner ? entity(sameSentenceFamilyOwner[1], evidence) : priorSingular;
    const isPossessive = sentence.match(new RegExp(`(${NAME})\\s+is\\s+((?:${NAME})(?:'s|’s)|[Hh]er|[Hh]is)\\s+(mother|mum|mom|father|dad|brother|sister|sibling|son|daughter|child|uncle|aunt|auntie|cousin|mentor|friend)`));
    if (isPossessive) {
      const subject = entity(isPossessive[1], evidence); const owner = resolve(isPossessive[2], evidence, familyOwnerRef ? [familyOwnerRef] : sentenceNames)[0]; const relation = normalizeVocabulary(isPossessive[3]);
      if (/mother|mum|mom|father|dad/.test(relation)) addRelationship(subject, owner, [/mother|mum|mom/.test(relation) ? "Mother" : "Father"], evidence, "source-to-target");
      else if (/son|daughter|child/.test(relation)) addRelationship(owner, subject, ["Child"], evidence, "source-to-target");
      else addRelationship(subject, owner, [ontologyLabel(relation)], evidence, /mentor/.test(relation) ? "source-to-target" : "undirected");
    }
    const possessiveIs = sentence.match(new RegExp(`((?:${NAME})(?:'s|’s)|[Hh]er|[Hh]is)\\s+(mother|mum|mom|father|dad|brother|sister|son|daughter|child|mentor|friend|manager)\\s+is\\s+(${NAME})`));
    if (possessiveIs) {
      const owner = resolve(possessiveIs[1], evidence, familyOwnerRef ? [familyOwnerRef] : sentenceNames)[0]; const related = entity(possessiveIs[3], evidence); const relation = normalizeVocabulary(possessiveIs[2]);
      if (relation === "manager") addReporting(owner, related, evidence);
      else if (/mother|mum|mom|father|dad/.test(relation)) addRelationship(related, owner, [/mother|mum|mom/.test(relation) ? "Mother" : "Father"], evidence, "source-to-target");
      else if (/son|daughter|child/.test(relation)) addRelationship(owner, related, ["Child"], evidence, "source-to-target");
      else addRelationship(owner, related, [ontologyLabel(relation)], evidence, /mentor/.test(relation) ? "target-to-source" : "undirected");
    }
    const joinedFamily = sentence.match(new RegExp(`(${NAME})\\s+is\\s+my\\s+(mother|mum|mom|father|dad|parent)\\s+and\\s+(${NAME})\\s+is\\s+(?:her|his)\\s+(brother|sister|sibling)`));
    if (joinedFamily) {
      const parent = entity(joinedFamily[1], evidence); const relative = entity(joinedFamily[3], evidence);
      const parentLabel = /mother|mum|mom/.test(joinedFamily[2]) ? "Mother" : /father|dad/.test(joinedFamily[2]) ? "Father" : "Parent";
      addRelationship(parent, "self", [parentLabel], evidence, "source-to-target");
      addRelationship(parent, relative, [ontologyLabel(joinedFamily[4])], evidence);
    }

    // Roles, companies and teams are attributes, not human relationships.
    const isChangeCommand = /^(?:change|update|set)\b/i.test(sentence);
    const titlePattern = new RegExp(`(${NAME})\\s+(?:is\\s+|is\\s+(?:a|an|the)\\s+|as\\s+)?(${TITLE})(?:\\s+(?:at|of)\\s+(${NAME}))?`, "g");
    if (!isChangeCommand) for (const match of sentence.matchAll(titlePattern)) {
      const subject = entity(match[1], evidence); const role = canonicalTitle(match[2]); addAttribute(subject, "role", role, evidence);
      if (/Lead$/i.test(role)) { sentenceLeadRefs.push(subject); addAttribute(subject, "team", role.replace(/\s+Lead$/i, ""), evidence); }
      if (match[3]) addAttribute(subject, "company", tidyName(match[3]), evidence);
    }
    const worksAt = new RegExp(`(${NAME})\\s+(?:works?|joined|is)\\s+at\\s+(${NAME})(?!\\s+(?:manages|reports))`, "g");
    for (const match of sentence.matchAll(worksAt)) if (!context.graph.people.some((person) => [person.name, person.nickname].some((value) => value && value.toLowerCase() === match[2].toLowerCase())) || /works? at|joined|is at/i.test(match[0])) addAttribute(entity(match[1], evidence), "company", tidyName(match[2]), evidence);
    const worksAtWith = sentence.match(new RegExp(`(${NAME})\\s+works?\\s+at\\s+(${NAME})\\s+with\\s+(${NAME})`));
    if (worksAtWith) { const left = entity(worksAtWith[1], evidence); const right = entity(worksAtWith[3], evidence); const company = tidyName(worksAtWith[2]); addAttribute(left, "company", company, evidence); addAttribute(right, "company", company, evidence); addRelationship(left, right, ["Colleague"], evidence); }
    const leads = sentence.match(new RegExp(`(${NAME})\\s+(?:leads|runs)\\s+(?:the\\s+)?([A-Za-z][A-Za-z-]*(?:\\s+team)?)`));
    if (leads && !/company/i.test(leads[2])) { const subject = entity(leads[1], evidence); const team = canonicalTitle(leads[2].replace(/\s+team$/i, "")); addAttribute(subject, "team", team, evidence); addAttribute(subject, "role", `${team} Lead`, evidence); sentenceLeadRefs.push(subject); }
    const teamMembership = new RegExp(`(${NAME})\\s+(?:works?|is|are)\\s+(?:on|in|part of)\\s+(?:the\\s+)?([A-Za-z][A-Za-z -]*?)(?:\\s+team)?(?=[,.;]|$)`, "g");
    for (const match of sentence.matchAll(teamMembership)) { const ref = entity(match[1], evidence); const team = canonicalTitle(match[2]); add({ type: "group_membership", subjectRef: ref, groupName: team, groupKind: "team", evidenceText: evidence, certainty: "explicit", polarity: "positive", derived: false }); }
    const twoInGroup = sentence.match(new RegExp(`(${NAME})\\s+and\\s+(${NAME})\\s+(?:are|work)\\s+in\\s+(?:the\\s+)?([A-Za-z][A-Za-z -]*?)(?:\\s+team)?[.!?;]?$`));
    if (twoInGroup) for (const ref of [entity(twoInGroup[1], evidence), entity(twoInGroup[2], evidence)]) add({ type: "group_membership", subjectRef: ref, groupName: canonicalTitle(twoInGroup[3]), groupKind: "team", evidenceText: evidence, certainty: "explicit", polarity: "positive", derived: false });
    const movedTeam = sentence.match(new RegExp(`(${NAME})\\s+(?:used to be|was)\\s+(?:on|in)\\s+(${NAME})(?:'s|’s)\\s+team.*?(?:moved|switched|transferred)\\s+(?:to|onto)\\s+(${NAME})(?:'s|’s)\\s+team`));
    if (movedTeam) {
      const member = entity(movedTeam[1], evidence); const leader = entity(movedTeam[3], evidence);
      const teamClaim = [...claims].reverse().find((claim) => claim.type === "attribute" && claim.subjectRef === leader && claim.field === "team" && claim.polarity === "positive");
      if (teamClaim?.type === "attribute") add({ type: "group_membership", subjectRef: member, groupName: teamClaim.value, groupKind: "team", evidenceText: evidence, certainty: "explicit", polarity: "positive", derived: false });
      else warnings.push(`“${movedTeam[3]}'s team” is not named in the stored context, so Circa did not guess a team.`);
    }
    const movedPronounContext = sentence.match(new RegExp(`(${NAME})\\s+(?:used to|formerly|previously)\\b.*?\\b(?:she|he|they)(?:'s|’s|\\s+has|\\s+is)?\\s+(?:moved|switched|transferred)(?:\\s+over)?\\s+(?:to|onto)\\s+(${NAME})(?:'s|’s)\\s+team`));
    const movedFromContext = movedPronounContext ?? sentence.match(new RegExp(`(${NAME})\\b.*?(?:moved|switched|transferred)(?:\\s+over)?\\s+(?:to|onto)\\s+(${NAME})(?:'s|’s)\\s+team`));
    if (movedFromContext && !movedTeam) {
      const member = entity(movedFromContext[1], evidence); const leader = entity(movedFromContext[2], evidence);
      const teamClaim = [...claims].reverse().find((claim) => claim.type === "attribute" && claim.subjectRef === leader && claim.field === "team" && claim.polarity === "positive");
      if (teamClaim?.type === "attribute") add({ type: "group_membership", subjectRef: member, groupName: teamClaim.value, groupKind: "team", evidenceText: evidence, certainty: "explicit", polarity: "positive", derived: false });
      else warnings.push(`“${movedFromContext[2]}'s team” is not named in the stored context, so Circa did not guess a team.`);
    }

    // School language keeps subject context and relationship separate.
    const teaches = sentence.match(new RegExp(`(${NAME})\\s+(?:teaches|tutors|instructs)\\s+(${PERSON_OR_PRONOUN})\\s+(.+?)[.!?;]?$`));
    if (teaches) { const teacher = entity(teaches[1], evidence); const student = resolve(teaches[2], evidence, sentenceNames)[0]; const subject = canonicalTitle(teaches[3]); addRelationship(teacher, student, ["Teacher"], evidence, "source-to-target"); addAttribute(teacher, "contextRole", "Teacher", evidence); addAttribute(teacher, "subject", subject, evidence); }
    const inClass = sentence.match(new RegExp(`(${NAME})(?:\\s+and\\s+(${NAME}))?\\s+(?:are|is)\\s+in\\s+my\\s+(.+?)\\s+class`));
    if (inClass) { const refs = [inClass[1], inClass[2]].filter(Boolean).map((name) => entity(name!, evidence)); const subject = canonicalTitle(inClass[3]); for (const ref of refs) { addRelationship("self", ref, ["Classmate"], evidence); addAttribute(ref, "subject", subject, evidence); } lastPlural = refs; }

    // Missing-punctuation title/relationship fragments (lexical scan, not example-specific names).
    const fragment = new RegExp(`(${NAME})\\s+(${TITLE})(?=\\s+my\\s+|\\s+${NAME}|$)`, "g");
    for (const match of sentence.matchAll(fragment)) { const ref = entity(match[1], evidence); addAttribute(ref, "role", canonicalTitle(match[2]), evidence); const tail = sentence.slice(match.index! + match[0].length, Math.min(sentence.length, match.index! + match[0].length + 28)); const labels = relationshipConceptsIn(tail, context.category).map((concept) => concept.canonical); if (/\bmy\b/i.test(tail)) addRelationship("self", ref, labels, evidence); }
    const roleChange = sentence.match(/(?:change|update|set)\s+([A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*)*?)['’]s\s+(?:role|job title|title)\s+(?:to|as)\s+(.+?)[.!?;]?$/i);
    if (roleChange) addAttribute(entity(roleChange[1], evidence), "role", canonicalTitle(roleChange[2]), evidence);

    // "everyone ... except" expands only against known graph membership and always remains reviewable.
    const everyone = sentence.match(/everyone\s+in\s+(.+?)\s+reports\s+to\s+([A-Z][A-Za-z'’-]*)(?:\s+except\s+([A-Z][A-Za-z'’-]*))?/i);
    if (everyone) {
      const group = normalizeVocabulary(everyone[1]); const manager = entity(everyone[2], evidence); const except = everyone[3]?.toLowerCase(); const members = context.graph.people.filter((person) => [person.team, person.department, person.subject].some((value) => normalizeVocabulary(value) === group) && person.name.toLowerCase() !== except);
      if (!members.length) warnings.push(`No known members matched “${everyone[1]}” in “${evidence}”.`); else for (const member of members) addReporting(entity(member.name, evidence), manager, evidence);
    }

    const coMentionPair = sentence.match(new RegExp(`^\\s*(${NAME})\\s+and\\s+(${NAME})\\s+(?:met|know|called|contacted|spoke to)\\s+(${NAME})`));
    const coMention = sentence.match(new RegExp(`^\\s*(${NAME})\\s+(?:met|knows?|called|contacted|spoke to)\\s+(${NAME})`));
    if (coMentionPair) { lastPlural = [entity(coMentionPair[1], evidence), entity(coMentionPair[2], evidence)]; lastObject = entity(coMentionPair[3], evidence); lastSingular = null; }
    else if (coMention) { const refs = [entity(coMention[1], evidence), entity(coMention[2], evidence)]; lastPlural = refs; lastObject = refs[1]; lastSingular = null; }
    const leadingPair = sentence.match(new RegExp(`^\\s*(${NAME})\\s+and\\s+(${NAME})`));
    const leadingName = sentence.match(new RegExp(`^\\s*(${NAME})`));
    const pronounIntroduces = sentence.match(new RegExp(`^\\s*(?:[Hh]er|[Hh]is|[Ss]he|[Hh]e)\\b.*?\\bis\\s+(${NAME})`));
    if (sentenceDiscourseRefs.length >= 2) { lastPlural = [...new Set(sentenceDiscourseRefs)]; lastSingular = null; }
    else if (sentenceLeadRefs.length >= 2) { lastPlural = [...new Set(sentenceLeadRefs)].slice(-2); lastSingular = null; }
    else if (coMentionPair || coMention) { /* co-mentions deliberately remain plural until clarified */ }
    else if (leadingPair) { lastPlural = [entity(leadingPair[1], evidence), entity(leadingPair[2], evidence)]; lastSingular = null; }
    else if (pronounIntroduces) lastSingular = entity(pronounIntroduces[1], evidence);
    else if (leadingName && !isChangeCommand && !RESERVED_NAMES.has(tidyName(leadingName[1]).split(/\s+/)[0])) lastSingular = entity(leadingName[1], evidence);
    else if (priorSingular && isSingularPronoun(sentence.split(/\s+/)[0] ?? "")) lastSingular = priorSingular;
  }

  // Token-level recovery for dictation-style input with little punctuation or casing.
  // This composes ontology concepts, discourse, attributes and reporting frames; it does
  // not rewrite names or special-case any test Person.
  const loose = normalizeVocabulary(source);
  const looseTokens = loose.match(/[a-z0-9][a-z0-9'’-]*/g) ?? [];
  if (looseTokens.length >= 2 && !/[A-Z]/.test(source)) {
    const pronouns = new Set(["he", "him", "his", "she", "her", "they", "them"]);
    const stop = new Set(["is", "are", "was", "were", "a", "an", "the", "my", "also", "and", "both", "of", "to", "in", "on", "for", "at"]);
    const displayLoose = (token: string) => token.slice(0, 1).toUpperCase() + token.slice(1);
    let activeRef = "";
    for (let index = 0; index < looseTokens.length; index += 1) {
      const concept = relationshipConceptsIn(looseTokens[index], context.category)[0];
      if (!concept) continue;
      let ownerIndex = index - 1;
      while (ownerIndex >= 0 && stop.has(looseTokens[ownerIndex])) ownerIndex -= 1;
      const rawOwner = looseTokens[ownerIndex];
      if (!rawOwner) continue;
      const owner = pronouns.has(rawOwner) ? activeRef || lastSingular || "" : entity(displayLoose(rawOwner), source);
      if (owner) { activeRef = owner; addRelationship("self", owner, [concept.canonical], source, concept.direction); }
    }
    if (!activeRef) {
      const first = looseTokens.find((token) => !stop.has(token) && !pronouns.has(token));
      if (first) activeRef = entity(displayLoose(first), source);
    }
    const underIndex = looseTokens.findIndex((token) => token === "under");
    const reportIndex = looseTokens.findIndex((token) => /^reports?$/.test(token));
    const managerIndex = underIndex >= 0 ? underIndex + 1 : reportIndex >= 0 && looseTokens[reportIndex + 1] === "to" ? reportIndex + 2 : -1;
    if (activeRef && managerIndex > 0 && looseTokens[managerIndex]) addReporting(activeRef, entity(displayLoose(looseTokens[managerIndex]), source), source);
    const workIndex = looseTokens.findIndex((token) => /^works?$/.test(token));
    if (activeRef && workIndex >= 0) {
      let valueIndex = workIndex + 1; while (valueIndex < looseTokens.length && stop.has(looseTokens[valueIndex])) valueIndex += 1;
      if (valueIndex < looseTokens.length && valueIndex !== managerIndex && looseTokens[valueIndex] !== "under") addAttribute(activeRef, "team", canonicalTitle(looseTokens[valueIndex]), source);
    }
  }

  // Cross-sentence plural references not caught by the clause parser.
  const bothReports = source.match(new RegExp(`(?:[Tt]hey\\s+both|[Bb]oth\\s+of\\s+them|[Tt]he\\s+two\\s+of\\s+them)\\s+(?:report|reports)\\s+(?:to\\s+)?([A-Za-z][A-Za-z'’-]*)`));
  if (bothReports && lastPlural.length) { const manager = entity(bothReports[1], bothReports[0]); for (const employee of lastPlural.slice(-2)) addReporting(employee, manager, bothReports[0]); }

  // Temporal manager changes prefer the explicit current statement.
  const temporal = source.match(new RegExp(`(${NAME})\\s+(?:used to|formerly|previously)\\s+(?:report to|work under)\\s+(${NAME}).*?(?:but\\s+)?(?:now|currently|moved to)\\s+(?:reports? to|works? under|works? for)?\\s*(${NAME})`));
  if (temporal) { const employee = entity(temporal[1], temporal[0]); removeSupersededManager(employee); addReporting(employee, entity(temporal[3], temporal[0]), temporal[0]); }

  // A correction may omit the repeated verb: "reports to James - actually Maya".
  const shortCorrection = source.match(new RegExp(`(${NAME})\\s+reports?\\s+to\\s+(${NAME}).*?(?:actually|sorry|i mean|rather)\\s+(?:no[, ]*)?(?:he|she|they)?\\s*(?:reports?\\s+to\\s+)?(${NAME})`));
  if (shortCorrection) { const employee = entity(shortCorrection[1], shortCorrection[0]); removeSupersededManager(employee); addReporting(employee, entity(shortCorrection[3], shortCorrection[0]), shortCorrection[0]); }

  // Small, reviewable family inference only.
  const parentClaim = claims.find((claim) => claim.type === "relationship" && claim.subjectRef !== "self" && claim.objectRef === "self" && ["Mother", "Father", "Parent"].some((label) => claim.labels.includes(label)));
  if (parentClaim && parentClaim.type === "relationship") {
    const sibling = claims.find((claim) => claim.type === "relationship" && [claim.subjectRef, claim.objectRef].includes(parentClaim.subjectRef) && claim.labels.some((label) => ["Sibling", "Brother", "Sister"].includes(label)));
    if (sibling && sibling.type === "relationship") {
      const relative = sibling.subjectRef === parentClaim.subjectRef ? sibling.objectRef : sibling.subjectRef;
      addRelationship(relative, "self", [sibling.labels.includes("Sister") ? "Aunt" : "Uncle"], `${parentClaim.evidenceText} ${sibling.evidenceText}`.trim(), "source-to-target", "positive", "safe-inference", true);
      const child = claims.find((claim) => claim.type === "relationship" && claim.subjectRef === relative && claim.labels.includes("Child"));
      if (child?.type === "relationship") addRelationship(child.objectRef, "self", ["Cousin"], `${sibling.evidenceText} ${child.evidenceText}`.trim(), "undirected", "positive", "safe-inference", true);
    }
  }

  if (!entities.size && !claims.length) warnings.push("Circa could not find a safely grounded Person or relationship in that description.");
  return { version: "circa-semantic-v1", entities: [...entities.values()], claims, ambiguities, warnings };
}

function ontologyLabel(value: string) {
  if (/^mum|mom|mother$/.test(value)) return "Mother";
  if (/^dad|father$/.test(value)) return "Father";
  if (/^brother$/.test(value)) return "Brother";
  if (/^sister$/.test(value)) return "Sister";
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
