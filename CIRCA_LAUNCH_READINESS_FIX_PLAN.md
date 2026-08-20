# Circa launch-readiness repair plan

Last reviewed: 20 August 2026  
Authoritative source inspected: local working tree based on P0.1 checkpoint `47cd786`
Original input covered: all 100 numbered findings in the supplied launch-readiness audit

## Decision and release scope

All locally resolvable P0 source and stop-ship gates now pass. Circa is still not ready for an unrestricted public cloud launch: the current P0.2–P0.9 work is uncommitted, and production provenance, deploy-console settings, deployed rules/indexes, legal/privacy approval, provider configuration, monitoring, backups and observed rollback evidence require external action. Personal is locally release-capable; cloud experiences remain Beta and disabled from unrestricted launch until those external gates close.

The release decision for messaging is final:

- Remove the WhatsApp feature completely from the shipped product.
- Remove its public copy, UI, client code, server code, functions, secrets, rules, tests, styles, data fields, scheduled jobs, setup instructions, and deploy configuration.
- Keep Community reminders only if they have a real in-app delivery/recurrence model. Do not leave recurrence controls that merely store a label.
- This plan may name the removed feature for traceability; the runtime product, public marketing, shipped assets, environment template, and active setup documentation must not.

Recommended launch statuses until the gates in this document pass:

| Experience | Status now | Status allowed after P0 |
| --- | --- | --- |
| Personal Maps | Locally verified account-free and durable; reviewed commit/deployment still required | Live after the production-candidate deployment gate |
| Community | P0 invariants pass locally; external privacy and production gates remain | Cloud Beta only after external gates, then Live after P1 Community gates |
| Network | P0 privacy/rules pass locally; external privacy and production gates remain | Cloud Beta until scale, cost and privacy gates pass |
| Compose/Ask | Local Compose/Ask pass account-free; provider route is secured but stays disabled until processor/App Check configuration | Live locally; provider-backed Describe only after external gates |
| WhatsApp | Removed from source; production-host cleanup and deployment verification pending | Removed |

## Evidence from the current repository

The old audit's statement that GitHub was empty is no longer current. The public repository contains source and history. P0.1 is committed at `47cd786`; P0.2–P0.9 are implemented in the local working tree and must be reviewed, committed and pushed before they can produce a releasable clean artifact. The build records commit plus dirty/clean state in `/release.json`, and CI refuses a dirty artifact.

### Verification results on 20 August 2026

| Check | Result | Meaning |
| --- | --- | --- |
| clean-clone CI order | Pass | After a fresh `npm ci`, with `dist` still absent, `npm run typecheck` passed before any build artifact existed. Source checking no longer imports generated output. |
| `npm test` | Pass | Cross-platform canonical gate: TypeScript, ESLint, 188/188 functional/static assertions, 15/15 Firestore emulator assertions, production build, 2/2 rendered-route tests and five headless-browser journeys. |
| missing-Firebase dedicated build | Pass | With `.env.local` temporarily absent, `npm run build` and Personal/Compose-entry browser smoke passed; the file was restored in `finally`. |
| `node --test tests/v17-critical-hardening.test.mjs` | 11 pass, 0 fail | Every retained P0 stop-ship assertion is green. |
| `npm run audit:production` | 0 vulnerabilities | Firebase Admin 14.3.0 plus scoped fixed `uuid` overrides remove the transitive moderate advisory; `npm ls` is valid. |
| generated Netlify function | Pass | `npm run build` generated and runtime-validated `dist/netlify/functions/circa-app.mjs`; pinned Netlify CLI 27.1.2 also packaged it successfully with the production worker dependency. |
| `npm run scan:artifact` | Pass | 61 clean-CI client artifact files contained no server secret patterns or source maps. |
| Personal critical-browser readiness | Pass | The production worker was healthy before browser launch (HTTP 200); headless Chrome stayed on `/?workspace=1`, returned HTTP 200, exited 0 and rendered the strict `/Your projects|What are you mapping/i` marker. |
| runtime/public removed-feature scan | 0 matches | Shipped source, public files, environment template, active docs and build remain free of the removed feature name. |
| artifact provenance | Local pass / external open | An isolated committed clean-clone baseline produced `/release.json` with its exact commit and `dirty: false`; a clean reviewed commit and production deploy remain required. |
| CI and controlled rules release source | Implemented / external open | GitHub workflows include release gate, secret/dependency/artifact scans and a workload-identity Firestore release job; remote execution/protection is not yet evidenced. |

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

**Status: COMPLETE AND VERIFIED LOCALLY.** `app/layout.tsx` no longer starts Firebase globally; cloud routes opt in through route layouts, Firebase configuration is lazy, and every Personal entry opens `/?workspace=1` without authentication. A dedicated production build with `.env.local` absent passed, followed by headless-browser Personal and browser-local Compose-entry smoke. The browser gate now waits for the real rendered workspace state and verifies HTTP status plus the unchanged final Personal URL instead of relying on a fixed virtual-time DOM dump. Signing out clears cloud cache without deleting Personal LocalStorage. Production publication still depends on the P0.7 reviewed-commit gate.

Original defect (resolved locally): `Landing` sent signed-out users to `/auth?returnTo=/start`, `/start` required a permanent account, and `/?workspace=1` redirected to Auth. In addition, `app/firebase/client.ts` required all Firebase variables at module evaluation while `FirebaseProvider` wrapped the entire app.

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

**Status: COMPLETE AND VERIFIED LOCALLY.** Failed saves now block navigation behind Stay/Export/Retry recovery; quota preflight, recovery/corruption copies, backup reminders, restore caps and explicit stale-tab choices are present. Introducer deletion preserves relationship endpoints, directed reconnection reorients endpoints, and 50/100/250/500-person plus old-schema round trips pass. Evidence: `tests/p0-personal-durability.test.mjs`, `tests/core-logic.test.ts`, the P0 stop-ship suite and the Personal browser smoke in `npm test`.

Original defects (now covered by passing V17/P0 regressions):

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

**Status: COMPLETE AND VERIFIED LOCALLY using option 1.** The public cloud-copy card, migration implementation, styles, imports and active documentation claims were removed. Personal is explicitly browser-local and no build/runtime cloud-migration surface remains. Evidence: the migration-absence P0 assertion, 188/188 functional/static tests and the production build.

Original defect (resolved by removal): `CloudMigrationCard` was public UI, but its marker and workspace paths were denied by Firestore rules, the migration had no retriable state machine, and the product had no complete cloud-map open/restore/export/delete experience.

Choose one safe launch option:

1. Recommended for the first release: remove/feature-flag the cloud-copy card and keep Personal strictly local-first; or
2. finish the feature end-to-end with `preparing → importing → verifying → complete/failed`, idempotent retries, consent fields, folder/global-person fidelity, rules, a read/restore path, export, deletion and recovery semantics.

Never ship a “Cloud copy ready” status for data the user cannot reopen, verify, export, or delete.

### P0.5 — re-establish Community publication invariants

**Status: COMPLETE AND VERIFIED LOCALLY; REQUIRES EXTERNAL ACTION for production rules/index deployment and production two-user smoke.** Member create/update/delete is proposal-only; review uses immutable provenance, exact base/version, server review time and moderation events; removed-member rejoin, idempotent membership, owner preservation and explicit ownership transfer are implemented. Raw join-code reads are denied and redemption/creation use authenticated, shared-rate-limited server boundaries with cryptographic collision checks. Evidence: 15/15 emulator assertions plus `tests/p0-community-invariants.test.mjs`. Deploy the reviewed `firestore.rules`/indexes and verify hashes before enabling cloud Beta.

Original defect (resolved locally): `lists/{listId}/items/{itemId}` permitted a member to delete an approved record when `createdBy` matched their UID and the UI exposed a direct delete action, contradicting proposal-only publication.

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

**Status: COMPLETE AND VERIFIED LOCALLY; REQUIRES EXTERNAL ACTION before enabling a production provider.** Browser-local Compose/Paste/CSV/Ask remain account-free. External Describe is explicit opt-in and requires a permanent verified Firebase session, supports App Check enforcement, uses shared UID plus HMAC-signal limiting, enforces streamed request/response caps and timeout/abort, treats context as untrusted data and exposes only reduced context. Evidence: `tests/p0-compose-security.test.mjs`, `tests/server-request-limits.test.ts`, functional/static tests and Compose browser smoke. The provider must remain disabled until its identity, contract, region/retention and production App Check metrics/enforcement are recorded.

Retained strengths: provider context drops phone, email and notes; graph context is bounded; semantic output is validated; mutation requires review; deterministic Ask is well tested.

Original defects (resolved locally): `POST /api/compose` was unauthenticated, rate limits lived in an instance-local `Map`, request size trusted `content-length`, and the UI did not distinguish browser-only parsing from server processing.

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

**Status: COMPLETE AND VERIFIED LOCALLY; REQUIRES EXTERNAL ACTION for remote CI, branch protection, deploy preview, clean production deployment and rollback drill.** Netlify is canonical; alternative D1/R2 runtime/example scaffolding is removed and the retained Cloudflare package is documented as build-time Fetch-worker bundling only. Cross-platform Node runners automatically discover tests, allocate collision-resistant emulator ports, build/validate the artifact and run real Chrome smoke. `/release.json` records commit and working-tree state; CI rejects dirty artifacts. `npm test` passes on Windows. GitHub release and controlled Firestore workflows, release/rollback documentation and artifact scanning are checked in locally but not yet run on a pushed reviewed commit.

Clean-CI repair evidence (20 August 2026): the checked-in Netlify adapter is now a source-only typed factory and has no import from `dist`. After Vite creates `dist/server/index.js`, the cross-platform Node build deliberately generates a deployable entry with a static worker import in `dist/netlify/functions`. A fresh `npm ci` left `dist` absent and source typechecking passed before build. Artifact validation invoked the generated handler against the real worker, and Netlify CLI 27.1.2 packaged that function successfully.

Dirty-worktree CI repair evidence (20 August 2026): `gitleaks/gitleaks-action@v2` was reproduced with its pinned 8.24.3 command and identified as the sole writer of untracked root-level `results.sarif`; running the build with that report present reproduced the exact CI failure and `dirty: true`. The workflow now preserves that known report under ignored `outputs/security`, then runs a cross-platform cleanliness diagnostic that prints `git status --porcelain`, `git diff --name-status` and unexpected untracked files and fails on any remaining mutation. A separate LF-line-ending clone with the repair committed as its baseline ran the real scanner sequence, `npm ci`, audit, source typecheck, lint, 188/188 functional/static assertions, 15/15 emulator assertions, `CI=true` build, repeated artifact validation, 2/2 rendered-route checks and five browser journeys. Every checkpoint and the final status were clean; release metadata recorded `dirty: false`. The remote PR rerun remains external evidence until this repair is committed and pushed.

Critical-browser CI repair evidence (20 August 2026): the Personal marker remains the strict `/Your projects|What are you mapping/i`, and both phrases still come from the account-free Personal workspace. The failing harness launched `--dump-dom` with a fixed 5,000 ms virtual-time budget and asserted its stdout immediately; it did not establish production-server health, observe navigation/redirects or wait for the two-stage client transition from landing SSR to loaded workspace state. A controlled legacy invocation reproduced exit 0 with landing output (`Map your people` / `Open Circa`) and neither Personal marker. The runner now uses Chromium DevTools with a fresh profile per route, checks the production worker before browser launch, records the requested URL, document status, final URL, rendered text/DOM, stdout and stderr separately, waits up to a bounded real-time deadline for the visible marker, rejects redirects and non-200 documents, and reports page/server exceptions. Local Chrome rendered `What are you mapping?` at the unchanged `/?workspace=1` URL with HTTP 200 and exit 0; all five critical journeys pass. A disposable clean baseline using the exact GitHub placeholder environment passed fresh `npm ci`, source checks, 188/188 functional/static assertions, 15/15 emulator assertions, `CI=true` build, artifact validation/scan, 11/11 critical-hardening assertions and all five browser journeys; `release.json` recorded `dirty: false`, `git diff --check` passed and final Git status was empty. Linux GitHub rerun remains external evidence until this uncommitted repair is reviewed and pushed.

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

**Status: LOCALLY IMPLEMENTED AND TESTED; REQUIRES EXTERNAL ACTION and remains an unrestricted-cloud stop-ship blocker.** Public versioned Privacy, Terms and Help routes, global links, data/storage map, 18+ initial scope, no-sensitive-inference rule, cloud export, recent-auth account deletion, leave, contribution withdrawal, ownership transfer and confirmed recursive owned-space deletion are implemented. Analytics is absent. Evidence: `tests/p0-privacy-lifecycle.test.mjs` and the complete local gate. Still required: controller/contact details, lawful-basis/legitimate-interest decisions, processor/region/transfer contracts, retention/TTL jobs, rights-request exercises, signed DPIA/Children's Code decision and qualified UK legal/privacy approval. See `docs/PRIVACY_RELEASE_GATES.md`.

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

**Status: LOCALLY IMPLEMENTED AND TESTED; REQUIRES EXTERNAL ACTION for production operation.** CSP/HSTS/nosniff/frame/referrer/permissions/COOP headers, offline/Firebase timeout/retry, 404/error boundaries, cloud-cache clearing on sign-out, redacted server failure IDs, secret/dependency/artifact CI scans, a controlled workload-identity rules job and operations/rollback runbooks are present. `npm run audit:production` reports 0 vulnerabilities and the client artifact scan reports no server secrets/source maps. Still required: production Auth domains/reset/Google flows, App Check metrics/enforcement, monitoring vendor/alerts, backup/export/TTL jobs, workload identity/environment setup, owner assignments, secret rotation, deployed rules hashes, two-user production smoke and observed rollback/restore drills.

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
| 2 | Cannot prove which source produced Netlify | Locally addressed by commit/dirty release metadata; production deployment provenance requires external verification. | P0.7 clean reviewed commit and Netlify evidence |
| 3 | Personal Circa appears to require sign-in | Resolved and browser-tested locally, including a missing-Firebase build. | Keep P0.2 account-free regression gate |
| 4 | Production is not tied to a passed acceptance suite | CI/release-gate source is implemented; source-first ordering and scanner-artifact hygiene are proven in an isolated clean clone, and the canonical suite passes locally. Remote required-check evidence is external. | P0.7 remote CI/protection gate |
| 5 | Firestore production rules deployment unverified | 15/15 adversarial emulator tests pass locally; deployed hashes and two-user smoke remain external. | P0.5/P0.9 controlled deploy evidence |
| 6 | App Check production enforcement unverified | External verification required | P0.6/P0.9 monitoring-first enforcement record |
| 7 | Public Privacy information undiscoverable | Resolved locally with versioned public routes and global navigation; production publication remains external. | Keep P0.8 route/navigation gate |
| 8 | Third-party people data needs a privacy model | Data map, visibility, export/deletion and retention targets documented; lawful basis, contracts and rights exercises remain external. | P0.8 external privacy gates |
| 9 | School use creates under-18 considerations | Cloud Beta is scoped 18+; school marketing remains disabled pending external Children's Code assessment. | P0.8 external legal decision |
| 10 | Public product advertises unclear features | Resolved locally: Personal is local-first and Community/Network are labelled Cloud Beta; removed-feature copy is absent. | Keep status/absence regression gates |
| 11 | LocalStorage creates data-loss risk | P0 durability paths are resolved locally with recovery, quota, corruption, backup, size and 50–500-person tests. | Keep P0.3 durability regressions; P1 device matrices remain |
| 12 | No verified production rollback path | Runbook and immutable-artifact procedure implemented; observed production rollback remains external. | P0.7/P0.9 rollback drill |
| 13 | Auth protection duplicated by screen | Open | P1.3 shared route/access model |
| 14 | Auth loading needs a failure timeout | Resolved locally with a bounded unavailable/retry/Personal state. | Keep P0.9 regression; broader P1.3 auth matrix remains |
| 15 | Auth edge cases need production testing | Open | P1.3 E2E matrix |
| 16 | Anonymous-to-permanent upgrade must preserve identity | Upgrade code exists, but current Community join does not use the anonymous session path. | P1.3 choose and test one coherent policy |
| 17 | `returnTo` must allow safe internal routes only | Resolved in current code and covered by local tests | Keep security regression gate |
| 18 | Account deletion/export/leave flows | Implemented and statically/functionally tested locally; production representative-user exercise remains external. | P0.8 external rights/lifecycle evidence |
| 19 | Logout local-cache privacy review | Resolved locally: cloud persistence is terminated/cleared while Personal LocalStorage is preserved. | Keep P0.9 shared-device regression |
| 20 | Supplied Community URL cannot be independently assessed without client boot | Partially architectural; loading/error/empty/offline states remain incomplete. | P1.1 browser E2E and failure-state gates |
| 21 | Community project URLs and invitation URLs must differ | Resolved locally with separate routes, consent and permanent-account flow; deployed proof remains external. | P0.5 production E2E |
| 22 | Join-code brute-force protection | Resolved locally with server-only redemption and shared HMAC rate limiting. | Keep P0.5 server/rules regressions |
| 23 | Invite creation must use secure randomness | Resolved in current code | Keep deterministic security test |
| 24 | Joining must be idempotent | Resolved locally for duplicate/retry and removed-member rejoin through current invites. | Keep P0.5 membership matrix |
| 25 | Owner role preservation | Locally rule-tested; production deployment still must be proven. | P0.5/P0.9 emulator and rules-hash gate |
| 26 | Moderation must be enforced in Firestore | Resolved locally: member direct mutation/deletion is denied and proposal review is versioned/audited. | Keep P0.5 adversarial rules gate |
| 27 | Pending information must not leak into Ask or messaging | Community Ask currently consumes published data only; messaging is being removed. | P0.1 and keep published-only regression test |
| 28 | Community time and recurrence need DST testing | Bin logic has useful DST coverage; reminder scheduling/recurrence is not real. | P1.1 scheduler and timezone matrix |
| 29 | Community ownership deletion policy | Transfer and exact-name confirmed recursive deletion are implemented; retention/production exercise remains external. | P0.5/P0.8 production lifecycle gate |
| 30 | Moderation/audit history for Communities | Immutable reviewer/provenance and minimal moderation events implemented locally; production retention job remains external. | P0.5/P0.8 retention gate |
| 31 | Imported professional data private by default | Resolved locally by default privacy rules | Keep adversarial privacy test |
| 32 | Network contribution explicit and reversible | Resolved locally and emulator-tested; deployed-rules/revocation proof remains external. | P0.9 production proof plus P1.2 scale gates |
| 33 | Identity must not merge by name | Resolved and tested | Keep identity regression gate |
| 34 | Cross-user identity linking needs deterministic evidence | Partial: URL digest evidence exists; privacy model and collision/keying review remain. | P1.2 identity-evidence design and adversarial tests |
| 35 | Pathfinding must not silently stop at a query limit | Partial: contribution queries paginate, but UI and contributor limits remain. | P1.2 completeness metadata and no-silent-truncation tests |
| 36 | Network cannot download every connection forever | Open scalability issue | P1.2 server-side/projection architecture and cost budgets |
| 37 | No inferred professional relationships | Resolved and tested | Keep no-inference gate |
| 38 | LinkedIn stays export-file import, not scraping | Resolved by current product model | Keep copy and implementation constraint |
| 39 | CSV importer hostile/large-file tests | P0 resource/hostile gaps resolved locally: 8 MB, 10k rows, malformed quotes and profile-only LinkedIn URLs; performance/streaming remains P1. | P1.2 resource-performance matrix |
| 40 | Path results describe only known facts | Resolved in current wording/tests | Keep semantics regression gate |
| 41 | AI output never directly mutates graph | Resolved: review/apply boundary exists and is tested. | Keep Apply-only mutation gate |
| 42 | Strict AI response schema validation | Resolved locally with bounded streaming, object/schema validation and hostile response tests. | Keep P0.6 server-limit regression |
| 43 | Compose ambiguity must ask, not guess | Resolved across broad local tests | Keep ambiguity corpus |
| 44 | Prompt/context privacy minimisation | Reduced-field payload and exact server/browser disclosure are locally tested; provider contract/production E2E remains external. | P0.6/P0.8 external provider gate |
| 45 | Prompt injection through content | P0 data delimiters and hostile-input/authoritative-validation tests pass locally. | Keep P0.6 adversarial corpus |
| 46 | AI request limits | Resolved locally with shared rate, streamed request/response caps and timeout/abort. | P0.6 production datastore/App Check verification |
| 47 | AI-provider failure cannot stop core Circa | Resolved locally: provider use is optional and browser-local Compose/Ask remain operational and browser-tested. | Keep P0.6 outage regression |
| 48 | ASK remains deterministic | Resolved and tested | Keep deterministic, provider-free gate |
| 49 | Establish whether WhatsApp is live | Source/runtime implementation removed and locally verified; deployed Netlify/provider state remains externally unverified. | Close P0.1 only after production endpoint/provider evidence |
| 50 | Meta credentials server-side | Local environment template and production dependency removed; hosted secret deletion/token revocation remains external. | P0.1 Netlify/provider cleanup |
| 51 | Webhook signatures validated | Source endpoint removed; deployed endpoint must be verified absent after clean deployment. | P0.1 production route inventory |
| 52 | Linking tokens expire and are single-purpose | Source flow removed; authenticated Firestore inventory found no stored link-request or identity records. | P0.1 provider cleanup only |
| 53 | STOP/disconnect/preferences behaviour | Resolved in source by removing the controls, fields, routes and documentation. | Keep source/build absence regression |
| 54 | Scheduled reminders are idempotent | Removed delivery scheduler and index; retained in-app reminder truthfulness remains P1.1. | P1.1 in-app scheduler gate |
| 55 | Messaging answers use approved Community data only | Resolved by deleting the answer/delivery runtime and its tests. | Keep source/build absence regression |
| 56 | Security headers audited | Required headers are source-configured and statically tested; production-origin inspection remains external. | P0.9 production header verification |
| 57 | Frontend bundles checked for secrets | Resolved locally with client artifact/source-map scan and CI secret scan; remote CI run remains external. | Keep P0.9 scan gate |
| 58 | App Check is not rate limiting | Shared server rate limiting is implemented; production App Check metrics/enforcement remain external. | P0.6/P0.9 external enforcement record |
| 59 | Cross-project isolation adversarial testing | 15/15 Community/Network emulator assertions pass locally. | Keep P0.5 hostile rules matrix; P1 scale cases remain |
| 60 | Dependency scanning in CI | Workflow gate implemented locally; production audit reports 0 vulnerabilities. Remote CI execution remains external. | P0.9 remote CI evidence |
| 61 | Firestore and LocalStorage versioned migration tests | Personal old-schema/size fixtures pass and the incomplete cloud migration is removed. | Keep P0.3/P0.4 regression gates |
| 62 | Multi-tab conflict handling | Personal stale-tab overwrite/discard handling is explicit and tested; cloud race/browser coverage remains P1. | P1.1 concurrency matrix |
| 63 | Firestore transaction/race review | P0 invite/membership/proposal stale-base invariants are transactional and tested; wider P1 races remain. | P1.1 concurrency expansion |
| 64 | Cloud backup/restore policy | Ownership, daily/35-day target and drill procedure documented; production job and observed restore remain external. | P0.9 external backup gate |
| 65 | Destructive confirmation and cleanup | P0 introducer, workspace recovery and recursive owned-space deletion paths are resolved locally. | Keep P0 regressions; P1 scheduled cleanup remains |
| 66 | Build scripts are platform-dependent | Resolved: cross-platform Node build/test runners pass on Windows; clean source typechecking is independent of generated output and CI targets Linux. | Keep P0.7 canonical gate |
| 67 | Linux CI pipeline | Workflow source implemented; clean scanner → `npm ci` → source typecheck → test → build ordering and `dirty: false` metadata are reproduced in an LF clean clone. First successful protected-branch rerun remains external. | P0.7 remote CI evidence |
| 68 | Production deploys a known commit | Artifact commit plus dirty/clean metadata implemented; clean reviewed production deploy remains external. | P0.7 immutable deploy evidence |
| 69 | Preview deployments before production | Preview requirement/runbook implemented; actual Netlify preview and approval remain external. | P0.7 external preview gate |
| 70 | Real browser E2E tests | Resolved locally for Personal, Auth, Community, Network and Compose entry using real headless Chrome; the gate observes production-worker health, navigation, final URL and visible DOM readiness rather than fixed virtual time. | Keep P0.7 browser gate |
| 71 | Mobile real-device validation | Open | P1.4 signed device/browser matrix |
| 72 | Canvas touch gesture conflicts | Touch controls exist but need device proof. | P1.4 pan/zoom/draw/scroll tests |
| 73 | Complete keyboard accessibility pass | Partial | P1.4 keyboard-only acceptance |
| 74 | Focus management in modals/panels | Partial: some focus handling exists, full pass absent. | P1.4 focus trap, return and escape tests |
| 75 | Reduced motion respected | Implemented in CSS; verify all animated interactions. | P1.4 reduced-motion browser gate |
| 76 | Meaning not dependent on colour | Partial/open | P1.4 contrast, icon, text and state audit |
| 77 | 320–360px screens | Responsive rules exist; real layout acceptance is missing. | P1.4 narrow-screen matrix |
| 78 | Large Personal maps stress-tested | 50/100/250/500-person normalize/round-trip fixtures pass; signed device latency/memory budgets remain P1. | P1.4 performance matrix |
| 79 | Large CSV memory/performance limits | Partial 15 MB file limit only; row and parsing budgets are missing. | P1.2 streamed/bounded import gate |
| 80 | Firebase query cost monitoring | Open | P1.5 budgets, dashboards and alerts |
| 81 | AI context remains bounded | Implemented and tested with people/relationship/payload caps. | Keep P0.6 bounded-payload assertion |
| 82 | Frontend bundle and Firebase startup measured | Eager global Firebase is removed; cloud providers are route-scoped and missing-config Personal builds pass. Wider bundle budgets remain P1. | P1.5 bundle budgets |
| 83 | Real production error monitoring | Privacy-bounded structured failure hooks/request IDs implemented; monitoring vendor, retention and alerts remain external. | P0.9 external monitoring gate |
| 84 | Important failures have a user-facing state | P0 offline, Firebase timeout/unavailable, save, error-boundary and server-request states are implemented; P1 listener/import completeness remains. | P1.1/P1.2 inventory |
| 85 | Proper 404/not-found behaviour | Resolved locally with not-found, route error and global error boundaries. | Keep P0.9 rendered/browser gate |
| 86 | Feature-level kill switches | Open | P1.5 safe server-controlled flags and runbook |
| 87 | Privacy Notice before cloud launch | Versioned public source implemented; controller details, legal approval and production publication remain external. | P0.8 external notice gate |
| 88 | Cookie/storage technology audit | Storage inventory and no-Analytics decision documented; qualified assessment/production verification remains external. | P0.8 external storage gate |
| 89 | Retention schedule | Record-level targets documented; TTL/deletion/backup jobs and evidence remain external. | P0.8/P0.9 external jobs |
| 90 | Data export and deletion handling | Self-service source implemented and tested; representative rights exercise/support process remains external. | P0.8 external rights gate |
| 91 | DPIA before higher-risk expansion | Decision/screen required, especially for Network, schools and non-user data. | P0.8 documented DPIA decision and completed DPIA if indicated |
| 92 | Do not infer sensitive characteristics | Resolved as an explicit product/prompt/data-map invariant with regression coverage. | Keep P0.8 ongoing no-inference gate |
| 93 | “Open Circa” versus “Sign in” miscommunicates architecture | Resolved locally: Open Circa enters Personal; Sign in is explicit for cloud routes. | Keep P0.2 route/copy gate |
| 94 | `/join` identifies a Community invitation | Resolved: the current join client is Community-specific and contextual. | Keep route/copy regression test |
| 95 | Product statuses explicit | Personal local-first and Community/Network Cloud Beta status are reflected in public UI/docs. | Keep release-copy review |
| 96 | Beta label includes feedback path | Open | P2 feedback/report flow with privacy handling |
| 97 | Community shared-link presentation | Open | P2 metadata, branded states and invite-safe previews |
| 98 | Public footer/legal navigation | Privacy, Terms and Help links are implemented; production support/status/contact destinations remain external/P2. | P0.8 external contact plus P2 status |
| 99 | Custom domain before broad launch | External launch task | P2 DNS, TLS, redirects and monitoring |
| 100 | Metadata/social previews verified | Partial metadata only; no complete social image and favicon is oversized. | P1.5/P2 metadata, asset and share-preview matrix |

## Final go-live checklist

Do not launch if any P0 item below is unchecked. A checked box must link to its commit, CI run, deployed environment, test evidence, and accountable owner in the release record.

### P0 release blockers

Locally completed and verified:

- [x] Runtime/public source, configuration, active docs and artifact contain no removed-feature surface; production/provider cleanup stays in the external list below.
- [x] Personal opens, edits, saves, exports and restores without an account; a production build and browser smoke pass with Firebase configuration absent.
- [x] Save failure blocks navigation with Stay/Export/Retry; introducer deletion, direction updates, quota/corruption/recovery and 50–500-person fixtures pass.
- [x] The incomplete Personal cloud migration is absent from runtime, UI and active documentation.
- [x] Community proposal-only publication, join/rejoin, owner preservation, invite limiting and cross-project isolation pass 15/15 emulator tests and local browser/static gates.
- [x] Provider-backed Compose has permanent authentication, App Check readiness, shared throttling, streamed byte/response limits, timeout/abort, minimal payloads and accurate disclosure; local Compose/Ask remains account-free.
- [x] One cross-platform `npm test` passes TypeScript, ESLint, all 188 functional/static assertions, 15 emulator assertions, the production build, rendered-route checks and five real-browser journeys.
- [x] A fresh `npm ci` leaves `dist` absent and passes source typechecking before build; the generated Netlify function validates at runtime and packages with the pinned Netlify CLI.
- [x] The local production artifact validates, records commit plus dirty/clean state, and its 61 clean-CI client files pass the secret/source-map scan; the production dependency audit reports 0 vulnerabilities.
- [x] Public privacy/help/terms source, storage/data maps, local lifecycle controls, security headers, 404/error/offline states, cache/logout policy, redacted failure hooks and operational runbooks are implemented and tested.

REQUIRES EXTERNAL ACTION before unrestricted public/cloud launch:

- [ ] Review, commit and push P0.2–P0.9; require the remote CI workflow on protected `main` and produce a clean (`dirty: false`) reviewed artifact.
- [ ] Verify Netlify protected-branch/preview/production configuration, remove any obsolete hosted endpoints/secrets, and disconnect/revoke the former provider application credentials.
- [ ] Configure workload identity, deploy the reviewed Firestore rules/indexes, record their hashes, and pass two-isolated-user production Community/Network/lifecycle smoke.
- [ ] Configure and prove Firebase Auth domains, email/Google/reset flows and App Check metrics/enforcement on every production/preview origin.
- [ ] Name and contract the optional AI processor, approve its purpose/region/retention, and leave provider-backed Describe disabled until that record and production test exist.
- [ ] Publish controller/operator identity and contacts; approve lawful bases, contracts/transfers, retention, non-user rights handling, 18+/Children's Code scope and a signed DPIA with qualified UK privacy/legal support.
- [ ] Configure TTL/deletion and managed backup jobs; assign product/security/privacy/incident owners; configure redacted monitoring/alerts/status/support; rotate exposed secrets; observe rollback and isolated restore drills.

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

This document is the master repair scope and local evidence ledger. Checked local gates are implemented in the working tree and verified by the commands recorded above; they are not evidence of production configuration. Circa becomes launch-ready only after P0.2–P0.9 are reviewed/committed, the deployed product and rules match that clean commit, and every external P0 checkbox is evidenced by its accountable owner.
