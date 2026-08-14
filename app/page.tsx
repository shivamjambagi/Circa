"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import SketchCanvas from "./SketchCanvas";
import { CreateProjectView, ProjectHub } from "./ProjectHub";
import { CircaProject, createEmptyWorkspace, createProject, createWorkspaceStore, getTabSessionId, Workspace } from "./graphStore";
import { useFirebaseUser } from "./firebase/FirebaseProvider";

type PreviewPerson = {
  name: string;
  detail: string;
  initials: string;
  className: string;
};

const previewPeople: PreviewPerson[] = [
  { name: "Maya", detail: "Studio", initials: "MK", className: "maya" },
  { name: "Noah", detail: "Old friend", initials: "NW", className: "noah" },
  { name: "Leila", detail: "Neighbour", initials: "LA", className: "leila" },
  { name: "Sam", detail: "Climbing", initials: "SR", className: "sam" },
];

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

function PersonCard({ person, you = false }: { person: PreviewPerson; you?: boolean }) {
  return (
    <article className={`preview-person ${person.className}${you ? " is-you" : ""}`}>
      <span className="paper-tape" aria-hidden="true" />
      <div className="avatar-scribble">{person.initials}</div>
      <strong>{person.name}</strong>
      <small>{person.detail}</small>
    </article>
  );
}

function Landing() {
  const { user } = useFirebaseUser();
  const startHref = user && !user.isAnonymous ? "/start" : "/auth?returnTo=/start";
  const [menuOpen, setMenuOpen] = useState(false);
  const lastCommunity = useSyncExternalStore(() => () => undefined, () => { try { return window.localStorage.getItem("circa_last_community") || ""; } catch { return ""; } }, () => "");
  return (
    <main className="site-shell">
      <header className="landing-nav">
        <a className="brand" href="#top" aria-label="Circa home">
          <Mark />
          <span className="brand-name">Circa<sup>beta</sup></span>
        </a>
        <button className="mobile-menu-button" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>Menu</button><nav className={menuOpen ? "open" : ""} aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#communities">Communities</a>
          <a href="#network">Network</a>
          <a href={user && !user.isAnonymous ? "/account" : "/auth"}>{user && !user.isAnonymous ? "Account" : "Sign in"}</a>
          <a className="button button-small button-outline" href={startHref}>Open Circa</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> A clearer view of the people who matter</p>
          <h1>Map your<br /><em>people.</em></h1>
          <p className="hero-sub">Sketch every part of your life.<br />See how your worlds connect.</p>
          <div className="hero-actions">
            <a className="button button-dark" href={startHref}>Open Circa <span>↗</span></a>
            <a className="button button-paper" href="#how">See how it works <span>↓</span></a>
          </div>
          <p className="privacy-note">✦ Personal maps stay local by default.<small>Sign in to enter Circa; your private maps still stay in this browser unless you explicitly choose a cloud feature. Export a backup anytime.</small></p>
        </div>

        <div className="network-preview" aria-label="Example relationship sketch">
          <span className="sketch-label label-one">the ones who know you</span>
          <span className="sketch-label label-two">through Maya</span>
          <svg className="threads" viewBox="0 0 720 520" role="img" aria-label="Threads connecting five profile cards">
            <path className="thread thread-strong" d="M343 260 C280 190 235 145 172 120" />
            <path className="thread" d="M378 252 C452 190 498 140 548 108" />
            <path className="thread thread-dash" d="M394 292 C488 315 541 358 604 390" />
            <path className="thread thread-soft" d="M330 294 C256 331 214 381 152 404" />
            <path className="thread thread-dash" d="M185 143 C335 72 448 62 539 101" />
          </svg>
          <PersonCard person={{ name: "You", detail: "Your circle", initials: "YO", className: "you" }} you />
          {previewPeople.map((person) => <PersonCard key={person.name} person={person} />)}
          <aside className="thread-key" aria-label="Relationship line key">
            <span><i className="key-close" /> Close</span>
            <span><i /> Friend</span>
            <span><i className="key-dash" /> Acquaintance</span>
          </aside>
          <span className="pencil-flourish">⌁</span>
        </div>
      </section>

      <section className="feature-strip" id="features" aria-label="Circa features">
        <article><span className="feature-icon blue">↗</span><div><strong>Sketch connections</strong><p>Draw the people in your world.</p></div></article>
        <article><span className="feature-icon sage">≋</span><div><strong>See closeness</strong><p>Understand relationships visually.</p></div></article>
        <article><span className="feature-icon peach">∞</span><div><strong>Remember introductions</strong><p>See how your network formed.</p></div></article>
      </section>

      {lastCommunity && user?.isAnonymous && <aside className="return-community"><span>Temporary Community session</span><a href={`/community/${lastCommunity}`}>Return to your Community →</a></aside>}

      <section className="circa-paths" aria-labelledby="circa-paths-title">
        <header><p className="eyebrow"><span /> One Circa</p><h2 id="circa-paths-title">Three ways to understand<br /><em>your people.</em></h2><p className="circa-paths-support">Map privately, explore professional paths, or share useful Community knowledge.</p></header>
        <div className="experience-grid">
          <article className="experience-card map"><div className="mini-map" aria-hidden="true"><i className="mini-you">You</i><i>Maya</i><i>Sam</i><i>Daniel</i><span /><span /><span /></div><div><small>01 · Personal</small><h3>Map your people</h3><p>Sketch the people and relationships across your personal life, family, school and work.</p><a href={startHref}>Open Circa →</a></div></article>
          <article className="experience-card network" id="network"><div className="mini-path" aria-hidden="true"><i>You</i><span>→</span><i>Maya</i><span>→</span><i>James</i><span>→</span><i>Priya</i></div><div><small>02 · Professional</small><h3>Bring in your network</h3><p>Import your LinkedIn connections and discover known pathways through the professional network available to you.</p><a href="/network/new">Explore Networks →</a></div></article>
          <article className="experience-card community" id="communities"><div className="mini-community" aria-hidden="true"><small>Tomorrow</small><strong>Recycling</strong><span>Local services <b>18</b></span><span>Residents meeting <b>Thu</b></span><em>WhatsApp reminders · Connected</em></div><div><small>03 · Shared</small><h3>Circa Communities</h3><p>Keep useful local information, recommendations, reminders and community knowledge in one place.</p><a href="/community/new">Create a Community →</a></div></article>
        </div><aside className="join-utility"><span>Already have a Community or Network invite?</span><a href="/join">Enter a code →</a></aside>
      </section>

      <section className="compose-demo" aria-label="Compose feature preview">
        <div className="compose-demo-copy"><p className="eyebrow"><span /> Sketch with words</p><h2>Describe the people.<br /><em>Review the draft.</em></h2><p>Describe people naturally, or paste a list or CSV. Circa turns your words into temporary paper cards so you can check every person and connection before anything reaches your map.</p><a className="button button-paper" href={startHref}>Try Compose <span>↗</span></a></div>
        <div className="compose-demo-flow" aria-hidden="true"><div className="demo-prompt"><span>✦ Compose</span><p>“Maya leads design. Daniel leads engineering. Both report to Sarah.”</p><small>Create draft →</small></div><i>→</i><div className="demo-draft"><span className="demo-card sarah"><b>S</b>Sarah<small>CEO · Draft</small></span><span className="demo-card maya"><b>M</b>Maya<small>Design · Draft</small></span><span className="demo-card daniel"><b>D</b>Daniel<small>Engineering · Draft</small></span><svg viewBox="0 0 320 210"><path d="M160 70 C160 105 82 105 82 137"/><path d="M160 70 C160 105 238 105 238 137"/></svg></div></div>
      </section>

      <section className="how-section" id="how">
        <div>
          <p className="eyebrow"><span /> Simple by design</p>
          <h2>Draw it. Or<br />describe it.</h2>
        </div>
        <ol>
          <li><b>01</b><div><strong>Draw</strong><p>Add, connect, group and arrange people by hand.</p></div></li>
          <li><b>02</b><div><strong>Describe</strong><p>Use Compose to prepare a draft from words, a list or CSV.</p></div></li>
          <li><b>03</b><div><strong>Review, then apply</strong><p>Nothing changes until you have checked the draft.</p></div></li>
        </ol>
      </section>

      <section className="about-section" id="about">
        <div className="about-label">
          <span>About Circa</span>
          <i aria-hidden="true">⌁</i>
        </div>
        <div className="about-copy">
          <p className="eyebrow"><span /> A gentler kind of network</p>
          <h2>Made for understanding,<br /><em>never ranking.</em></h2>
          <p>Circa gives the people in your life a place to live visually - alongside the stories, introductions and little details that make each relationship yours.</p>
          <p>It shows context without judging it. You decide what every connection means.</p>
        </div>
        <aside className="about-card">
          <span className="paper-tape" aria-hidden="true" />
          <b>“</b>
          <blockquote>Your network belongs to you.</blockquote>
          <p>In beta, sketches are stored locally and can be exported as a backup.</p>
          <div><i /> Local-first by design</div>
        </aside>
      </section>

      <footer><a className="brand" href="#top"><Mark /><span className="brand-name">Circa<sup>beta</sup></span></a><p>Map your people.</p><a href={startHref}>Open Circa ↗</a></footer>
    </main>
  );
}

export default function Home() {
  const { user, loading: authLoading } = useFirebaseUser();
  const store = useMemo(() => createWorkspaceStore(), []);
  const [workspace, setWorkspace] = useState<Workspace>(() => createEmptyWorkspace());
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<"landing" | "hub" | "create" | "canvas">("landing");
  const [hubView, setHubView] = useState<"projects" | "people">("projects");
  const [activeProjectId, setActiveProjectId] = useState("");
  const [saveError, setSaveError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");

  useEffect(() => {
    let active = true;
    store.loadWorkspace().then((next) => {
      if (!active) return;
      setWorkspace(next);
      setActiveProjectId(next.activeProjectId);
      setLoaded(true);
    }).catch((error) => { if (!active) return; setLoaded(true); setSaveError(error instanceof Error ? error.message : "Circa could not load local data."); });
    return () => { active = false; };
  }, [store]);

  useEffect(() => {
    if (!loaded || authLoading || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("workspace") !== "1") return;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    if (!user || user.isAnonymous) {
      window.location.replace(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    const requestedProject = params.get("project") || "";
    const timer = window.setTimeout(() => {
      if (requestedProject && workspace.projects.some((project) => project.id === requestedProject && !project.archived)) {
        setActiveProjectId(requestedProject);
        setScreen("canvas");
        return;
      }
      if (params.get("create") === "1") { setScreen("create"); return; }
      setHubView(params.get("view") === "people" ? "people" : "projects");
      setScreen(workspace.projects.length ? "hub" : "create");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, loaded, user, workspace.projects]);

  function setWorkspaceLocation(next: "hub" | "create" | "canvas" | "landing", projectId = "", view: "projects" | "people" = hubView) {
    if (typeof window === "undefined") return;
    if (next === "landing") { window.history.replaceState(null, "", "/"); return; }
    const params = new URLSearchParams({ workspace: "1" });
    if (next === "create") params.set("create", "1");
    if (next === "canvas" && projectId) params.set("project", projectId);
    if (next === "hub" && view === "people") params.set("view", "people");
    window.history.replaceState(null, "", `/?${params.toString()}`);
  }

  async function persist(next: Workspace) {
    setWorkspace(next);
    try { const saved = await store.saveWorkspace(next); setWorkspace(saved); setSaveError(""); }
    catch (error) { setSaveError(error instanceof Error ? error.message : "Circa could not save locally."); }
  }

  useEffect(() => {
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("circa-workspace") : null;
    const tabSessionId = getTabSessionId();
    async function newer(revision: number) {
      if (revision <= workspace.revision) return;
      if (screen === "canvas") { setStorageNotice("This workspace changed in another tab. Finish here, then reload to review the newer version."); return; }
      try { const next = await store.loadWorkspace(); setWorkspace(next); setActiveProjectId(next.activeProjectId); setStorageNotice("Workspace refreshed from another tab."); }
      catch { setStorageNotice("Another tab changed this workspace, but Circa could not refresh it."); }
    }
    channel?.addEventListener("message", (event) => { const data = event.data as { revision?: unknown; source?: unknown }; if (data.source === tabSessionId) return; const revision = Number(data.revision); if (Number.isFinite(revision)) void newer(revision); });
    function storage(event: StorageEvent) { if (event.key === "circa_workspace_v3" && event.newValue) { try { const revision = Number((JSON.parse(event.newValue) as { revision?: unknown }).revision); if (Number.isFinite(revision)) void newer(revision); } catch { /* malformed external write */ } } }
    window.addEventListener("storage", storage);
    return () => { channel?.close(); window.removeEventListener("storage", storage); };
  }, [screen, store, workspace.revision]);


  async function openProject(id: string) {
    const latest = await store.loadWorkspace();
    const next = { ...latest, activeProjectId: id, updatedAt: new Date().toISOString() };
    const saved = await store.saveWorkspace(next);
    setWorkspace(saved);
    setActiveProjectId(id);
    setWorkspaceLocation("canvas", id);
    setScreen("canvas");
  }

  async function leaveCanvas(destination: "hub" | "landing" = "hub") {
    const latest = await store.loadWorkspace();
    setWorkspace(latest);
    setWorkspaceLocation(destination);
    setScreen(destination);
  }

  async function addProject(name: string, category: Parameters<typeof createProject>[1], custom: string) {
    const latest = await store.loadWorkspace();
    const project = createProject(name, category, custom);
    const next = { ...latest, projects: [...latest.projects, project], activeProjectId: project.id, updatedAt: new Date().toISOString() };
    const saved = await store.saveWorkspace(next);
    setWorkspace(saved);
    setActiveProjectId(project.id);
    setWorkspaceLocation("canvas", project.id);
    setScreen("canvas");
  }

  async function updateActiveProject(patch: Partial<CircaProject>) {
    const latest = await store.loadWorkspace();
    const next = { ...latest, projects: latest.projects.map((project) => project.id === activeProjectId ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project) };
    const saved = await store.saveWorkspace(next);
    setWorkspace(saved);
  }

  async function restoreWorkspace(next: Workspace) {
    const saved = await store.restoreWorkspace(next);
    setWorkspace(saved); setActiveProjectId(saved.activeProjectId); setHubView("projects"); setWorkspaceLocation("hub"); setScreen("hub"); setSaveError("");
  }

  const activeProject = workspace.projects.find((project) => project.id === activeProjectId);

  let content;
  if (screen === "landing") content = <Landing />;
  else if (screen === "create") content = <CreateProjectView onCancel={() => { const next = workspace.projects.length ? "hub" : "landing"; setWorkspaceLocation(next); setScreen(next); }} onCreate={addProject} />;
  else if (screen === "hub") content = <ProjectHub workspace={workspace} view={hubView} onView={(next) => { setHubView(next); setWorkspaceLocation("hub", "", next); }} onChange={persist} onNewProject={() => { setWorkspaceLocation("create"); setScreen("create"); }} onOpenProject={openProject} onHome={() => { setWorkspaceLocation("landing"); setScreen("landing"); }} onRestoreWorkspace={restoreWorkspace} />;
  else if (!activeProject) content = <ProjectHub workspace={workspace} view="projects" onView={(next) => { setHubView(next); setWorkspaceLocation("hub", "", next); setScreen("hub"); }} onChange={persist} onNewProject={() => { setWorkspaceLocation("create"); setScreen("create"); }} onOpenProject={openProject} onHome={() => { setWorkspaceLocation("landing"); setScreen("landing"); }} onRestoreWorkspace={restoreWorkspace} />;
  else content = <SketchCanvas key={activeProject.id} project={activeProject} projects={workspace.projects.filter((project) => !project.archived)} onOpenProject={openProject} onNewProject={() => { setWorkspaceLocation("create"); setScreen("create"); }} onUpdateProject={updateActiveProject} onExit={() => leaveCanvas("hub")} />;
  return <>{content}{saveError && <div className="persistent-alert error" role="alert"><span>{saveError}</span><button onClick={() => setSaveError("")} aria-label="Dismiss save error">×</button></div>}{storageNotice && <div className="persistent-alert" role="status"><span>{storageNotice}</span><button onClick={() => setStorageNotice("")} aria-label="Dismiss storage notice">×</button></div>}</>;
}
