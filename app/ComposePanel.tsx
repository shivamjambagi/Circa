"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { countComposeOperations, createImportDraft } from "./composeEngine";
import type { ComposeAmbiguity, ComposeDraft, ComposeDraftPerson, ComposeMode, ComposePersonField, ComposeSource } from "./composeEngine";
import type { AskResponse } from "./askEngine";
import type { CircaProject, GlobalPerson, Graph, Person } from "./graphStore";
import { displayCategory } from "./projectTemplates";
import { compileSemanticInterpretation } from "./composeSemantics";
import { interpretNaturalLanguage } from "./localSemanticInterpreter";

type ComposePanelProps = {
  project: CircaProject;
  graph: Graph;
  globalPeople: GlobalPerson[];
  selectedPerson?: Person;
  onClose: () => void;
  onPreview: (draft: ComposeDraft | null) => void;
  onApply: (draft: ComposeDraft) => void;
  onAsk: (question: string, resolutions?: Record<string, string>) => AskResponse;
};

const ASK_SUGGESTIONS = [
  "How is Sai connected to Shivam?",
  "Who is Sai connected to?",
  "Who introduced Shivam to Rithvik?",
] as const;

function modeCopy(mode: ComposeMode) {
  if (mode === "change") return { title: "Describe what should change.", action: "Review changes" };
  if (mode === "ask") return { title: "Ask about this map.", action: "Show answer" };
  return { title: "Describe the people and connections.", action: "Create draft" };
}

function exampleFor(project: CircaProject) {
  if (project.category === "business") return "Sarah is CEO. James is CTO and reports to Sarah.";
  if (project.category === "school") return "Maya is my classmate and Mr Ahmed teaches Computer Science.";
  if (project.category === "family") return "Sarah is my mum. Maya is my sister.";
  return "Adam is my close friend. He introduced me to Maya.";
}

function DraftRow({ person, graph, globalPeople, managerOptions, onChange }: { person: ComposeDraftPerson; graph: Graph; globalPeople: GlobalPerson[]; managerOptions: Array<{ ref: string; label: string }>; onChange: (next: ComposeDraftPerson) => void }) {
  const match = graph.people.find((item) => item.id === person.matchId);
  const possibleMatches = graph.people.filter((item) => person.suggestedMatchIds.includes(item.id));
  const possibleGlobals = globalPeople.filter((item) => person.suggestedGlobalMatchIds?.includes(item.id));
  const setField = (field: ComposePersonField, value: string) => onChange({ ...person, [field === "manager" ? "managerName" : field]: value, fieldPatches: { ...person.fieldPatches, [field]: value ? { action: "set", value } : { action: "clear" } } });
  const changedFields = (["name", "role", "company", "department", "team", "subject", "contextRole", "phone", "email", "linkedinUrl", "githubUrl", "howWeMet"] as ComposePersonField[]).flatMap((field) => {
    const patch = person.fieldPatches?.[field];
    if (!match || !patch || patch.action === "unchanged") return [];
    const stored = String(match[field as keyof Person] ?? "") || "Not set";
    const proposed = patch.action === "clear" ? "Not set" : String(patch.value ?? "") || "Not set";
    return stored === proposed ? [] : [{ field, stored, proposed }];
  });
  const managerPatch = person.fieldPatches?.manager;
  if (match && managerPatch && managerPatch.action !== "unchanged") {
    changedFields.push({ field: "manager", stored: graph.people.find((item) => item.id === match.reportsToPersonId)?.name ?? "No manager", proposed: managerPatch.action === "clear" ? "No manager" : managerOptions.find((option) => option.ref === managerPatch.value)?.label ?? String(managerPatch.value ?? "No manager") });
  }
  return <article className={`compose-review-row${person.needsReview ? " needs-review" : ""}${!person.selected ? " unchecked" : ""}`}>
    <label className="compose-check"><input type="checkbox" checked={person.selected} disabled={!person.name} onChange={(event) => onChange({ ...person, selected: event.target.checked })} /><span /></label>
    <div className="compose-row-main">
      <div className="compose-row-heading"><input aria-label="Person name" maxLength={120} value={person.name} onChange={(event) => { const name = event.target.value; onChange({ ...person, name, needsReview: !name.trim(), fieldPatches: { ...person.fieldPatches, name: name.trim() ? { action: "set", value: name } : { action: "clear" } } }); }} /><small>{match ? `Use existing ${match.name}` : person.identityResolution === "use-global" ? "Use existing Circa Person" : person.needsReview ? "Needs review" : "New person"}</small></div>
      {(possibleMatches.length > 0 || possibleGlobals.length > 0) && <label className="compose-identity">Possible existing Person<select value={person.identityResolution === "create" ? "create" : person.matchId ? `existing:${person.matchId}` : person.globalMatchId ? `global:${person.globalMatchId}` : ""} onChange={(event) => { const value = event.target.value; const existingId = value.startsWith("existing:") ? value.slice(9) : ""; const globalId = value.startsWith("global:") ? value.slice(7) : ""; const global = globalPeople.find((item) => item.id === globalId); onChange({ ...person, matchId: existingId, globalMatchId: globalId, globalContact: global ? { nickname: global.nickname, phone: global.phone, email: global.email, linkedinUrl: global.linkedinUrl, githubUrl: global.githubUrl } : undefined, identityResolution: value === "create" ? "create" : existingId ? "use-existing" : globalId ? "use-global" : "unresolved", needsReview: !value }); }}><option value="">Choose safely</option>{possibleMatches.map((candidate) => <option key={candidate.id} value={`existing:${candidate.id}`}>Use {candidate.name}{candidate.role ? ` - ${candidate.role}` : candidate.team ? ` - ${candidate.team}` : ""}</option>)}{possibleGlobals.map((candidate) => <option key={candidate.id} value={`global:${candidate.id}`}>Use {candidate.name} from Circa</option>)}<option value="create">Create new Person</option></select></label>}
      <div className="compose-row-fields">
        <label>Role<input value={person.role} onChange={(event) => setField("role", event.target.value)} placeholder="Optional" /></label>
        <label>Reports to<select value={managerPatch?.action === "unchanged" ? "__unchanged" : managerPatch?.action === "clear" ? "__clear" : String(managerPatch?.value ?? "__unchanged")} onChange={(event) => { const value = event.target.value; if (value === "__unchanged") onChange({ ...person, managerName: "", fieldPatches: { ...person.fieldPatches, manager: { action: "unchanged" } } }); else if (value === "__clear") onChange({ ...person, managerName: "", fieldPatches: { ...person.fieldPatches, manager: { action: "clear" } } }); else setField("manager", value); }}><option value="__unchanged">Leave unchanged</option><option value="__clear">No manager</option>{managerOptions.filter((option) => option.ref !== person.ref).map((option) => <option value={option.ref} key={option.ref}>{option.label}</option>)}</select></label>
      </div>
      <details className="compose-more"><summary>More details</summary><div className="compose-more-grid">{(["company", "department", "team", "subject", "contextRole", "phone", "email", "linkedinUrl", "githubUrl", "howWeMet"] as ComposePersonField[]).map((field) => <label key={field}>{field === "linkedinUrl" ? "LinkedIn" : field === "githubUrl" ? "GitHub" : field === "howWeMet" ? "How we met" : field === "contextRole" ? "Context role" : field.charAt(0).toUpperCase() + field.slice(1)}<input value={String(person[field as keyof ComposeDraftPerson] ?? "")} onChange={(event) => setField(field, event.target.value)} /></label>)}</div></details>
      {person.evidenceText?.length ? <details className="compose-evidence"><summary>What Circa understood</summary>{person.evidenceText.map((evidence) => <p key={evidence}>{evidence}</p>)}</details> : null}
      {changedFields.length > 0 && <div className="compose-diffs">{changedFields.map((diff) => <p className="compose-diff" key={diff.field}><span>{diff.field}</span><b>{diff.stored}</b><i>→</i><strong>{diff.proposed}</strong></p>)}</div>}
    </div>
  </article>;
}

export default function ComposePanel({ project, graph, globalPeople, selectedPerson, onClose, onPreview, onApply, onAsk }: ComposePanelProps) {
  const [mode, setMode] = useState<ComposeMode>("create");
  const [source, setSource] = useState<ComposeSource>("describe");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [externalProviderAvailable, setExternalProviderAvailable] = useState(false);
  const [useExternalProvider, setUseExternalProvider] = useState(false);
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null);
  const [askResolutions, setAskResolutions] = useState<Record<string, string>>({});
  const [semanticResolutions, setSemanticResolutions] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLElement>(null);
  const copy = modeCopy(mode);
  const managerOptions = useMemo(() => {
    const representedIds = new Set(draft?.people.map((person) => person.matchId).filter(Boolean) ?? []);
    return [
      ...graph.people.filter((person) => !representedIds.has(person.id)).map((person) => ({ ref: `existing:${person.id}`, label: `${person.name}${person.role ? ` - ${person.role}` : person.team ? ` - ${person.team}` : person.isSelf ? " - you" : ""}` })),
      ...(draft?.people.map((person) => ({ ref: person.ref, label: `${person.name}${person.role ? ` - ${person.role}` : person.team ? ` - ${person.team}` : " - draft"}` })) ?? []),
    ];
  }, [graph.people, draft]);

  useEffect(() => {
    onPreview(draft);
    return () => onPreview(null);
  }, [draft, onPreview]);

  useEffect(() => {
    let active = true;
    fetch("/api/compose", { headers: { accept: "application/json" }, cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { externalProviderAvailable?: boolean }) => { if (active) setExternalProviderAvailable(Boolean(payload.externalProviderAvailable)); })
      .catch(() => { if (active) setExternalProviderAvailable(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (draft) { setDraft(null); setStatus(""); }
        else onClose();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [draft, onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    const focusable = () => [...(node?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') ?? [])];
    window.setTimeout(() => (focusable()[0] ?? node)?.focus(), 0);
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) { event.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); window.setTimeout(() => previous?.focus(), 0); };
  }, []);

  function reset(nextMode: ComposeMode, nextSource = source) {
    setMode(nextMode);
    setSource(nextMode === "ask" ? "describe" : nextSource);
    if (nextMode === "ask") setText("");
    setDraft(null);
    setAskResponse(null);
    setAskResolutions({});
    setSemanticResolutions({});
    setStatus("");
  }

  async function createDraft(resolutions = semanticResolutions) {
    if (!text.trim()) return;
    if (mode === "ask") {
      const result = onAsk(text.trim(), askResolutions); setAskResponse(result);
      if (result.status === "result") { onPreview(null); onClose(); }
      else setStatus(result.status === "error" ? result.message : result.clarification.question);
      return;
    }
    setLoading(true);
    setStatus(source === "describe" ? "Reading your description..." : "Building draft...");
    try {
      if (source === "paste" || source === "csv") {
        const next = createImportDraft({ text, source, mode, category: project.category, existingPeople: graph.people });
        setDraft(next);
        setStatus(next.people.length ? `${next.people.length} ${next.people.length === 1 ? "person" : "people"} found. Nothing has changed yet.` : next.warnings[0]);
      } else {
        const requestBody = { mode, text, resolutions, project: { id: project.id, name: project.name, category: project.category, customCategoryName: project.customCategoryName, customRelationshipLabels: project.customRelationshipLabels }, selectedPersonId: selectedPerson?.id ?? "", globalPeople: globalPeople.map(({ id, name, nickname }) => ({ id, name, nickname })), graph: { people: graph.people.map(({ id, globalId, name, nickname, role, company, department, team, subject, contextRole, reportsToPersonId, includeInOrgChart, groupIds, isSelf }) => ({ id, globalId, name, nickname, role, company, department, team, subject, contextRole, reportsToPersonId, includeInOrgChart, groupIds, isSelf })), relationships: graph.relationships.map(({ id, sourceId, targetId, labels, semantic, direction, strength, type, introducedByPersonId }) => ({ id, sourceId, targetId, labels, semantic, direction, strength, type, introducedByPersonId })), groups: graph.groups.map(({ id, name }) => ({ id, name })) } };
        let nextDraft: ComposeDraft;
        if (!useExternalProvider) {
          const interpretation = interpretNaturalLanguage(text, { mode: mode === "change" ? "change" : "create", category: project.category, customCategoryName: project.customCategoryName, graph, resolutions });
          nextDraft = compileSemanticInterpretation(interpretation, { mode: mode === "change" ? "change" : "create", source: "describe", graph, globalPeople, category: project.category });
        } else {
          const { getFirebaseServices } = await import("./firebase/client"); const services = getFirebaseServices(); const user = services.auth.currentUser;
          if (!user || user.isAnonymous) throw new Error("Sign in with a permanent Circa account before using external Describe.");
          let appCheckToken = "";
          try { const { getToken } = await import("firebase/app-check"); if (services.appCheck) appCheckToken = (await getToken(services.appCheck, false)).token; } catch { /* the server decides whether App Check is currently enforced */ }
          const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 30_000);
          try {
            const response = await fetch("/api/compose", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}`, ...(appCheckToken ? { "x-firebase-appcheck": appCheckToken } : {}) }, body: JSON.stringify(requestBody), signal: controller.signal });
            const payload = await response.json() as { draft?: ComposeDraft; error?: string };
            if (!response.ok || !payload.draft) throw new Error(payload.error || "Compose could not interpret that description.");
            nextDraft = payload.draft;
          } finally { window.clearTimeout(timeout); }
        }
        const hydrated = { ...nextDraft, people: nextDraft.people.map((person) => { const global = globalPeople.find((item) => item.id === person.globalMatchId); return global ? { ...person, globalContact: { nickname: global.nickname, phone: global.phone, email: global.email, linkedinUrl: global.linkedinUrl, githubUrl: global.githubUrl } } : person; }) };
        setDraft(hydrated);
        setStatus(`${nextDraft.people.length} ${nextDraft.people.length === 1 ? "person" : "people"} found. Nothing has changed yet.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Compose could not interpret that description.");
    } finally { setLoading(false); }
  }

  function updatePerson(next: ComposeDraftPerson) {
    if (!draft) return;
    setDraft({ ...draft, people: draft.people.map((person) => person.id === next.id ? next : person) });
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 512_000) { setStatus("Choose a CSV smaller than 500 KB (up to 300 people)."); return; }
    file.text().then((value) => { setText(value); setStatus(`${file.name} is ready to review.`); });
  }

  const selectedCount = draft?.people.filter((person) => person.selected && person.name.trim()).length ?? 0;
  const reportingCount = draft?.people.filter((person) => person.selected && person.managerName).length ?? 0;
  const operationSummary = useMemo(() => draft ? countComposeOperations(draft, graph, project.category) : { count: 0, error: undefined }, [draft, graph, project.category]);
  const unresolvedAmbiguities = draft?.ambiguities?.filter((ambiguity) => !ambiguity.resolvedOptionId) ?? [];

  function chooseDraftAmbiguity(ambiguity: ComposeAmbiguity, optionId: string) {
    if (!draft) return;
    if (ambiguity.kind === "identity") {
      const ref = ambiguity.id.replace(/^identity_/, ""); const person = draft.people.find((item) => item.ref === `draft:${ref}`); if (!person) return;
      const existingId = optionId.startsWith("existing:") ? optionId.slice(9) : ""; const globalId = optionId.startsWith("global:") ? optionId.slice(7) : ""; const global = globalPeople.find((item) => item.id === globalId);
      updatePerson({ ...person, matchId: existingId, globalMatchId: globalId, globalContact: global ? { nickname: global.nickname, phone: global.phone, email: global.email, linkedinUrl: global.linkedinUrl, githubUrl: global.githubUrl } : undefined, identityResolution: optionId === "create" ? "create" : existingId ? "use-existing" : globalId ? "use-global" : "unresolved", needsReview: false });
      setDraft((current) => current ? { ...current, ambiguities: current.ambiguities?.map((item) => item.id === ambiguity.id ? { ...item, resolvedOptionId: optionId } : item) } : current); return;
    }
    if (ambiguity.kind === "conflict" && ambiguity.id.startsWith("manager_conflict_")) {
      const ref = ambiguity.id.replace(/^manager_conflict_/, ""); const person = draft.people.find((item) => item.ref === `draft:${ref}`); if (person) updatePerson({ ...person, managerName: optionId, fieldPatches: { ...person.fieldPatches, manager: { action: "set", value: optionId } }, needsReview: false });
      setDraft((current) => current ? { ...current, ambiguities: current.ambiguities?.map((item) => item.id === ambiguity.id ? { ...item, resolvedOptionId: optionId } : item) } : current); return;
    }
    const next = { ...semanticResolutions, [ambiguity.id]: optionId }; setSemanticResolutions(next); void createDraft(next);
  }

  return <aside ref={panelRef} tabIndex={-1} className="compose-panel" role="dialog" aria-modal="true" aria-labelledby="compose-title">
    <header>
      <div><span className="form-kicker">✦ Compose</span><p>{project.name} <i>·</i> {displayCategory(project.category, project.customCategoryName)}</p></div>
      <button onClick={onClose} aria-label="Close Compose">×</button>
    </header>

    <div className="compose-mode-tabs" role="tablist" aria-label="Compose action">
      {(["create", "change", "ask"] as ComposeMode[]).map((item) => <button role="tab" aria-selected={mode === item} className={mode === item ? "active" : ""} key={item} onClick={() => reset(item)}>{item}</button>)}
    </div>

    {!draft ? <div className="compose-entry">
      <h2 id="compose-title">{copy.title}</h2>
      <p>{mode === "ask" ? "Circa answers from the relationships already stored here." : "Sketch using words, then review every detail before it reaches your canvas."}</p>
      {selectedPerson && <div className="compose-context">Selected context <strong>{selectedPerson.name}</strong></div>}
      {mode !== "ask" && <div className="compose-source-tabs">
        {(["describe", "paste", "csv"] as ComposeSource[]).map((item) => <button className={source === item ? "active" : ""} key={item} onClick={() => { setSource(item); setStatus(""); }}>{item === "paste" ? "Paste list" : item === "csv" ? "CSV" : "Describe"}</button>)}
      </div>}
      {source === "csv" && mode !== "ask" && <label className="csv-drop"><input type="file" accept=".csv,text/csv" onChange={chooseFile} /><span>Choose CSV</span><small>Name, role and manager are recognised automatically.</small></label>}
      <label className="compose-text-label">{mode === "ask" ? "Your question" : source === "paste" ? "One person per line" : source === "csv" ? "CSV preview" : "Your description"}
        <textarea autoFocus value={text} onChange={(event) => { setText(event.target.value); setAskResponse(null); setStatus(""); }} rows={source === "csv" ? 8 : 7} placeholder={mode === "ask" ? "Ask anything about the relationships on this map..." : source === "paste" ? "Sarah Jones - CEO\nJames Patel - CTO - reports to Sarah Jones" : source === "csv" ? "name,role,manager" : exampleFor(project)} />
      </label>
      {source === "describe" && mode !== "ask" && <div className="compose-provider-note"><p>Circa’s local semantic engine is ready. You will review every interpreted fact before anything changes.</p>{externalProviderAvailable && <button className={useExternalProvider ? "active" : ""} onClick={() => setUseExternalProvider((value) => !value)}>{useExternalProvider ? "Use browser-only Describe" : "Use signed-in external Describe"}</button>}</div>}
      {mode !== "ask" && <p className="compose-privacy">Local Describe, Paste List and CSV are parsed in this browser with no account. If you choose signed-in external Describe, Describe sends your description plus limited Project context to Circa’s server. It never sends private notes, phone numbers, email addresses or unrelated Projects.</p>}
      {mode === "ask" && <section className="ask-suggestions" aria-labelledby="ask-suggestions-title">
        <p id="ask-suggestions-title">Try asking</p>
        <div className="suggested-questions">{ASK_SUGGESTIONS.map((question) => <button type="button" key={question} onClick={() => { setText(question); setAskResponse(null); setStatus(""); }}>{question}</button>)}</div>
      </section>}
      {mode === "ask" && askResponse?.status === "clarification" && <div className="compose-ambiguity ask-clarification"><strong>{askResponse.clarification.question}</strong>{askResponse.clarification.options.map((option) => <button key={option.id} onClick={() => { const resolutions = { ...askResolutions, [askResponse.clarification.id]: option.id }; setAskResolutions(resolutions); const result = onAsk(text.trim(), resolutions); setAskResponse(result); if (result.status === "result") onClose(); else setStatus(result.status === "error" ? result.message : result.clarification.question); }}><span>{option.label}</span>{option.description && <small>{option.description}</small>}</button>)}</div>}
      <button className="button button-dark compose-primary" onClick={() => void createDraft()} disabled={!text.trim() || loading}>{loading ? "Reading..." : copy.action} <span>→</span></button>
      {status && <p className="compose-status" role="status" aria-live="polite">{status}</p>}
    </div> : <div className="compose-review">
      <div className="compose-review-title"><span className="form-kicker">Here’s what I understood</span><h2>{operationSummary.count} proposed {operationSummary.count === 1 ? "change" : "changes"}</h2><p>{draft.semanticSummary ? `Circa understood ${draft.semanticSummary.people} ${draft.semanticSummary.people === 1 ? "person" : "people"}, ${draft.semanticSummary.relationships} ${draft.semanticSummary.relationships === 1 ? "relationship" : "relationships"} and ${draft.semanticSummary.organisationLinks} organisation ${draft.semanticSummary.organisationLinks === 1 ? "link" : "links"}.` : `${selectedCount} ${selectedCount === 1 ? "person" : "people"} and ${reportingCount} reporting ${reportingCount === 1 ? "line" : "lines"}.`} Temporary paper cards and dashed threads are only a preview.</p></div>
      {draft.warnings.length > 0 && <div className="compose-warnings">{draft.warnings.map((warning) => <p key={warning}>△ {warning}</p>)}</div>}
      {draft.ambiguities?.length ? <div className="compose-ambiguities"><span className="form-kicker">{unresolvedAmbiguities.length} {unresolvedAmbiguities.length === 1 ? "detail needs" : "details need"} your help</span>{draft.ambiguities.map((ambiguity) => <div className={`compose-ambiguity${ambiguity.resolvedOptionId ? " resolved" : ""}`} key={ambiguity.id}><strong>{ambiguity.question}</strong>{ambiguity.evidenceText && <small>From: “{ambiguity.evidenceText}”</small>}<div>{ambiguity.options.map((option) => <button className={ambiguity.resolvedOptionId === option.id ? "chosen" : ""} key={option.id} onClick={() => chooseDraftAmbiguity(ambiguity, option.id)}><span>{option.label}</span>{option.description && <small>{option.description}</small>}</button>)}</div></div>)}</div> : null}
      {operationSummary.error && <div className="compose-warnings"><p>△ {operationSummary.error}</p></div>}
      <div className="compose-review-list">{draft.people.map((person) => <DraftRow key={person.id} person={person} graph={graph} globalPeople={globalPeople} managerOptions={managerOptions} onChange={updatePerson} />)}</div>
      {draft.relationships.length > 0 && <div className="compose-relationships"><span className="form-kicker">Proposed relationships</span>{draft.relationships.map((relationship) => { const source = relationship.sourceRef === "self" ? "You" : draft.people.find((person) => person.ref === relationship.sourceRef)?.name ?? graph.people.find((person) => `existing:${person.id}` === relationship.sourceRef)?.name ?? "Unknown"; const target = relationship.targetRef === "self" ? "You" : draft.people.find((person) => person.ref === relationship.targetRef)?.name ?? graph.people.find((person) => `existing:${person.id}` === relationship.targetRef)?.name ?? "Unknown"; return <label key={relationship.id}><input type="checkbox" checked={relationship.selected} onChange={(event) => setDraft({ ...draft, relationships: draft.relationships.map((item) => item.id === relationship.id ? { ...item, selected: event.target.checked } : item) })} /><span><strong>{relationship.action === "remove" ? "Remove " : ""}{source} {relationship.direction === "undirected" ? "and" : "to"} {target}</strong><small>{relationship.labels.join(" · ")}{relationship.introducedByRef ? " · introduced through someone" : ""}{relationship.derived ? " · Derived suggestion" : ""}</small>{relationship.evidenceText && <small>From: “{relationship.evidenceText}”</small>}</span></label>; })}</div>}
      {draft.groups.length > 0 && <div className="compose-groups"><span className="form-kicker">Proposed groups</span>{draft.groups.map((group) => <label key={group.id}><input type="checkbox" checked={group.selected} onChange={(event) => setDraft({ ...draft, groups: draft.groups.map((item) => item.id === group.id ? { ...item, selected: event.target.checked } : item) })} />{group.name}<small>{group.memberDraftIds.length} people</small></label>)}</div>}
      <div className="compose-review-actions"><button className="button button-paper" onClick={() => { setDraft(null); setStatus(""); }}>Back</button><button className="button button-dark" disabled={!selectedCount || !operationSummary.count || Boolean(operationSummary.error) || unresolvedAmbiguities.length > 0} onClick={() => onApply(draft)}>{unresolvedAmbiguities.length ? "Resolve details first" : draft.mode === "change" ? `Apply ${operationSummary.count} ${operationSummary.count === 1 ? "change" : "changes"}` : draft.source === "csv" ? `Import ${selectedCount} ${selectedCount === 1 ? "person" : "people"}` : `Apply ${operationSummary.count} ${operationSummary.count === 1 ? "change" : "changes"}`} <span>↗</span></button></div>
      <button className="compose-cancel" onClick={onClose}>Cancel draft</button>
    </div>}
  </aside>;
}
