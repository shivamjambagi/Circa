# Circa release and rollback runbook

## Canonical release path

Netlify is Circa's only production host. It builds the protected `main` branch with `npm run build`, publishes `dist/client`, and serves Vinext server routes through the generated `dist/netlify/functions/circa-app.mjs`. The checked-in `netlify/functions/circa-app.ts` is a source-only typed handler factory; the build injects `dist/server/index.js` only after that worker exists. The Cloudflare Vite package is a build-time Fetch-worker bundler only; Circa has no Cloudflare deployment, D1 or R2 runtime.

Before production, require the GitHub `Circa release gate`, a reviewed pull request, and a successful Netlify deploy preview. Confirm `/release.json` contains the intended commit and record the deploy URL, commit, Firestore rules hash and indexes hash in the release record.

## Rollback

1. Identify the last known-good commit whose CI, deploy preview and production smoke record passed.
2. In Netlify, publish that commit's immutable deploy. Do not rebuild unreviewed local source.
3. If rules or indexes changed, redeploy the known-good commit's `firestore.rules` and `firestore.indexes.json` from the controlled release job. Never roll back rules independently without checking data compatibility.
4. Run signed-out Personal, sign-in, Community read/proposal, Network private import/path and browser-local Compose smoke checks.
5. Record the incident time, affected releases, data impact, rollback deploy ID and rules/index hashes.

Branch protection, Netlify protected-branch configuration, preview-domain Auth/App Check configuration and a real rollback drill require external administration before public launch.
