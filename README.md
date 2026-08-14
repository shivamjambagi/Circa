Circa

A local-first relationship sketchbook for mapping the people, connections, groups and context that matter to you.

Circa turns relationships into a tactile visual workspace. People appear as paper-like cards, connections as hand-drawn threads, and supporting context as sketched groups and pinned notes. Everything is designed to feel calm, direct and personal.

Circa is currently in active development. It runs locally in the browser, requires no account and does not depend on a cloud database.

Highlights

Build relationship maps on a responsive, full-screen canvas

Add, select, edit, move and safely remove people

Draw and edit relationship threads, including “introduced by” context

Organise people into sketched groups and attach movable notes

Add people by voice where the Web Speech API is supported, with a typed fallback

Import lists or CSV files containing up to 300 people

Switch Business Projects between Connections and Org Chart views

Ask visual questions about paths, teams, managers and reporting branches

Navigate with trackpad pan, anchored wheel or pinch zoom, touch pinch and fit-to-content

Undo and redo changes across the workspace

Back up and restore projects with downloadable workspace files

Use the interface on desktop and mobile, with reduced-motion support

Core workspace

Element

Purpose

People

Tactile cards representing the people in a project

Threads

Visual relationships between people, with optional context

Groups

Sketched boundaries for teams, circles or other collections

Notes

Movable context pinned directly to the canvas

Projects

Separate spaces for personal or business relationship maps

Compose

Compose is a controlled language layer built on top of the graph. It supports three intents:

Create prepares people, relationships and groups as a temporary draft.

Change prepares a diff against people already in the current project.

Ask runs deterministic queries against stored graph data and highlights the result.

Compose never changes the canvas directly. Every structured intent is validated and previewed before it can be applied. A confirmed batch becomes a single undo transaction.

Paste List, CSV and Ask operations run locally. Free-form descriptions require an optional server-side provider. Provider configuration is documented in COMPOSE_SETUP.md.

Importing people

Circa supports deterministic list and CSV imports for up to 300 people at a time. Common column names are recognised automatically:

Data

Recognised examples

Name

name, full name, employee

Role

role, job title, position

Manager

manager, reports to, line manager

Imported rows are treated strictly as data. Formula-like cells are blocked without rejecting valid values such as +44 phone numbers. Circa also surfaces possible duplicates and prevents reporting cycles.

Business Projects

Business Projects can switch between two views while using the same underlying people:

Connections shows the wider relationship graph.

Org Chart reads the canonical reportsToPersonId relationship.

The Org Chart includes only explicit organisation members, supports multiple companies and root nodes, prevents reporting cycles, and allows branches to be collapsed.

Local development

Install the dependencies and start the development server:

npm install
npm run dev

No account or cloud database is required.

Storage and recovery

LocalStorage is the official Circa V10 storage adapter. Workspace data belongs to the current browser, so it does not automatically sync between browsers or devices.

Key

Purpose

circa_workspace_v3

Current workspace data

circa_workspace_backup_v2

Original data retained during the first v2 migration

circa_workspace_recovery_v10

Workspace replaced by a restore operation

app/graphStore.ts defines the typed graph, workspace migration, backup and local concurrency contracts. Project saves do not alter navigation state. If another tab has written a newer version of the same project, Circa requires the stale tab to reload or explicitly confirm before replacing it.

The workspace flushes pending changes on exit, reports save failures and provides downloadable backups from the Project Hub and the canvas More menu.

Privacy

Workspace data is stored in the current browser and is not cloud-synchronised.

Paste List, CSV and Ask remain local.

Voice recognition is provided by the browser and may use the browser vendor’s speech service.

Free-form Compose sends only a reduced graph context to the configured server-side provider.

GitHub and LinkedIn URLs are validated inline but are not scraped.

Export regular JSON backups if the workspace is important to you, especially before clearing browser data or moving to another device.

Keyboard shortcuts

Shortcut

Action

Cmd/Ctrl + Z

Undo

Cmd/Ctrl + Shift + Z

Redo

Delete or Backspace

Remove the selected item

+ or -

Zoom in or out

Escape

Cancel the active tool or close a panel

Current status

Circa is an in-development local-first application. Storage formats, Compose behaviour and interface details may continue to evolve as the project is refined.
