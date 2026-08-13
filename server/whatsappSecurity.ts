import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(raw: Uint8Array, signature: string, secret: string) {
  if (!secret || !signature.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const actual = Buffer.from(signature.slice(7));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
