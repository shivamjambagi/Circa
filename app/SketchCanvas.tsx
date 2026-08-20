"use client";

import {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Accent,
  CanvasNote,
  CircaProject,
  createGraphStore,
  createId,
  createInitialGraph,
  createWorkspaceStore,
  GlobalPerson,
  Graph,
  Group,
  Person,
  ProjectCategory,
  Relationship,
  RelationshipDirection,
  RelationshipStrength,
  RelationshipType,
  Workspace,
  getTabSessionId,
  mergeProjectGraph,
  relationshipLabels,
  readWorkspaceBackupFile,
  serializeWorkspace,
} from "./graphStore";
import ComposePanel from "./ComposePanel";
import { accentForDraft, applyComposeDraftToGraph, hasReportingCycle } from "./composeEngine";
import type { ComposeDraft } from "./composeEngine";
import { answerGraphQuestion } from "./askEngine";
import type { AskResponse } from "./askEngine";
import { displayCategory, projectTemplates, RelationshipOption } from "./projectTemplates";
import { calculateFitViewport, layoutOrganisation } from "./orgLayout";
import { parseSpokenPerson } from "./voiceParser";
import { calculateWorkspaceSize, MIN_GROUP_HEIGHT, MIN_GROUP_WIDTH, resizeCanvasRect } from "./canvasGeometry";

type Tool = "select" | "add" | "connect" | "group" | "note" | "compose" | "voice" | "erase";
type Dialog = "add" | "group" | "note" | "reset" | "example" | null;
type Selection =
  | { kind: "person"; id: string }
  | { kind: "relationship"; id: string }
  | { kind: "note"; id: string }
  | { kind: "group"; id: string }
  | null;
type ResizeKind = "person" | "note" | "group";
type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type VoiceState = "idle" | "listening" | "processing" | "success" | "unsupported" | "denied" | "error";
type SpeechResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = Event & { resultIndex: number; results: { length: number; [index: number]: SpeechResultLike } };
type SpeechRecognitionErrorLike = Event & { error?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const ACCENTS: Accent[] = ["blue", "sage", "peach", "lilac", "yellow", "rose", "mint", "aqua", "coral", "graphite"];
const WORKSPACE_WIDTH = 1800;
const WORKSPACE_HEIGHT = 1100;

function personWidth(person: Person) { return person.width ?? (person.isSelf ? 148 : 134); }
function personHeight(person: Person) { return person.height ?? (person.isSelf ? 181 : 164); }
function noteWidth(note: CanvasNote) { return note.width ?? 155; }
function noteHeight(note: CanvasNote) { return note.height ?? 118; }

const RESIZE_DIRECTIONS: ResizeDirection[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function useModalFocus<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = () => [...(node?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    window.setTimeout(() => (focusable()[0] ?? node)?.focus(), 0);
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) { event.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); window.setTimeout(() => previous?.focus(), 0); };
  }, [onClose]);
  return ref;
}

function ResizeHandles({ label, onStart }: { label: string; onStart: (event: ReactPointerEvent, direction: ResizeDirection) => void }) {
  return <>{RESIZE_DIRECTIONS.map((direction) => <button key={direction} className={`resize-edge resize-${direction}`} onPointerDown={(event) => onStart(event, direction)} onClick={(event) => event.stopPropagation()} aria-label={`Resize ${label} from ${direction}`} title="Drag edge to resize" />)}</>;
}

function newPersonBase(name: string, now: string, includeInOrgChart = false) {
  return {
    name, nickname: "", phone: "", email: "", githubUrl: "", linkedinUrl: "", notes: "", howWeMet: "", groupId: "", groupIds: [], lastInteraction: "",
    role: "", company: "", department: "", team: "", reportsToPersonId: "", includeInOrgChart, yearGroup: "", subject: "", knownSince: "", sharedInterests: "", contextRole: "", createdAt: now, updatedAt: now,
  };
}

function relationshipFields(type: RelationshipType, label: string) {
  return {
    type, label, labels: [label], semantic: label,
    strength: /\bbest friend\b|\bvery close\b/i.test(label) ? "very-close" as const : /\bclose friend\b/i.test(label) ? "close" as const : /\bacquaintance\b/i.test(label) ? "light" as const : "normal" as const,
    direction: "undirected" as const,
  };
}

function directionalCopy(label: string, source: string, target: string) {
  const value = label.toLowerCase();
  if (/manager|manages/.test(value)) return [`${source} manages ${target}`, `${target} manages ${source}`];
  if (/mentor/.test(value)) return [`${source} mentors ${target}`, `${target} mentors ${source}`];
  if (/parent/.test(value)) return [`${source} is ${target}'s parent`, `${target} is ${source}'s parent`];
  if (/teacher|teaches/.test(value)) return [`${source} teaches ${target}`, `${target} teaches ${source}`];
  return [`${source} → ${target}`, `${target} → ${source}`];
}

function cardDetail(person: Person, category: ProjectCategory, groups: Group[], organisation = false) {
  if (organisation) return [person.role, person.company, person.team].filter(Boolean).join(" · ") || (person.isSelf ? "You" : "Organisation member");
  if (person.isSelf) return "Your starting point";
  if (category === "business") return [person.role, person.company].filter(Boolean).join(" · ") || person.howWeMet || "Professional contact";
  if (category === "school") return [person.yearGroup, person.subject].filter(Boolean).join(" · ") || person.howWeMet || "School connection";
  if (category === "family") return person.contextRole || person.howWeMet || "Family";
  if (category === "community") return person.contextRole || groups.find((group) => group.id === person.groupId)?.name || person.howWeMet || "Community";
  return person.nickname || person.howWeMet || groups.find((group) => group.id === person.groupId)?.name || "In your circle";
}

const toolItems: Array<{ id: Tool; icon: string; label: string }> = [
  { id: "select", icon: "↖", label: "Select" },
  { id: "add", icon: "＋", label: "Add" },
  { id: "connect", icon: "⌁", label: "Connect" },
  { id: "group", icon: "◌", label: "Group" },
  { id: "note", icon: "▤", label: "Note" },
  { id: "compose", icon: "✦", label: "Compose" },
  { id: "voice", icon: "◉", label: "Voice" },
  { id: "erase", icon: "⌫", label: "Erase" },
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function isStructuredUrl(value: string, host: "github.com" | "linkedin.com") {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === host || url.hostname === `www.${host}`);
  } catch {
    return false;
  }
}

function pathFor(source: Person, target: Person) {
  const x1 = source.x + personWidth(source) / 2;
  const y1 = source.y + personHeight(source) / 2;
  const x2 = target.x + personWidth(target) / 2;
  const y2 = target.y + personHeight(target) / 2;
  const bend = Math.min(90, Math.abs(x2 - x1) * 0.18 + 18);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1 - 12}, ${x2 - bend} ${y2 + 12}, ${x2} ${y2}`;
}

function createExampleGraph(): Graph {
  const now = new Date().toISOString();
  const base = createInitialGraph();
  const examplePeople: Person[] = [
    { id: "sample_maya", globalId: "global_sample_maya", ...newPersonBase("Maya", now), nickname: "May", howWeMet: "Design studio", notes: "Always knows the best tiny cafés.", groupId: "sample_creative", groupIds: ["sample_creative"], lastInteraction: "2026-08-02", x: 290, y: 170, accent: "blue" },
    { id: "sample_noah", globalId: "global_sample_noah", ...newPersonBase("Noah", now), howWeMet: "Introduced by Maya", notes: "Climbing on Thursdays.", groupId: "sample_creative", groupIds: ["sample_creative"], lastInteraction: "2026-07-29", x: 860, y: 155, accent: "peach" },
    { id: "sample_leila", globalId: "global_sample_leila", ...newPersonBase("Leila", now), nickname: "Lei", howWeMet: "Neighbours", notes: "Book swap list lives here.", lastInteraction: "2026-08-07", x: 280, y: 570, accent: "sage" },
    { id: "sample_sam", globalId: "global_sample_sam", ...newPersonBase("Sam", now), howWeMet: "Weekend climbing", notes: "Met Noah through Maya.", lastInteraction: "2026-07-18", x: 880, y: 595, accent: "lilac" },
  ];
  const relationships: Relationship[] = [
    { id: "rel_self_maya", sourceId: "person_self", targetId: "sample_maya", ...relationshipFields("very-close", "Very close"), introducedByPersonId: "", createdAt: now, updatedAt: now },
    { id: "rel_self_noah", sourceId: "person_self", targetId: "sample_noah", ...relationshipFields("friend", "Friend"), introducedByPersonId: "sample_maya", createdAt: now, updatedAt: now },
    { id: "rel_self_leila", sourceId: "person_self", targetId: "sample_leila", ...relationshipFields("close", "Close"), introducedByPersonId: "", createdAt: now, updatedAt: now },
    { id: "rel_maya_noah", sourceId: "sample_maya", targetId: "sample_noah", ...relationshipFields("close", "Close"), introducedByPersonId: "", createdAt: now, updatedAt: now },
    { id: "rel_noah_sam", sourceId: "sample_noah", targetId: "sample_sam", ...relationshipFields("acquaintance", "Acquaintance"), introducedByPersonId: "sample_maya", createdAt: now, updatedAt: now },
  ];
  return {
    ...base,
    people: [base.people[0], ...examplePeople],
    relationships,
    groups: [{ id: "sample_creative", name: "Creative circle", color: "blue", x: 205, y: 90, width: 880, height: 300 }],
    notes: [{ id: "sample_note", text: "Maya introduced us after a studio talk", color: "yellow", x: 985, y: 385, createdAt: now, updatedAt: now }],
    onboardingComplete: true,
    updatedAt: now,
  };
}

function organisationPath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const x1 = source.x + 82;
  const y1 = source.y + 145;
  const x2 = target.x + 82;
  const y2 = target.y;
  const middle = y1 + (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /></span>;
}

function ToolRail({ tool, viewMode, onChoose }: { tool: Tool; viewMode: "network" | "organisation"; onChoose: (tool: Tool) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleItems = viewMode === "organisation" ? toolItems.filter((item) => ["select", "add", "compose"].includes(item.id)) : toolItems;
  function itemButton(item: (typeof toolItems)[number]) {
    const label = viewMode === "organisation" && item.id === "add" ? "Add employee" : item.label;
    return <button key={item.id} className={tool === item.id ? "active" : ""} onClick={() => { onChoose(item.id); setMoreOpen(false); }} aria-label={label === "Add" ? "Add person" : label} aria-pressed={tool === item.id} title={label}><b>{item.icon}</b><span>{label}</span></button>;
  }
  return (
    <aside className="tool-rail full-tools" aria-label="Sketch tools">
      {visibleItems.slice(0, 4).map(itemButton)}
      <div className={`tool-secondary${moreOpen ? " open" : ""}`}>{visibleItems.slice(4).map(itemButton)}</div>
      {visibleItems.length > 4 && <button className="tool-more-toggle" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} aria-label="More sketch tools"><b>•••</b><span>More</span></button>}
    </aside>
  );
}

function AddDialog({ onClose, onAdd, onAddExisting, existingPeople }: { onClose: () => void; onAdd: (name: string, howWeMet: string) => void; onAddExisting: (person: GlobalPerson) => void; existingPeople: GlobalPerson[] }) {
  const [name, setName] = useState("");
  const [how, setHow] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const dialogRef = useModalFocus<HTMLFormElement>(onClose);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) onAdd(name.trim(), how.trim());
  }
  return (
    <div className="popover-backdrop" onMouseDown={onClose}>
      <form ref={dialogRef} className="add-popover" role="dialog" aria-modal="true" aria-labelledby="add-person-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="popover-close" onClick={onClose} aria-label="Close">×</button>
        <span className="form-kicker">Add person</span>
        <h2 id="add-person-title">Who are you thinking of?</h2>
        {existingPeople.length > 0 && <div className="person-source-tabs"><button type="button" className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>Create new</button><button type="button" className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>Add existing</button></div>}
        {mode === "new" ? <>
          <label>Name<input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Maya" /></label>
          {existingPeople.some((person) => person.name.toLowerCase() === name.trim().toLowerCase()) && <button type="button" className="duplicate-suggestion" onClick={() => { const match = existingPeople.find((person) => person.name.toLowerCase() === name.trim().toLowerCase()); if (match) onAddExisting(match); }}>Is this the same {name.trim()} already in Circa? <span>Add existing ↗</span></button>}
          <label className="optional-field">How do you know them? <small>optional</small><input value={how} onChange={(event) => setHow(event.target.value)} placeholder="e.g. Design studio" /></label>
          <p>Start lightly. You can add the rest once they’re on your sketch.</p>
          <button className="button button-dark" type="submit" disabled={!name.trim()}>Add to sketch <span>↗</span></button>
        </> : <div className="existing-person-picker"><label>Search people<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Search by name or email" /></label><div>{existingPeople.filter((person) => !name.trim() || `${person.name} ${person.email}`.toLowerCase().includes(name.toLowerCase())).map((person) => <button type="button" key={person.id} onClick={() => onAddExisting(person)}><span>{initials(person.name)}</span><div><strong>{person.name}</strong><small>{person.email || "Already in Circa"}</small></div><i>＋</i></button>)}</div></div>}
      </form>
    </div>
  );
}

function EmployeeDialog({ people, onClose, onAdd }: { people: Person[]; onClose: () => void; onAdd: (value: { name: string; role: string; reportsToPersonId: string; team: string; department: string; company: string }) => void }) {
  const [value, setValue] = useState({ name: "", role: "", reportsToPersonId: "", team: "", department: "", company: "" });
  const dialogRef = useModalFocus<HTMLFormElement>(onClose);
  return <div className="popover-backdrop" onMouseDown={onClose}><form ref={dialogRef} className="add-popover employee-popover" role="dialog" aria-modal="true" aria-labelledby="employee-title" onSubmit={(event) => { event.preventDefault(); if (value.name.trim()) onAdd({ ...value, name: value.name.trim().slice(0, 120) }); }} onMouseDown={(event) => event.stopPropagation()}>
    <button type="button" className="popover-close" onClick={onClose} aria-label="Close">×</button>
    <span className="form-kicker">Add employee</span><h2 id="employee-title">Place someone in the organisation.</h2>
    <label>Name<input autoFocus maxLength={120} value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} required /></label>
    <label>Role<input maxLength={180} value={value.role} onChange={(event) => setValue({ ...value, role: event.target.value })} placeholder="e.g. CTO" /></label>
    <label>Reports to<select value={value.reportsToPersonId} onChange={(event) => setValue({ ...value, reportsToPersonId: event.target.value })}><option value="">No manager assigned</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.role ? ` - ${person.role}` : person.isSelf ? " - you" : ""}</option>)}</select></label>
    <div className="employee-grid"><label>Team<input maxLength={180} value={value.team} onChange={(event) => setValue({ ...value, team: event.target.value })} /></label><label>Department<input maxLength={180} value={value.department} onChange={(event) => setValue({ ...value, department: event.target.value })} /></label></div>
    <label>Company<input maxLength={180} value={value.company} onChange={(event) => setValue({ ...value, company: event.target.value })} /></label>
    <button className="button button-dark" disabled={!value.name.trim()}>Add employee <span>↗</span></button>
  </form></div>;
}

function SimpleCreateDialog({ kind, suggestions = [], onClose, onCreate }: { kind: "group" | "note"; suggestions?: string[]; onClose: () => void; onCreate: (value: string, color: Accent) => void }) {
  const [value, setValue] = useState("");
  const [color, setColor] = useState<Accent>(kind === "group" ? "sage" : "yellow");
  const title = kind === "group" ? "Name this little circle" : "Pin a thought";
  const dialogRef = useModalFocus<HTMLFormElement>(onClose);
  return (
    <div className="popover-backdrop" onMouseDown={onClose}>
      <form ref={dialogRef} className="add-popover compact-popover" role="dialog" aria-modal="true" aria-labelledby={`create-${kind}-title`} onSubmit={(event) => { event.preventDefault(); if (value.trim()) onCreate(value.trim(), color); }} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="popover-close" onClick={onClose} aria-label="Close">×</button>
        <span className="form-kicker">New {kind}</span>
        <h2 id={`create-${kind}-title`}>{title}</h2>
        <label>{kind === "group" ? "Group name" : "Note"}
          {kind === "group"
            ? <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. University" />
            : <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. Met at the summer studio" rows={3} />}
        </label>
        {kind === "group" && suggestions.length > 0 && <div className="group-suggestions"><small>Suggestions</small><div>{suggestions.slice(0, 6).map((suggestion) => <button type="button" key={suggestion} onClick={() => setValue(suggestion)}>{suggestion}</button>)}</div></div>}
        <fieldset className="color-field"><legend>Paper accent</legend><div>{ACCENTS.map((item) => <button key={item} type="button" className={`color-dot ${item}${color === item ? " chosen" : ""}`} onClick={() => setColor(item)} aria-label={`${item} accent`} />)}</div></fieldset>
        <button className="button button-dark" type="submit" disabled={!value.trim()}>Place {kind} <span>↗</span></button>
      </form>
    </div>
  );
}

function ConfirmDialog({ title, copy, action, onClose, onConfirm }: { title: string; copy: string; action: string; onClose: () => void; onConfirm: () => void }) {
  const dialogRef = useModalFocus<HTMLDivElement>(onClose);
  return (
    <div className="popover-backdrop" onMouseDown={onClose}>
      <div ref={dialogRef} tabIndex={-1} className="add-popover confirm-popover" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="form-kicker">Please check</span>
        <h2 id="confirm-title">{title}</h2>
        <p>{copy}</p>
        <div className="confirm-actions"><button className="button button-paper" onClick={onClose}>Cancel</button><button className="button danger-button" onClick={onConfirm}>{action}</button></div>
      </div>
    </div>
  );
}

function BackupRestoreDialog({ current, backup, busy, onClose, onConfirm }: { current: Workspace; backup: Workspace; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const summary = (workspace: Workspace) => ({ projects: workspace.projects.length, people: workspace.globalPeople.length, folders: workspace.folders.length });
  const before = summary(current); const after = summary(backup);
  const dialogRef = useModalFocus<HTMLDivElement>(onClose);
  return <div className="popover-backdrop"><div ref={dialogRef} tabIndex={-1} className="add-popover confirm-popover restore-popover" role="dialog" aria-modal="true" aria-labelledby="restore-title">
    <span className="form-kicker">Workspace restore</span><h2 id="restore-title">Restore Circa backup?</h2>
    <div className="restore-compare"><section><strong>Backup contains</strong><span>{after.projects} Projects</span><span>{after.people} People</span><span>{after.folders} Folders</span></section><i>→</i><section><strong>Current Workspace</strong><span>{before.projects} Projects</span><span>{before.people} People</span><span>{before.folders} Folders</span></section></div>
    <p>This replaces your current local Workspace. Circa will keep the current Workspace as a recovery copy.</p>
    <div className="confirm-actions"><button className="button button-paper" disabled={busy} onClick={onClose}>Cancel</button><button className="button danger-button" disabled={busy} onClick={onConfirm}>{busy ? "Restoring..." : "Restore backup"}</button></div>
  </div></div>;
}

function SaveRecoveryDialog({ message, destination, busy, onStay, onExport, onRetry }: { message: string; destination: string; busy: boolean; onStay: () => void; onExport: () => void; onRetry: () => void }) {
  const dialogRef = useModalFocus<HTMLDivElement>(onStay);
  return <div className="popover-backdrop"><div ref={dialogRef} tabIndex={-1} className="add-popover confirm-popover save-recovery-popover" role="dialog" aria-modal="true" aria-labelledby="save-recovery-title">
    <span className="form-kicker">Save required</span><h2 id="save-recovery-title">Circa kept you on this Project.</h2>
    <p>{message}</p><p>Your unsaved edits are still on this screen. Stay here, export them as a recovery backup, or retry saving before {destination}.</p>
    <div className="save-recovery-actions"><button className="button button-paper" disabled={busy} onClick={onStay}>Stay here</button><button className="button button-paper" disabled={busy} onClick={onExport}>Export recovery backup</button><button className="button button-dark" disabled={busy} onClick={onRetry}>{busy ? "Retrying..." : `Retry and ${destination}`}</button></div>
  </div></div>;
}

function RelationshipChooser({ people, sourceId, targetId, options, customLabels, onAddCustom, onChoose, onCancel }: { people: Person[]; sourceId: string; targetId: string; options: RelationshipOption[]; customLabels: string[]; onAddCustom: (label: string) => void; onChoose: (type: RelationshipType, labels: string[], introducedBy: string, strength: RelationshipStrength, direction: RelationshipDirection) => void; onCancel: () => void }) {
  const [introducedBy, setIntroducedBy] = useState("");
  const [custom, setCustom] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [strength, setStrength] = useState<RelationshipStrength>("normal");
  const [direction, setDirection] = useState<RelationshipDirection>("undirected");
  const source = people.find((person) => person.id === sourceId);
  const target = people.find((person) => person.id === targetId);
  const allOptions = [...options, ...customLabels.map((label) => ({ label, style: "friend" as RelationshipType }))];
  const firstType = allOptions.find((option) => option.label === selectedLabels[0])?.style ?? "friend";
  const directionLabels = directionalCopy(selectedLabels[0] ?? "", source?.name ?? "First person", target?.name ?? "Second person");
  const dialogRef = useModalFocus<HTMLDivElement>(onCancel);
  function toggle(label: string) { setSelectedLabels((labels) => labels.includes(label) ? labels.filter((item) => item !== label) : [...labels, label]); }
  return (
    <div ref={dialogRef} tabIndex={-1} className="relationship-chooser" role="dialog" aria-modal="true" aria-labelledby="relationship-dialog-title">
      <button className="popover-close" onClick={onCancel} aria-label="Cancel connection">×</button>
      <span className="form-kicker">New thread</span>
      <h3 id="relationship-dialog-title">{source?.name} <i>and</i> {target?.name}</h3>
      <div className="relationship-options">
        {allOptions.map((option) => <button key={option.label} className={selectedLabels.includes(option.label) ? "chosen" : ""} aria-pressed={selectedLabels.includes(option.label)} onClick={() => toggle(option.label)}><i className={`line-sample ${option.style}`} />{option.label}</button>)}
      </div>
      <form className="custom-relationship" onSubmit={(event) => { event.preventDefault(); const label = custom.trim(); if (!label) return; onAddCustom(label); setSelectedLabels((labels) => labels.includes(label) ? labels : [...labels, label]); setCustom(""); }}><input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Custom relationship" aria-label="Custom relationship" /><button disabled={!custom.trim()}>＋ Add label</button></form>
      <div className="relationship-settings"><label>Connection strength<select value={strength} onChange={(event) => setStrength(event.target.value as RelationshipStrength)}><option value="very-close">Very strong</option><option value="close">Strong</option><option value="normal">Regular</option><option value="light">Light</option></select></label><label>Direction<select value={direction} onChange={(event) => setDirection(event.target.value as RelationshipDirection)}><option value="undirected">Both ways</option><option value="source-to-target">{directionLabels[0]}</option><option value="target-to-source">{directionLabels[1]}</option></select></label></div>
      <label>Introduced by <select value={introducedBy} onChange={(event) => setIntroducedBy(event.target.value)}><option value="">No one noted</option>{people.filter((person) => person.id !== sourceId && person.id !== targetId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <button className="button button-dark relationship-create" disabled={!selectedLabels.length} onClick={() => onChoose(firstType, selectedLabels, introducedBy, strength, direction)}>Draw connection ↗</button>
    </div>
  );
}

function VoicePanel({ state, draft, message, category, relationshipOptions, onDraftChange, onRetry, onFinish, onUsePhrase, onClose }: {
  state: VoiceState;
  draft: string;
  message: string;
  category: ProjectCategory;
  relationshipOptions: RelationshipOption[];
  onDraftChange: (value: string) => void;
  onRetry: () => void;
  onFinish: () => void;
  onUsePhrase: () => void;
  onClose: () => void;
}) {
  const statusCopy: Record<VoiceState, string> = {
    idle: "Ready when you are.",
    listening: "Listening - keep talking, then say “done” or “stop.”",
    processing: "Listening finished. Understanding the name and relationship...",
    success: message || "Person added to your sketch.",
    unsupported: "Voice recognition isn’t available in this browser.",
    denied: "Microphone access is off. You can allow it in your browser or type the phrase below.",
    error: message || "I couldn’t hear that clearly. Try once more or type the phrase below.",
  };
  const detected = parseSpokenPerson(draft, category);
  const detectedOption = detected?.relationshipDetected ? relationshipOptions.find((option) => option.label === detected.relationshipLabel) : undefined;
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  return (
    <aside ref={dialogRef} tabIndex={-1} className={`voice-panel ${state}`} role="dialog" aria-modal="true" aria-labelledby="voice-title">
      <button className="popover-close" onClick={onClose} aria-label="Close voice add">×</button>
      <span className="form-kicker">Voice add</span>
      <h2 id="voice-title">Say who you’re thinking of.</h2>
      <div className="voice-orb" aria-hidden="true"><i /><span>⌁</span></div>
      <p className="voice-example">Try: “His name is Shivam and he is my close friend.”<br />Keep talking naturally, then say “done.”</p>
      <p className="voice-status" role="status">{statusCopy[state]}</p>
      <label>What Circa heard
        <input value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Your phrase will appear here" />
      </label>
      {detected && <div className="voice-detected"><span><small>Name</small>{detected.name}</span><i /><span><small>Relationship</small>{detected.relationshipDetected ? detectedOption?.label ?? detected.relationshipLabel : "Not specified"}</span>{detected.howWeMet && <><i /><span><small>Context</small>{detected.howWeMet}</span></>}</div>}
      <div className="voice-actions">
        {state === "listening"
          ? <button className="button button-paper finish-listening" onClick={onFinish}><span className="mic-glyph">■</span> Done listening</button>
          : <button className="button button-paper" onClick={onRetry} disabled={state === "processing"}><span className="mic-glyph">●</span> Listen again</button>}
        <button className="button button-dark" onClick={onUsePhrase} disabled={!draft.trim() || state === "processing"}>Create person ↗</button>
      </div>
      <p className="voice-privacy">Speech recognition is provided by your browser and may use its speech service. Review the transcript first; Circa stores only the confirmed card and connection in this local workspace.</p>
    </aside>
  );
}

type DetailsProps = {
  selection: Selection;
  graph: Graph;
  category: ProjectCategory;
  relationshipOptions: RelationshipOption[];
  onClose: () => void;
  onUpdatePerson: (person: Person) => void;
  onUpdateRelationship: (relationship: Relationship) => void;
  onUpdateNote: (note: CanvasNote) => void;
  onUpdateGroup: (group: Group) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onDelete: () => void;
};

function PersonNameField({ person, onUpdate }: { person: Person; onUpdate: (person: Person) => void }) {
  const [draft, setDraft] = useState(person.name);
  const [error, setError] = useState("");
  function commit() {
    const name = draft.trim().slice(0, 120);
    if (!name) { setDraft(person.name); setError("Name can't be empty."); return; }
    setError(""); if (name !== person.name) onUpdate({ ...person, name });
  }
  return <label>Name<input value={draft} maxLength={120} aria-invalid={Boolean(error)} aria-describedby={error ? `name-error-${person.id}` : undefined} onChange={(event) => { setDraft(event.target.value); if (event.target.value.trim()) setError(""); }} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />{error && <small className="field-error" id={`name-error-${person.id}`} role="alert">{error}</small>}</label>;
}

function DetailsPanel({ selection, graph, category, relationshipOptions, onClose, onUpdatePerson, onUpdateRelationship, onUpdateNote, onUpdateGroup, onEditStart, onEditEnd, onDelete }: DetailsProps) {
  const [linkError, setLinkError] = useState("");
  if (!selection) return null;
  const person = selection.kind === "person" ? graph.people.find((item) => item.id === selection.id) : undefined;
  const relationship = selection.kind === "relationship" ? graph.relationships.find((item) => item.id === selection.id) : undefined;
  const note = selection.kind === "note" ? graph.notes.find((item) => item.id === selection.id) : undefined;
  const group = selection.kind === "group" ? graph.groups.find((item) => item.id === selection.id) : undefined;
  if (!person && !relationship && !note && !group) return null;
  const detailDirectionLabels = relationship ? directionalCopy(relationship.labels[0] ?? relationship.semantic, graph.people.find((item) => item.id === relationship.sourceId)?.name ?? "First person", graph.people.find((item) => item.id === relationship.targetId)?.name ?? "Second person") : ["First → second", "Second → first"];

  return (
    <aside className="details-panel" aria-label="Selected item details" onFocusCapture={onEditStart} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onEditEnd(); }}>
      <header><div><span className="form-kicker">{selection.kind}</span><h2>{person?.name ?? note?.text.slice(0, 22) ?? group?.name ?? "Relationship"}</h2></div><button onClick={onClose} aria-label="Close details">×</button></header>
      {person && <div className="detail-form">
        <div className={`panel-avatar ${person.accent}`}>{initials(person.name)}</div>
        <PersonNameField key={`${person.id}:${person.name}`} person={person} onUpdate={onUpdatePerson} />
        <label>Nickname <small>optional</small><input value={person.nickname} onChange={(event) => onUpdatePerson({ ...person, nickname: event.target.value })} placeholder="What you call them" /></label>
        {category === "business" && <><label>Role <small>optional</small><input value={person.role} onChange={(event) => onUpdatePerson({ ...person, role: event.target.value })} placeholder="e.g. Developer" /></label><label>Company <small>optional</small><input value={person.company} onChange={(event) => onUpdatePerson({ ...person, company: event.target.value })} placeholder="e.g. Barclays" /></label><label>Department <small>optional</small><input value={person.department} onChange={(event) => onUpdatePerson({ ...person, department: event.target.value })} placeholder="e.g. Engineering" /></label><label>Team <small>optional</small><input value={person.team} onChange={(event) => onUpdatePerson({ ...person, team: event.target.value })} placeholder="e.g. Frontend" /></label><label>Reports to <small>optional</small><select value={person.reportsToPersonId} onChange={(event) => onUpdatePerson({ ...person, reportsToPersonId: event.target.value })}><option value="">No manager assigned</option>{graph.people.filter((item) => item.id !== person.id).map((item) => <option key={item.id} value={item.id}>{item.name}{item.isSelf ? " (you)" : ""}</option>)}</select></label><label className="check-row"><input type="checkbox" checked={person.includeInOrgChart} onChange={(event) => onUpdatePerson({ ...person, includeInOrgChart: event.target.checked })} /> Include in organisation chart</label></>}
        {category === "school" && <><label>Year group <small>optional</small><input value={person.yearGroup} onChange={(event) => onUpdatePerson({ ...person, yearGroup: event.target.value })} placeholder="e.g. Year 13" /></label><label>Subject <small>optional</small><input value={person.subject} onChange={(event) => onUpdatePerson({ ...person, subject: event.target.value })} placeholder="e.g. Computer Science" /></label></>}
        {category === "personal" && <><label>Known since <small>optional</small><input value={person.knownSince} onChange={(event) => onUpdatePerson({ ...person, knownSince: event.target.value })} placeholder="e.g. 2021" /></label><label>Shared interests <small>optional</small><input value={person.sharedInterests} onChange={(event) => onUpdatePerson({ ...person, sharedInterests: event.target.value })} placeholder="e.g. Climbing, design" /></label></>}
        {(category === "family" || category === "community" || category === "other") && <label>{category === "family" ? "Relation" : "Role"} <small>optional</small><input value={person.contextRole} onChange={(event) => onUpdatePerson({ ...person, contextRole: event.target.value })} placeholder={category === "family" ? "e.g. Cousin" : "e.g. Organiser"} /></label>}
        <label>How you met <small>optional</small><input value={person.howWeMet} onChange={(event) => onUpdatePerson({ ...person, howWeMet: event.target.value })} placeholder="Where your paths crossed" /></label>
        {graph.groups.length > 0 && <fieldset className="group-memberships"><legend>Groups <small>optional</small></legend>{graph.groups.map((item) => <label key={item.id}><input type="checkbox" checked={person.groupIds.includes(item.id)} onChange={(event) => { const groupIds = event.target.checked ? [...new Set([...person.groupIds, item.id])] : person.groupIds.filter((id) => id !== item.id); onUpdatePerson({ ...person, groupIds, groupId: groupIds[0] ?? "" }); }} />{item.name}</label>)}</fieldset>}
        <label>Last interaction <small>optional</small><input type="date" value={person.lastInteraction} onChange={(event) => onUpdatePerson({ ...person, lastInteraction: event.target.value })} /></label>
        <label>Notes <small>optional</small><textarea rows={4} value={person.notes} onChange={(event) => onUpdatePerson({ ...person, notes: event.target.value })} placeholder="The useful, human details" /></label>
        <fieldset className="color-field"><legend>Card accent</legend><div>{ACCENTS.map((item) => <button key={item} type="button" className={`color-dot ${item}${person.accent === item ? " chosen" : ""}`} onClick={() => onUpdatePerson({ ...person, accent: item })} aria-label={`${item} accent`} />)}</div></fieldset>
        <div className="detail-divider"><span>Contact</span></div>
        <label>Phone number <small>optional</small><input type="tel" value={person.phone} onChange={(event) => onUpdatePerson({ ...person, phone: event.target.value })} placeholder="+44 7700 900000" /></label>
        <label>Email address <small>optional</small><input type="email" value={person.email} onChange={(event) => onUpdatePerson({ ...person, email: event.target.value })} placeholder="maya@example.com" /></label>
        <label>LinkedIn <small>optional</small><input value={person.linkedinUrl} onChange={(event) => { setLinkError(""); onUpdatePerson({ ...person, linkedinUrl: event.target.value }); }} onBlur={() => setLinkError(isStructuredUrl(person.linkedinUrl, "linkedin.com") ? "" : "Use a full https://linkedin.com/… URL.")} placeholder="https://linkedin.com/in/…" /></label>
        <label>GitHub <small>optional</small><input value={person.githubUrl} onChange={(event) => { setLinkError(""); onUpdatePerson({ ...person, githubUrl: event.target.value }); }} onBlur={() => setLinkError(isStructuredUrl(person.githubUrl, "github.com") ? "" : "Use a full https://github.com/… URL.")} placeholder="https://github.com/…" /></label>
        {linkError && <p className="inline-error" role="alert">{linkError}</p>}
        {!person.isSelf && <button className="text-danger" onClick={onDelete}>Remove from this project</button>}
      </div>}
      {relationship && <div className="detail-form">
        <p className="relationship-names">{graph.people.find((item) => item.id === relationship.sourceId)?.name} <i>and</i> {graph.people.find((item) => item.id === relationship.targetId)?.name}</p>
        <label>{category === "business" ? "Connection labels" : "Relationship labels"}<input value={relationship.labels.join(", ")} onChange={(event) => { const labels = event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8); const option = relationshipOptions.find((item) => item.label === labels[0]); onUpdateRelationship({ ...relationship, type: option?.style ?? relationship.type, label: labels[0] ?? "Connection", labels, semantic: labels[0] ?? "Connection" }); }} placeholder="Friend, mentor" /></label>
        <label>{category === "personal" ? "Closeness" : category === "family" ? "Strength" : "Connection strength"}<select value={relationship.strength} onChange={(event) => onUpdateRelationship({ ...relationship, strength: event.target.value as RelationshipStrength })}><option value="very-close">Very strong</option><option value="close">Strong</option><option value="normal">Regular</option><option value="light">Light</option></select></label>
        <label>Direction<select value={relationship.direction} onChange={(event) => onUpdateRelationship({ ...relationship, direction: event.target.value as RelationshipDirection })}><option value="undirected">Both ways</option><option value="source-to-target">{detailDirectionLabels[0]}</option><option value="target-to-source">{detailDirectionLabels[1]}</option></select></label>
        <label>Introduced by <small>optional</small><select value={relationship.introducedByPersonId} onChange={(event) => onUpdateRelationship({ ...relationship, introducedByPersonId: event.target.value })}><option value="">No one noted</option>{graph.people.filter((item) => item.id !== relationship.sourceId && item.id !== relationship.targetId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <p className="panel-note">Circa uses texture and weight - not a score - to show connection strength.</p>
        <button className="text-danger" onClick={onDelete}>Remove thread</button>
      </div>}
      {note && <div className="detail-form">
        <label>Note<textarea rows={7} value={note.text} onChange={(event) => onUpdateNote({ ...note, text: event.target.value })} /></label>
        <fieldset className="color-field"><legend>Paper accent</legend><div>{ACCENTS.map((item) => <button key={item} type="button" className={`color-dot ${item}${note.color === item ? " chosen" : ""}`} onClick={() => onUpdateNote({ ...note, color: item })} aria-label={`${item} accent`} />)}</div></fieldset>
        <button className="text-danger" onClick={onDelete}>Remove note</button>
      </div>}
      {group && <div className="detail-form">
        <label>Group name<input value={group.name} onChange={(event) => onUpdateGroup({ ...group, name: event.target.value })} /></label>
        <fieldset className="color-field"><legend>Pencil shade</legend><div>{ACCENTS.map((item) => <button key={item} type="button" className={`color-dot ${item}${group.color === item ? " chosen" : ""}`} onClick={() => onUpdateGroup({ ...group, color: item })} aria-label={`${item} accent`} />)}</div></fieldset>
        <p className="panel-note">Drag the selected group to move it. Pull any edge or corner to resize it.</p>
        <button className="text-danger" onClick={onDelete}>Remove group</button>
      </div>}
    </aside>
  );
}

type SketchCanvasProps = {
  project: CircaProject;
  projects: CircaProject[];
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  onUpdateProject: (patch: Partial<CircaProject>) => void;
  onExit: () => void;
};

export default function SketchCanvas({ project, projects, onOpenProject, onNewProject, onUpdateProject, onExit }: SketchCanvasProps) {
  const store = useMemo(() => createGraphStore(project.id), [project.id]);
  const workspaceStore = useMemo(() => createWorkspaceStore(), []);
  const template = projectTemplates[project.category];
  const relationshipOptions = useMemo(() => [...template.relationships, ...project.customRelationshipLabels.map((label) => ({ label, style: "friend" as RelationshipType }))], [template.relationships, project.customRelationshipLabels]);
  const [graph, setGraph] = useState<Graph>(() => createInitialGraph());
  const [existingPeople, setExistingPeople] = useState<GlobalPerson[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [tool, setTool] = useState<Tool>("select");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [connectStart, setConnectStart] = useState<string>("");
  const [pendingConnection, setPendingConnection] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [deleteSelection, setDeleteSelection] = useState<Selection>(null);
  const [past, setPast] = useState<Graph[]>([]);
  const [future, setFuture] = useState<Graph[]>([]);
  const [toast, setToast] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [resizingId, setResizingId] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceDraft, setVoiceDraft] = useState("");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [viewMode, setViewMode] = useState<"network" | "organisation">("network");
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [highlightRelationshipIds, setHighlightRelationshipIds] = useState<string[]>([]);
  const [highlightReportingEdges, setHighlightReportingEdges] = useState<string[]>([]);
  const [highlightAnswer, setHighlightAnswer] = useState("");
  const [collapsedOrgIds, setCollapsedOrgIds] = useState<string[]>([]);
  const [orgCompany, setOrgCompany] = useState("");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<Workspace | null>(null);
  const [restoreCurrent, setRestoreCurrent] = useState<Workspace | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [projectConflict, setProjectConflict] = useState(false);
  const [overwriteConflict, setOverwriteConflict] = useState(false);
  const [saveFailure, setSaveFailure] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState<{ destination: string; run: () => void } | null>(null);
  const [saveRetryBusy, setSaveRetryBusy] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const graphRef = useRef(graph);
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveSequenceRef = useRef<Promise<void>>(Promise.resolve());
  const saveGenerationRef = useRef(0);
  const saveSuspendedRef = useRef(false);
  const dragRef = useRef<{ kind: "person" | "note" | "group"; id: string; startX: number; startY: number; originX: number; originY: number; zoom: number; snapshot: Graph; moved: boolean } | null>(null);
  const resizeRef = useRef<{ kind: ResizeKind; id: string; direction: ResizeDirection; startX: number; startY: number; originX: number; originY: number; originWidth: number; originHeight: number; zoom: number; snapshot: Graph; moved: boolean } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceTranscriptRef = useRef("");
  const voiceSessionActiveRef = useRef(false);
  const voiceStopRequestedRef = useRef(false);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; centerX: number; centerY: number; viewport: Graph["viewport"] } | null>(null);
  const editSnapshotRef = useRef<Graph | null>(null);
  const orgPreviewPeople = useMemo(() => {
    if (viewMode !== "organisation" || !composeDraft) return graph.people;
    const base = graph.people.find((person) => person.isSelf) ?? createInitialGraph().people[0];
    const drafts = composeDraft.people.filter((person) => person.selected && person.name.trim()).map((person, index) => {
      const managerPatch = person.fieldPatches?.manager;
      const managerRef = managerPatch?.action === "set" ? String(managerPatch.value ?? "") : person.managerName;
      const reportsToPersonId = managerRef.startsWith("existing:") ? managerRef.slice(9) : managerRef;
      return { ...base, id: person.ref, globalId: `draft-global-${index}`, name: person.name, role: person.role, company: person.company, department: person.department, team: person.team, reportsToPersonId, includeInOrgChart: person.includeInOrgChart !== false, isSelf: false };
    });
    return [...graph.people, ...drafts];
  }, [composeDraft, graph.people, viewMode]);
  const orgLayout = useMemo(() => layoutOrganisation(orgPreviewPeople, new Set(collapsedOrgIds), orgCompany), [orgPreviewPeople, collapsedOrgIds, orgCompany]);
  const orgPositions = orgLayout.positions;
  const orgCompanies = useMemo(() => [...new Set(graph.people.filter((person) => person.includeInOrgChart && person.company.trim()).map((person) => person.company.trim()))].sort(), [graph.people]);
  const networkWorkspace = useMemo(() => calculateWorkspaceSize([
    ...graph.people.map((person) => ({ x: person.x, y: person.y, width: personWidth(person), height: personHeight(person) })),
    ...graph.notes.map((note) => ({ x: note.x, y: note.y, width: noteWidth(note), height: noteHeight(note) })),
    ...graph.groups.map((group) => ({ x: group.x, y: group.y, width: group.width, height: group.height })),
  ], WORKSPACE_WIDTH, WORKSPACE_HEIGHT), [graph.groups, graph.notes, graph.people]);
  const workspaceWidth = viewMode === "organisation" ? orgLayout.bounds.width : networkWorkspace.width;
  const workspaceHeight = viewMode === "organisation" ? orgLayout.bounds.height : networkWorkspace.height;
  const composePreviewPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    for (const person of graph.people) {
      const point = viewMode === "organisation" ? orgPositions.get(person.id) : { x: person.x, y: person.y };
      if (point) { positions.set(`existing:${person.id}`, point); positions.set(person.id, point); if (person.isSelf) positions.set("self", point); }
    }
    for (const person of composeDraft?.people ?? []) {
      const point = viewMode === "organisation" ? orgPositions.get(person.ref) : { x: person.x, y: person.y };
      if (point) positions.set(person.ref, point);
    }
    return positions;
  }, [composeDraft, graph.people, orgPositions, viewMode]);

  useEffect(() => { graphRef.current = graph; }, [graph]);

  useEffect(() => {
    let active = true;
    Promise.all([store.loadGraph(), store.loadContacts()]).then(([stored, contacts]) => {
      if (!active) return;
      setGraph(stored);
      setExistingPeople(contacts.filter((contact) => !stored.people.some((person) => person.globalId === contact.id)));
      setLoaded(true);
      loadedRef.current = true;
      setSaveStatus("saved");
    }).catch((error) => { if (!active) return; setLoaded(true); loadedRef.current = true; setSaveStatus("error"); setToast(error instanceof Error ? error.message : "Circa could not open local data."); });
    return () => { active = false; };
  }, [store]);

  const performSave = useCallback((next: Graph, generation = saveGenerationRef.current) => {
    if (saveSuspendedRef.current) return Promise.reject(new Error("Saving is paused until you resolve the newer version from another tab."));
    setSaveStatus("saving");
    saveSequenceRef.current = saveSequenceRef.current.catch(() => undefined).then(() => store.saveGraph(next)).then(() => { if (generation === saveGenerationRef.current) setSaveStatus("saved"); setSaveFailure(""); }).catch((error) => {
      const message = error instanceof Error ? error.message : "Circa could not save this change.";
      setSaveStatus("error"); setSaveFailure(message);
      if (message.includes("changed in another tab")) { saveSuspendedRef.current = true; setProjectConflict(true); }
      else setToast(`${message} Export a backup before continuing if this persists.`);
      throw error;
    });
    return saveSequenceRef.current;
  }, [store]);

  const flushPendingSave = useCallback(async () => {
    if (!loadedRef.current) return;
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    await performSave(graphRef.current);
  }, [performSave]);

  useEffect(() => {
    if (!loaded || saveSuspendedRef.current) return;
    const generation = ++saveGenerationRef.current;
    const statusTimer = window.setTimeout(() => setSaveStatus("saving"), 0);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => { saveTimerRef.current = null; void performSave(graphRef.current, generation).catch(() => undefined); }, 420);
    return () => { window.clearTimeout(statusTimer); if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; } };
  }, [graph, loaded, performSave]);

  useEffect(() => {
    function pagehide() { if (!loadedRef.current || saveSuspendedRef.current) return; try { store.saveGraphNow(graphRef.current); } catch { setSaveStatus("error"); } }
    function visibility() { if (document.visibilityState === "hidden") pagehide(); }
    window.addEventListener("pagehide", pagehide); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("pagehide", pagehide); document.removeEventListener("visibilitychange", visibility); pagehide(); };
  }, [store]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("circa-workspace");
    const source = getTabSessionId();
    channel.addEventListener("message", (event) => {
      const data = event.data as { source?: unknown; projectId?: unknown };
      if (data.source === source || data.projectId !== project.id) return;
      saveSuspendedRef.current = true;
      if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      setProjectConflict(true); setSaveStatus("error");
    });
    return () => channel.close();
  }, [project.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const commitGraph = useCallback((nextGraph: Graph) => {
    setGraph((current) => {
      setPast((items) => [...items.slice(-29), current]);
      setFuture([]);
      return { ...nextGraph, updatedAt: new Date().toISOString() };
    });
  }, []);

  const updateWithoutHistory = useCallback((updater: (current: Graph) => Graph) => {
    setGraph((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
  }, []);

  function startDetailsEdit() { if (!editSnapshotRef.current) editSnapshotRef.current = graphRef.current; }
  function finishDetailsEdit() {
    const snapshot = editSnapshotRef.current; editSnapshotRef.current = null;
    if (snapshot && snapshot.updatedAt !== graphRef.current.updatedAt) { setPast((items) => [...items.slice(-29), snapshot]); setFuture([]); }
  }

  async function navigateAfterSave(destination: string, run: () => void) {
    try { await flushPendingSave(); setPendingNavigation(null); setSaveFailure(""); run(); }
    catch (error) { setSaveFailure(error instanceof Error ? error.message : "Circa could not save this change."); setPendingNavigation({ destination, run }); }
  }

  async function leaveCanvas() { await navigateAfterSave("returning to Projects", onExit); }
  async function openProject(id: string) { await navigateAfterSave("opening the other Project", () => onOpenProject(id)); }
  async function newProject() { await navigateAfterSave("creating a new Project", onNewProject); }

  async function downloadCurrentWorkspaceBackup() {
    const workspace = await workspaceStore.loadWorkspace();
    const recovery = mergeProjectGraph(workspace, project.id, graphRef.current);
    const blob = new Blob([serializeWorkspace(recovery)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `circa-recovery-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }

  async function exportBackup() {
    try {
      try { await flushPendingSave(); } catch { /* include the in-memory graph in the recovery export */ }
      await downloadCurrentWorkspaceBackup();
      setMoreMenuOpen(false); setToast("Workspace backup exported");
    } catch (error) { setSaveStatus("error"); setToast(error instanceof Error ? error.message : "Backup export failed."); }
  }

  async function importBackup(file: File) {
    try {
      const imported = await readWorkspaceBackupFile(file);
      const current = await workspaceStore.loadWorkspace();
      setPendingRestore(imported); setRestoreCurrent(current); setMoreMenuOpen(false);
    } catch (error) { setToast(error instanceof Error ? error.message : "That backup could not be restored."); }
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    setRestoreBusy(true);
    saveSuspendedRef.current = true;
    saveGenerationRef.current += 1;
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    try {
      await saveSequenceRef.current.catch(() => undefined);
      await workspaceStore.restoreWorkspace(pendingRestore);
      setPendingRestore(null); setRestoreCurrent(null); setToast("Backup restored. Your previous Workspace was kept as a recovery copy.");
      onExit();
    } catch (error) {
      saveSuspendedRef.current = false; setSaveStatus("error"); setToast(error instanceof Error ? error.message : "That backup could not be restored.");
    } finally { setRestoreBusy(false); }
  }

  async function reloadNewerProject() {
    saveSuspendedRef.current = true;
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const newer = await store.loadGraph();
    graphRef.current = newer; setGraph(newer); setPast([]); setFuture([]); setSelection(null); setProjectConflict(false); setOverwriteConflict(false);
    saveGenerationRef.current += 1; saveSuspendedRef.current = false; setSaveStatus("saved"); setToast("Newer Project version loaded");
  }

  async function keepThisProjectVersion() {
    try {
      await store.forceSaveGraph(graphRef.current);
      setProjectConflict(false); setOverwriteConflict(false); saveSuspendedRef.current = false; setSaveStatus("saved"); setToast("This version replaced the newer Project after confirmation");
    } catch (error) { setSaveStatus("error"); setToast(error instanceof Error ? error.message : "Circa could not keep this version."); }
  }

  async function resetSketch() {
    const previous = graphRef.current;
    try {
      const clean = createInitialGraph();
      await store.clearGraph();
      graphRef.current = clean; setGraph(clean); setPast([]); setFuture([]); setSelection(null); setDialog(null); setSaveStatus("saved"); setToast("A fresh sketch is ready");
    } catch {
      graphRef.current = previous; setGraph(previous); setDialog(null); setSaveStatus("error"); setToast("Circa couldn't save the reset. Your previous local sketch has been kept.");
    }
  }

  function undo() {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setFuture((items) => [graph, ...items].slice(0, 30));
    setPast((items) => items.slice(0, -1));
    setGraph(previous);
    setSelection(null);
  }

  function redo() {
    if (!future.length) return;
    const next = future[0];
    setPast((items) => [...items, graph].slice(-30));
    setFuture((items) => items.slice(1));
    setGraph(next);
    setSelection(null);
  }

  function chooseTool(nextTool: Tool) {
    if (nextTool === "compose") {
      setTool("compose");
      setComposeOpen(true);
      setSelection(null);
      return;
    }
    if (nextTool === "voice") {
      beginVoice();
      return;
    }
    setTool(nextTool);
    setConnectStart("");
    setSelection(null);
    if (nextTool === "add") setDialog("add");
    if (nextTool === "group") setDialog("group");
    if (nextTool === "note") setDialog("note");
  }

  function addPerson(name: string, howWeMet: string, relationshipType: RelationshipType = "friend", relationshipLabel?: string, existing?: GlobalPerson, autoConnect = false) {
    const now = new Date().toISOString();
    const safeName = name.trim().slice(0, 120);
    if (!safeName) { setToast("Name can't be empty."); return; }
    const self = graph.people.find((person) => person.isSelf) ?? graph.people[0];
    const index = graph.people.length - 1;
    const angle = (index * 1.9) - .55;
    const radius = 270 + (index % 3) * 42;
    const person: Person = {
      id: createId("person"), globalId: existing?.id ?? createId("global"), ...newPersonBase(safeName, now, project.category === "business" && viewMode === "organisation"),
      ...(existing ? { name: existing.name, nickname: existing.nickname, phone: existing.phone, email: existing.email, githubUrl: existing.githubUrl, linkedinUrl: existing.linkedinUrl, createdAt: existing.createdAt } : {}),
      howWeMet, x: Math.max(60, self.x + Math.cos(angle) * radius), y: Math.max(70, self.y + Math.sin(angle) * radius), accent: ACCENTS[index % ACCENTS.length],
    };
    const label = relationshipLabel ?? template.relationships.find((option) => option.style === relationshipType)?.label ?? relationshipLabels[relationshipType];
    const relationship: Relationship = { id: createId("relationship"), sourceId: self.id, targetId: person.id, ...relationshipFields(relationshipType, label), introducedByPersonId: "", createdAt: now, updatedAt: now };
    commitGraph({ ...graph, people: [...graph.people, person], relationships: autoConnect ? [...graph.relationships, relationship] : graph.relationships, onboardingComplete: graph.people.length > 1 });
    setDialog(null);
    setTool("select");
    setSelection({ kind: "person", id: person.id });
    setToast(`${safeName} is on your sketch`);
  }

  function addExistingPerson(person: GlobalPerson) {
    addPerson(person.name, "", "friend", "Friend", person, false);
    setExistingPeople((people) => people.filter((item) => item.id !== person.id));
  }

  function addEmployee(value: { name: string; role: string; reportsToPersonId: string; team: string; department: string; company: string }) {
    const now = new Date().toISOString();
    const index = graph.people.length - 1;
    const person: Person = {
      id: createId("person"), globalId: createId("global"), ...newPersonBase(value.name, now, true),
      role: value.role.trim(), reportsToPersonId: value.reportsToPersonId, team: value.team.trim(), department: value.department.trim(), company: value.company.trim(),
      x: 560 + (index % 5) * 180, y: 350 + Math.floor(index / 5) * 195, accent: ACCENTS[index % ACCENTS.length],
    };
    const proposed = [...graph.people, person];
    if (hasReportingCycle(proposed)) { setToast("That reporting line would create a cycle."); return; }
    commitGraph({ ...graph, people: proposed, onboardingComplete: true });
    setDialog(null); setTool("select"); setSelection({ kind: "person", id: person.id }); setToast(`${person.name} added to the organisation`);
  }

  function createPersonFromPhrase(phrase: string) {
    const parsed = parseSpokenPerson(phrase, project.category);
    if (!parsed) {
      setVoiceState("error");
      setVoiceMessage("Try saying “Her name is Maya” or type a shorter name.");
      return;
    }
    setVoiceState("processing");
    voiceSessionActiveRef.current = false;
    const option = parsed.relationshipDetected ? relationshipOptions.find((item) => item.label === parsed.relationshipLabel) : undefined;
    addPerson(parsed.name, parsed.howWeMet, parsed.relationshipType ?? "friend", option?.label, undefined, parsed.relationshipDetected);
    setVoiceMessage(parsed.relationshipDetected ? `${parsed.name} is now on your sketch as ${(option?.label ?? parsed.relationshipLabel).toLowerCase()}.` : `${parsed.name} is now on your sketch with no relationship added.`);
    setVoiceState("success");
    window.setTimeout(() => {
      setVoiceOpen(false);
      setVoiceState("idle");
    }, 950);
  }

  function beginVoice() {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
    }
    recognitionRef.current = null;
    voiceSessionActiveRef.current = true;
    voiceStopRequestedRef.current = false;
    voiceTranscriptRef.current = "";
    setTool("voice");
    setSelection(null);
    setVoiceOpen(true);
    setVoiceDraft("");
    setVoiceMessage("");
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      voiceSessionActiveRef.current = false;
      setVoiceState("unsupported");
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = window.navigator.language || "en-GB";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setVoiceState("listening");
      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const text = event.results[index][0]?.transcript ?? "";
          if (event.results[index].isFinal) finalText += ` ${text}`;
          else interimText += ` ${text}`;
        }
        if (finalText.trim()) voiceTranscriptRef.current = `${voiceTranscriptRef.current} ${finalText}`.trim();
        const combined = `${voiceTranscriptRef.current} ${interimText}`.trim();
        if (combined) setVoiceDraft(combined);
        if (/\b(?:stop|done|finished|finish)\b[.!?]*\s*$/i.test(combined)) {
          voiceTranscriptRef.current = combined.replace(/\s*\b(?:stop|done|finished|finish)\b[.!?]*\s*$/i, "").trim();
          setVoiceDraft(voiceTranscriptRef.current);
          voiceStopRequestedRef.current = true;
          voiceSessionActiveRef.current = false;
          setVoiceState("processing");
          recognition.stop();
        }
      };
      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          voiceSessionActiveRef.current = false;
          setVoiceState("denied");
          setVoiceMessage("");
        } else if (event.error === "no-speech") {
          setVoiceState("listening");
        } else if (event.error !== "aborted") {
          voiceSessionActiveRef.current = false;
          setVoiceState("error");
          setVoiceMessage("I couldn’t hear that clearly.");
        }
      };
      recognition.onend = () => {
        if (voiceStopRequestedRef.current) {
          voiceStopRequestedRef.current = false;
          window.setTimeout(() => createPersonFromPhrase(voiceTranscriptRef.current), 260);
          return;
        }
        if (voiceSessionActiveRef.current) {
          window.setTimeout(() => {
            if (!voiceSessionActiveRef.current) return;
            try { recognition.start(); } catch {
              setVoiceState("error");
              setVoiceMessage("Listening paused. Tap “Listen again” to continue.");
            }
          }, 220);
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setVoiceState("error");
      setVoiceMessage("The microphone couldn’t start. You can type the phrase below.");
    }
  }

  function finishVoiceCapture() {
    if (!voiceDraft.trim()) {
      setVoiceState("error");
      setVoiceMessage("I haven’t heard a description yet.");
      return;
    }
    voiceTranscriptRef.current = voiceDraft.trim();
    voiceStopRequestedRef.current = true;
    voiceSessionActiveRef.current = false;
    setVoiceState("processing");
    if (voiceState === "listening" && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {
        voiceStopRequestedRef.current = false;
        window.setTimeout(() => createPersonFromPhrase(voiceTranscriptRef.current), 220);
      }
    } else {
      voiceStopRequestedRef.current = false;
      window.setTimeout(() => createPersonFromPhrase(voiceTranscriptRef.current), 220);
    }
  }

  function closeVoice() {
    voiceSessionActiveRef.current = false;
    voiceStopRequestedRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
    }
    recognitionRef.current = null;
    setVoiceOpen(false);
    setVoiceState("idle");
    setTool("select");
  }

  function addGroup(name: string, color: Accent) {
    const group: Group = { id: createId("group"), name, color, x: 340, y: 220, width: 600, height: 360 };
    commitGraph({ ...graph, groups: [...graph.groups, group] });
    setDialog(null); setTool("select"); setSelection({ kind: "group", id: group.id }); setToast(`${name} group added`);
  }

  function addNote(text: string, color: Accent) {
    const now = new Date().toISOString();
    const note: CanvasNote = { id: createId("note"), text, color, x: 870, y: 400, width: 155, height: 118, createdAt: now, updatedAt: now };
    commitGraph({ ...graph, notes: [...graph.notes, note] });
    setDialog(null); setTool("select"); setSelection({ kind: "note", id: note.id }); setToast("Note pinned");
  }

  function connectPeople(sourceId: string, targetId: string, type: RelationshipType, labels: string[], introducedByPersonId: string, strength: RelationshipStrength, direction: RelationshipDirection) {
    const now = new Date().toISOString();
    const existing = graph.relationships.find((item) => (item.sourceId === sourceId && item.targetId === targetId) || (item.sourceId === targetId && item.targetId === sourceId));
    const label = labels[0] ?? relationshipLabels[type];
    const relationship: Relationship = existing ? { ...existing, sourceId, targetId, type, label, labels: [...new Set([...existing.labels, ...labels])], semantic: label, strength, direction, introducedByPersonId, updatedAt: now } : { id: createId("relationship"), sourceId, targetId, ...relationshipFields(type, label), labels, strength, direction, introducedByPersonId, createdAt: now, updatedAt: now };
    commitGraph({ ...graph, relationships: existing ? graph.relationships.map((item) => item.id === existing.id ? relationship : item) : [...graph.relationships, relationship] });
    setPendingConnection(null); setConnectStart(""); setTool("select"); setSelection({ kind: "relationship", id: relationship.id }); setToast("Thread drawn");
  }

  function applyComposeDraft(draft: ComposeDraft) {
    const result = applyComposeDraftToGraph(draft, graph, project.category);
    if (result.error) { setToast(`${result.error} Nothing was changed.`); return; }
    commitGraph(result.graph);
    setComposeDraft(null); setComposeOpen(false); setTool("select"); setHighlightIds([]); setHighlightRelationshipIds([]); setHighlightReportingEdges([]);
    setToast(`${result.operations.length} ${result.operations.length === 1 ? "change" : "changes"} applied · Undo is available`);
    if (project.category === "business" && result.operations.some((operation) => operation.type === "SET_MANAGER")) setViewMode("organisation");
  }

  function askCompose(question: string, resolutions: Record<string, string> = {}): AskResponse {
    const result = answerGraphQuestion(question, graph, { selectedPersonId: selection?.kind === "person" ? selection.id : "", resolutions, category: project.category });
    if (result.status === "error") { setToast(result.message); return result; }
    if (result.status === "clarification") return result;
    setHighlightIds(result.personIds);
    setHighlightRelationshipIds(result.relationshipIds);
    setHighlightReportingEdges(result.reportingEdges.map((edge) => edge.key));
    setHighlightAnswer(`${result.label}: ${result.answer}`);
    if (project.category === "business" && result.reportingEdges.length && !result.relationshipIds.length) setViewMode("organisation");
    setToast(result.answer);
    return result;
  }

  function handlePersonActivate(person: Person) {
    if (tool === "erase") {
      if (!person.isSelf) setDeleteSelection({ kind: "person", id: person.id });
      return;
    }
    if (tool === "connect") {
      if (!connectStart) { setConnectStart(person.id); setToast(`Now choose who ${person.name} connects to`); return; }
      if (connectStart === person.id) { setConnectStart(""); return; }
      setPendingConnection({ sourceId: connectStart, targetId: person.id });
      return;
    }
    setSelection({ kind: "person", id: person.id });
  }

  function startItemDrag(event: ReactPointerEvent, kind: "person" | "note" | "group", item: Person | CanvasNote | Group) {
    if (tool !== "select") return;
    event.stopPropagation();
    dragRef.current = { kind, id: item.id, startX: event.clientX, startY: event.clientY, originX: item.x, originY: item.y, zoom: graph.viewport.zoom, snapshot: graph, moved: false };
    setDraggingId(item.id);
  }

  function startResize(event: ReactPointerEvent, kind: ResizeKind, id: string, x: number, y: number, width: number, height: number, direction: ResizeDirection) {
    if (tool !== "select") return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { kind, id, direction, startX: event.clientX, startY: event.clientY, originX: x, originY: y, originWidth: width, originHeight: height, zoom: graph.viewport.zoom, snapshot: graph, moved: false };
    setSelection({ kind, id });
    setResizingId(id);
  }

  useEffect(() => {
    function move(event: PointerEvent) {
      if (touchPointsRef.current.has(event.pointerId)) {
        touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = [...touchPointsRef.current.values()];
        if (points.length >= 2 && pinchRef.current) {
          const [a, b] = points;
          const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
          const centerX = (a.x + b.x) / 2; const centerY = (a.y + b.y) / 2;
          const base = pinchRef.current;
          const zoom = Math.min(2.4, Math.max(.25, base.viewport.zoom * (distance / base.distance)));
          const worldX = (base.centerX - base.viewport.x) / base.viewport.zoom;
          const worldY = (base.centerY - base.viewport.y) / base.viewport.zoom;
          setGraph((current) => ({ ...current, viewport: { zoom, x: centerX - worldX * zoom, y: centerY - worldY * zoom } }));
          return;
        }
      }
      const resize = resizeRef.current;
      if (resize) {
        const screenDeltaX = event.clientX - resize.startX;
        const screenDeltaY = event.clientY - resize.startY;
        const dx = screenDeltaX / resize.zoom;
        const dy = screenDeltaY / resize.zoom;
        if (Math.abs(dx) + Math.abs(dy) > 2) resize.moved = true;
        const nextSize = (minWidth: number, minHeight: number, maxWidth?: number, maxHeight?: number) => resizeCanvasRect({ x: resize.originX, y: resize.originY, width: resize.originWidth, height: resize.originHeight, direction: resize.direction, screenDeltaX, screenDeltaY, zoom: resize.zoom, minWidth, minHeight, maxWidth, maxHeight });
        if (resize.kind === "person") {
          const size = nextSize(108, 130, 260, 320);
          setGraph((current) => ({ ...current, people: current.people.map((person) => person.id === resize.id ? { ...person, ...size } : person) }));
        } else if (resize.kind === "note") {
          const size = nextSize(110, 80, 360, 300);
          setGraph((current) => ({ ...current, notes: current.notes.map((note) => note.id === resize.id ? { ...note, ...size } : note) }));
        } else {
          const size = nextSize(MIN_GROUP_WIDTH, MIN_GROUP_HEIGHT);
          setGraph((current) => ({ ...current, groups: current.groups.map((group) => group.id === resize.id ? { ...group, ...size } : group) }));
        }
        return;
      }
      const drag = dragRef.current;
      if (drag) {
        const dx = (event.clientX - drag.startX) / drag.zoom;
        const dy = (event.clientY - drag.startY) / drag.zoom;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        setGraph((current) => drag.kind === "person"
          ? { ...current, people: current.people.map((person) => person.id === drag.id ? { ...person, x: drag.originX + dx, y: drag.originY + dy } : person) }
          : drag.kind === "note"
            ? { ...current, notes: current.notes.map((note) => note.id === drag.id ? { ...note, x: drag.originX + dx, y: drag.originY + dy } : note) }
            : { ...current, groups: current.groups.map((group) => group.id === drag.id ? { ...group, x: drag.originX + dx, y: drag.originY + dy } : group) });
      }
      const pan = panRef.current;
      if (pan) setGraph((current) => ({ ...current, viewport: { ...current.viewport, x: pan.originX + event.clientX - pan.startX, y: pan.originY + event.clientY - pan.startY } }));
    }
    function up(event: PointerEvent) {
      touchPointsRef.current.delete(event.pointerId);
      if (touchPointsRef.current.size < 2) pinchRef.current = null;
      const resize = resizeRef.current;
      if (resize?.moved) { setPast((items) => [...items.slice(-29), resize.snapshot]); setFuture([]); }
      const drag = dragRef.current;
      if (drag?.moved) { setPast((items) => [...items.slice(-29), drag.snapshot]); setFuture([]); }
      resizeRef.current = null; dragRef.current = null; panRef.current = null; setDraggingId(""); setResizingId("");
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  function startPan(event: ReactPointerEvent<HTMLElement>) {
    if (tool !== "select") return;
    const target = event.target as HTMLElement;
    if (target.closest(".canvas-person, .canvas-note, .group-boundary, .connection, button, input, textarea, select, a")) return;
    setSelection(null);
    if (event.pointerType === "touch") {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture(event.pointerId);
      const points = [...touchPointsRef.current.values()];
      if (points.length >= 2) {
        const [a, b] = points;
        pinchRef.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2, viewport: { ...graph.viewport } };
        panRef.current = null;
        return;
      }
    }
    panRef.current = { startX: event.clientX, startY: event.clientY, originX: graph.viewport.x, originY: graph.viewport.y };
  }

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (!canvasRef.current) return;
    const isPinch = event.ctrlKey || event.metaKey;
    const isCoarseWheel = event.deltaMode !== 0 || (Math.abs(event.deltaX) < 1 && Math.abs(event.deltaY) >= 48);
    if (!isPinch && !isCoarseWheel) {
      updateWithoutHistory((current) => ({ ...current, viewport: { ...current.viewport, x: current.viewport.x - event.deltaX, y: current.viewport.y - event.deltaY } }));
      return;
    }
    const bounds = canvasRef.current.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const factor = Math.exp(-event.deltaY * (isPinch ? .007 : .0016));
    updateWithoutHistory((current) => {
      const oldZoom = current.viewport.zoom;
      const zoom = Math.min(2.4, Math.max(.25, oldZoom * factor));
      const worldX = (pointerX - current.viewport.x) / oldZoom;
      const worldY = (pointerY - current.viewport.y) / oldZoom;
      return {
        ...current,
        viewport: {
          zoom,
          x: pointerX - worldX * zoom,
          y: pointerY - worldY * zoom,
        },
      };
    });
  }, [updateWithoutHistory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel, loaded]);

  function setZoom(next: number) {
    updateWithoutHistory((current) => {
      const zoom = Math.min(2.4, Math.max(.25, next));
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return { ...current, viewport: { ...current.viewport, zoom } };
      const centerX = bounds.width / 2; const centerY = bounds.height / 2;
      const worldX = (centerX - current.viewport.x) / current.viewport.zoom; const worldY = (centerY - current.viewport.y) / current.viewport.zoom;
      return { ...current, viewport: { zoom, x: centerX - worldX * zoom, y: centerY - worldY * zoom } };
    });
  }

  function fitCurrentView() {
    if (!canvasRef.current || !graph.people.length) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const visibleOrgPeople = graph.people.filter((person) => orgPositions.has(person.id));
    const lefts = viewMode === "organisation" ? visibleOrgPeople.map((person) => orgPositions.get(person.id)!.x) : [...graph.people.map((person) => person.x), ...graph.notes.map((note) => note.x), ...graph.groups.map((group) => group.x)];
    const tops = viewMode === "organisation" ? visibleOrgPeople.map((person) => orgPositions.get(person.id)!.y) : [...graph.people.map((person) => person.y), ...graph.notes.map((note) => note.y), ...graph.groups.map((group) => group.y)];
    const rights = viewMode === "organisation" ? visibleOrgPeople.map((person) => orgPositions.get(person.id)!.x + 164) : [...graph.people.map((person) => person.x + personWidth(person)), ...graph.notes.map((note) => note.x + noteWidth(note)), ...graph.groups.map((group) => group.x + group.width)];
    const bottoms = viewMode === "organisation" ? visibleOrgPeople.map((person) => orgPositions.get(person.id)!.y + 145) : [...graph.people.map((person) => person.y + personHeight(person)), ...graph.notes.map((note) => note.y + noteHeight(note)), ...graph.groups.map((group) => group.y + group.height)];
    if (!lefts.length) return;
    const rects = lefts.map((x, index) => ({ x, y: tops[index], width: rights[index] - x, height: bottoms[index] - tops[index] }));
    const viewport = calculateFitViewport(rects, bounds.width, bounds.height);
    if (viewport) updateWithoutHistory((current) => ({ ...current, viewport }));
  }

  function deleteNow(target: Selection = deleteSelection) {
    if (!target) return;
    let next = graph;
    if (target.kind === "person") next = { ...graph, people: graph.people.filter((item) => item.id !== target.id).map((item) => item.reportsToPersonId === target.id ? { ...item, reportsToPersonId: "" } : item), relationships: graph.relationships.filter((item) => item.sourceId !== target.id && item.targetId !== target.id).map((item) => item.introducedByPersonId === target.id ? { ...item, introducedByPersonId: "", updatedAt: new Date().toISOString() } : item) };
    if (target.kind === "relationship") next = { ...graph, relationships: graph.relationships.filter((item) => item.id !== target.id) };
    if (target.kind === "note") next = { ...graph, notes: graph.notes.filter((item) => item.id !== target.id) };
    if (target.kind === "group") next = { ...graph, groups: graph.groups.filter((item) => item.id !== target.id), people: graph.people.map((person) => { const groupIds = person.groupIds.filter((id) => id !== target.id); return groupIds.length === person.groupIds.length ? person : { ...person, groupIds, groupId: groupIds[0] ?? "" }; }) };
    commitGraph(next); setSelection(null); setDeleteSelection(null); setToast("Removed from your sketch");
  }

  function requestDelete(target: Selection = selection) {
    if (!target) return;
    if (target.kind === "person") {
      const person = graph.people.find((item) => item.id === target.id);
      if (person?.isSelf) return;
      setDeleteSelection(target);
      return;
    }
    deleteNow(target);
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if (event.key === "Escape") { setDialog(null); setSelection(null); setConnectStart(""); setPendingConnection(null); setProjectMenuOpen(false); setComposeOpen(false); setComposeDraft(null); closeVoice(); }
      if (isTyping) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection) requestDelete(selection);
      if (event.key === "+" || event.key === "=") setZoom(graph.viewport.zoom + .1);
      if (event.key === "-") setZoom(graph.viewport.zoom - .1);
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const deletingPerson = deleteSelection?.kind === "person" ? graph.people.find((person) => person.id === deleteSelection.id) : undefined;
  const deletingConnections = deletingPerson ? graph.relationships.filter((item) => item.sourceId === deletingPerson.id || item.targetId === deletingPerson.id).length : 0;

  if (!loaded) {
    return <main className="canvas-shell loading-canvas"><div className="loading-paper"><BrandMark /><span>Opening your sketch…</span></div></main>;
  }

  return (
    <main className="canvas-shell app-canvas-shell">
      <header className="canvas-topbar">
        <div className="canvas-brand-project">
          <button className="brand brand-button" onClick={() => void leaveCanvas()} aria-label="Back to projects"><BrandMark /><span className="brand-name">Circa<sup>beta</sup></span></button>
          <button className="project-current" onClick={() => setProjectMenuOpen((value) => !value)} aria-expanded={projectMenuOpen}><span>{displayCategory(project.category, project.customCategoryName)}</span><strong>{project.name}</strong><i>⌄</i></button>
          {project.category === "business" && <div className="view-switcher" aria-label="Business project view"><button title="Relationships, contacts and introductions" className={viewMode === "network" ? "active" : ""} onClick={() => setViewMode("network")}>Connections</button><button title="Roles, teams and reporting lines" className={viewMode === "organisation" ? "active" : ""} onClick={() => { setViewMode("organisation"); setTool("select"); }}>Org Chart</button></div>}
          {projectMenuOpen && <div className="project-switcher-panel">
            <span className="form-kicker">Project settings</span>
            <label>Project name<input maxLength={80} defaultValue={project.name} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (!value) { event.currentTarget.value = project.name; setToast("Project name can't be empty."); } else if (value !== project.name) onUpdateProject({ name: value }); }} /></label>
            <label>Category<select value={project.category} onChange={(event) => { const category = event.target.value as ProjectCategory; setViewMode("network"); if (category === "other" && !project.customCategoryName.trim()) { const custom = window.prompt("Describe what this Project maps.", ""); if (!custom?.trim()) { event.currentTarget.value = project.category; setToast("Describe what this Project maps before choosing Other."); return; } onUpdateProject({ category, customCategoryName: custom.trim().slice(0, 80) }); return; } onUpdateProject({ category }); }}>{(Object.keys(projectTemplates) as ProjectCategory[]).map((category) => <option key={category} value={category}>{projectTemplates[category].label}</option>)}</select></label>
            {project.category === "other" && <label>What you’re mapping<input maxLength={80} defaultValue={project.customCategoryName} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (!value) { event.currentTarget.value = project.customCategoryName; setToast("Describe what this Project maps."); } else if (value !== project.customCategoryName) onUpdateProject({ customCategoryName: value }); }} /></label>}
            <div className="switcher-projects"><small>Switch project</small>{projects.map((item) => <button key={item.id} className={item.id === project.id ? "active" : ""} onClick={() => { setProjectMenuOpen(false); void openProject(item.id); }}><span>{projectTemplates[item.category].icon}</span><div><strong>{item.name}</strong><small>{displayCategory(item.category, item.customCategoryName)}</small></div></button>)}</div>
            <button className="new-project-inline" onClick={() => void newProject()}>＋ New project</button>
          </div>}
        </div>
        <div className={`canvas-status ${saveStatus}`}><span className="saved-dot" />{saveStatus === "loading" ? "Opening…" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save issue" : "Saved locally"}</div>
        <div className="top-actions">
          <button onClick={undo} disabled={!past.length} title="Undo">↶ <span>Undo</span></button>
          <button onClick={redo} disabled={!future.length} title="Redo">↷ <span>Redo</span></button>
          <div className="more-wrap"><button className="more-button" onClick={() => setMoreMenuOpen((value) => !value)} title="More project actions" aria-label="More project actions" aria-expanded={moreMenuOpen}>•••</button>{moreMenuOpen && <div className="more-menu"><button onClick={() => void exportBackup()}>Export workspace backup</button><button onClick={() => backupInputRef.current?.click()}>Restore backup…</button><button className="danger-link" onClick={() => { setMoreMenuOpen(false); setDialog("reset"); }}>Reset this sketch…</button></div>}<input ref={backupInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = ""; }} /></div>
          <button onClick={() => void leaveCanvas()} className="button button-small button-outline">Done</button>
        </div>
      </header>

      <ToolRail tool={tool} viewMode={viewMode} onChoose={chooseTool} />

      <section
        className={`infinite-canvas tool-${tool} view-${viewMode}`}
        aria-label="Relationship sketch canvas"
        ref={canvasRef}
        onPointerDown={startPan}
      >
        {viewMode === "network" && graph.people.length === 1 && <div className="empty-guidance"><p><span>✦</span> Start here - this is you.</p><button onClick={() => setDialog("add")}><b>＋</b><strong>{template.emptyHint}</strong><small>Begin with one person.</small></button>{project.category === "business" && <button className="sample-link compose-empty-link" onClick={() => { setComposeOpen(true); setTool("compose"); }}>✦ Describe organisation</button>}</div>}
        {viewMode === "organisation" && !graph.people.some((person) => person.includeInOrgChart && person.reportsToPersonId) && !composeDraft?.people.some((person) => person.selected && person.fieldPatches?.manager?.action === "set") && <div className="organisation-empty"><span>⌁</span><h2>No reporting structure yet.</h2><p>Add an employee, describe a structure with Compose, or import CSV.</p><div><button className="button button-dark" onClick={() => { setDialog("add"); setTool("add"); }}>Add employee</button><button className="button button-paper" onClick={() => { setComposeOpen(true); setTool("compose"); }}>✦ Compose / CSV</button></div></div>}
        {graph.people.length === 2 && !graph.onboardingComplete && <p className="context-hint">Nice. Drag the card anywhere you like.</p>}
        {tool === "connect" && <div className="mode-banner">{connectStart ? "Choose the second person" : "Choose the first person"}<button onClick={() => { setTool("select"); setConnectStart(""); }}>Cancel</button></div>}
        {highlightIds.length > 0 && <div className="highlight-banner"><span>{highlightAnswer}</span><button onClick={() => { setHighlightIds([]); setHighlightRelationshipIds([]); setHighlightReportingEdges([]); setHighlightAnswer(""); }}>Clear view</button></div>}

        {viewMode === "organisation" && orgCompanies.length >= 2 && <div className="org-filter"><label>Company<select value={orgCompany} onChange={(event) => setOrgCompany(event.target.value)}><option value="">All companies</option>{orgCompanies.map((company) => <option key={company}>{company}</option>)}</select></label></div>}
        <div className="workspace-transform" style={{ width: workspaceWidth, height: workspaceHeight, transform: `translate(${graph.viewport.x}px, ${graph.viewport.y}px) scale(${graph.viewport.zoom})`, "--canvas-zoom": graph.viewport.zoom } as CSSProperties}>
          {viewMode === "network" && graph.groups.map((group) => <div
            key={group.id}
            className={`group-boundary ${group.color}${selection?.kind === "group" && selection.id === group.id ? " selected" : ""}${resizingId === group.id ? " resizing" : ""}${draggingId === group.id ? " dragging" : ""}`}
            style={{ left: group.x, top: group.y, width: group.width, height: group.height }}
            onPointerDown={(event) => { event.stopPropagation(); setSelection({ kind: "group", id: group.id }); startItemDrag(event, "group", group); }}
            onClick={(event) => { event.stopPropagation(); setSelection({ kind: "group", id: group.id }); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelection({ kind: "group", id: group.id }); }}
            role="button"
            tabIndex={0}
            aria-label={`${group.name} group`}
          ><span className="group-label">{group.name}</span><ResizeHandles label={`${group.name} group`} onStart={(event, direction) => startResize(event, "group", group.id, group.x, group.y, group.width, group.height, direction)} /></div>)}

          <svg className={`connection-layer${viewMode === "organisation" ? " organisation-connections" : ""}`} width={workspaceWidth} height={workspaceHeight} aria-label="Relationship threads">
            <defs><marker id="thread-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
            {viewMode === "network" && graph.relationships.map((relationship) => {
              const source = graph.people.find((person) => person.id === relationship.sourceId);
              const target = graph.people.find((person) => person.id === relationship.targetId);
              if (!source || !target) return null;
              const path = pathFor(source, target);
              const selected = selection?.kind === "relationship" && selection.id === relationship.id;
              const highlighted = !highlightIds.length || highlightRelationshipIds.includes(relationship.id);
              const fullLabel = relationship.labels.join(" · ");
              const label = fullLabel.length > 34 ? `${relationship.labels[0]}${relationship.labels.length > 1 ? ` +${relationship.labels.length - 1}` : "..."}` : fullLabel;
              const via = relationship.introducedByPersonId ? ` · via ${graph.people.find((person) => person.id === relationship.introducedByPersonId)?.name ?? "someone"}` : "";
              return <g key={relationship.id} className={`connection ${relationship.type} strength-${relationship.strength}${selected ? " selected" : ""}${highlighted ? "" : " faded"}`} role="button" tabIndex={0} aria-label={`${source.name} and ${target.name}: ${fullLabel}${via}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelection({ kind: "relationship", id: relationship.id }); }} onClick={(event) => { event.stopPropagation(); if (tool === "erase") deleteNow({ kind: "relationship", id: relationship.id }); else setSelection({ kind: "relationship", id: relationship.id }); }}>
                <path className="connection-hit" d={path} />
                <path className="connection-visible" d={path} markerEnd={relationship.direction === "source-to-target" ? "url(#thread-arrow)" : undefined} markerStart={relationship.direction === "target-to-source" ? "url(#thread-arrow)" : undefined} />
                <text className="connection-label"><textPath href={`#label-${relationship.id}`} startOffset="50%" textAnchor="middle">{label}{via}</textPath></text>
                <path id={`label-${relationship.id}`} d={path} fill="none" stroke="none" />
              </g>;
            })}
            {viewMode === "organisation" && graph.people.filter((person) => orgPositions.has(person.id) && person.reportsToPersonId && orgPositions.has(person.reportsToPersonId)).map((person) => {
              const source = orgPositions.get(person.reportsToPersonId)!;
              const target = orgPositions.get(person.id)!;
              const highlighted = !highlightIds.length || highlightReportingEdges.includes(`reports:${person.id}:${person.reportsToPersonId}`);
              return <g key={`org-${person.id}`} className={`connection professional organisation-line${highlighted ? "" : " faded"}`}><path className="connection-visible" d={organisationPath(source, target)} /><text x={target.x + 90} y={target.y - 8}>reports to</text></g>;
            })}
            {composeDraft && viewMode === "organisation" && composeDraft.people.filter((person) => person.selected && person.fieldPatches?.manager?.action === "set").map((person) => {
              const source = composePreviewPositions.get(String(person.fieldPatches?.manager?.value ?? ""));
              const target = composePreviewPositions.get(person.ref);
              if (!source || !target) return null;
              return <path key={`draft-report-${person.id}`} className="draft-thread" d={organisationPath(source, target)} />;
            })}
            {composeDraft && viewMode === "network" && composeDraft.relationships.filter((relationship) => relationship.selected).map((relationship) => {
              const source = composePreviewPositions.get(relationship.sourceRef); const target = composePreviewPositions.get(relationship.targetRef);
              if (!source || !target) return null;
              const d = `M ${source.x + 68} ${source.y + 82} C ${source.x + 110} ${source.y + 35}, ${target.x - 42} ${target.y + 125}, ${target.x + 68} ${target.y + 82}`;
              return <g key={`draft-relationship-${relationship.id}`} className="draft-relationship"><path className="draft-thread" d={d} /><text x={(source.x + target.x) / 2 + 68} y={(source.y + target.y) / 2 + 72}>{relationship.labels.join(" · ")}</text></g>;
            })}
          </svg>

          {viewMode === "network" && graph.notes.map((note) => <article
            key={note.id}
            className={`canvas-note ${note.color}${selection?.kind === "note" && selection.id === note.id ? " selected" : ""}${draggingId === note.id ? " dragging" : ""}${resizingId === note.id ? " resizing" : ""}`}
            style={{ left: note.x, top: note.y, width: noteWidth(note), height: noteHeight(note) }}
            onPointerDown={(event) => startItemDrag(event, "note", note)}
            onClick={(event) => { event.stopPropagation(); if (tool === "erase") deleteNow({ kind: "note", id: note.id }); else setSelection({ kind: "note", id: note.id }); }}
            tabIndex={0}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelection({ kind: "note", id: note.id }); }}
            aria-label={`Note: ${note.text}`}
          ><span className="note-tape" /><p>{note.text}</p><small>note</small><ResizeHandles label="note" onStart={(event, direction) => startResize(event, "note", note.id, note.x, note.y, noteWidth(note), noteHeight(note), direction)} /></article>)}

          {graph.people.filter((person) => viewMode === "network" || orgPositions.has(person.id)).map((person) => (
            <article
              key={person.id}
              className={`canvas-person ${person.accent}${person.isSelf ? " self" : ""}${viewMode === "organisation" ? " organisation-card" : ""}${highlightIds.length && !highlightIds.includes(person.id) ? " answer-faded" : ""}${highlightIds.includes(person.id) ? " answer-highlight" : ""}${selection?.kind === "person" && selection.id === person.id ? " selected" : ""}${connectStart === person.id ? " connect-source" : ""}${draggingId === person.id ? " dragging" : ""}${resizingId === person.id ? " resizing" : ""}`}
              style={{ left: viewMode === "organisation" ? orgPositions.get(person.id)?.x : person.x, top: viewMode === "organisation" ? orgPositions.get(person.id)?.y : person.y, width: viewMode === "organisation" ? 164 : personWidth(person), height: viewMode === "organisation" ? 145 : personHeight(person) }}
              onPointerDown={(event) => viewMode === "organisation" ? (event.stopPropagation(), setSelection({ kind: "person", id: person.id })) : startItemDrag(event, "person", person)}
              onClick={(event) => { event.stopPropagation(); if (!dragRef.current?.moved) handlePersonActivate(person); }}
              onContextMenu={(event) => { event.preventDefault(); setSelection({ kind: "person", id: person.id }); }}
              tabIndex={0}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handlePersonActivate(person); }}
              aria-label={`${person.name}${person.isSelf ? ", you" : ""}`}
            >
              {person.isSelf ? <span className="pin" /> : <span className="paper-tape" />}
              <div className="card-avatar">{initials(person.name)}</div>
              <strong>{person.name || "Unnamed"}</strong>
              <small>{cardDetail(person, project.category, graph.groups, viewMode === "organisation")}</small>
              {person.isSelf && <span className="you-label">you</span>}
              <div className="card-actions"><button onClick={(event) => { event.stopPropagation(); setSelection({ kind: "person", id: person.id }); }} aria-label={`Edit ${person.name}`}>✎</button>{viewMode === "network" ? <button onClick={(event) => { event.stopPropagation(); setTool("connect"); setConnectStart(person.id); }} aria-label={`Connect ${person.name}`}>⌁</button> : graph.people.some((item) => item.reportsToPersonId === person.id) ? <button onClick={(event) => { event.stopPropagation(); setCollapsedOrgIds((ids) => ids.includes(person.id) ? ids.filter((id) => id !== person.id) : [...ids, person.id]); }} aria-label={`${collapsedOrgIds.includes(person.id) ? "Expand" : "Collapse"} ${person.name}'s reports`}>{collapsedOrgIds.includes(person.id) ? "＋" : "−"}</button> : null}</div>
              {viewMode === "network" && <ResizeHandles label={person.name} onStart={(event, direction) => startResize(event, "person", person.id, person.x, person.y, personWidth(person), personHeight(person), direction)} />}
            </article>
          ))}

          {composeDraft?.people.filter((person) => person.selected && (viewMode === "network" || orgPositions.has(person.ref))).map((person) => { const point = composePreviewPositions.get(person.ref) ?? { x: person.x, y: person.y }; return <article key={person.id} className={`canvas-person draft-person ${accentForDraft(composeDraft.people.indexOf(person))}${viewMode === "organisation" ? " organisation-card" : ""}`} style={{ left: point.x, top: point.y, width: viewMode === "organisation" ? 164 : 134, height: viewMode === "organisation" ? 145 : 164 }} aria-label={`${person.name} draft person`}><span className="draft-label">Draft</span><div className="card-avatar">{initials(person.name)}</div><strong>{person.name || "Needs a name"}</strong><small>{person.role || person.relationshipLabel || "Proposed person"}</small></article>; })}
        </div>
      </section>

      <div className="zoom-controls" aria-label="Canvas zoom controls"><button onClick={() => setZoom(graph.viewport.zoom - .1)} aria-label="Zoom out">−</button><span>{Math.round(graph.viewport.zoom * 100)}%</span><button onClick={() => setZoom(graph.viewport.zoom + .1)} aria-label="Zoom in">＋</button><button onClick={fitCurrentView}>Fit</button></div>
      <div className="canvas-legend">{viewMode === "network" ? (project.category === "business" ? <span><i className="friend" /> Line weight shows connection strength</span> : project.category === "personal" ? <><span><i className="very-close" /> Very close</span><span><i className="friend" /> Regular</span><span><i className="acquaintance" /> Light</span></> : <span><i className="friend" /> Threads show stored connections</span>) : <><span><i className="professional" /> Reports to</span><span>Click − to collapse a branch</span></>}</div>
      <div className="canvas-nav-tip" aria-hidden="true"><span>↔</span> Grab empty space to move <i /> {viewMode === "network" ? "Select an item and pull its edge to resize" : "Organisation layout follows reporting lines"} <i /> Scroll or pinch to zoom</div>
      {toast && <div className="quiet-toast" role="status">{toast}</div>}

      <DetailsPanel
        selection={selection}
        graph={graph}
        category={project.category}
        relationshipOptions={relationshipOptions}
        onClose={() => { finishDetailsEdit(); setSelection(null); }}
        onUpdatePerson={(person) => {
          const proposed = graph.people.map((item) => item.id === person.id ? person : item);
          if (hasReportingCycle(proposed)) { setToast("That reporting line would create a cycle."); return; }
          updateWithoutHistory((current) => ({ ...current, people: current.people.map((item) => item.id === person.id ? { ...person, updatedAt: new Date().toISOString() } : item) }));
        }}
        onUpdateRelationship={(relationship) => updateWithoutHistory((current) => ({ ...current, relationships: current.relationships.map((item) => item.id === relationship.id ? { ...relationship, updatedAt: new Date().toISOString() } : item) }))}
        onUpdateNote={(note) => updateWithoutHistory((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? { ...note, updatedAt: new Date().toISOString() } : item) }))}
        onUpdateGroup={(group) => updateWithoutHistory((current) => ({ ...current, groups: current.groups.map((item) => item.id === group.id ? group : item) }))}
        onEditStart={startDetailsEdit}
        onEditEnd={finishDetailsEdit}
        onDelete={() => requestDelete(selection)}
      />

      {dialog === "add" && (viewMode === "organisation" ? <EmployeeDialog people={graph.people} onClose={() => { setDialog(null); setTool("select"); }} onAdd={addEmployee} /> : <AddDialog onClose={() => { setDialog(null); setTool("select"); }} onAdd={addPerson} onAddExisting={addExistingPerson} existingPeople={existingPeople} />)}
      {dialog === "group" && <SimpleCreateDialog kind="group" suggestions={template.suggestedGroups} onClose={() => { setDialog(null); setTool("select"); }} onCreate={addGroup} />}
      {dialog === "note" && <SimpleCreateDialog kind="note" onClose={() => { setDialog(null); setTool("select"); }} onCreate={addNote} />}
      {dialog === "reset" && <ConfirmDialog title="Reset your local sketch?" copy="This clears the people, threads, groups and notes saved on this device. This cannot be undone." action="Reset sketch" onClose={() => setDialog(null)} onConfirm={() => void resetSketch()} />}
      {dialog === "example" && <ConfirmDialog title="Load a sample sketch?" copy="This replaces the current blank sketch with clearly marked sample people so you can explore the tools." action="Load sample" onClose={() => setDialog(null)} onConfirm={() => { commitGraph(createExampleGraph()); setDialog(null); window.setTimeout(fitCurrentView, 50); }} />}
      {deleteSelection && deletingPerson && <ConfirmDialog title={`Remove ${deletingPerson.name} from “${project.name}”?`} copy={`This removes ${deletingPerson.name}'s project-specific connections, groups and notes here, including ${deletingConnections} ${deletingConnections === 1 ? "thread" : "threads"}. They remain in Circa's People directory and other Projects.`} action="Remove from project" onClose={() => setDeleteSelection(null)} onConfirm={() => deleteNow(deleteSelection)} />}
      {pendingConnection && <RelationshipChooser people={graph.people} {...pendingConnection} options={template.relationships} customLabels={project.customRelationshipLabels} onAddCustom={(label) => { if (!project.customRelationshipLabels.includes(label)) onUpdateProject({ customRelationshipLabels: [...project.customRelationshipLabels, label] }); }} onCancel={() => { setPendingConnection(null); setConnectStart(""); }} onChoose={(type, labels, introducedBy, strength, direction) => connectPeople(pendingConnection.sourceId, pendingConnection.targetId, type, labels, introducedBy, strength, direction)} />}
      {voiceOpen && <VoicePanel state={voiceState} draft={voiceDraft} message={voiceMessage} category={project.category} relationshipOptions={relationshipOptions} onDraftChange={setVoiceDraft} onRetry={beginVoice} onFinish={finishVoiceCapture} onUsePhrase={finishVoiceCapture} onClose={closeVoice} />}
      {composeOpen && <ComposePanel project={project} graph={graph} globalPeople={existingPeople} selectedPerson={selection?.kind === "person" ? graph.people.find((person) => person.id === selection.id) : undefined} onClose={() => { setComposeOpen(false); setComposeDraft(null); setTool("select"); }} onPreview={setComposeDraft} onApply={applyComposeDraft} onAsk={askCompose} />}
      {pendingRestore && restoreCurrent && <BackupRestoreDialog current={restoreCurrent} backup={pendingRestore} busy={restoreBusy} onClose={() => { if (!restoreBusy) { setPendingRestore(null); setRestoreCurrent(null); } }} onConfirm={() => void confirmRestore()} />}
      {pendingNavigation && <SaveRecoveryDialog message={saveFailure || "Circa could not save this change."} destination={pendingNavigation.destination} busy={saveRetryBusy} onStay={() => setPendingNavigation(null)} onExport={() => void downloadCurrentWorkspaceBackup().then(() => setToast("Recovery backup exported")).catch((error) => setToast(error instanceof Error ? error.message : "Backup export failed."))} onRetry={() => { setSaveRetryBusy(true); void flushPendingSave().then(() => { const run = pendingNavigation.run; setPendingNavigation(null); setSaveFailure(""); run(); }).catch((error) => setSaveFailure(error instanceof Error ? error.message : "Circa could not save this change.")).finally(() => setSaveRetryBusy(false)); }} />}
      {projectConflict && <div className="conflict-banner" role="alert"><div><strong>This Project changed in another tab.</strong><span>Choose explicitly: discard this tab’s edits, or overwrite the newer saved version.</span></div><button className="button button-paper" onClick={() => void reloadNewerProject()}>Discard this tab and load newer</button><button className="button button-dark" onClick={() => setOverwriteConflict(true)}>Overwrite newer with this tab</button></div>}
      {overwriteConflict && <ConfirmDialog title="Overwrite the newer Project?" copy="This intentionally replaces the newer edits saved in the other tab with the version currently on this screen." action="Overwrite newer Project" onClose={() => setOverwriteConflict(false)} onConfirm={() => void keepThisProjectVersion()} />}
    </main>
  );
}
