import type { Env } from "../env";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export interface MediaUrlPolicy {
  readonly allowedHostnames: ReadonlySet<string>;
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
}

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

function assertPublicHostname(hostname: string): void {
  if (
    !hostname ||
    !hostname.includes(".") ||
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
}

function normalizePolicyHostname(value: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.includes("*") || /[:/@?#\\]/.test(candidate)) {
    throw new Error("MEDIA_ALLOWED_HOSTS contains an invalid hostname");
  }

  let parsed: URL;
  try {
    parsed = new URL(`https://${candidate}`);
  } catch {
    throw new Error("MEDIA_ALLOWED_HOSTS contains an invalid hostname");
  }

  const hostname = normalizeHostname(parsed.hostname);
  try {
    assertPublicHostname(hostname);
  } catch {
    throw new Error("MEDIA_ALLOWED_HOSTS contains an invalid hostname");
  }
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      hostname,
    )
  ) {
    throw new Error("MEDIA_ALLOWED_HOSTS contains an invalid hostname");
  }
  return hostname;
}

export function createMediaUrlPolicy(hostnames: Iterable<string>): MediaUrlPolicy {
  return {
    allowedHostnames: new Set(Array.from(hostnames, normalizePolicyHostname)),
  };
}

function configuredMediaHostnames(env: Pick<Env, "MEDIA_ALLOWED_HOSTS">): string[] {
  if (!env.MEDIA_ALLOWED_HOSTS?.trim()) return [];
  return env.MEDIA_ALLOWED_HOSTS.split(",").map(normalizePolicyHostname);
}

function dashboardHostname(env: Pick<Env, "DASHBOARD_BASE_URL">): string {
  let url: URL;
  try {
    url = new URL(env.DASHBOARD_BASE_URL);
  } catch {
    throw new Error("DASHBOARD_BASE_URL must be a valid HTTPS URL for WhatsApp media");
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("DASHBOARD_BASE_URL must be a standard HTTPS URL for WhatsApp media");
  }
  return normalizePolicyHostname(url.hostname);
}

/**
 * Build the fail-closed media policy for an inbound channel. Fixed-provider
 * channels use only provider-controlled hosts; channels with variable CDNs
 * require exact operator-approved hostnames.
 */
export function mediaHostPolicyFor(
  channel: string,
  env: Pick<Env, "DASHBOARD_BASE_URL" | "MEDIA_ALLOWED_HOSTS">,
): MediaUrlPolicy {
  switch (channel) {
    case "telegram":
      return createMediaUrlPolicy(["api.telegram.org"]);
    case "twilio":
      return createMediaUrlPolicy(["api.twilio.com"]);
    case "whatsapp":
      return createMediaUrlPolicy([dashboardHostname(env)]);
    case "manychat":
    case "messenger":
    case "instagram":
      return createMediaUrlPolicy(configuredMediaHostnames(env));
    default:
      return createMediaUrlPolicy(configuredMediaHostnames(env));
  }
}

/**
 * Allow only an exact, approved public HTTPS media location. DNS rebinding
 * cannot be fully resolved without trusted egress, so callers must restrict
 * URLs to provider-controlled or explicitly approved hostnames.
 */
export function assertSafeExternalMediaUrl(value: string | URL, policy: MediaUrlPolicy): URL {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  const hostname = normalizeHostname(url.hostname);

  if (url.protocol !== "https:") throw new Error("media URL must use HTTPS");
  if (url.username || url.password) throw new Error("media URL must not contain credentials");
  if (url.port && url.port !== "443") throw new Error("media URL must use the standard HTTPS port");
  assertPublicHostname(hostname);
  if (!policy.allowedHostnames.has(hostname)) throw new Error("media URL host is not allowed");

  return url;
}

export function isSafeExternalMediaUrl(value: string | URL, policy: MediaUrlPolicy): boolean {
  try {
    assertSafeExternalMediaUrl(value, policy);
    return true;
  } catch {
    return false;
  }
}

/** Fetch media while validating every redirect target and bounding connect time. */
export async function fetchSafeExternalMedia(
  value: string | URL,
  policy: MediaUrlPolicy,
  init: RequestInit = {},
): Promise<Response> {
  let url = assertSafeExternalMediaUrl(value, policy);

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
    url = assertSafeExternalMediaUrl(new URL(location, url), policy);
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
