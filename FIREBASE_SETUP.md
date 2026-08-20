# Circa cloud setup

Circa remains local-first for ordinary maps. Firebase adds optional accounts, cloud migration, private Networks, Community membership, approved Community information, proposals and invitations. Netlify remains the intended public frontend and trusted function host.

## Firebase project

This checkout is configured for the existing Firebase project `circa-4bea4` and the default Firestore database in `europe-west2`.

The client uses the modular Firebase Web SDK. App Check is initialised before Auth and Firestore with `ReCaptchaEnterpriseProvider`, site key `6Leb-lEtAAAAAJVLLrjf2-P9_VsmU-94LMH5MhA3`, and automatic token refresh. Do not enable App Check enforcement until legitimate production Auth, Firestore, anonymous invitation joins and proposal writes appear in Firebase App Check metrics.

Authentication providers expected in Firebase Console:

- Email/password
- Google
- Anonymous (used only after explicit Community join consent)

The authorized domains must include `circaa.netlify.app` and the development host you use.

## Firestore rules and indexes

Production rules are in `firestore.rules`; composite indexes are in `firestore.indexes.json`. The configuration deliberately contains no Firebase Hosting section.

Deploy from the repository root with an authenticated Firebase CLI:

```bash
firebase deploy --project circa-4bea4 --only firestore:rules,firestore:indexes
```

Run the database-level rules suite with:

```bash
npm run test:firestore
```

The rules enforce member proposals, admin publication/review, cross-Community isolation, private Network ownership, explicit project-visible Network contributions, exact public invite/code reads without public listing, and complete client denial for server-owned rate-limit records.

## Existing local data

`circa_workspace_v3` remains the working local source for existing map projects. On a permanent account, `/auth` offers an explicit copy to cloud. Before copying, Circa retains a local backup. The migration uses a per-user `localWorkspaceV3` marker, is safe to retry, verifies the completion marker, and never deletes the local workspace.

## Netlify routing

`netlify.toml` builds the existing Vinext app, publishes static assets, bundles Netlify Functions, and sends unmatched SPA/server routes—including `/join/*`, `/community/*` and `/network/*`—through the checked production worker adapter. `public/_redirects` mirrors that fallback.
