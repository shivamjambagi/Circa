# Circa cloud architecture

## Source-of-truth boundaries

- Personal map projects: local `WorkspaceStore` only. The incomplete cloud-copy feature is not shipped.
- Communities: approved Firestore list/item documents. Member contributions are separate pending proposal documents.
- Networks: authorized Firestore people and explicit graph edges. Pathways are deterministic breadth-first graph traversal; language interpretation never invents an edge.

## Security boundaries

- Browser: Firebase Web SDK, Auth, App Check, member-scoped Firestore access.
- Firestore rules: role, membership, ownership, proposal state and Network visibility enforcement.
- Netlify: the Vinext application is served by the checked server adapter; privileged routes verify Firebase identity and authorization server-side.

## Privacy decisions

- A normal homepage visit does not authenticate or join anything.
- Opening an invitation only reads a public-safe preview. A visitor must explicitly consent and use a permanent account before joining.
- Community reminders are displayed inside the signed-in Community experience.
- Imported LinkedIn connections are private. Shared visibility is a separate reversible contribution choice.
- Imported emails are kept in owner-only `networkPrivateFields`; shared Network people documents do not expose them.
- Duplicate names are not merged. Cross-contribution identity matching uses a deterministic fingerprint only when a strong identifier exists.

Personal maps are not migrated to Firestore in this release. Community and Network records use bounded project subcollections rather than an unbounded graph document.
