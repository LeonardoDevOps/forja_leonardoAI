const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

function isPrivateIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const parts = hostname.split(".").map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * Allow only public HTTPS media locations. DNS rebinding cannot be fully
 * resolved without a trusted egress proxy, but blocking local names and IP
 * literals closes the direct SSRF paths available to webhook payloads.
 */
export function assertSafeExternalMediaUrl(value: string | URL): URL {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (url.protocol !== "https:") throw new Error("media URL must use HTTPS");
  if (url.username || url.password) throw new Error("media URL must not contain credentials");
  if (url.port && url.port !== "443") throw new Error("media URL must use the standard HTTPS port");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa") ||
    hostname === "metadata.google.internal" ||
    hostname.includes(":") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("media URL host is not public");
  }

  return url;
}

export function isSafeExternalMediaUrl(value: string | URL): boolean {
  try {
    assertSafeExternalMediaUrl(value);
    return true;
  } catch {
    return false;
  }
}

/** Fetch media while validating every redirect target and bounding connect time. */
export async function fetchSafeExternalMedia(value: string | URL, init: RequestInit = {}): Promise<Response> {
  let url = assertSafeExternalMediaUrl(value);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status < 300 || response.status >= 400) return response;
    if (redirectCount === MAX_REDIRECTS) throw new Error("too many media redirects");

    const location = response.headers.get("location");
    if (!location) throw new Error("media redirect is missing a location");
    url = assertSafeExternalMediaUrl(new URL(location, url));
  }

  throw new Error("too many media redirects");
}

/** Read a response body without allowing an unbounded in-memory allocation. */
export async function readMediaBytes(response: Response, maxBytes = MAX_MEDIA_BYTES): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("media file is too large");
  }

  if (!response.body) return new ArrayBuffer(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("media file is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
