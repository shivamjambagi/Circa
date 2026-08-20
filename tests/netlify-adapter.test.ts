import assert from "node:assert/strict";
import test from "node:test";
import { createNetlifyHandler, type CircaWorkerArtifact } from "../netlify/functions/circa-app.ts";

test("Netlify handler factory forwards the request, environment and worker context", async () => {
  const environment: NodeJS.ProcessEnv = { ...process.env, CIRCA_ADAPTER_TEST: "source-only" };
  let passThroughCalled = false;
  const worker: CircaWorkerArtifact = {
    async fetch(request, receivedEnvironment, context) {
      assert.equal(request.url, "https://circa.test/health");
      assert.equal(receivedEnvironment, environment);
      context.waitUntil(Promise.resolve());
      context.passThroughOnException();
      passThroughCalled = true;
      return new Response("adapter-ok", { status: 202 });
    },
  };

  const response = await createNetlifyHandler(worker, environment)(new Request("https://circa.test/health"));
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "adapter-ok");
  assert.equal(passThroughCalled, true);
});
