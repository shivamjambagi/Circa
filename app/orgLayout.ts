import type { Person } from "./graphStore.ts";

export type OrgLayout = {
  positions: Map<string, { x: number; y: number }>;
  bounds: { width: number; height: number };
  roots: string[];
};

export function calculateFitViewport(rects: Array<{ x: number; y: number; width: number; height: number }>, viewportWidth: number, viewportHeight: number, minZoom = .25, maxZoom = 1.15) {
  if (!rects.length) return null;
  const minX = Math.min(...rects.map((rect) => rect.x)) - 100;
  const minY = Math.min(...rects.map((rect) => rect.y)) - 100;
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width)) + 100;
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height)) + 100;
  const contentWidth = Math.max(1, maxX - minX); const contentHeight = Math.max(1, maxY - minY);
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min((viewportWidth - 100) / contentWidth, (viewportHeight - 100) / contentHeight)));
  return { zoom, x: (viewportWidth - contentWidth * zoom) / 2 - minX * zoom, y: (viewportHeight - contentHeight * zoom) / 2 - minY * zoom };
}

const CARD_WIDTH = 164;
const H_GAP = 56;
const V_GAP = 205;
const PADDING = 120;

/** Deterministic tidy-forest layout. Parents are centered over their complete visible subtree. */
export function layoutOrganisation(people: Person[], collapsed: Set<string>, company = ""): OrgLayout {
  const companyKey = company.trim().toLowerCase();
  const included = people
    .filter((person) => person.includeInOrgChart !== false)
    .filter((person) => !companyKey || person.company.trim().toLowerCase() === companyKey)
    .sort((a, b) => `${a.name}\u0000${a.id}`.localeCompare(`${b.name}\u0000${b.id}`));
  const byId = new Map(included.map((person) => [person.id, person]));
  const children = new Map<string, Person[]>();
  for (const person of included) {
    if (!person.reportsToPersonId || !byId.has(person.reportsToPersonId) || person.reportsToPersonId === person.id) continue;
    children.set(person.reportsToPersonId, [...(children.get(person.reportsToPersonId) ?? []), person]);
  }
  for (const row of children.values()) row.sort((a, b) => `${a.team}\u0000${a.name}\u0000${a.id}`.localeCompare(`${b.team}\u0000${b.name}\u0000${b.id}`));
  const roots = included.filter((person) => !person.reportsToPersonId || !byId.has(person.reportsToPersonId) || person.reportsToPersonId === person.id);
  const positions = new Map<string, { x: number; y: number }>();
  const seen = new Set<string>();
  let cursor = PADDING;
  let maxDepth = 0;

  function measure(person: Person, visiting = new Set<string>()): number {
    if (visiting.has(person.id) || collapsed.has(person.id)) return CARD_WIDTH;
    const next = new Set(visiting); next.add(person.id);
    const rows = (children.get(person.id) ?? []).filter((child) => !visiting.has(child.id));
    if (!rows.length) return CARD_WIDTH;
    return Math.max(CARD_WIDTH, rows.reduce((sum, child) => sum + measure(child, next), 0) + H_GAP * (rows.length - 1));
  }

  function place(person: Person, left: number, depth: number, visiting = new Set<string>()) {
    if (visiting.has(person.id) || seen.has(person.id)) return;
    const next = new Set(visiting); next.add(person.id); seen.add(person.id); maxDepth = Math.max(maxDepth, depth);
    const width = measure(person, visiting);
    positions.set(person.id, { x: left + width / 2 - CARD_WIDTH / 2, y: PADDING + depth * V_GAP });
    if (collapsed.has(person.id)) return;
    let childLeft = left;
    for (const child of children.get(person.id) ?? []) {
      const childWidth = measure(child, next);
      place(child, childLeft, depth + 1, next);
      childLeft += childWidth + H_GAP;
    }
  }

  for (const root of roots) { const width = measure(root); place(root, cursor, 0); cursor += width + H_GAP * 2; }
  // Corrupt/cyclic imported nodes are still displayed as independent roots.
  for (const person of included) if (!seen.has(person.id)) { place(person, cursor, 0); roots.push(person); cursor += CARD_WIDTH + H_GAP * 2; }
  return { positions, roots: roots.map((person) => person.id), bounds: { width: Math.max(900, cursor + PADDING), height: Math.max(700, PADDING * 2 + maxDepth * V_GAP + 170) } };
}
