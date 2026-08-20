# Manual / external hardening checklist

These audit findings cannot be completed by source files alone.

## Firebase
- Verify App Check metrics in production.
- After verification, set `CIRCA_REQUIRE_APP_CHECK=true` for protected server routes.
- Review Firebase Authentication email-verification policy before requiring verified email for resource creation.
- Decide retention periods for removed memberships and audit records.

## GitHub / Netlify
- After the CI workflow appears, protect `main` so CI must pass before merge.
- Keep Netlify production tied to the canonical GitHub `main`.
- Decide one canonical hosting architecture before removing alternative adapters.

## Product decisions required
- Exact cloud account deletion semantics.
- Exact cloud export format.
- Whether migrated Personal Maps are a long-term cloud feature or only a backup.
- Retention/deletion policy for recovery backups.
- Whether Personal Map should remain usable without any account (the Phase 1 patch restores that local-first behaviour).
- Whether full offline PWA support is a product requirement.
