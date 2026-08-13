# Circa cloud architecture

## Source-of-truth boundaries

- Existing map projects: local `WorkspaceStore`, with explicit optional cloud copy.
- Communities: approved Firestore list/item documents. Member contributions are separate pending proposal documents.
- WhatsApp: the same approved Community list/item documents, read only by trusted Netlify Functions after webhook verification.
- Networks: authorized Firestore people and explicit graph edges. Pathways are deterministic breadth-first graph traversal; language interpretation never invents an edge.

## Security boundaries

- Browser: Firebase Web SDK, Auth, App Check, member-scoped Firestore access.
- Firestore rules: role, membership, ownership, proposal state and Network visibility enforcement.
- Netlify Functions: Firebase ID-token verification for browser-initiated WhatsApp actions; Firebase Admin authorization checks; raw Meta webhook HMAC validation; rate limiting and idempotency.
- Server-only collections: `whatsappIdentities`, `whatsappLinkRequests`, `whatsappProcessedMessages`, and `serverRateLimits` are denied to Web SDK clients.

## Privacy decisions

- A normal homepage visit does not authenticate or join anything.
- Opening an invitation only reads a public-safe preview. Anonymous auth starts after the visitor checks consent and presses Join.
- WhatsApp connection and reminder opt-in are separate.
- Imported LinkedIn connections are private. Shared visibility is a separate reversible contribution choice.
- Imported emails are kept in owner-only `networkPrivateFields`; shared Network people documents do not expose them.
- Duplicate names are not merged. Cross-contribution identity matching uses a deterministic fingerprint only when a strong identifier exists.

Local map migrations store people, relationships, groups and notes as project subcollections; Circa does not place an unbounded graph in one Firestore document.
