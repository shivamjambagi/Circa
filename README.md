# Circa

Circa is a local-first relationship sketchbook. People are tactile paper cards, relationships are thread-like paths, and personal context can be organised with groups and pinned notes.

## What works

- Calm responsive landing page and full-screen sketch canvas
- Add, select, edit, drag and safely remove people
- Create and edit relationship threads, including “introduced by” context
- Create and edit sketched groups and movable notes
- Add people by voice in browsers that support the Web Speech API, with a typed-phrase fallback
- Compose Create, Change and Ask flows with mandatory draft review before apply
- Deterministic list/CSV import (up to 300 people), duplicate hints and cycle checks
- Business Connections and Org Chart views powered by the same people
- Visual graph questions for stored paths, teams, managers and reporting branches
- Trackpad pan, anchored wheel/pinch zoom, touch pinch, fit-to-content, undo and redo
- Flush-on-exit autosave, visible save errors, stale-tab write protection and downloadable/restorable workspace backups
- Validated Workspace v3 migration with a retained v2 recovery copy
- Inline GitHub and LinkedIn URL validation without scraping
- Keyboard shortcuts and reduced-motion support
- Mobile toolbar and detail bottom sheet

## Local development

```bash
npm install
npm run dev
```

Circa V10 is deliberately local-first and requires no account or cloud database. Workspace data is saved under `circa_workspace_v3` in the current browser. Different devices and browsers do not sync automatically. Export a backup from the Project Hub or canvas More menu. The first v2 migration retains the original JSON under `circa_workspace_backup_v2`; a restore keeps the replaced Workspace under `circa_workspace_recovery_v10`.

## Compose

Compose is a controlled language layer above the existing graph. It supports three intents:

- **Create** prepares people, relationships and groups as a temporary draft.
- **Change** prepares a diff against people already on the current Project.
- **Ask** runs deterministic queries against stored graph data and highlights the answer.

No Compose operation can mutate the canvas directly. Structured intent is validated, previewed and only applied after explicit confirmation. A confirmed batch is one undo transaction. Paste List and CSV work locally; free-form descriptions require an optional server-side provider. See `COMPOSE_SETUP.md`.

CSV columns are matched from common names such as `name` / `full name` / `employee`, `role` / `job title` / `position`, and `manager` / `reports to` / `line manager`. Rows are parsed as data only, formula-like cells are blocked without rejecting `+44` phone numbers, and imports are limited to 300 people.

Business Projects can switch between **Connections** and **Org Chart**. The Org Chart reads the canonical `reportsToPersonId`, includes only explicit organisation members, prevents reporting cycles, supports multiple roots and companies, and can collapse branches.

## Storage architecture

`app/graphStore.ts` defines the typed graph, Workspace migration, backup and local concurrency contracts. LocalStorage is the official V10 storage adapter. Project saves do not alter navigation state, and stale same-Project tabs must be reloaded or explicitly confirmed before replacing a newer version.

## Shortcuts

- `Cmd/Ctrl + Z`: undo
- `Cmd/Ctrl + Shift + Z`: redo
- `Delete` / `Backspace`: remove the selected item
- `+` / `-`: zoom
- `Escape`: cancel the active tool or close a panel

## Privacy

The Workspace is stored in the current browser and is not cloud-synchronised. Export regular JSON backups from the Project Hub or canvas More menu. Voice recognition is supplied by the browser and may use the browser vendor's speech service. Free-form Compose sends only a reduced graph context to the configured server-side provider; Paste List, CSV and Ask stay local.
