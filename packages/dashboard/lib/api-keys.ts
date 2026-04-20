import { randomBytes, createHash } from "node:crypto";

/** Generate a new API key. Returns the raw key (show once) and its sha256 hash (store). */
export function generateApiKey(): { raw: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  const raw = `mw_sk_live_${token}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

/** Hash an existing key (for lookup). */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
