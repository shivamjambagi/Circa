import assert from "node:assert/strict";
import test from "node:test";

test("renders release metadata without a development marker", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>Circa \| Map your people<\/title>/i);
  assert.doesNotMatch(html, /codex-preview|content=["']development["']/i);
});

test("cloud entry routes render through the production worker", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("routes", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  for (const path of ["/join", "/community/new", "/network/new", "/auth"]) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, context);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i, path);
    if (path === "/auth") {
      const csp = response.headers.get("content-security-policy") ?? "";
      assert.match(csp, /script-src[^;]*https:\/\/apis\.google\.com(?:\s|;)/);
      assert.match(csp, /frame-src[^;]*https:\/\/circa-4bea4\.firebaseapp\.com(?:\s|;)/);
      assert.doesNotMatch(csp, /'unsafe-eval'|(?:^|\s)https:\/\/\*(?:\s|;)/);
    }
  }
});
