# Connecting Firebase to Circa

Circa currently runs in local mode. Workspace data is stored in the browser under `circa_workspace_v3`; v1 graph and v2 workspace keys are migration inputs only. No data is sent to Firebase and the interface makes no cloud-sync claims.

## Integration steps

1. Create a Firebase project and a web app in the Firebase console.
2. Copy `.env.example` to `.env.local` and fill in the six public web-app values. Never add Admin SDK credentials to browser-exposed variables.
3. Add the official Firebase web SDK as a production dependency.
4. Enable the authentication providers you intend to support. Add the deployed Circa hostname to Firebase Authentication's authorised domains.
5. Create Firestore in production mode and deploy `firestore.rules`.
6. Implement a `FirebaseGraphStore` that satisfies the `GraphStore` interface in `app/graphStore.ts`. Keep `LocalGraphStore` as the offline cache and safe fallback.
7. Store each authenticated user's graph under `users/{uid}/sketches/{sketchId}`. Use the authenticated UID only; never trust a client-supplied owner ID.
8. Debounce graph writes and preserve a local pending copy before syncing. A network failure must never replace newer local work with older cloud data.

## Suggested adapter boundary

```ts
class FirebaseGraphStore implements GraphStore {
  loadGraph(): Promise<Graph>;
  saveGraph(graph: Graph): Promise<void>;
  saveGraphNow(graph: Graph): void;
  clearGraph(): Promise<void>;
}
```

Switch adapters only after Firebase initialises successfully and an authenticated user is available. Until then, use `LocalGraphStore` and label the state as “Saved locally”.

## Security checklist

- Do not use a Firebase Admin key in the browser.
- Keep Firestore rules owner-scoped.
- Validate graph shape before rendering downloaded data.
- Add App Check only after the core authenticated flow works.
- Test signed-out reads and cross-user reads; both must fail.
- Do not enable GitHub or LinkedIn scraping. Circa stores only URLs entered by the user.
