export interface CircaWorkerContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface CircaWorkerArtifact {
  fetch(request: Request, env: NodeJS.ProcessEnv, context: CircaWorkerContext): Promise<Response>;
}

/**
 * Source-only Netlify handler contract. The release build injects the completed
 * Vinext worker artifact into this factory and writes the deployable function to
 * dist/netlify/functions. Source typechecking therefore never depends on dist.
 */
export function createNetlifyHandler(worker: CircaWorkerArtifact, environment: NodeJS.ProcessEnv = process.env) {
  return async function handler(request: Request): Promise<Response> {
    const context: CircaWorkerContext = {
      waitUntil(promise) { void promise.catch(() => undefined); },
      passThroughOnException() { /* Netlify owns final exception handling. */ },
    };
    return worker.fetch(request, environment, context);
  };
}
