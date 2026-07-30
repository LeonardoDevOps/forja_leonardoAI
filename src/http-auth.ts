import type { Env } from "./env";

/**
 * Compare UTF-8 strings without returning early on a length mismatch.
 *
 * JavaScript cannot guarantee perfectly constant-time execution, but folding
 * the length into the result and scanning the longest byte array avoids the
 * obvious prefix/length timing leak for webhook and control-plane secrets.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const max = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < max; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/** Backwards-compatible name used by existing token-guarded endpoints. */
export function tokensMatch(a: string, b: string): boolean {
  return timingSafeEqual(a, b);
}

/** Minimum length for the optional control-plane Bearer secret. */
export const MIN_CONTROL_PLANE_TOKEN_LENGTH = 32;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Calculate the signature Twilio sends for form-encoded webhooks.
 *
 * Twilio signs the exact configured public URL followed by every form
 * parameter sorted by its case-sensitive name, with no separators, using
 * HMAC-SHA1 and the account Auth Token. Query parameters remain in `url`.
 */
export async function twilioExpectedSignature(
  url: string,
  params: Iterable<readonly [string, string]>,
  authToken: string,
): Promise<string> {
  const sorted = [...params].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let payload = url;
  for (const [name, value] of sorted) payload += `${name}${value}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64(new Uint8Array(signature));
}

/**
 * Fail-closed Bearer auth for the control-plane `/api/*` endpoints.
 *
 * Passes ONLY when CONTROL_PLANE_TOKEN has at least 32 characters AND the
 * request carries a matching `Authorization: Bearer <token>` (constant-time
 * compare via tokensMatch). If the token is unset/short, the header is
 * missing/malformed, or it mismatches → returns false (the caller answers 401).
 */
export function requireControlPlane(req: Request, env: Env): boolean {
  const expected = env.CONTROL_PLANE_TOKEN?.trim();
  if (!expected || Array.from(expected).length < MIN_CONTROL_PLANE_TOKEN_LENGTH) {
    return false;
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  return tokensMatch(match[1].trim(), expected);
}
