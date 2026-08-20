# Circa privacy data map

Status: implementation inventory for the 20 August 2026 release candidate. Controller identity, contact, provider regions/contracts and qualified legal approval are external launch gates.

| Store / fields | Source and purpose | Visibility / processor | Retention, export and deletion |
|---|---|---|---|
| Browser `circa_workspace_v3`, backups, recovery and corruption copy | User-created Personal Projects, People, contact fields, relationships, notes, groups and positions; provides the account-free Personal Workspace | This browser profile only. Not sent to Circa by sign-in. Netlify serves the application code but does not receive the stored graph | Until the user clears it. Workspace JSON export/restore is local. Account deletion does not delete it |
| Browser `circa_last_community`, reminder-seen and tab/session keys | Return link, suppress repeat in-app alert, conflict detection | This browser only | Until site storage is cleared; no cloud-account export |
| Firebase Auth | Email, provider identity, UID, display name, photo, token/security metadata | User and Firebase/Google Cloud; server verifies tokens | Active account plus provider security retention; included by request process; Auth user deleted by Account deletion |
| `users/{uid}` | Account profile and account type | That user; Firebase/Firestore | Account lifetime; cloud export; deleted with account |
| `users/{uid}/memberships/{projectId}` | Fast account list: project name/mode, role, status | That user and controlled server/admin updates | Active membership; removed state up to 12 months; exported; deleted with account |
| `projects/{projectId}` | Community/Network name, description, mode, owner, settings | Active members; Firebase/Firestore | Space lifetime; owner export; recursive owner deletion |
| `members`, `memberDirectory` | UID, role/status, consent, safe display summary | Full membership: user/admin. Safe directory: active members | Removed state up to 12 months for access/audit; exported; redacted/deleted through leave/account deletion |
| `lists/items` | Admin-published Community information, including possible contact/directory information about non-users | Active Community members | Space lifetime or admin deletion; owner export. Published facts may remain after contributor deletion with attribution removed where required |
| `editProposals` | Member suggestion, reason, exact base and proposed value, review | Submitter and admins | Pending until review; rejected 90 days; approved record retained for audit up to 12 months; export; pending/rejected deleted and approved attribution redacted on account deletion |
| `moderationEvents` | Minimal action, actor, target and time | Admins | Up to 12 months; immutable during ordinary use; actor pseudonymised on account deletion where possible |
| `invites`, `joinCodes`, project invitations | Cryptographic token/code and public-safe preview; redeem membership | Token preview public; raw codes server/admin only | Active until expiry/revocation; delete 30 days later by production cleanup |
| `reminders` | Community in-app reminder text/time | Active members | Until admin deletion/space deletion; not an external delivery service |
| `networkImports` | File name, counts and importer | Importing user | Until replacement, leave, account/space deletion; export |
| `networkPeople`, `networkEdges` | Imported professional contact facts and real contributed edges | Owner always; active Network members only while owner contribution is enabled | Until owner deletes/leaves/account/space deletion; export. Shared reads close immediately on contribution withdrawal |
| `networkPrivateFields` | Imported email/private fields | Owner only | Same as private import; export and deletion |
| `networkContributions` | Explicit enabled/revoked consent state | Active Network members | Membership/space lifetime; disabled immediately on withdrawal/leave; export |
| `serverRateLimits` | HMAC of scope, UID/network signal, count and expiry | Privileged server only | Target 30 days maximum; excluded from user export because the signal is one-way operational security data; production TTL required |
| Netlify request/function logs | Request metadata, status, release and redacted error category | Netlify and authorised operator | Proposed 30 days; must never contain graph/contact/prompt bodies |
| External Describe payload | Explicit description, limited active Project names/roles/edges/groups; excludes private notes, phones, emails and unrelated Projects | Circa Netlify function and the named configured AI processor | Provider must be disabled until processor, purpose, region, contract and zero/defined retention are recorded |

## Storage/access decision

LocalStorage and Firebase IndexedDB are storage/access technologies. Personal Workspace storage and sign-in persistence are requested product functions; they are not advertising. App Check/reCAPTCHA is used for abuse protection. Non-essential Analytics is absent from release source and must not be enabled until the applicable PECR assessment and consent mechanism are complete. See the [ICO storage/access guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/).

## No-sensitive-inference invariant

Circa stores user-supplied facts and explicit relationships. Semantic interpretation must not infer health, race/ethnicity, religion, political opinion, sexuality, biometrics, criminal history or other sensitive characteristics. It must not infer relationship value or rank people. Provider output remains an uncommitted proposal until user review.
