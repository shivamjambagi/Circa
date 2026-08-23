export type ContactSearchState = {
  query: string;
  suggestionsOpen: boolean;
};

export type ContactSearchAction =
  | { type: "change"; query: string }
  | { type: "focus" }
  | { type: "choose"; query: string }
  | { type: "close" };

export const initialContactSearchState: ContactSearchState = { query: "", suggestionsOpen: false };

export function contactSearchReducer(state: ContactSearchState, action: ContactSearchAction): ContactSearchState {
  if (action.type === "change") return { query: action.query, suggestionsOpen: Boolean(action.query.trim()) };
  if (action.type === "focus") return { ...state, suggestionsOpen: Boolean(state.query.trim()) };
  if (action.type === "choose") return { query: action.query, suggestionsOpen: false };
  return { ...state, suggestionsOpen: false };
}
