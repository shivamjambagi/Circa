export type ContactSearchState = {
  query: string;
  selectedCategory: string | null;
  suggestionsOpen: boolean;
};

export type ContactSearchAction =
  | { type: "change"; query: string }
  | { type: "focus" }
  | { type: "choose-category"; label: string }
  | { type: "choose-contact"; label: string }
  | { type: "close" };

export type ContactSuggestionSource = {
  category?: string;
  contactKey: string;
  listTitle: string;
  title: string;
};

export type ContactSearchSuggestion = {
  contactKey?: string;
  kind: "category" | "contact";
  label: string;
};

export const initialContactSearchState: ContactSearchState = { query: "", selectedCategory: null, suggestionsOpen: false };

export function contactSearchReducer(state: ContactSearchState, action: ContactSearchAction): ContactSearchState {
  if (action.type === "change") return { query: action.query, selectedCategory: null, suggestionsOpen: Boolean(action.query.trim()) };
  if (action.type === "focus") return { ...state, suggestionsOpen: Boolean(state.query.trim()) };
  if (action.type === "choose-category") return { query: action.label, selectedCategory: action.label, suggestionsOpen: false };
  if (action.type === "choose-contact") return { query: action.label, selectedCategory: null, suggestionsOpen: false };
  return { ...state, suggestionsOpen: false };
}

export function buildContactSearchSuggestions(sources: ContactSuggestionSource[], query: string, normalize: (value: string) => string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const seenLabels = new Set<string>();
  const suggestions: ContactSearchSuggestion[] = [];
  for (const source of sources) {
    const candidates: ContactSearchSuggestion[] = [
      ...(source.category ? [{ kind: "category" as const, label: source.category }] : []),
      { kind: "category", label: source.listTitle },
      { kind: "contact", label: source.title, contactKey: source.contactKey },
    ];
    for (const candidate of candidates) {
      if (!candidate.label || seenLabels.has(candidate.label)) continue;
      seenLabels.add(candidate.label);
      const normalizedLabel = normalize(candidate.label);
      if (normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedLabel)) suggestions.push(candidate);
      if (suggestions.length === 6) return suggestions;
    }
  }
  return suggestions;
}

function exactCategoryLabel(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function contactMatchesSelectedCategory(category: string | undefined, listTitle: string, selectedCategory: string | null) {
  if (!selectedCategory) return true;
  const selected = exactCategoryLabel(selectedCategory);
  return exactCategoryLabel(category || listTitle) === selected;
}
