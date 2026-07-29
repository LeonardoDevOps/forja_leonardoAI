import { describe, it, expect, vi } from "vitest";

// `src/index.ts` re-exports `SupportAgent` from `./agent`, which imports the
// `agents` SDK. `agents` (via `partyserver`) imports the virtual
// `cloudflare:workers` module at load time, which Node's ESM loader can't
// resolve outside workerd. Mock the `agents` package so the import graph stays
// in Node-land — we only exercise the Hono router here. Tests that need real
// agent/runtime behavior use Miniflare instead.
vi.mock("agents", () => ({ Agent: class {} }));

import worker from "../src/index";

async function metaSignature(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  return `sha256=${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

describe("Worker entry", () => {
  const env = {
    BOT_NAME: "Testi",
    BUSINESS_NAME: "Test",
    BOT_LANGUAGE: "es",
    BOT_TIER: "pro",
    BUFFER_SECONDS: "15",
    DASHBOARD_BASE_URL: "https://test.workers.dev",
  } as any;

  it("returns 200 on /health", async () => {
    const res = await worker.fetch(new Request("https://test/health"), env, {} as any);
    expect(res.status).toBe(200);
  });

  it("returns 404 on unknown route", async () => {
    const res = await worker.fetch(new Request("https://test/nope"), env, {} as any);
    expect(res.status).toBe(404);
  });

  it("does not expose internal webhook parsing errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await worker.fetch(
      new Request("https://test/webhooks/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      env,
      {} as any,
    );

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("internal error");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("acknowledges a signed Meta payload with an invalid nested shape", async () => {
    const raw = JSON.stringify({ object: "page", entry: "unexpected" });
    const secret = "meta-secret";
    const res = await worker.fetch(
      new Request("https://test/webhooks/meta", {
        method: "POST",
        headers: { "x-hub-signature-256": await metaSignature(raw, secret) },
        body: raw,
      }),
      { ...env, META_APP_SECRET: secret },
      {} as any,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("EVENT_RECEIVED");
  });

  it("acknowledges a signed WhatsApp payload with an invalid nested shape", async () => {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: 7 });
    const secret = "whatsapp-secret";
    const res = await worker.fetch(
      new Request("https://test/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": await metaSignature(raw, secret) },
        body: raw,
      }),
      { ...env, WHATSAPP_APP_SECRET: secret },
      {} as any,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("EVENT_RECEIVED");
  });
});
