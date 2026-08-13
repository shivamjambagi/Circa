import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { it } from "node:test";
import { verifyWebhookSignature } from "../server/whatsappSecurity.ts";

it("accepts the exact Meta webhook HMAC and rejects changed or malformed signatures", () => {
  const raw = new TextEncoder().encode('{"entry":[]}'); const secret = "test-only-secret"; const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(verifyWebhookSignature(raw, signature, secret), true);
  assert.equal(verifyWebhookSignature(new TextEncoder().encode('{"entry":[1]}'), signature, secret), false);
  assert.equal(verifyWebhookSignature(raw, "sha256=bad", secret), false);
  assert.equal(verifyWebhookSignature(raw, signature, "wrong"), false);
});
