// Netlify adapter for Circa's checked production worker artifact.
import worker from "../../dist/server/index.js";

export default async function handler(request: Request) {
  const context = {
    waitUntil(promise: Promise<unknown>) { void promise.catch(() => undefined); },
    passThroughOnException() { /* Netlify owns final exception handling. */ },
  };
  return worker.fetch(request, process.env, context);
}
