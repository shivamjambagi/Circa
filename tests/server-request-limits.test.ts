import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBodyWithLimit, readResponseJsonWithLimit } from "../app/server/firebaseAdmin.ts";

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
