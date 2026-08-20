# Circa launch-readiness repair plan

Last reviewed: 20 August 2026  
Authoritative source inspected: local `v17-phase1-hardening` branch at `20fb3e6`  
Original input covered: all 100 numbered findings in the supplied launch-readiness audit

## Decision and release scope

Circa is not ready for an unrestricted public launch today. It has a strong product core, a passing TypeScript check, a passing lint check, a successful direct Vinext production build, and broad deterministic graph/Compose coverage. The remaining work is concentrated in release provenance, Personal-map access and durability, cloud privacy/lifecycle, Firestore invariants, Community and Network edge cases, production operations, and legal transparency.

The release decision for messaging is final:

- Remove the WhatsApp feature completely from the shipped product.
- Remove its public copy, UI, client code, server code, functions, secrets, rules, tests, styles, data fields, scheduled jobs, setup instructions, and deploy configuration.
- Keep Community reminders only if they have a real in-app delivery/recurrence model. Do not leave recurrence controls that merely store a label.
- This plan may name the removed feature for traceability; the runtime product, public marketing, shipped assets, environment template, and active setup documentation must not.

Recommended launch statuses until the gates in this document pass:

| Experience | Status now | Status allowed after P0 |
| --- | --- | --- |
| Personal Maps | Blocked by sign-in regression and save/data-loss defects | Live |
| Community | Private beta only | Beta, then Live after Community gates |
| Network | Private beta only | Beta until scale and privacy gates pass |
| Compose/Ask | Local semantic and deterministic Ask are usable; provider route is not production-secure | Live locally; provider-backed Describe only after server gates |
| WhatsApp | Removed from source; production-host cleanup and deployment verification pending | Removed |

## Evidence from the current repository

The old audit's statement that GitHub was empty is no longer current. The public repository contains source and history. However, release provenance is still incomplete:

- `origin/main` is `4b7455e`.
- the local hardening branch is `20fb3e6`, five tracked files ahead of `origin/main`, and does not track a remote branch;
- this repair plan, `MANUAL_EXTERNAL_HARDENING.md`, the removal regression test and `tests/v17-critical-hardening.test.mjs` are currently untracked;
- misleading V17 installers, verifiers, phase documentation and backup folders were removed from the product tree during P0.1 and preserved in the external historical archive `circa-p0-1-source-archive`;
- the retained V17 critical suite still has nine failing assertions, all assigned to later P0 workstreams.

### Verification results on 20 August 2026

| Check | Result | Meaning |
| --- | --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | Pass | Current tracked TypeScript compiles. |
| direct ESLint over `app`, functions and tests | Pass | No current lint errors. |
| `node node_modules/vinext/dist/cli.js build` | Pass | Production code can build directly. |
| `npm run build` | Fail on Windows | The declared build requires `bash`; there is no cross-platform canonical runner. |
| existing functional/static suite | 146 pass, 0 fail | Personal graph, deterministic Ask, semantic Compose, Community schedules, UI logic and the P0.1 absence gate pass. |
| V17 critical hardening suite | 2 pass, 9 fail, 0 skipped | Save navigation, introducer deletion, relationship direction, LinkedIn parsing, Compose security, privacy copy, cloud migration, directory IDs and CI remain open for later P0 workstreams. |
| Firestore emulator suite | 10 pass, 0 fail | Rules and the explicit Network-contribution fixture now agree. |
| `npm audit --omit=dev` | 0 vulnerabilities | Removing orphaned feature-only server dependencies removed the six former production advisories. |
| clean build and local production smoke | Pass | `/`, `/start`, and a Community route returned 200; none of their HTML or the clean `dist` contained the removed product name. |
| bundle inspection | Warning | `FirebaseProvider` chunk is about 667 KB, the main page chunk about 162 KB, and the favicon SVG is 1,021,390 bytes. |
| CI | Missing | `.github/workflows/ci.yml` and a cross-platform test runner do not exist. |

## Definition of launch-ready

Circa is launch-ready only when all of the following are true:

1. The exact production deployment points to a pushed commit on the canonical protected branch.
2. Personal Maps open while signed out and continue to work if Firebase, App Check, analytics, or the network is unavailable.
3. Leaving a canvas is impossible after a failed save unless the user explicitly exports or discards the unsaved state.
4. The runtime/public product has no WhatsApp implementation or claims.
5. Every P0 test, including Firestore adversarial tests and browser E2E, passes in CI against the production candidate.
6. Deployed Firestore rules and indexes are verified as the versions in that commit.
7. Community members cannot directly publish, alter, or delete approved content; every member change goes through review.
8. Network imports remain private by default and revoked contribution data becomes unreadable immediately.
9. Provider-backed Compose is authenticated, App-Check-aware when enforced, size-bounded, rate-limited in shared storage, and explicit about server processing.
10. Privacy information, account export/deletion, Community/Network leave, ownership handling, retention, and processor records are in place before real cloud data is accepted.
11. Production has security headers, error monitoring, user-facing failure states, backups, a rollback procedure, and a tested incident path.
12. Public claims label every experience accurately as Live, Beta, Preview, or Disabled.

## P0 — stop-ship work

### P0.1 — remove WhatsApp completely

**Implementation status (20 August 2026): source and local verification complete; external production cleanup still open. Do not mark P0.1 globally complete until both unchecked external gates below are evidenced.**

Verified completion evidence:

- [x] Feature-only client, function, scheduler, webhook, adapter, security, generic orphan-helper and obsolete test files deleted.
- [x] UI copy, invitation examples, directory import copy, member/integration types and integration-only CSS removed or rewritten.
- [x] Feature collections, reminder-delivery rules, scheduler index, environment variables, dependency entries and active documentation removed.
- [x] Obsolete phase installers, verifiers, backup folders and misleading phase documentation moved outside the product tree into `circa-p0-1-source-archive`.
- [x] Authenticated production Firestore inventory found none of the removed top-level or collection-group records, including no subscription, identity, link-request, processed-message or delivery documents.
- [x] TypeScript and ESLint pass; 146/146 functional/static tests and 10/10 Firestore emulator tests pass; the clean direct production build and three-route smoke test pass.
- [x] The source/build absence regression passes and `npm audit --omit=dev` reports zero vulnerabilities.
- [ ] Netlify production environment variables, old deployed function URLs and scheduled jobs have been inspected and removed; a clean source deployment is live.
- [ ] Any historical Meta application webhook/token is disconnected or revoked and the provider dashboard evidence is attached.

Delete these feature-only runtime files:

- `app/cloud/whatsappClient.ts`
- `netlify/functions/whatsapp-disconnect.ts`
- `netlify/functions/whatsapp-integration-status.ts`
- `netlify/functions/whatsapp-link-start.ts`
- `netlify/functions/whatsapp-preferences.ts`
- `netlify/functions/whatsapp-reminders.ts`
- `netlify/functions/whatsapp-status.ts`
- `netlify/functions/whatsapp-webhook.ts`
- `server/messaging/WhatsAppAdapter.ts`
- `server/messaging/CommunityMessagingAdapter.ts` if no other adapter uses it
- `server/whatsappSecurity.ts`
- `tests/whatsapp-security.test.ts`

Remove or rewrite all remaining references in:

- `app/page.tsx` — remove the “connected reminders” marketing claim;
- `app/community/[projectId]/CommunityClient.tsx` — replace the invitation-label example;
- `app/community/[projectId]/DirectoryImportTool.tsx` — use provider-neutral local-file copy;
- `app/cloud/types.ts` — remove the integration type and member phone/integration flags;
- `app/globals.css` — delete integration-only selectors and stale preference styles;
- `firestore.rules` — remove integration subcollections and top-level server collections after any required data export/purge;
- `firestore.indexes.json` — remove delivery/scheduler indexes that are no longer used;
- `.env.example` — remove Meta and WhatsApp variables;
- `package.json` — remove the old security test and dependencies that become unused; retain `firebase-admin` only if the secured Compose route needs it;
- `CLOUD_ARCHITECTURE.md`, `FIREBASE_SETUP.md`, `README.md`, `README_V17_PHASE1.md`, `MANUAL_EXTERNAL_HARDENING.md` and obsolete patch scripts — rewrite active documentation, and archive historical material outside shipped/current docs if it must be retained;
- `tests/firestore-rules.test.ts`, `tests/v16-community-ux.test.mjs`, and `tests/v17-critical-hardening.test.mjs` — remove obsolete assertions and add a runtime/public absence test.

External cleanup:

- remove the Meta webhook and scheduled function configuration;
- delete the feature's secrets from Netlify and any other host;
- revoke Meta tokens and disconnect the app if they were ever real;
- inventory and delete or retain existing integration collections under an explicit retention decision;
- remove TTL policies that only served removed collections;
- clean-build `dist` so deleted functions/assets cannot survive from an older build.

Acceptance gates:

- a clean build contains no integration endpoints;
- `rg -i` over `app`, `public`, `server`, `netlify`, active docs, `.env.example`, `package.json`, rules and indexes finds no runtime/public mentions;
- Netlify exposes none of the old function URLs;
- Community, Network, Personal, Auth, Compose and reminders still build and pass tests;
- no obsolete secret remains configured.

### P0.2 — restore genuinely account-free Personal Maps

Current defect: `Landing` sends signed-out users to `/auth?returnTo=/start`, `/start` requires a permanent account, and `/?workspace=1` redirects to Auth. In addition, `app/firebase/client.ts` requires all Firebase variables at module evaluation while `FirebaseProvider` wraps the entire app. A Personal-only visitor therefore still depends on cloud configuration.

Required changes:

- make every “Open Circa” and “Personal Map” action open the local workspace directly;
- remove the auth redirect for `/?workspace=1`;
- reserve `/auth` for explicit Sign in, Community, Network and optional cloud actions;
- lazy-load Firebase only when a cloud route or explicit account action needs it;
- make a missing/failed Firebase configuration non-fatal to `/` and Personal Maps;
- avoid loading Analytics, Auth, Firestore and App Check in the Personal-only critical path;
- keep `/start` only if it adds value; it must not be required before entering Personal;
- preserve local data through sign-in, sign-out, account upgrade and Firebase failure.

Acceptance gates:

- signed-out homepage → Open Circa → local hub/canvas with no auth page;
- refresh, offline mode, blocked App Check, sign-in and sign-out do not remove or hide the local workspace;
- Personal works with all Firebase environment variables absent in a dedicated test build;
- the landing copy, README and route behaviour agree.

### P0.3 — eliminate known Personal data-loss paths

Current defects proven by the failing V17 suite:

- `performSave` catches and resolves a failed write, `flushPendingSave` swallows it, and Done/project-switch/new-project navigation proceeds;
- deleting a person who was only the introducer deletes the entire endpoint relationship in both `deleteGlobalPerson` and `SketchCanvas.deleteNow`;
- reconnecting an existing reverse-ordered relationship updates direction without reorienting `sourceId` and `targetId` to the user's chosen source/target.

Required changes:

- propagate save failure to navigation and show “Stay on canvas / Export backup / Retry”; never present a failed save as complete;
- clear `introducedByPersonId` when only the introducer is deleted, while still deleting edges whose actual endpoint is deleted;
- reorient an existing edge before applying a directional relationship update;
- add storage quota preflight/error handling, a visible backup reminder, corruption recovery choice, and a recovery-copy UI;
- cap restore file size before reading/parsing it;
- add old-schema fixtures and destructive tests for 50, 100, 250 and 500-person workspaces;
- keep stale-tab conflict protection and add explicit discard/overwrite wording.

Acceptance gates: the nine V17 hardening assertions relevant to Personal pass, quota/corruption tests pass, and E2E proves a failed save cannot navigate away silently.

### P0.4 — remove or finish the broken cloud migration feature

Current defect: `CloudMigrationCard` is public UI, but its marker and workspace paths are denied by current Firestore rules, the owner membership payload lacks `consented: true`, the migration has no retriable state machine, and folders/global people are not copied to readable cloud collections. The product also has no complete cloud-map open/restore/export/delete experience.

Choose one safe launch option:

1. Recommended for the first release: remove/feature-flag the cloud-copy card and keep Personal strictly local-first; or
2. finish the feature end-to-end with `preparing → importing → verifying → complete/failed`, idempotent retries, consent fields, folder/global-person fidelity, rules, a read/restore path, export, deletion and recovery semantics.

Never ship a “Cloud copy ready” status for data the user cannot reopen, verify, export, or delete.

### P0.5 — re-establish Community publication invariants

Current rule `lists/{listId}/items/{itemId}` permits a member to delete an approved record when `createdBy` matches their UID. The UI exposes “Delete my information.” This contradicts the product invariant that members propose and admins publish.

Required changes:

- route member create/update/delete requests through `editProposals` only;
- remove direct member deletion from rules and UI;
- require a pending proposal, immutable submitter/base fields, reviewer UID equal to the authenticated reviewer, server review time, and a strict allowed-field diff;
- add stale-base/version checks so approval cannot overwrite newer published data;
- retain a minimal immutable moderation event for publish, approve, reject, membership and role changes;
- fix removed-member rejoin: the current transaction updates an existing removed membership, but the rules do not permit that update path;
- keep owner role non-transferable except through a dedicated, explicit ownership-transfer transaction;
- define owner-account deletion: transfer, archive, or confirmed recursive deletion;
- make joining idempotent under double-click, refresh and timeout retry;
- stop exposing raw public join-code documents as the long-term redemption mechanism. Redeem codes through a rate-limited server endpoint, use collision-checked cryptographic codes, and return only the minimum preview;
- keep project URLs and invite URLs separate; a guessed project ID must never create membership.

Acceptance gates: adversarial emulator tests cover cross-project reads, role escalation, self-review, forged reviewer metadata, direct member deletion, expired/revoked invite, removed-member rejoin, duplicate join and owner preservation.

### P0.6 — secure provider-backed Compose without breaking local Compose

Current strengths: provider context drops phone, email and notes; graph context is bounded; semantic output is validated; mutation requires review; deterministic Ask is well tested.

Current defects: `POST /api/compose` is unauthenticated, rate limits live in an instance-local `Map`, `content-length` can be absent, and the UI does not clearly distinguish browser-only parsing from server processing.

Required design:

- keep Paste List, CSV, deterministic Ask and preferably the local semantic interpreter in the browser with no account requirement;
- require a verified permanent Firebase session for any request that can call a paid/external provider;
- verify App Check on protected server requests after production metrics prove legitimate tokens work;
- use Firestore/shared rate limiting keyed by UID plus privacy-preserving network signal, not a process-local map;
- stream/read the body with an enforced byte cap even when `content-length` is absent;
- add timeout, abort, maximum provider-response size, JSON/schema failure and retry-safe errors;
- treat imported/user strings as data delimiters and keep validation authoritative after any prompt injection attempt;
- tell the user: Describe sends the description and limited Project context to Circa's server; Paste List/CSV stay in the browser;
- publish provider name/purpose/retention in the Privacy Notice and send no unrelated project data.

### P0.7 — create a reproducible release chain

Required changes:

- choose one canonical hosting architecture and remove or clearly isolate unused Cloudflare/D1/example scaffolding;
- create `scripts/run-tests.mjs` and cross-platform `test:unit`, `typecheck`, `test:firestore`, `build` and `test` scripts;
- make `npm run build` work on Windows and Linux; do not make normal validation depend on Bash/GNU `timeout`;
- add `.github/workflows/ci.yml`: `npm ci → typecheck → lint → unit/static tests → Firestore emulator → build → artifact validation → critical E2E`;
- include every `tests/*` file automatically or by an audited manifest, so new tests cannot be silently omitted;
- push the hardening branch, open a reviewed PR, protect `main`, and require CI;
- configure Netlify to build only the canonical protected branch and show the Git commit in deployment metadata;
- use preview deployments for auth/App Check/routing tests;
- document rollback to the last known-good commit and rules/index versions;
- do not commit `.v17-*` backup folders, private seed data, local environment files, generated build output, or one-off installers.

### P0.8 — finish privacy, account lifecycle and user control before cloud launch

Required product/data decisions:

- map every field and collection: source, purpose, visibility, processor, location, retention, export and deletion behaviour;
- define what stays local, what may be copied to Circa cloud, what a Community sees, and what a Network contribution exposes;
- publish an accessible Privacy Notice with controller/contact, purposes, lawful basis, recipients/processors, transfers, retention, rights, export/deletion and information obtained about non-users;
- classify LocalStorage, Firebase persistence, Auth, App Check/reCAPTCHA, Analytics and any telemetry under the current storage/access rules; enable consent before non-essential analytics rather than adding a blind generic banner;
- implement cloud export, account deletion, leave Community, leave Network, contribution withdrawal, and ownership handling;
- decide retention for removed memberships, rejected proposals, expired invites, rate-limit records, imports, audit events and backups;
- assess whether school/under-18 use is likely, set the target age and defaults, and complete the applicable Children's Code assessment before marketing to school-age users;
- screen and complete a DPIA where the intended processing is likely high risk;
- prohibit inference of sensitive characteristics and document that invariant;
- review contracts/configuration for Firebase, Netlify and any AI provider;
- obtain qualified UK privacy/legal review before public cloud launch.

Useful current official guidance: [ICO privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/), [storage and access technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/), [Children's Code coverage](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/), and [DPIAs](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/).

### P0.9 — production security and operational baseline

- add and test CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors`, Referrer Policy and Permissions Policy without breaking Firebase/App Check;
- add secret scanning and dependency scanning in CI; confirm only `.env.example` is tracked and rotate anything ever exposed;
- run dependency audit in CI and record an upgrade or time-bounded exception for any future actionable advisory; the post-P0.1 production audit is currently clean;
- verify Firebase Auth domains, email/Google/reset flows, App Check token generation and enforcement in the production origin;
- add privacy-safe error monitoring with release/commit tags and no graph/contact content in payloads;
- define backup, restore, incident response, rollback and production smoke-test ownership;
- add explicit 404, permission-denied, offline, invalid/expired invite, Firebase unavailable, App Check failure and retry states; no route may remain on an infinite spinner;
- audit Firestore IndexedDB on sign-out/shared machines and clear or partition cloud cache as required;
- deploy rules/indexes from CI or a controlled release job, then run production read/write smoke tests with two isolated users.

## P1 — complete each experience

### P1.1 — Community correctness and reliability

- add `onSnapshot` error callbacks to every listener and a retry/unavailable state;
- make Community project type validation explicit before opening a route;
- replace fire-and-forget admin operations with busy, success and error handling;
- use collision-resistant directory import IDs rather than a slug that can overwrite a different contact;
- validate and normalise email, phone, URL, dates, timezone and custom fields at the repository boundary;
- make directory imports transactional/recoverable enough to avoid a misleading partial-success state;
- implement real timezone conversion for `datetime-local`; a local wall time must be interpreted in the Community timezone, not the admin browser timezone;
- either implement a real recurrence engine for weekly, fortnightly and monthly in-app reminders or remove repeat controls. A reminder must advance after occurrence and must not depend on a member keeping the page open;
- test Europe/London DST boundaries, month ends, retry/idempotency and multiple tabs;
- define Community archive/delete and recursive subcollection cleanup;
- add pagination for members, items, proposals, reminders and account memberships beyond the current 100/200/500 caps;
- add private invitation metadata/social previews without leaking Community data;
- retain approved-data-only deterministic Community answers and test that pending/stale proposals never enter them.

### P1.2 — Network correctness, privacy and scale

- reject non-LinkedIn profile URLs, unmatched CSV quotes and files over an explicit 10,000-row limit before import;
- cap decoding/memory and test BOM, encodings, quoted commas, reordered/missing fields, malformed dates/URLs and incomplete exports;
- reconcile a new import with the previous import so removed connections do not persist forever and retries do not duplicate weak-identity rows;
- make import workflow states recoverable and show partial/batch failure accurately;
- clarify self-identity UX: a Connections export normally does not contain the user's own profile; do not suggest another connection as “you”;
- use a keyed/HMAC server identity fingerprint if fingerprints are stored across users, with a rotation/migration plan;
- add rules that validate Network edge endpoints, owner UID, provenance and allowed fields;
- fix `NetworkPath` rejection handling so unauthorized/failed reads end in an error, not an infinite loader;
- do not attach the admin-only invitations listener for ordinary members;
- replace per-member contribution N+1 reads and the 2,000-contributor cap;
- replace “download every consenting member's complete graph into every browser” with an indexed/denormalised pathway service or bounded server-side search;
- provide server-side/paginated person search, explicit “Show more,” query-cost budgets and path limits;
- add realtime or explicit refresh semantics so another member's contribution/revocation changes the graph immediately;
- implement leave/delete/import purge and prove withdrawn edges disappear from future path results;
- keep no-name-only merge, no-company inference, real-edge-only paths and cautious “known pathway” wording.

### P1.3 — Authentication and account UX

- create reusable cloud route/session/membership boundaries instead of duplicating checks in each page;
- give Auth initialization a bounded timeout, retry and Firebase-unavailable state;
- test signup, sign-in, wrong password, existing email, reset, popup blocked/closed, redirect completion, refresh persistence, disabled user, network failure and sign-out;
- either implement anonymous invite membership and prove UID-preserving upgrade, or remove the unused anonymous-session code and state clearly that joining requires a permanent account;
- keep `safeReturnTo`; add regression tests for encoded/backslash/protocol-relative open redirects;
- implement account export/delete and clear explanations of local-vs-cloud effects;
- ensure account deletion cannot orphan a Community/Network owner;
- audit display names/emails so raw emails do not leak into member directories.

### P1.4 — Personal quality, accessibility and device support

- automate keyboard creation, selection, editing, connecting, deletion, Compose, modal close and restore journeys;
- test focus entry/trap/return in every modal, panel and mobile sheet;
- ensure all pointer-only drag/resize operations have an accessible alternative;
- verify relationship meaning does not depend on colour; retain labels, texture, weight and direction;
- preserve `prefers-reduced-motion` and test it;
- test 320, 360, 375, 768 and desktop widths, including toolbar overflow and bottom sheets;
- run real-device iOS Safari and Android Chrome pan/drag/pinch/scroll tests;
- stress 50/100/250/500-person maps and profile LocalStorage serialization, canvas DOM/SVG, fit-to-content and undo memory;
- add browser support/fallback copy for voice input and disclose browser-vendor speech processing.

### P1.5 — performance, observability and maintainability

- replace the 1,021,390-byte raster-in-SVG favicon with a clean small vector/PNG without embedded metadata;
- code-split Firebase/cloud routes so Personal does not download the roughly 667 KB Firebase provider chunk;
- lazy-load QR, Community, Network, Compose-provider and other route-specific code;
- establish Web Vitals/bundle budgets and fail CI on material regressions;
- monitor Firestore reads/writes, listener counts, rule denials, provider requests/cost and import sizes without logging personal graph data;
- split `SketchCanvas.tsx`, `CommunityClient.tsx`, `graphStore.ts` and the monolithic CSS into testable domain modules;
- validate Firestore DTOs on reads as well as writes instead of trusting casts;
- remove dead D1/Drizzle/example infrastructure if Netlify/Firebase is canonical, or document why it remains;
- create feature flags/kill switches for Community, Network and provider-backed Compose, independent of Personal.

## P2 — broad-launch polish

- add a small public footer with Privacy, Terms, Help/Contact and status/support links;
- add an in-product beta feedback/report-data-loss/privacy-concern route;
- add a custom domain and align OAuth/App Check/canonical origins;
- add canonical URL, OG/Twitter image, complete icons and route-specific safe invite metadata;
- create a public status/incident communication approach;
- decide whether Circa is an installable offline PWA. A manifest alone is not an offline guarantee;
- add product analytics only after classification, consent where required, minimisation and privacy review;
- keep a release changelog, data migration notes and a support runbook.

## Recommended implementation sequence

Each phase should be a separate reviewed, reversible PR. Do not mix rule migrations, destructive data cleanup and large UI changes in one release.

1. **Baseline PR:** commit this plan, add CI/cross-platform runners, align the Firestore fixture with consent rules, and make the current suite reproducible.
2. **Removal PR:** complete P0.1, clean build artifacts and revoke external configuration.
3. **Personal PR:** P0.2 and P0.3; ship account-free Personal only after browser E2E.
4. **Cloud migration decision PR:** remove the card or finish P0.4. Do not leave it half-live.
5. **Community rules PR:** P0.5 plus emulator/adversarial tests; deploy rules/indexes only after preview testing.
6. **Compose server PR:** P0.6 with authentication, App Check readiness, shared limits and disclosure.
7. **Privacy/account PR:** P0.8 and P1.3 before accepting unrestricted cloud users.
8. **Community product PRs:** P1.1, split into moderation, invitations, reminders/time and deletion/ownership.
9. **Network product PRs:** P1.2, split into import correctness, identity/privacy and pathway scale.
10. **Operations PR:** P0.9, monitoring, headers, backups, rollback and release smoke tests.
11. **Device/performance PRs:** P1.4 and P1.5.
12. **Broad-launch PR:** P2, final copy/status review, custom domain and go-live checklist.

## Required acceptance suite

### Personal

- signed-out open/create/save/reload;
- sign-in/sign-out does not alter local data;
- save failure blocks Done/switch/new project;
- export/restore/corruption/quota/recovery;
- V1/V2/V3 fixtures;
- introducer deletion and directed-edge reorientation;
- stale-tab conflict and explicit overwrite;
- 50/100/250/500-person stress;
- keyboard, touch, reduced motion and 320 px layout.

### Auth/account

- email/Google/reset/error/popup/redirect/persistence/sign-out;
- internal-only return path;
- account export/delete;
- Community/Network leave and contribution withdrawal;
- ownership transfer/archive/delete;
- shared-machine cache behaviour.

### Community

- create/invite/QR/code/consent/join/retry/rejoin/revoke/expire;
- member cannot list raw membership, publish, edit, delete, self-promote or self-review;
- admin review uses immutable proposal fields and stale-base protection;
- approved data only in Ask;
- cross-Community isolation;
- recurrence/timezone/DST/month end;
- listener offline/permission/App Check failures;
- recursive delete/backup/restore.

### Network

- hostile/large CSV matrix and retry-safe import;
- private default and private fields unreadable by another member;
- explicit contribution on/off and immediate revocation;
- no name/company/school inference;
- deterministic cross-user identity evidence;
- exact path/no path/ambiguity and no silent truncation;
- large-network query/cost/performance bounds;
- leave/delete/import purge.

### Compose/Ask

- local modes work signed out and offline;
- external Describe requires auth and respects App Check policy;
- streamed body/response limits, shared throttling, timeout and abort;
- schema rejection, prompt injection strings and ambiguous people;
- no direct mutation before Apply;
- minimal provider payload assertion;
- provider failure never blocks the core map;
- deterministic graph answers only.

### Release/operations

- clean `npm ci` on Linux and Windows;
- typecheck, lint, all tests, emulator, build and E2E in CI;
- preview environment smoke test;
- security headers and secret scan;
- dependency audit decision recorded;
- production commit/rules/index match;
- rollback drill and restore drill;
- privacy/legal/footer/status links present;
- no removed messaging runtime/public surface.

## Additional defects found in the current source

These are not merely restatements of the supplied audit. They were confirmed while tracing the current local branch and must remain in the delivery backlog.

| ID | Confirmed current defect | Required resolution |
| --- | --- | --- |
| X1 | Resolved in P0.1: the misleading phase README is no longer in the product tree; the real V17 suite still reports its nine later-workstream failures. | Keep status documentation evidence-based. |
| X2 | Resolved in P0.1: misleading installers, verifiers and backups were moved to an external historical archive. | Do not restore or execute the archived installers against current source. |
| X3 | Personal save failures are swallowed before project switching, leaving the canvas, or creating a project. | Propagate the failure, keep the user in place, retain the dirty snapshot, and provide retry/export recovery. |
| X4 | Deleting an introducer also deletes relationships between two other people. | Clear `introducedByPersonId` when the deleted person is not an endpoint; delete only true endpoint edges. |
| X5 | Reusing an existing relationship can change its label without reorienting `sourceId` and `targetId`. | Update direction and endpoints atomically and add a regression test. |
| X6 | Cloud migration writes to rule-denied paths and creates owner membership without the consent field required by rules. | Remove the exposed migration for launch or implement and emulator-test the complete state machine. |
| X7 | A Community member can directly delete their published item although the product promises admin moderation. | Route deletion through proposals and enforce that invariant in Firestore rules. |
| X8 | Rejoining after a removed membership attempts fields that the self-update rule does not allow. | Add a safe server/rules reactivation path and test active, pending, removed, and banned states. |
| X9 | Directory import IDs are slug-derived and can collide or overwrite. | Use collision-resistant stable digests plus duplicate review and provenance. |
| X10 | Reminder recurrence is stored, but delivery is only an in-page toast while the page remains open; timezone parsing uses the admin browser. | Build a real in-app scheduler with Community timezone/DST and recurrence advancement, or remove recurrence controls. |
| X11 | Network path and invitation listeners lack appropriate permission/network error handling; a member can see an endless loader or trigger an admin-only listener. | Add listener error callbacks and subscribe only when authorized. |
| X12 | Provider-backed Compose is unauthenticated and uses process-local throttling plus a header-only request-size check. | Require permanent auth, add shared limiting, count streamed bytes, cap responses, and enforce timeout/abort. |
| X13 | `public/favicon-v2.svg` is a 1,021,390-byte raster/base64 asset with metadata. | Replace it with clean, small SVG/PNG/ICO assets and verify caching and social previews. |
| X14 | There is no CI; the standard test command omits newer suites; the Firestore emulator suite is 9/10 because its contribution fixture and rules disagree. | Establish one cross-platform all-tests entry point and make CI, rules, fixtures, and production deployment agree. |
| X15 | Firebase is eagerly loaded for the whole app, a Firebase client chunk is about 667 KB, and several alternative deployment stacks remain in the tree. | Lazy-load cloud code, measure budgets, and choose/document one canonical production architecture. |

## Traceability for every supplied audit finding

Status is the state of the current local source, not a claim about a future installer. “External verification” means repository inspection alone cannot prove the deployed setting. Every non-resolved row is covered by the named work package and its acceptance gates above.

| # | Audit finding | Current disposition | Required package / gate |
| ---: | --- | --- | --- |
| 1 | GitHub source-of-truth repository is empty | Historical statement is resolved: the public repository now has source and history; local changes still are not on the canonical remote. | P0.7 canonical branch and commit provenance |
| 2 | Cannot prove which source produced Netlify | Open | P0.7 immutable commit-to-deployment evidence |
| 3 | Personal Circa appears to require sign-in | Confirmed regression | P0.2 account-free Personal acceptance |
| 4 | Production is not tied to a passed acceptance suite | Open | P0.7 CI and complete acceptance gate |
| 5 | Firestore production rules deployment unverified | External verification required; local emulator suite is also not fully green. | P0.5 and P0.9 rules hash plus adversarial emulator suite |
| 6 | App Check production enforcement unverified | External verification required | P0.6/P0.9 monitoring-first enforcement record |
| 7 | Public Privacy information undiscoverable | Open | P0.8 notice and global navigation |
| 8 | Third-party people data needs a privacy model | Open | P0.8 data map, lawful basis, rights and retention |
| 9 | School use creates under-18 considerations | Product/legal decision required | P0.8 age scope and Children's Code screen |
| 10 | Public product advertises unclear features | Open; removed messaging copy is part of this mismatch. | P0.1 plus explicit product-status copy |
| 11 | LocalStorage creates data-loss risk | Partly mitigated by migrations/restore/stale-tab code; known save-loss and recovery gaps remain. | P0.3 durability matrix and stress tests |
| 12 | No verified production rollback path | Open | P0.7/P0.9 rollback drill |
| 13 | Auth protection duplicated by screen | Open | P1.3 shared route/access model |
| 14 | Auth loading needs a failure timeout | Open | P1.3/P0.9 timeout, retry and visible failure state |
| 15 | Auth edge cases need production testing | Open | P1.3 E2E matrix |
| 16 | Anonymous-to-permanent upgrade must preserve identity | Upgrade code exists, but current Community join does not use the anonymous session path. | P1.3 choose and test one coherent policy |
| 17 | `returnTo` must allow safe internal routes only | Resolved in current code and covered by local tests | Keep security regression gate |
| 18 | Account deletion/export/leave flows | Open | P0.8/P1.3 lifecycle implementation and proof |
| 19 | Logout local-cache privacy review | Open | P0.9 shared-device policy and test |
| 20 | Supplied Community URL cannot be independently assessed without client boot | Partially architectural; loading/error/empty/offline states remain incomplete. | P1.1 browser E2E and failure-state gates |
| 21 | Community project URLs and invitation URLs must differ | Mostly resolved by separate routes; deployed behaviour still needs E2E proof. | P0.5 URL/invite acceptance |
| 22 | Join-code brute-force protection | Open; lookup is public and has no shared limiter. | P0.5 server redemption, collision and rate-limit tests |
| 23 | Invite creation must use secure randomness | Resolved in current code | Keep deterministic security test |
| 24 | Joining must be idempotent | Active membership is substantially handled; removed-member rejoin is broken. | P0.5 membership-state matrix |
| 25 | Owner role preservation | Locally rule-tested; production deployment still must be proven. | P0.5/P0.9 emulator and rules-hash gate |
| 26 | Moderation must be enforced in Firestore | Confirmed open: member direct-delete contradicts the invariant. | P0.5 proposal-only mutation rules |
| 27 | Pending information must not leak into Ask or messaging | Community Ask currently consumes published data only; messaging is being removed. | P0.1 and keep published-only regression test |
| 28 | Community time and recurrence need DST testing | Bin logic has useful DST coverage; reminder scheduling/recurrence is not real. | P1.1 scheduler and timezone matrix |
| 29 | Community ownership deletion policy | Open | P0.5/P0.8 transfer, archive, delete and retention policy |
| 30 | Moderation/audit history for Communities | Partial proposal records exist; immutable reviewer/audit constraints are incomplete. | P0.5 strict audit schema and retention |
| 31 | Imported professional data private by default | Resolved locally by default privacy rules | Keep adversarial privacy test |
| 32 | Network contribution explicit and reversible | Substantially improved; one rules fixture disagrees and production is unverified. | P1.2/P0.9 revocation and deployed-rules proof |
| 33 | Identity must not merge by name | Resolved and tested | Keep identity regression gate |
| 34 | Cross-user identity linking needs deterministic evidence | Partial: URL digest evidence exists; privacy model and collision/keying review remain. | P1.2 identity-evidence design and adversarial tests |
| 35 | Pathfinding must not silently stop at a query limit | Partial: contribution queries paginate, but UI and contributor limits remain. | P1.2 completeness metadata and no-silent-truncation tests |
| 36 | Network cannot download every connection forever | Open scalability issue | P1.2 server-side/projection architecture and cost budgets |
| 37 | No inferred professional relationships | Resolved and tested | Keep no-inference gate |
| 38 | LinkedIn stays export-file import, not scraping | Resolved by current product model | Keep copy and implementation constraint |
| 39 | CSV importer hostile/large-file tests | Open gaps: malformed quotes, URL validation and 10k-row cap. | P1.2 parser hardening and resource-budget matrix |
| 40 | Path results describe only known facts | Resolved in current wording/tests | Keep semantics regression gate |
| 41 | AI output never directly mutates graph | Resolved: review/apply boundary exists and is tested. | Keep Apply-only mutation gate |
| 42 | Strict AI response schema validation | Implemented locally but provider boundary still needs full hostile-response coverage. | P0.6 schema/size/timeout tests |
| 43 | Compose ambiguity must ask, not guess | Resolved across broad local tests | Keep ambiguity corpus |
| 44 | Prompt/context privacy minimisation | Mostly implemented for graph fields; disclosure and provider E2E proof remain. | P0.6 payload assertion and privacy copy |
| 45 | Prompt injection through content | Partial protections; adversarial corpus incomplete. | P0.6 hostile-input suite |
| 46 | AI request limits | Confirmed open in production terms | P0.6 shared rate, byte, response and timeout limits |
| 47 | AI-provider failure cannot stop core Circa | Local fallbacks exist; browser/E2E proof is still needed. | P0.6 provider-outage acceptance |
| 48 | ASK remains deterministic | Resolved and tested | Keep deterministic, provider-free gate |
| 49 | Establish whether WhatsApp is live | Source/runtime implementation removed and locally verified; deployed Netlify/provider state remains externally unverified. | Close P0.1 only after production endpoint/provider evidence |
| 50 | Meta credentials server-side | Local environment template and production dependency removed; hosted secret deletion/token revocation remains external. | P0.1 Netlify/provider cleanup |
| 51 | Webhook signatures validated | Source endpoint removed; deployed endpoint must be verified absent after clean deployment. | P0.1 production route inventory |
| 52 | Linking tokens expire and are single-purpose | Source flow removed; authenticated Firestore inventory found no stored link-request or identity records. | P0.1 provider cleanup only |
| 53 | STOP/disconnect/preferences behaviour | Resolved in source by removing the controls, fields, routes and documentation. | Keep source/build absence regression |
| 54 | Scheduled reminders are idempotent | Removed delivery scheduler and index; retained in-app reminder truthfulness remains P1.1. | P1.1 in-app scheduler gate |
| 55 | Messaging answers use approved Community data only | Resolved by deleting the answer/delivery runtime and its tests. | Keep source/build absence regression |
| 56 | Security headers audited | Open | P0.9 CSP and header verification |
| 57 | Frontend bundles checked for secrets | Partial source hygiene only; no CI bundle scan. | P0.9 secret/source-map/bundle scan |
| 58 | App Check is not rate limiting | Open for provider-backed Compose and public mutations. | P0.6/P0.9 shared limiter plus App Check policy |
| 59 | Cross-project isolation adversarial testing | Partial emulator coverage; expand and make fully green. | P0.5/P1.2 hostile rules matrix |
| 60 | Dependency scanning in CI | CI remains open; the current production audit is clean after P0.1 removed orphaned server dependencies. | P0.9 automated CI audit gate |
| 61 | Firestore and LocalStorage versioned migration tests | Local migration coverage is useful; cloud migration is broken. | P0.3/P0.4 migration fixtures and rollback |
| 62 | Multi-tab conflict handling | Partially handled for local storage; cloud/race/browser coverage remains. | P0.3/P1.1 concurrency matrix |
| 63 | Firestore transaction/race review | Partial transactional code exists; membership, invite and proposal races remain. | P0.5/P1.1 concurrency and stale-base tests |
| 64 | Cloud backup/restore policy | Open | P0.9 backup ownership, retention and restore drill |
| 65 | Destructive confirmation and cleanup | Open defects include introducer edges and non-cascading project deletion. | P0.3/P0.5 confirmation, cascade and recovery tests |
| 66 | Build scripts are platform-dependent | Confirmed: `npm run build` fails on Windows because it invokes Bash. | P0.7 cross-platform scripts |
| 67 | Linux CI pipeline | Open | P0.7 required CI workflow |
| 68 | Production deploys a known commit | Open | P0.7 immutable SHA and artifact provenance |
| 69 | Preview deployments before production | Open | P0.7 preview smoke and approval gate |
| 70 | Real browser E2E tests | Open | P0.7 Playwright-equivalent critical journeys |
| 71 | Mobile real-device validation | Open | P1.4 signed device/browser matrix |
| 72 | Canvas touch gesture conflicts | Touch controls exist but need device proof. | P1.4 pan/zoom/draw/scroll tests |
| 73 | Complete keyboard accessibility pass | Partial | P1.4 keyboard-only acceptance |
| 74 | Focus management in modals/panels | Partial: some focus handling exists, full pass absent. | P1.4 focus trap, return and escape tests |
| 75 | Reduced motion respected | Implemented in CSS; verify all animated interactions. | P1.4 reduced-motion browser gate |
| 76 | Meaning not dependent on colour | Partial/open | P1.4 contrast, icon, text and state audit |
| 77 | 320–360px screens | Responsive rules exist; real layout acceptance is missing. | P1.4 narrow-screen matrix |
| 78 | Large Personal maps stress-tested | Open; also coupled to save/recovery risk. | P0.3/P1.4 size, latency and memory budgets |
| 79 | Large CSV memory/performance limits | Partial 15 MB file limit only; row and parsing budgets are missing. | P1.2 streamed/bounded import gate |
| 80 | Firebase query cost monitoring | Open | P1.5 budgets, dashboards and alerts |
| 81 | AI context remains bounded | Implemented with people/relationship caps; test and monitor the budget. | P0.6 bounded-payload assertion |
| 82 | Frontend bundle and Firebase startup measured | Open problem: eager global Firebase and an approximately 667 KB Firebase client chunk. | P0.2/P1.5 lazy loading and bundle budgets |
| 83 | Real production error monitoring | Open | P0.9 redacted client/function monitoring and alerts |
| 84 | Important failures have a user-facing state | Partial/open across listeners, imports, auth and server actions. | P0.9/P1.1/P1.2 error-state inventory and tests |
| 85 | Proper 404/not-found behaviour | Open | P0.9 not-found and global error boundaries |
| 86 | Feature-level kill switches | Open | P1.5 safe server-controlled flags and runbook |
| 87 | Privacy Notice before cloud launch | Open | P0.8 published, versioned notice |
| 88 | Cookie/storage technology audit | Open | P0.8 storage inventory, consent decision and documentation |
| 89 | Retention schedule | Open | P0.8 record-level schedule and deletion jobs |
| 90 | Data export and deletion handling | Open | P0.8/P1.3 self-service and support process |
| 91 | DPIA before higher-risk expansion | Decision/screen required, especially for Network, schools and non-user data. | P0.8 documented DPIA decision and completed DPIA if indicated |
| 92 | Do not infer sensitive characteristics | Current product rule is aligned; preserve with tests and policy. | P0.8 ongoing no-inference gate |
| 93 | “Open Circa” versus “Sign in” miscommunicates architecture | Confirmed by the Personal sign-in regression. | P0.2 account-free routing and accurate copy |
| 94 | `/join` identifies a Community invitation | Resolved: the current join client is Community-specific and contextual. | Keep route/copy regression test |
| 95 | Product statuses explicit | Open beyond internal planning | Decision table must be reflected in public UI and release notes |
| 96 | Beta label includes feedback path | Open | P2 feedback/report flow with privacy handling |
| 97 | Community shared-link presentation | Open | P2 metadata, branded states and invite-safe previews |
| 98 | Public footer/legal navigation | Open | P0.8/P2 Privacy, Terms, Help, Status and contact links |
| 99 | Custom domain before broad launch | External launch task | P2 DNS, TLS, redirects and monitoring |
| 100 | Metadata/social previews verified | Partial metadata only; no complete social image and favicon is oversized. | P1.5/P2 metadata, asset and share-preview matrix |

## Final go-live checklist

Do not launch if any P0 item below is unchecked. A checked box must link to its commit, CI run, deployed environment, test evidence, and accountable owner in the release record.

### P0 release blockers

- [ ] Removed messaging has zero runtime, UI, copy, configuration, provider, stored-token, scheduled-job, documentation, secret-scan or deployed-endpoint surface.
- [ ] Personal Maps opens, edits, saves, exports and restores without an account and without Firebase configuration or network access.
- [ ] Save failure blocks navigation and provides retry/export recovery; introducer deletion and directed-edge updates pass regression tests.
- [ ] Cloud migration is either absent/disabled everywhere or complete, consented, rule-compatible, restartable, verified and reversible.
- [ ] Community proposal-only publication, join/rejoin, owner preservation, invite limiting and isolation all pass the emulator and browser suites.
- [ ] Provider-backed Compose has permanent authentication, shared throttling, streamed byte/response limits, timeout/abort, minimal payloads and accurate disclosure; local Compose/Ask remains account-free.
- [ ] One cross-platform command passes typecheck, lint, every unit/integration/static test, Firestore emulator tests, production build and browser E2E in CI.
- [ ] The release artifact maps to one reviewed commit; preview, production configuration, rules and indexes match; rollback is rehearsed.
- [ ] Privacy Notice, storage audit, data map, retention, export/deletion/leave, non-user data handling, age decision and DPIA decision are complete and reviewed by qualified UK counsel/DPO support.
- [ ] Security headers, secret/bundle scan, dependency decision, production monitoring, cache/logout policy, backup/restore and incident ownership are verified.

### Experience gates

- [ ] Personal large-map, multi-tab, corruption, quota, touch, narrow-screen, keyboard, focus, contrast and reduced-motion matrices pass.
- [ ] Community timezone/DST/reminder behaviour is truthful; every async failure has a visible retry path; destructive actions and ownership lifecycle are defined.
- [ ] Network hostile CSV, identity, revocation, no-inference, no-silent-truncation, cost and scale gates pass without downloading an unbounded graph.
- [ ] Authentication upgrade, refresh, offline, timeout, cancellation, return routing, shared-device logout and lifecycle journeys pass.
- [ ] Bundle budgets, lazy Firebase startup, 404/error pages, redacted telemetry, query-cost alerts and kill switches are operational.

### Launch record

- [ ] Public experience status, beta feedback path, legal/footer navigation, support/status contact and custom-domain plan are published.
- [ ] Canonical URL, title, description, icons, Open Graph and other share previews are verified on the production domain.
- [ ] Product owner, engineering owner, privacy owner, incident owner and rollback decision-maker have signed the release record.
- [ ] The release record contains no waivers for P0; any accepted P1/P2 gap has an owner, deadline, user impact and safe operating constraint.

## Completion rule

This document is the master repair scope, not evidence that the repairs have already been applied. Circa becomes launch-ready only when the acceptance evidence is attached to every applicable gate, the deployed product matches the reviewed commit, and every P0 checkbox is complete.
