import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBodyWithLimit, readResponseJsonWithLimit, reportFirebaseAdminDiagnostic, serverErrorStatus } from "../app/server/firebaseAdmin.ts";

function streamedRequest(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("https://circa.test/api", { method: "POST", body, duplex: "half" } as RequestInit & { duplex: "half" });
}

test("request limits stop oversized chunked bodies without Content-Length", async () => {
  await assert.rejects(readJsonBodyWithLimit(streamedRequest(["{\"text\":\"", "x".repeat(80), "\"}"]), 64), /BODY_TOO_LARGE/);
});

test("request limits distinguish malformed JSON and accept valid objects", async () => {
  await assert.rejects(readJsonBodyWithLimit(streamedRequest(["{not-json"]), 128), /INVALID_JSON/);
  assert.deepEqual(await readJsonBodyWithLimit(streamedRequest(["{\"safe\":true}"]), 128), { safe: true });
});

test("provider response limit is enforced while streaming", async () => {
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(`{\"value\":\"${"x".repeat(80)}\"}`)); controller.close(); },
  }));
  await assert.rejects(readResponseJsonWithLimit(response, 64), /PROVIDER_RESPONSE_TOO_LARGE/);
});

test("provider response parser accepts bounded objects and rejects arrays", async () => {
  assert.deepEqual(await readResponseJsonWithLimit(new Response('{"result":"ok"}'), 128), { result: "ok" });
  await assert.rejects(readResponseJsonWithLimit(new Response("[]"), 128), /PROVIDER_INVALID_JSON/);
});

test("Firebase Admin diagnostics expose only allowlisted non-personal metadata", () => {
  const environment = process.env as Record<string, string | undefined>;
  const originalNodeEnv = environment.NODE_ENV;
  const originalProjectId = environment.FIREBASE_PROJECT_ID;
  const originalServiceAccount = environment.FIREBASE_SERVICE_ACCOUNT_JSON;
  const originalConsoleError = console.error;
  const token = "eyJhbGciOiJSUzI1NiJ9.private-token-marker.signature";
  const privateKey = "-----BEGIN PRIVATE KEY-----private-key-marker-----END PRIVATE KEY-----";
  const serviceAccountEmail = "service-account-secret@example.test";
  const userEmail = "person-secret@example.test";
  const uid = "private-uid-marker";
  const name = "Private Person Marker";
  const lines: string[] = [];
  try {
    environment.NODE_ENV = "production";
    environment.FIREBASE_PROJECT_ID = "private-project-id-marker";
    environment.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ private_key: privateKey, client_email: serviceAccountEmail });
    console.error = (...values: unknown[]) => { lines.push(values.map(String).join(" ")); };
    const firebaseError = Object.assign(new Error(`Bearer ${token} ${userEmail} ${uid} ${name}`), {
      name: "FirebaseAuthError",
      code: "auth/id-token-expired",
      authorization: `Bearer ${token}`,
      token,
      uid,
      email: userEmail,
    });
    reportFirebaseAdminDiagnostic("id_token_verification", "id_token_expired", firebaseError);
  } finally {
    console.error = originalConsoleError;
    if (originalNodeEnv === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = originalNodeEnv;
    if (originalProjectId === undefined) delete environment.FIREBASE_PROJECT_ID; else environment.FIREBASE_PROJECT_ID = originalProjectId;
    if (originalServiceAccount === undefined) delete environment.FIREBASE_SERVICE_ACCOUNT_JSON; else environment.FIREBASE_SERVICE_ACCOUNT_JSON = originalServiceAccount;
  }
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    event: "circa_firebase_admin_diagnostic",
    phase: "id_token_verification",
    category: "id_token_expired",
    firebaseProjectIdPresent: true,
    firebaseServiceAccountJsonPresent: true,
    serviceAccountJsonParsedSuccessfully: null,
    firebaseErrorCode: "auth/id-token-expired",
    firebaseErrorName: "FirebaseAuthError",
  });
  for (const secret of [token, privateKey, serviceAccountEmail, userEmail, uid, name, "private-project-id-marker", "Bearer"]) {
    assert.ok(!lines[0].includes(secret), `diagnostic must not log ${secret}`);
  }
});

test("authentication failures retain the generic public response", () => {
  assert.deepEqual(serverErrorStatus(new Error("AUTH_REQUIRED")), { status: 401, message: "Sign in to continue." });
});
