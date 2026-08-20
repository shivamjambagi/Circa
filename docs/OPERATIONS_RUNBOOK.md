# Circa production operations

## Ownership and release evidence

- Product/release owner: must be assigned before launch.
- Security/privacy incident lead and deputy: must be assigned before launch.
- Netlify deploys only reviewed protected `main`; `/release.json` identifies the commit.
- Firestore rules/indexes deploy only from the protected `production` GitHub environment using workload identity. Record commit and SHA-256 hashes of both files.
- Run the Personal, Auth, Community proposal/review, Network private import/contribution/revocation/path and Compose local/outage production smoke matrix with two isolated test users after each release.

## Privacy-safe monitoring

Privileged routes log only an allowlisted scope/category, Netlify request ID and release commit. Never log request bodies, prompts, graph/contact fields, email, phone, tokens, IP addresses or HMAC network signals. Alert on 5xx rate, repeated App Check failures, join-code abuse and account-lifecycle failures. Give users the `x-circa-request-id` for unexpected server failures. Monitoring vendor, retention (target 30 days), access and alert routing require production configuration.

## Backup and restore

Enable scheduled managed Firestore exports to a restricted, encrypted bucket in the intended region. Target daily backup, 35-day expiry, separate restore permission and quarterly restore drills into an isolated non-production project. Record collection counts and two-user access tests after restore. Personal browser Workspaces are not in cloud backups; users have the local JSON backup control.

## Incident path

1. Triage severity and data exposure without copying personal data into tickets.
2. Freeze deploys, preserve restricted evidence and identify the release/rules hashes.
3. Revoke affected secrets/sessions, disable the risky feature or roll back using `RELEASE_AND_ROLLBACK.md`.
4. Validate contribution revocation and cross-user Firestore access with isolated test accounts.
5. Involve the privacy lead, assess notification deadlines and communicate through the configured status/support channels.
6. Record cause, data types/subjects, duration, containment, recovery, notifications and preventive action.

## External production gates

Netlify branch protection, deploy previews, Auth domains and email/reset templates, App Check metrics/enforcement, workload identity, TTL policies, monitoring alerts, backup bucket/jobs, two-user smoke credentials, status/support channels, secret rotation and an observed rollback/restore drill all require external administration. Source configuration alone does not close them.
