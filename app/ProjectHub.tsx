"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CircaFolder, CircaProject, createId, createInitialGraph, deleteGlobalPerson, GlobalPerson, parseWorkspaceBackup, ProjectCategory, serializeWorkspace, Workspace } from "./graphStore";
import { displayCategory, projectTemplates } from "./projectTemplates";

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /></span>;
}

function relativeDate(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 7) return `Updated ${days} days ago`;
  return `Updated ${new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

function ProjectMiniature({ project }: { project: CircaProject }) {
  const people = project.graph.people.filter((person) => !person.isSelf).slice(0, 3);
  return <div className="project-miniature" aria-hidden="true">
    {project.graph.relationships.length > 0 && <i className="mini-thread one" />}{project.graph.relationships.length > 1 && <i className="mini-thread two" />}
    <span className="mini-person self">Y</span>
    {people.map((person, index) => <span className={`mini-person p${index + 1}`} key={person.id}>{person.name.charAt(0).toUpperCase()}</span>)}
    {!people.length && <span className="mini-empty">blank canvas</span>}
  </div>;
}

type HubProps = {
  workspace: Workspace;
  view: "projects" | "people";
  onView: (view: "projects" | "people") => void;
  onChange: (workspace: Workspace) => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onHome: () => void;
  onRestoreWorkspace: (workspace: Workspace) => Promise<void>;
};

export function ProjectHub({ workspace, view, onView, onChange, onNewProject, onOpenProject, onHome, onRestoreWorkspace }: HubProps) {
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<"updated" | "name" | "created">("updated");
  const [folderDraft, setFolderDraft] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState("");
  const [folderRenameDraft, setFolderRenameDraft] = useState("");
  const [deleteProjectId, setDeleteProjectId] = useState("");
  const [deleteFolderId, setDeleteFolderId] = useState("");
  const [deletePersonId, setDeletePersonId] = useState("");
  const [openPersonId, setOpenPersonId] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [restoreDraft, setRestoreDraft] = useState<Workspace | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [assignPersonId, setAssignPersonId] = useState("");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const activeModal = deleteProjectId || deleteFolderId || deletePersonId || openPersonId || (restoreDraft ? "restore" : "") || assignPersonId;

  useEffect(() => {
    if (!activeModal) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = modalRef.current;
    const focusable = () => [...(node?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    window.setTimeout(() => (focusable()[0] ?? node)?.focus(), 0);
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { setDeleteProjectId(""); setDeleteFolderId(""); setDeletePersonId(""); setOpenPersonId(""); setRestoreDraft(null); setAssignPersonId(""); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) { event.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); window.setTimeout(() => previous?.focus(), 0); };
  }, [activeModal]);

  function update(next: Workspace) {
    onChange({ ...next, updatedAt: new Date().toISOString() });
  }

  function createFolder(event: FormEvent) {
    event.preventDefault();
    if (!folderDraft.trim()) return;
    const now = new Date().toISOString();
    update({ ...workspace, folders: [...workspace.folders, { id: createId("folder"), name: folderDraft.trim(), createdAt: now, updatedAt: now }] });
    setFolderDraft("");
  }

  function deleteFolder(folder: CircaFolder) {
    update({ ...workspace, folders: workspace.folders.filter((item) => item.id !== folder.id), projects: workspace.projects.map((project) => project.folderId === folder.id ? { ...project, folderId: "" } : project) });
    if (folderId === folder.id) setFolderId("all");
  }

  function patchProject(projectId: string, patch: Partial<CircaProject>) {
    update({ ...workspace, projects: workspace.projects.map((project) => project.id === projectId ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project) });
  }

  const projects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workspace.projects
      .filter((project) => project.archived === showArchived)
      .filter((project) => folderId === "all" || project.folderId === folderId)
      .filter((project) => !normalized || project.name.toLowerCase().includes(normalized) || displayCategory(project.category, project.customCategoryName).toLowerCase().includes(normalized))
      .sort((a, b) => {
        if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [workspace.projects, query, folderId, showArchived, sort]);

  const people = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workspace.globalPeople.filter((person) => !normalized || `${person.name} ${person.email} ${person.phone}`.toLowerCase().includes(normalized));
  }, [workspace.globalPeople, query]);

  const appearanceNames = (person: GlobalPerson) => workspace.projects.filter((project) => project.graph.people.some((item) => item.globalId === person.id)).map((project) => project.name);

  function exportBackup() {
    const blob = new Blob([serializeWorkspace(workspace)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `circa-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
    setWorkspaceMenuOpen(false); setWorkspaceMessage("Workspace backup exported");
  }

  async function chooseBackup(file: File) {
    try { setRestoreDraft(parseWorkspaceBackup(await file.text())); setWorkspaceMenuOpen(false); }
    catch (error) { setWorkspaceMessage(error instanceof Error ? error.message : "That backup could not be opened."); }
  }

  async function restoreBackup() {
    if (!restoreDraft) return;
    setRestoreBusy(true);
    try { await onRestoreWorkspace(restoreDraft); setRestoreDraft(null); setWorkspaceMessage("Backup restored. Your previous Workspace was kept as a recovery copy."); }
    catch (error) { setWorkspaceMessage(error instanceof Error ? error.message : "That backup could not be restored."); }
    finally { setRestoreBusy(false); }
  }

  function addPersonToProject(globalId: string, projectId: string) {
    const global = workspace.globalPeople.find((person) => person.id === globalId);
    if (!global) return;
    const now = new Date().toISOString();
    update({ ...workspace, projects: workspace.projects.map((project) => {
      if (project.id !== projectId || project.graph.people.some((person) => person.globalId === globalId)) return project;
      const base = createInitialGraph().people[0];
      const person = { ...base, id: createId("person"), globalId: global.id, name: global.name, nickname: global.nickname, phone: global.phone, email: global.email, githubUrl: global.githubUrl, linkedinUrl: global.linkedinUrl, isSelf: false, includeInOrgChart: false, x: 650 + project.graph.people.length * 35, y: 360 + project.graph.people.length * 28, accent: "blue" as const, createdAt: global.createdAt, updatedAt: now };
      return { ...project, graph: { ...project.graph, people: [...project.graph.people, person], updatedAt: now }, updatedAt: now };
    }) });
    setAssignPersonId(""); setWorkspaceMessage(`${global.name} added to the Project`);
  }

  return <main className="hub-shell">
    <header className="hub-topbar">
      <button className="brand brand-button" onClick={onHome}><Mark /><span className="brand-name">Circa<sup>beta</sup></span></button>
      <nav aria-label="Workspace navigation"><button className={view === "projects" ? "active" : ""} onClick={() => onView("projects")}>Projects</button><button className={view === "people" ? "active" : ""} onClick={() => onView("people")}>People</button></nav>
      <div className="hub-top-actions"><div className="workspace-menu-wrap"><button className="workspace-menu-button" onClick={() => setWorkspaceMenuOpen((value) => !value)} aria-expanded={workspaceMenuOpen}>Workspace •••</button>{workspaceMenuOpen && <div className="workspace-menu"><button onClick={exportBackup}>Export backup</button><button onClick={() => backupInputRef.current?.click()}>Restore backup...</button></div>}<input ref={backupInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void chooseBackup(file); event.currentTarget.value = ""; }} /></div><button className="button button-dark button-small" onClick={onNewProject}>＋ New project</button></div>
    </header>

    <div className={`hub-layout${view === "people" ? " people-layout" : ""}`}>
      {view === "projects" && <aside className="folder-rail">
        <div className="folder-heading"><span>Folders</span><i>{workspace.folders.length}</i></div>
        <button className={folderId === "all" ? "active" : ""} onClick={() => setFolderId("all")}><span>⌂</span> All projects</button>
        {workspace.folders.map((folder) => <div className="folder-row" key={folder.id}>
          {renamingFolderId === folder.id ? <form onSubmit={(event) => { event.preventDefault(); if (folderRenameDraft.trim()) update({ ...workspace, folders: workspace.folders.map((item) => item.id === folder.id ? { ...item, name: folderRenameDraft.trim(), updatedAt: new Date().toISOString() } : item) }); setRenamingFolderId(""); }}><input maxLength={80} autoFocus value={folderRenameDraft} onChange={(event) => setFolderRenameDraft(event.target.value)} onBlur={() => { if (folderRenameDraft.trim() && folderRenameDraft.trim() !== folder.name) update({ ...workspace, folders: workspace.folders.map((item) => item.id === folder.id ? { ...item, name: folderRenameDraft.trim(), updatedAt: new Date().toISOString() } : item) }); setRenamingFolderId(""); }} /></form>
            : <button className={folderId === folder.id ? "active" : ""} onClick={() => setFolderId(folder.id)}><span>⌑</span>{folder.name}<small>{workspace.projects.filter((project) => project.folderId === folder.id && !project.archived).length}</small></button>}
          <div className="folder-actions"><button onClick={() => { setRenamingFolderId(folder.id); setFolderRenameDraft(folder.name); }} title={`Rename ${folder.name}`} aria-label={`Rename ${folder.name}`}>✎</button><button onClick={() => setDeleteFolderId(folder.id)} title={`Delete ${folder.name}`} aria-label={`Delete ${folder.name}`}>×</button></div>
        </div>)}
        <form className="new-folder-form" onSubmit={createFolder}><input maxLength={80} value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} placeholder="New folder" aria-label="New folder name" /><button disabled={!folderDraft.trim()} aria-label="Create folder">＋</button></form>
        <button className={`archive-link ${showArchived ? "active" : ""}`} onClick={() => setShowArchived((value) => !value)}>▱ {showArchived ? "Back to projects" : "Archived"}</button>
      </aside>}

      <section className="hub-content">
        <div className="hub-intro">
          <div><p className="eyebrow"><span /> Your relationship sketchbook</p><h1>{view === "projects" ? (showArchived ? "Archived projects" : "Your projects") : "People"}</h1><p>{view === "projects" ? "A map for every part of your life." : "People you’ve mapped across your projects."}</p></div>
          <div className="hub-controls"><label className="hub-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "projects" ? "Search projects" : "Search people"} /></label>{view === "projects" && <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort projects"><option value="updated">Recently updated</option><option value="name">Name</option><option value="created">Date created</option></select>}</div>
        </div>

        {view === "projects" ? <>
          {projects.length ? <div className="project-grid">{projects.map((project) => {
            const category = displayCategory(project.category, project.customCategoryName);
            const peopleCount = project.graph.people.filter((person) => !person.isSelf).length;
            return <article className={`project-card accent-${projectTemplates[project.category].accent}`} key={project.id}>
              <span className="project-tape" aria-hidden="true" />
              <div className="project-card-top"><span className="project-category">{projectTemplates[project.category].icon} {category}</span><button className={`favourite ${project.favourite ? "active" : ""}`} onClick={() => patchProject(project.id, { favourite: !project.favourite })} aria-label={`${project.favourite ? "Unfavourite" : "Favourite"} ${project.name}`}>☆</button></div>
              <button className="project-open" onClick={() => onOpenProject(project.id)}><ProjectMiniature project={project} /></button>
              {renamingProjectId === project.id ? <form className="project-rename" onSubmit={(event) => { event.preventDefault(); if (renameDraft.trim()) patchProject(project.id, { name: renameDraft.trim() }); setRenamingProjectId(""); }}><input maxLength={80} autoFocus value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onBlur={() => { if (renameDraft.trim() && renameDraft.trim() !== project.name) patchProject(project.id, { name: renameDraft.trim() }); setRenamingProjectId(""); }} /></form>
                : <button className="project-title" onClick={() => onOpenProject(project.id)}>{project.name}</button>}
              <div className="project-meta"><span>{peopleCount} {peopleCount === 1 ? "person" : "people"}</span><span>{project.graph.relationships.length} connections</span><span>{relativeDate(project.updatedAt)}</span></div>
              <div className="project-card-actions"><button onClick={() => { setRenamingProjectId(project.id); setRenameDraft(project.name); }}>Rename</button><label>Move<select value={project.folderId} onChange={(event) => patchProject(project.id, { folderId: event.target.value })}><option value="">All projects</option>{workspace.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button onClick={() => patchProject(project.id, { archived: !project.archived })}>{project.archived ? "Restore" : "Archive"}</button><button className="danger-link" onClick={() => setDeleteProjectId(project.id)}>Delete</button></div>
            </article>;
          })}</div> : <div className="hub-empty"><i>✦</i><h2>{workspace.projects.length ? "Nothing here yet." : "You haven’t mapped anything yet."}</h2><p>{query ? "Try another search." : "Create a project for one part of your life."}</p>{!query && <button className="button button-dark" onClick={onNewProject}>Create your first project ↗</button>}</div>}
        </> : <>
          {people.length ? <div className="people-directory">{people.map((person) => { const appearances = appearanceNames(person); return <article key={person.id}><span className="directory-avatar">{person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><div><h2>{person.name}</h2>{person.phone && <p>{person.phone}</p>}{person.email && <p>{person.email}</p>}<small>{appearances.length ? `Appears in ${appearances.join(", ")}` : "Not currently in a project"}</small></div><div className="directory-actions">{appearances.length > 0 && <button onClick={() => { if (appearances.length === 1) { const project = workspace.projects.find((item) => item.graph.people.some((candidate) => candidate.globalId === person.id)); if (project) onOpenProject(project.id); } else setOpenPersonId(person.id); }}>Open map ↗</button>}<button onClick={() => setAssignPersonId(person.id)}>Add to project</button><button className="danger-link" onClick={() => setDeletePersonId(person.id)}>Delete person</button></div></article>; })}</div>
            : <div className="hub-empty"><i>∞</i><h2>No people found.</h2><p>People appear here after you add them to a project.</p></div>}
        </>}
      </section>
    </div>

    {deleteProjectId && <div className="popover-backdrop" onMouseDown={() => setDeleteProjectId("")}><div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" className="add-popover confirm-popover" onMouseDown={(event) => event.stopPropagation()}><span className="form-kicker">Permanent action</span><h2>Delete “{workspace.projects.find((project) => project.id === deleteProjectId)?.name}”?</h2><p>This permanently removes this Project, its relationships, groups and notes. People remain in your Circa People directory and in any other Projects where they appear.</p><div className="confirm-actions"><button className="button button-paper" onClick={() => setDeleteProjectId("")}>Cancel</button><button className="button danger-button" onClick={() => { const projects = workspace.projects.filter((project) => project.id !== deleteProjectId); update({ ...workspace, projects, activeProjectId: workspace.activeProjectId === deleteProjectId ? projects.find((project) => !project.archived)?.id ?? "" : workspace.activeProjectId }); setDeleteProjectId(""); }}>Delete</button></div></div></div>}
    {deleteFolderId && <div className="popover-backdrop" onMouseDown={() => setDeleteFolderId("")}><div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" className="add-popover confirm-popover" onMouseDown={(event) => event.stopPropagation()}><span className="form-kicker">Delete folder</span><h2>Move its projects to All projects?</h2><p>The projects stay safe. Only the folder is removed.</p><div className="confirm-actions"><button className="button button-paper" onClick={() => setDeleteFolderId("")}>Cancel</button><button className="button danger-button" onClick={() => { const folder = workspace.folders.find((item) => item.id === deleteFolderId); if (folder) deleteFolder(folder); setDeleteFolderId(""); }}>Delete folder</button></div></div></div>}
    {deletePersonId && <div className="popover-backdrop" onMouseDown={() => setDeletePersonId("")}><div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" className="add-popover confirm-popover" onMouseDown={(event) => event.stopPropagation()}><span className="form-kicker">Delete everywhere</span><h2>Delete {workspace.globalPeople.find((person) => person.id === deletePersonId)?.name}?</h2><p>This removes the person, their threads and any reporting references from every project. Project-specific notes are deleted too.</p><div className="confirm-actions"><button className="button button-paper" onClick={() => setDeletePersonId("")}>Cancel</button><button className="button danger-button" onClick={() => { update(deleteGlobalPerson(workspace, deletePersonId)); setDeletePersonId(""); }}>Delete everywhere</button></div></div></div>}
    {openPersonId && <div className="popover-backdrop" onMouseDown={() => setOpenPersonId("")}><div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" className="add-popover compact-popover" onMouseDown={(event) => event.stopPropagation()}><button className="popover-close" onClick={() => setOpenPersonId("")} aria-label="Close project chooser">×</button><span className="form-kicker">Choose a project</span><h2>Where should Circa open them?</h2><div className="project-choice-list">{workspace.projects.filter((project) => project.graph.people.some((person) => person.globalId === openPersonId)).map((project) => <button key={project.id} onClick={() => onOpenProject(project.id)}><strong>{project.name}</strong><small>{displayCategory(project.category, project.customCategoryName)}</small></button>)}</div></div></div>}
    {restoreDraft && <div className="popover-backdrop"><div ref={modalRef} tabIndex={-1} className="add-popover confirm-popover restore-popover" role="dialog" aria-modal="true" aria-labelledby="hub-restore-title"><span className="form-kicker">Workspace restore</span><h2 id="hub-restore-title">Restore Circa backup?</h2><div className="restore-compare"><section><strong>Backup contains</strong><span>{restoreDraft.projects.length} Projects</span><span>{restoreDraft.globalPeople.length} People</span><span>{restoreDraft.folders.length} Folders</span></section><i>→</i><section><strong>Current Workspace</strong><span>{workspace.projects.length} Projects</span><span>{workspace.globalPeople.length} People</span><span>{workspace.folders.length} Folders</span></section></div><p>This replaces your current local Workspace. Circa will keep the current Workspace as a recovery copy.</p><div className="confirm-actions"><button className="button button-paper" disabled={restoreBusy} onClick={() => setRestoreDraft(null)}>Cancel</button><button className="button danger-button" disabled={restoreBusy} onClick={() => void restoreBackup()}>{restoreBusy ? "Restoring..." : "Restore backup"}</button></div></div></div>}
    {assignPersonId && <div className="popover-backdrop" onMouseDown={() => setAssignPersonId("")}><div ref={modalRef} tabIndex={-1} className="add-popover compact-popover" role="dialog" aria-modal="true" aria-labelledby="assign-person-title" onMouseDown={(event) => event.stopPropagation()}><button className="popover-close" onClick={() => setAssignPersonId("")} aria-label="Close Project chooser">×</button><span className="form-kicker">Add to Project</span><h2 id="assign-person-title">Where should they appear?</h2><div className="project-choice-list">{workspace.projects.filter((project) => !project.archived && !project.graph.people.some((person) => person.globalId === assignPersonId)).map((project) => <button key={project.id} onClick={() => addPersonToProject(assignPersonId, project.id)}><strong>{project.name}</strong><small>{displayCategory(project.category, project.customCategoryName)}</small></button>)}</div></div></div>}
    {workspaceMessage && <div className="quiet-toast" role="status">{workspaceMessage}</div>}
  </main>;
}

export function CreateProjectView({ onCancel, onCreate }: { onCancel: () => void; onCreate: (name: string, category: ProjectCategory, custom: string) => void }) {
  const [category, setCategory] = useState<ProjectCategory | null>(null);
  const [name, setName] = useState("");
  const [custom, setCustom] = useState("");
  const canCreate = Boolean(category && name.trim() && (category !== "other" || custom.trim()));
  return <main className="create-project-shell">
    <header><button className="brand brand-button" onClick={onCancel}><Mark /><span className="brand-name">Circa<sup>beta</sup></span></button><button className="create-close" onClick={onCancel} aria-label="Close new project">×</button></header>
    <section className="create-project-card">
      <p className="eyebrow"><span /> New project</p>
      <h1>What are you mapping?</h1>
      <p className="create-support">Choose a starting point. You can change this later.</p>
      <div className={`category-grid ${category ? "has-selection" : ""}`}>{(Object.keys(projectTemplates) as ProjectCategory[]).map((key) => { const template = projectTemplates[key]; return <button key={key} className={`${category === key ? "selected" : ""} accent-${template.accent}`} onClick={() => setCategory(key)}><i>{template.icon}</i><strong>{template.label}</strong><span>{template.description}</span></button>; })}</div>
      {category && <form className="project-name-step" onSubmit={(event) => { event.preventDefault(); if (canCreate) onCreate(name.trim(), category, custom.trim()); }}>
        {category === "other" && <label>What are you mapping?<input maxLength={80} autoFocus value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="e.g. Martial arts club" required /></label>}
        <label>Give this project a name<input maxLength={80} autoFocus={category !== "other"} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. My Circle" required /></label>
        <button className="button button-dark" disabled={!canCreate}>Create project <span>↗</span></button>
      </form>}
    </section>
  </main>;
}
