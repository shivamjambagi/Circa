# Circa

> **Map your people.**
>
> Made for understanding, never ranking.

Circa is a local-first visual relationship sketchbook. It gives people a calm, tactile space to map who they know, how those people connect, where relationships began and how different parts of their world overlap.

Instead of presenting relationships as rows in a contact manager, Circa turns them into a living canvas:

- people become paper-like cards;
- relationships become hand-drawn threads;
- teams and social circles become sketched groups;
- memories and context become pinned notes;
- questions become visual graph answers.

The result is a human-friendly graph that feels closer to a notebook or personal whiteboard than a CRM, dashboard or traditional social network.

Circa is currently in active development. The core Personal Map experience works locally in the browser without an account or cloud database. Community, Network, account and messaging ideas described later in this document are part of the wider product direction and should not be treated as live integrations unless explicitly marked otherwise.

---

## Product vision

Most digital tools treat relationships as flat contact records, audience numbers or engagement metrics. Circa starts from a different idea: a relationship is easier to understand when it can be seen in context.

Circa is designed to help someone understand:

- who is part of their world;
- how two people are connected;
- who introduced whom;
- which people belong to the same group, team or environment;
- where professional reporting lines exist;
- which paths connect otherwise separate circles;
- what useful context they want to remember;
- how their network may have developed over time.

Circa presents structure, evidence and patterns. It does not make personal decisions for the user.

The guiding principle is simple:

> **The system helps the user see. The user decides what the information means.**

---

## What Circa is not

Circa is intentionally not:

- a CRM;
- a popularity tracker;
- a relationship-ranking system;
- a social-value score;
- a leaderboard;
- a replacement for human judgement;
- a generic AI chatbot;
- a generic flowchart editor;
- a LinkedIn clone;
- an excuse to infer private facts that were never provided.

Circa must never tell a user to replace a friend, end a relationship or treat one person as more valuable than another. It must not turn closeness into a competitive score or present assumptions as facts.

Future insights may describe stored patterns, such as a person connecting several groups or a relationship not having a recent interaction recorded. Those observations must remain neutral, evidence-based and controlled by the user.

---

## Product experiences

The broader Circa vision contains three related experiences.

### Personal

Personal is the current core experience. It contains private relationship maps, projects, people, threads, groups, notes, imports, Compose and visual questions.

Personal Maps are local-first. They should remain usable without authentication and should not disappear when account features are introduced later.

### Network

Network is the planned professional pathway experience. It is intended to help members understand known connection paths built from real, intentionally contributed edges.

Network is about questions such as:

- How am I connected to this person?
- Is there a known path between these two people?
- Who could potentially introduce one person to another?
- Which nearby connections are relevant to this search?

It is not intended to render thousands of contacts at once or invent links based on a shared company, school, location or name.

### Community

Community is the planned shared knowledge experience. It is intended for approved local information, directories, events, collections, reminders, member suggestions and optional messaging access.

Community data must be useful and real. Pending suggestions must not appear as approved information, and opening an invitation must never silently create membership.

---

## Project categories

Circa Projects can represent different parts of a person's life while retaining the same visual language.

Planned and supported categories include:

- Personal
- School
- Business
- Family
- Community
- Other or custom categories

The category can influence language and available views without changing Circa into a different product. A Business Project may expose an Org Chart, while a Personal Project may focus on friendship groups and introductions.

---

## Core model

Circa is built around a graph, but the interface deliberately avoids making the user think in graph-database terminology.

### Projects

A Project is a separate relationship map. It owns its category, membership, canvas layout, route context and project-specific state.

The Project Hub is responsible for creating, opening and organising Projects and folders. A project save must not unexpectedly alter navigation state.

### People

A person is a stable identity, not a name string. Two people may share the same name, so names are never used as unique identifiers.

A person may contain:

- display name;
- nickname or aliases;
- role or position;
- optional avatar or image;
- phone and email details;
- GitHub and LinkedIn URLs;
- notes and relationship context;
- project and group membership;
- canvas position and size;
- created and updated timestamps.

Most fields are optional. Circa uses progressive disclosure so a user can begin with only a name and add richer context later.

### Relationships

A relationship is a stored edge between people. It can include:

- source and target people;
- a relationship label;
- optional direction;
- closeness or contextual meaning;
- an “introduced by” person;
- evidence or supporting context;
- created and updated timestamps.

Relationships may use category-appropriate labels such as Friend, Family, Professional or Custom. Reporting lines are stored separately from ordinary relationship labels so an organisation structure remains unambiguous.

### Groups

Groups represent teams, friendship circles, families, environments or any other useful collection.

A group has both semantic membership and visual bounds. It can be moved, resized and labelled without becoming a giant card that hides the canvas. Group size should not be restricted by an arbitrary small limit.

### Notes

Notes are lightweight pieces of context placed directly on the canvas. They behave like small paper scraps and can be edited, moved, recoloured and removed.

Examples include:

- Met at Barclays
- University group
- Introduced through Maya
- Project team

### The graph

People and stored relationships are the source of truth for graph questions. The language model, when configured, may interpret a request, but it does not decide whether a connection exists.

---

## Visual identity

Circa should feel like a carefully designed combination of:

- a personal notebook;
- a relationship sketchbook;
- an editorial illustration;
- a modern digital whiteboard;
- a graph visualisation tool.

The interface uses:

- a warm off-white background;
- a quiet dotted canvas;
- readable editorial typography;
- selective handwritten details;
- warm yellow, muted blue, sage, lavender, coral and graphite accents;
- paper cards with restrained texture;
- tape, pencil and paperclip details used sparingly;
- stitched, pencil-like or thread-like relationship paths;
- generous whitespace;
- subtle motion with a physical feeling.

Colour communicates meaning through groups, annotations, selection and relationship categories. It is not added merely as decoration.

Circa should look handmade but still professional. It must not become a children's drawing application, a generic SaaS dashboard or a default graph-library demo.

---

## Design principles

### Start simple

Complexity should emerge from the user's own map.

- A new map should feel peaceful and mostly empty.
- A map with five people should feel like a small sketch.
- A map with fifty people should become naturally rich.

The interface must not fill empty space with fake people, unnecessary panels or decorative data.

### Use progressive disclosure

Adding a person should initially ask for very little:

- Name
- How do you know them? — optional

More detailed fields belong in the person panel after the card exists. The user should be allowed to build first and enrich later.

### Keep controls contextual

The canvas should remain visually quiet. Editing controls can appear when an item is selected or hovered rather than remaining permanently visible everywhere.

Full-screen modals should be rare. Circa prefers:

- floating editors;
- small popovers;
- side panels;
- inline editing;
- mobile bottom sheets.

### Make every control real

Circa must not include dead buttons, fake authentication, imaginary provider responses or integrations that only look connected. If a capability is unavailable, the interface should say so clearly and preserve a clean integration point for later.

### Preserve empty space

Empty space is part of the product. The canvas should feel calm with two people and remain readable with many people.

---

## Landing and first-run experience

The landing page introduces Circa without becoming a large marketing site. Its job is to explain the idea, demonstrate the visual language and move the user into the canvas quickly.

The primary message is:

> **Map your people.**

A first-time user should move through a simple journey:

1. Open Circa.
2. Start sketching.
3. Arrive on a mostly empty dotted canvas.
4. Begin with themselves or add the first person.
5. Move the card naturally.
6. Add another person.
7. Draw a relationship.
8. Let the map grow from real context.

Onboarding should be contextual rather than a long carousel. Small hints can appear at the moment they are useful and remain dismissed after the user understands the action.

---

## Person cards

People are represented by tactile paper-like cards rather than circles.

A card may contain:

- an avatar or initials-based placeholder;
- a name;
- one small optional tag;
- a restrained paper, tape or pin detail;
- a slight hand-positioned variation.

Cards should not expose every available field on the canvas. A map containing many people must remain readable.

Selecting a card opens a lightweight detail surface without replacing the canvas. On desktop this is a side panel; on mobile it becomes a bottom sheet.

The detail surface can contain name, nickname, role, how the user met the person, who introduced them, groups, last interaction, notes, contact details and manually entered profile URLs.

GitHub and LinkedIn URLs are validated for structure only. Circa does not scrape those services and does not pretend to have analysed a profile.

---

## Relationship threads

Relationship lines are a central part of Circa's identity. They should feel like pencil marks, stitched paths, string or thread rather than rigid diagram connectors.

Meaning must not depend on colour alone. Thickness, texture, direction and dash treatment can help communicate different relationship types.

Users can create a relationship by choosing the Connect tool and connecting two cards. A small contextual editor can then set the relationship label or “introduced by” context.

Circa prevents duplicate or invalid edges where appropriate and updates visible threads continuously as cards move.

Closeness may exist as internal or optional contextual data, but it must not dominate the interface as a percentage or competitive score.

---

## Canvas interaction

The canvas is the centre of the product and receives the highest interaction priority.

It supports:

- adding, selecting, editing and moving people;
- connecting people with relationship threads;
- creating, moving and resizing groups;
- creating and moving notes;
- safe deletion;
- pan and zoom;
- anchored mouse-wheel and trackpad zoom;
- touch pinch zoom;
- fit-to-content;
- undo and redo;
- autosave;
- visible save and error states;
- desktop and mobile layouts.

Dragging should feel immediate. Cards must not jump, and connected threads must remain attached while an item moves.

Cursor, focus and selection states should clearly distinguish panning, dragging, connecting and editing.

### Toolbars

The main canvas toolbar remains compact and can contain:

- Select
- Add person
- Connect
- Group
- Note
- Remove

Top-level controls remain equally restrained, focusing on navigation, undo, redo, save state and the small number of actions needed to leave or manage the canvas.

### Motion

Motion should reinforce the physical metaphor:

- a new card settles into the canvas;
- a new thread draws between two people;
- a selected card gains a subtle outline;
- a dragged card lifts slightly;
- a removed paper object fades or scales gently;
- panels open with short, controlled transitions.

Motion should be fast, optional and never distracting. Reduced-motion preferences are respected.

---

## Business Projects

Business Projects use the same people and graph while offering two complementary views.

### Connections

Connections shows the broader professional relationship graph, including colleagues, introductions and cross-team context.

### Org Chart

Org Chart reads the canonical `reportsToPersonId` field. It:

- includes only explicit organisation members;
- keeps reporting relationships separate from ordinary connections;
- prevents reporting cycles;
- supports multiple root people;
- supports multiple companies;
- allows reporting branches to be collapsed;
- preserves the underlying person identity shared with the Connections view.

Changing view does not create a second copy of the people. Both views are projections of the same stored model.

---

## Compose

Compose is Circa's controlled language layer: **sketch using words**.

It allows someone to describe a graph operation naturally while preserving the safety of a structured editor. Compose supports three intents.

### Create

Create interprets a description of new people, relationships and groups. It produces a temporary visual draft before anything is applied.

Example requests may describe:

- several people and their roles;
- a set of relationships;
- an introduction chain;
- a team or group;
- a reporting structure.

### Change

Change interprets a request against people already stored in the current Project. It creates a reviewed diff rather than mutating the graph immediately.

Changes may include:

- renaming or updating a person;
- changing a relationship label;
- adding or removing a relationship;
- moving a person into a group;
- changing a manager;
- correcting an earlier statement.

Deletion is never hidden inside vague language. Destructive operations must remain visible and reviewable.

### Ask

Ask turns natural-language questions into deterministic graph queries. It answers from stored data and highlights the exact people, relationships or path involved.

Supported question families include:

- direct connections;
- how two people are connected;
- introduction paths;
- mutual connections;
- group and team membership;
- managers and direct reports;
- reporting chains and branches;
- disconnected people;
- stored shortest paths.

If no path exists, that is a valid answer. It means only that no path is known in the stored graph.

### Compose safety model

Every mutating Compose flow follows the same boundary:

```text
User language
    ↓
Interpretation
    ↓
Structured validation
    ↓
Reviewable draft or diff
    ↓
Explicit user confirmation
    ↓
One graph transaction
```

No Compose request can mutate the canvas directly.

Circa treats provider output as untrusted structured data. It validates:

- person references;
- field names and types;
- relationship direction;
- duplicate identities and edges;
- reporting cycles;
- URLs and email fields;
- operation and import limits.

Existing-person matching belongs to deterministic Circa logic. A provider cannot silently choose a stored person ID.

Ambiguous language triggers clarification rather than guessing. This includes duplicate names, unclear pronouns, uncertain relationship direction and requests that could refer to several groups or people.

The semantic layer is designed to understand normal language features such as pronouns, plurals, possessives, “respectively”, corrections, negation, temporal wording, minor spelling mistakes and imperfect grammar. When meaning is still unclear, Circa asks instead of assuming.

Circa keeps roles, relationship labels, reporting lines, teams, groups and introductions as distinct concepts. It does not infer unsupported facts such as:

- same company means manager;
- same group means friend;
- family means emotional closeness;
- similar profile means the same person.

Safe derived suggestions may be shown separately, but they remain optional and reviewable.

A confirmed batch is recorded as one undo transaction.

### Local and provider-backed Compose

Paste List, CSV and deterministic Ask operations stay local.

Free-form Create and Change descriptions can use an optional server-side provider. Only bounded, reduced graph context should be sent. Private notes, phone numbers and unrelated projects must not be included unless a permitted operation genuinely requires them.

Provider configuration belongs in `COMPOSE_SETUP.md`.

---

## Importing people

Circa supports deterministic Paste List and CSV imports for up to 300 people per batch.

Common columns are recognised automatically:

| Data | Recognised column names |
| --- | --- |
| Name | `name`, `full name`, `employee` |
| Role | `role`, `job title`, `position` |
| Manager | `manager`, `reports to`, `line manager` |

Import rules include:

- rows are treated as data, not executable content;
- formula-like cells are blocked;
- valid values such as `+44` phone numbers are not rejected as formulas;
- duplicate identities are surfaced for review;
- malformed rows do not silently corrupt the graph;
- reporting cycles are rejected;
- imported operations remain deterministic.

LinkedIn Network import is a separate planned flow. It uses a user-provided export and never scraping or unofficial automation.

---

## Voice input

Where the Web Speech API is supported, Circa can use voice as another way to enter Compose text or add people.

The speech session should remain active until the user explicitly stops or completes it, allowing more than one short clause. Browsers without supported recognition use the same typed-phrase flow instead.

Speech recognition is provided by the browser and may use the browser vendor's speech service.

---

## Local-first storage

Circa V10 currently treats LocalStorage as the official Personal workspace adapter.

The current storage keys are:

| Key | Purpose |
| --- | --- |
| `circa_workspace_v3` | Current validated workspace |
| `circa_workspace_backup_v2` | Original v2 data retained during the first migration |
| `circa_workspace_recovery_v10` | Workspace replaced by a restore operation |

Workspace data belongs to the current browser profile. Different browsers and devices do not sync automatically.

The storage system provides:

- versioned workspace validation;
- migration into Workspace v3;
- a retained v2 recovery copy;
- flush-on-exit autosave;
- visible save failures;
- downloadable JSON backups;
- workspace restore;
- stale-tab write protection.

If two tabs open the same Project and one saves a newer version, the stale tab must reload or explicitly confirm before replacing newer data.

Backups are available from the Project Hub and the canvas **More** menu. Important work should be exported regularly, especially before clearing browser data or moving to another device.

---

## Storage architecture

`app/graphStore.ts` defines the typed graph, workspace migration, backup and local concurrency contracts.

The architecture separates interface behaviour from persistence behaviour. Canvas components should work with graph and storage contracts rather than reading and writing browser storage directly throughout the UI.

This boundary supports:

- reliable local persistence today;
- validation before stored data enters the application;
- future account-backed repositories without rebuilding the canvas;
- deterministic graph operations;
- safer migrations and recovery;
- testable storage behaviour.

The wider product direction preserves the existing Firebase Authentication, Firestore and App Check foundation for shared Community and Network data, while Personal Maps remain local-first. Secret-bearing integrations belong in trusted server-side functions, and the existing Netlify deployment model remains the intended hosting foundation.

Signing in or out must never delete or alter a local Personal Map.

---

## Data integrity rules

Circa protects several invariants across direct editing, imports and Compose:

- a person is never merged solely because a name matches;
- unsupported relationship facts are not inferred;
- duplicate relationships are prevented or explained;
- manager and reporting cycles cannot be created by validated operations;
- graph questions use stored people and edges;
- pending Community suggestions cannot appear in approved answers;
- professional Network edges cannot be invented from profile similarity;
- provider output is validated before it reaches graph state;
- a failed external service cannot silently discard local edits.

---

## Privacy

Relationship data is personal, so privacy is part of the product model rather than a settings afterthought.

### Current Personal workspace

- Workspace data is stored in the current browser.
- No account or cloud database is required.
- Paste List, CSV and deterministic Ask remain local.
- GitHub and LinkedIn URLs are stored as user-entered data and are not scraped.
- Voice recognition may be processed by the browser vendor.
- Free-form Compose sends only reduced context to a configured server-side provider.
- Circa does not make unsupported encryption claims.

### Planned shared experiences

- Community membership requires explicit consent.
- Opening an invitation does not silently join or authenticate a visitor.
- Public invitation previews expose only minimal safe information.
- Role permissions are enforced at the data boundary, not only by hiding buttons.
- Network imports are private by default.
- Network contribution is explicit, reversible and separate from membership.
- Private email information is not exposed through shared Network records.
- Server credentials and integration secrets never enter browser code.

---

## Community direction

Community extends Circa's relationship model into shared, approved local knowledge.

A Community may contain:

- a structured directory;
- services, schools, contacts and recommendations;
- upcoming events;
- collections or bin information;
- scheduled and recurring reminders;
- member suggestions;
- approved updates;
- an Ask experience based only on published data.

The permission model contains owner, admin and member roles.

Members can submit proposals, but a proposal remains pending until an authorised admin or owner approves or rejects it. A member cannot approve their own suggestion, promote themselves or overwrite the owner role.

Community timezone is the source of truth for event and reminder calculations. Recurring schedules must handle weekly, fortnightly and monthly behaviour without drifting because of browser timezone or daylight-saving changes.

The Community dashboard should prioritise useful information rather than generic analytics: the next collection, local information, upcoming events, reminders, Ask and recent approved updates.

---

## Optional WhatsApp direction

WhatsApp is a planned optional extension of Community, not a requirement for Community to function.

The intended first version uses a one-to-one Circa assistant through the official Meta WhatsApp Cloud API. It does not read existing group chats, automate a personal account or scrape WhatsApp Web.

The proposed linking flow is:

```text
Member chooses Connect
    ↓
Circa creates a short-lived, single-use token
    ↓
The member sends JOIN plus the token to Circa
    ↓
The server verifies the sender, token, user and Community
    ↓
The verified identity is linked
```

Connection consent and notification consent remain separate. A typed phone number alone is not proof of ownership.

Members should be able to control question access and reminder categories independently, disconnect one Community without breaking others, and use STOP to opt out.

Answers and reminders must use the correct Community and approved data only. Raw identifiers remain server-protected and only a masked number may appear in the client.

Webhook signatures, token expiry, token reuse and duplicate webhook deliveries must all be validated safely.

---

## Professional Network direction

Network is designed for understanding professional pathways without turning Circa into a contact spreadsheet.

The planned model includes:

- owner and member roles;
- a user's private LinkedIn export;
- an explicitly established self identity;
- optional, reversible contribution of real first-degree edges;
- search by name, company and position;
- a prominent Find a pathway flow;
- exact path and relevant-subgraph visualisation.

Only stored imported or intentionally contributed edges count. Circa does not infer a professional connection because two people share a company, location, school or similar name.

Shortest unweighted paths are calculated with deterministic graph traversal such as breadth-first search. A language model may help resolve the names in a question, but it never calculates connectivity.

Path results use careful wording such as **Known connection pathway** or **Potential introduction pathway**. Circa cannot promise that an introduction will happen.

Where several equally short paths exist, Circa returns a sensible bounded set in deterministic order. Large networks should be searched or visualised as relevant subsets instead of rendering the entire graph at once.

---

## Accessibility

Circa remains a visual product without becoming visual-only.

Accessibility requirements include:

- keyboard navigation where practical;
- visible focus and selection states;
- semantic buttons and clear labels;
- accessible names for icon controls;
- readable contrast;
- touch-friendly targets;
- reduced-motion support;
- relationship styles that do not rely on colour alone;
- shortcuts that do not interfere with text inputs;
- mobile controls designed for touch rather than merely shrinking desktop UI.

---

## Responsive behaviour

Desktop, tablet and mobile layouts are intentional variations of the same product.

On mobile:

- the canvas remains full-screen;
- the main toolbar becomes compact bottom navigation;
- the detail panel becomes a bottom sheet;
- buttons use touch-friendly hit areas;
- the landing page rearranges vertically;
- pinch zoom remains available where reliable;
- essential project and Compose flows remain usable.

The interface should avoid horizontal page overflow while allowing the canvas itself to pan freely.

---

## Performance and reliability

The canvas should remain smooth as a map becomes meaningfully populated.

Important implementation rules include:

- avoid unnecessary graph re-renders;
- avoid saving on every pointer movement;
- save after drag completion or a sensible debounce;
- keep connection rendering lightweight;
- bound provider context;
- avoid rendering an entire large Network when a path subset is enough;
- prevent duplicate submissions;
- expose loading, offline and pending states;
- preserve local work when a network-backed service becomes unavailable;
- show specific, understandable errors instead of a generic failure message.

Save state should remain quiet and useful, using states such as Saving, Saved, Saved locally, Offline or Sync issue rather than repeated disruptive notifications.

---

## Undo and deletion safety

Undo and redo are part of the editing model, not decorative toolbar actions.

The current canvas supports undo and redo, and a confirmed Compose batch becomes a single undo transaction.

Removing a person also affects connected relationships, so Circa presents an appropriate safeguard before destructive removal. Lightweight objects such as an empty note can use a simpler deletion path where sensible.

Resetting or restoring an entire workspace requires clear confirmation and retains recovery data where the current storage contract provides it.

---

## Local development

Install the project dependencies and start the development server:

```bash
npm install
npm run dev
```

Circa currently requires no account, Firebase project or cloud database for the local Personal workspace.

Free-form Compose requires an optional server-side provider configuration. Paste List, CSV and deterministic Ask do not.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Delete` or `Backspace` | Remove the selected item with the appropriate safeguard |
| `+` or `-` | Zoom in or out |
| `Escape` | Cancel the active tool or close the current panel |

Keyboard shortcuts are ignored or adapted while the user is typing into a field.

---

## Testing direction

Circa's highest-risk behaviour lives in graph correctness, storage, permissions and multi-step user flows. Testing should therefore cover more than visual rendering.

### Unit behaviour

- person resolution and ambiguity;
- relationship validation;
- duplicate detection;
- reporting-cycle prevention;
- Compose compilation;
- safe derived suggestions;
- deterministic shortest paths;
- Community timezone and recurrence calculations;
- token expiry and reuse;
- Network contribution visibility.

### Integration behaviour

- LocalStorage persistence and migration;
- backup and restore;
- stale-tab protection;
- Compose Create, Change and Ask boundaries;
- account return context when introduced;
- Community suggestion lifecycle;
- Network privacy and contribution;
- WhatsApp routing with external boundaries mocked.

### Browser journeys

- create and refresh a local Personal Map;
- add, move, connect and remove people;
- edit groups and notes;
- import a list or CSV;
- confirm or cancel a Compose draft;
- recover from ambiguous language;
- ask for a path that exists and one that does not;
- use core flows on desktop and mobile;
- preserve local maps through future sign-in and sign-out.

External integrations must not be described as live until they have been tested with real configuration.

---

## Current implementation

The current Circa V10 local workspace includes:

- a calm responsive landing page;
- a full-screen relationship canvas;
- people, threads, groups and movable notes;
- safe creation, editing, dragging and removal;
- “introduced by” relationship context;
- voice entry with typed fallback;
- Compose Create, Change and Ask review flows;
- deterministic list and CSV import up to 300 people;
- duplicate hints and reporting-cycle checks;
- Business Connections and Org Chart views;
- stored graph questions and visual highlights;
- trackpad, wheel, pinch and touch navigation;
- fit-to-content, undo and redo;
- autosave, visible failures and stale-tab protection;
- Workspace v3 migration and recovery copies;
- downloadable backup and restore;
- inline GitHub and LinkedIn URL validation without scraping;
- keyboard, reduced-motion and mobile support.

---

## Planned direction

The wider product requirements describe future or partially prepared work including:

- optional account-backed experiences;
- Firebase Authentication, Firestore and App Check for shared data;
- secure Community invitations and role-based access;
- approved directories, events, collections and reminders;
- member suggestion and moderation flows;
- optional one-to-one WhatsApp access;
- private LinkedIn export import;
- explicit professional Network contribution;
- multi-user deterministic pathway finding;
- longer-term relationship history and timeline concepts.

These items must be integrated without replacing the working local-first Personal architecture.

---

## Explicitly out of scope

The following are intentionally excluded from the current product boundary:

- relationship rankings, scores or gamification;
- popularity metrics and leaderboards;
- automatic relationship advice;
- LinkedIn scraping or invented API access;
- unofficial WhatsApp Web automation;
- LLM-computed graph paths;
- fake profile analysis;
- silent identity merging;
- payments and subscriptions;
- unrelated social-network integrations;
- replacing the existing application or backend architecture without a clear need.

---

## Development status

Circa is in active development. Storage formats, Compose behaviour, interface details and planned shared experiences may continue to evolve.

The standard for the project is straightforward:

- preserve working behaviour;
- make difficult states visible;
- never claim an integration works when it has not been verified;
- document remaining limitations;
- prefer correctness, privacy and clarity over superficial feature count;
- protect the calm, tactile canvas experience as the product grows.

Circa should always remain a place for understanding people—not measuring their worth.
