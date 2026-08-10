# Compose semantic architecture

Circa Compose shares one semantic layer across all three modes:

1. **Create** interprets language into entities, claims, evidence and ambiguities, then deterministically compiles a reviewed graph proposal.
2. **Change** uses the same interpretation but compiles only explicit field patches and graph operations/diffs. Omitted fields remain unchanged.
3. **Ask** resolves People and intent locally, runs deterministic queries against the stored graph, and returns exact People, relationship IDs and reporting edges for highlighting.

The stored graph is always the source of truth. A model or local interpreter never writes application state. Create and Change mutate the graph only after the user reviews the proposal and selects **Apply**. Ask is read-only.

## Local semantic engine

Create, Change and Ask work without an external provider. The local engine uses:

- one relationship ontology and vocabulary normaliser;
- a cautious graph-backed Person/nickname resolver;
- discourse tracking for singular and plural pronouns;
- compositional relationship, reporting, role, team, family and introduction frames;
- explicit polarity, temporal corrections and safe derived-family facts;
- ambiguity objects when identity, reference or meaning is not safe to infer;
- a deterministic compiler and graph query engine.

Only known relationship vocabulary is typo-normalised. Person names are never autocorrected.

## Optional external semantic provider

An external provider can improve open-ended language coverage while keeping the same trust boundary. Configure server-only values (never `NEXT_PUBLIC_`):

```dotenv
AI_PROVIDER=custom-http
AI_API_URL=https://your-provider.example.com/circa-compose
AI_API_KEY=PASTE_SERVER_SIDE_AI_KEY_HERE
```

Circa sends a dedicated system instruction, the user description, category-aware ontology, and a minimal graph projection. Project notes, phone numbers, email addresses and social links are excluded. The endpoint must pass Circa's `system`/`instruction` value to its language model as **system-level policy**; appending it to the user text is an incomplete and unsafe integration.

The request is shaped like:

```json
{
  "task": "circa_semantic_interpretation",
  "mode": "change",
  "system": "Circa semantic system policy…",
  "instruction": "Circa semantic system policy…",
  "userDescription": "Change Maya's role to Senior Developer",
  "context": {
    "project": { "category": "business", "relationshipLabels": ["Friend", "Colleague", "Mentor"] },
    "selectedPersonId": "",
    "people": [{ "id": "person_1", "name": "Maya", "role": "Developer", "team": "Frontend" }],
    "relationships": [],
    "groups": [],
    "globalPeople": [],
    "ambiguityResolutions": {}
  },
  "responseShape": { "version": "circa-semantic-v1", "entities": [], "claims": [], "ambiguities": [], "warnings": [] }
}
```

The provider must return a semantic interpretation—not application state or a final graph:

```json
{
  "interpretation": {
    "version": "circa-semantic-v1",
    "entities": [
      {
        "ref": "maya",
        "kind": "person",
        "displayName": "Maya",
        "aliases": [],
        "evidence": ["Maya is my friend and reports to James"]
      },
      {
        "ref": "james",
        "kind": "person",
        "displayName": "James",
        "aliases": [],
        "evidence": ["Maya is my friend and reports to James"]
      }
    ],
    "claims": [
      {
        "id": "claim_1",
        "type": "relationship",
        "subjectRef": "self",
        "objectRef": "maya",
        "labels": ["Friend"],
        "direction": "undirected",
        "evidenceText": "Maya is my friend",
        "certainty": "explicit",
        "polarity": "positive",
        "derived": false
      },
      {
        "id": "claim_2",
        "type": "reports_to",
        "subjectRef": "maya",
        "objectRef": "james",
        "evidenceText": "reports to James",
        "certainty": "explicit",
        "polarity": "positive",
        "derived": false
      }
    ],
    "ambiguities": [],
    "warnings": []
  }
}
```

The server treats this JSON as untrusted: it bounds sizes, strips unknown fields, validates every reference, rejects dangling claims, grounds identities against local/global People, and deterministically compiles the same reviewed draft used by the local engine. Legacy `{ "draft": ... }` provider responses remain temporarily accepted with a migration warning.

## Verification

The automated suite covers the 30 common-English Create/Change benchmarks, multi-sentence discourse, hard corrections, unseen paraphrases, provider validation, graph immutability, and all 25 Ask benchmarks including exact relationship/reporting highlights.

Manual smoke test:

1. Open **Compose → Create**, describe several People with roles, relationships and pronouns, and verify the map does not change before Apply.
2. Open **Compose → Change**, request one field change, and verify unrelated fields show as unchanged.
3. Enter an ambiguous Person or pronoun and verify Compose stays open with explicit choices.
4. Open **Compose → Ask**, ask a path, introducer, manager, reports, group or disconnected-People question.
5. Verify the answer highlights only returned relationship IDs/reporting edges and **Clear view** removes the result.

To disable only the external provider, remove `AI_API_URL` or set `AI_PROVIDER=NOT_CONFIGURED`; the local semantic engine remains available.
