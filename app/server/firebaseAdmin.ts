import { createHmac, randomUUID } from "node:crypto";
import type { App } from "firebase-admin/app";
import type { AppCheck } from "firebase-admin/app-check";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

type VerifiedRequest = { uid: string; token: DecodedIdToken };

type FirebaseAdminDiagnosticPhase = "initialization" | "id_token_verification";
type FirebaseAdminDiagnosticCategory =
  | "admin_app_reused"
  | "admin_initialization_succeeded"
  | "admin_sdk_load_failed"
  | "project_id_missing"
  | "service_account_json_invalid"
  | "credential_initialization_failed"
  | "admin_app_initialization_failed"
  | "admin_auth_unavailable"
  | "id_token_expired"
  | "id_token_revoked"
  | "id_token_invalid"
  | "id_token_verification_failed";

let serviceAccountJsonParsedSuccessfully: boolean | null = null;

function safeFirebaseErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^(?:app|auth|firestore)\/[a-z0-9-]{1,80}$/.test(code) ? code : "unavailable";
}

function safeFirebaseErrorName(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? (error as { name?: unknown }).name : undefined;
  return typeof name === "string" && ["Error", "FirebaseAppError", "FirebaseAuthError", "FirebaseError", "SyntaxError", "TypeError"].includes(name) ? name : "unavailable";
}

function verificationDiagnosticCategory(error: unknown): FirebaseAdminDiagnosticCategory {
  const code = safeFirebaseErrorCode(error);
  if (code === "auth/id-token-expired") return "id_token_expired";
  if (code === "auth/id-token-revoked") return "id_token_revoked";
  if (["auth/argument-error", "auth/invalid-argument", "auth/invalid-id-token"].includes(code)) return "id_token_invalid";
  return "id_token_verification_failed";
}

export function reportFirebaseAdminDiagnostic(phase: FirebaseAdminDiagnosticPhase, category: FirebaseAdminDiagnosticCategory, error?: unknown, level: "error" | "info" = "error") {
  if (process.env.NODE_ENV !== "production") return;
  const diagnostic = JSON.stringify({
    event: "circa_firebase_admin_diagnostic",
    phase,
    category,
    firebaseProjectIdPresent: Boolean(process.env.FIREBASE_PROJECT_ID?.trim()),
    firebaseServiceAccountJsonPresent: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()),
    serviceAccountJsonParsedSuccessfully,
    firebaseErrorCode: safeFirebaseErrorCode(error),
    firebaseErrorName: safeFirebaseErrorName(error),
  });
  if (level === "info") console.info(diagnostic);
  else console.error(diagnostic);
}

let appPromise: Promise<App> | undefined;
async function adminApp(): Promise<App> {
  if (appPromise) return appPromise;
  appPromise = (async () => {
    let category: FirebaseAdminDiagnosticCategory = "admin_sdk_load_failed";
    try {
      // These remain native Node imports in the Netlify function. Inlining the
      // Admin SDK into the Fetch-worker ESM bundle breaks its CommonJS paths.
      const sdk = await import(/* @vite-ignore */ "firebase-admin/app");
      const existing = sdk.getApps()[0];
      if (existing) {
        reportFirebaseAdminDiagnostic("initialization", "admin_app_reused", undefined, "info");
        return existing;
      }
      category = "project_id_missing";
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (process.env.FIRESTORE_EMULATOR_HOST ? "circa-rules-test" : "");
      if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required for Circa server routes.");
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
      let credential;
      if (raw) {
        category = "service_account_json_invalid";
        serviceAccountJsonParsedSuccessfully = false;
        const parsed = JSON.parse(raw) as Parameters<typeof sdk.cert>[0];
        serviceAccountJsonParsedSuccessfully = true;
        category = "credential_initialization_failed";
        credential = sdk.cert(parsed);
      } else {
        serviceAccountJsonParsedSuccessfully = null;
        category = "credential_initialization_failed";
        credential = sdk.applicationDefault();
      }
      category = "admin_app_initialization_failed";
      const app = sdk.initializeApp({ credential, projectId });
      reportFirebaseAdminDiagnostic("initialization", "admin_initialization_succeeded", undefined, "info");
      return app;
    } catch (error) {
      reportFirebaseAdminDiagnostic("initialization", category, error);
      if (category === "service_account_json_invalid") throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
      throw error;
    }
  })();
  return appPromise;
}

export async function getAdminFirestoreModule() { return import(/* @vite-ignore */ "firebase-admin/firestore"); }
export async function getAdminFirestore(): Promise<Firestore> { const sdk = await getAdminFirestoreModule(); return sdk.getFirestore(await adminApp()); }
export async function getAdminAppCheck(): Promise<AppCheck> { const sdk = await import(/* @vite-ignore */ "firebase-admin/app-check"); return sdk.getAppCheck(await adminApp()); }
export async function getAdminAuth(): Promise<Auth> { const sdk = await import(/* @vite-ignore */ "firebase-admin/auth"); return sdk.getAuth(await adminApp()); }

export async function verifyPermanentFirebaseRequest(request: Request, requireAppCheck = false): Promise<VerifiedRequest> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("AUTH_REQUIRED");
  let auth: Auth;
  try { auth = await getAdminAuth(); }
  catch (error) { reportFirebaseAdminDiagnostic("id_token_verification", "admin_auth_unavailable", error); throw new Error("AUTH_REQUIRED"); }
  let token: DecodedIdToken;
  try { token = await auth.verifyIdToken(match[1], true); }
  catch (error) { reportFirebaseAdminDiagnostic("id_token_verification", verificationDiagnosticCategory(error), error); throw new Error("AUTH_REQUIRED"); }
  if (token.firebase?.sign_in_provider === "anonymous") throw new Error("PERMANENT_ACCOUNT_REQUIRED");
  const appCheckToken = request.headers.get("x-firebase-appcheck");
  if (requireAppCheck && !appCheckToken) throw new Error("APP_CHECK_REQUIRED");
  if (appCheckToken) { try { await (await getAdminAppCheck()).verifyToken(appCheckToken); } catch { throw new Error("APP_CHECK_REQUIRED"); } }
  return { uid: token.uid, token };
}

export async function readResponseJsonWithLimit(response: Response, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
  if (!response.body) throw new Error("PROVIDER_INVALID_JSON");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break; total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error("PROVIDER_RESPONSE_TOO_LARGE"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { const parsed = JSON.parse(new TextDecoder().decode(bytes)); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); return parsed as Record<string, unknown>; }
  catch { throw new Error("PROVIDER_INVALID_JSON"); }
}

export async function readJsonBodyWithLimit(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (!request.body) return {};
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_JSON");
    return parsed as Record<string, unknown>;
  } catch (error) { if (error instanceof Error && error.message === "INVALID_JSON") throw error; throw new Error("INVALID_JSON"); }
}

export function privacyPreservingNetworkSignal(request: Request) {
  const forwarded = (request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const secret = process.env.RATE_LIMIT_HMAC_SECRET || (process.env.NODE_ENV === "production" ? "" : "circa-local-rate-limit-key");
  if (!secret) throw new Error("RATE_LIMIT_HMAC_SECRET is required in production.");
  return createHmac("sha256", secret).update(forwarded).digest("hex").slice(0, 32);
}

export async function enforceSharedRateLimit(scope: string, key: string, maximum: number, windowMs: number) {
  const db = await getAdminFirestore(); const safeKey = createHmac("sha256", process.env.RATE_LIMIT_HMAC_SECRET || "circa-local-rate-limit-key").update(`${scope}:${key}`).digest("hex");
  const ref = db.collection("serverRateLimits").doc(safeKey); const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref); const data = snapshot.data(); const resetAt = Number(data?.resetAt || 0); const count = resetAt > now ? Number(data?.count || 0) : 0;
    if (count >= maximum) throw new Error("RATE_LIMITED");
    transaction.set(ref, { scope, count: count + 1, resetAt: resetAt > now ? resetAt : now + windowMs, expiresAt: new Date(now + windowMs * 2), updatedAt: new Date() });
  });
}

export function serverErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "AUTH_REQUIRED") return { status: 401, message: "Sign in to continue." };
  if (message === "PERMANENT_ACCOUNT_REQUIRED") return { status: 403, message: "Use a permanent Circa account to continue." };
  if (message === "APP_CHECK_REQUIRED") return { status: 403, message: "Circa could not verify this app session." };
  if (message === "BODY_TOO_LARGE") return { status: 413, message: "That request is too large." };
  if (message === "INVALID_JSON") return { status: 400, message: "Circa could not read that request." };
  if (message === "RATE_LIMITED") return { status: 429, message: "Too many attempts. Wait a few minutes and retry." };
  return { status: 500, message: "Circa could not complete that request." };
}

export function reportServerFailure(scope: string, error: unknown, request: Request) {
  const hostRequestId = request.headers.get("x-nf-request-id") || "";
  const requestId = /^[a-zA-Z0-9_-]{6,100}$/.test(hostRequestId) ? hostRequestId : randomUUID();
  const category = error instanceof Error && /^[A-Z][A-Z0-9_]{2,60}$/.test(error.message) ? error.message : error instanceof Error ? error.name : "UnknownError";
  console.error(JSON.stringify({ event: "circa_server_failure", scope, category, requestId, release: process.env.COMMIT_REF || process.env.GITHUB_SHA || "local" }));
  return requestId;
}
