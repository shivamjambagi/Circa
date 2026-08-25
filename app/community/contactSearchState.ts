export type ContactSearchState = {
  query: string;
  selectedCategory: string | null;
  suggestionsOpen: boolean;
};

export type ContactSearchAction =
  | { type: "change"; query: string }
  | { type: "focus" }
  | { type: "choose-category"; label: string }
  | { type: "close" };

export type ContactSuggestionSource = {
  category?: string;
};

export type ContactSearchSuggestion = {
  kind: "category";
  label: string;
};

export const initialContactSearchState: ContactSearchState = { query: "", selectedCategory: null, suggestionsOpen: false };

export function contactSearchReducer(state: ContactSearchState, action: ContactSearchAction): ContactSearchState {
  if (action.type === "change") return { query: action.query, selectedCategory: null, suggestionsOpen: Boolean(action.query.trim()) };
  if (action.type === "focus") return { ...state, suggestionsOpen: Boolean(state.query.trim()) };
  if (action.type === "choose-category") return { query: action.label, selectedCategory: action.label, suggestionsOpen: false };
  return { ...state, suggestionsOpen: false };
}

export function buildContactSearchSuggestions(sources: ContactSuggestionSource[], query: string, normalize: (value: string) => string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const seenLabels = new Set<string>();
  const suggestions: ContactSearchSuggestion[] = [];
  for (const source of sources) {
    const label = source.category?.trim();
    if (!label) continue;
    const uniqueLabel = exactCategoryLabel(label);
    if (seenLabels.has(uniqueLabel)) continue;
    seenLabels.add(uniqueLabel);
    const normalizedLabel = normalize(label);
    if (normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedLabel)) suggestions.push({ kind: "category", label });
    if (suggestions.length === 6) return suggestions;
  }
  return suggestions;
}

function exactCategoryLabel(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function contactMatchesCategoryFilter(category: string | undefined, query: string, selectedCategory: string | null, normalize: (value: string) => string) {
  if (selectedCategory) return exactCategoryLabel(category || "") === exactCategoryLabel(selectedCategory);
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  const normalizedCategory = normalize(category || "");
  if (!normalizedCategory) return false;
  return normalizedCategory.includes(normalizedQuery) || normalizedQuery.includes(normalizedCategory);
}
