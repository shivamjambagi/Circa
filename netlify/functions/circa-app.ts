// Netlify adapter for Circa's checked production worker artifact.
import artifact from "../../dist/server/index.js";

const worker = artifact as unknown as { fetch(request: Request, env: NodeJS.ProcessEnv, context: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }): Promise<Response> };

export default async function handler(request: Request) {
  const context = {
    waitUntil(promise: Promise<unknown>) { void promise.catch(() => undefined); },
    passThroughOnException() { /* Netlify owns final exception handling. */ },
  };
  return worker.fetch(request, process.env, context);
}
