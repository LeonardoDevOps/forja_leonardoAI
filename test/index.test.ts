import { describe, it, expect, vi } from "vitest";

// `src/index.ts` re-exports `SupportAgent` from `./agent`, which imports the
// `agents` SDK. `agents` (via `partyserver`) imports the virtual
// `cloudflare:workers` module at load time, which Node's ESM loader can't
// resolve outside workerd. Mock the `agents` package so the import graph stays
// in Node-land — we only exercise the Hono router here. Tests that need real
// agent/runtime behavior use Miniflare instead.
vi.mock("agents", () => ({ Agent: class {} }));

import worker from "../src/index";
import { twilioExpectedSignature } from "../src/http-auth";

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

  function withAgent(overrides: Record<string, unknown> = {}) {
    const ingest = vi.fn(async () => undefined);
    const idFromName = vi.fn((name: string) => name);
    const get = vi.fn(() => ({ ingest }));
    return {
      env: {
        ...env,
        AGENT: { idFromName, get },
        ...overrides,
      } as any,
      ingest,
      idFromName,
      get,
    };
  }

  function telegramBody(from = 555) {
    return {
      update_id: 1,
      message: {
        message_id: 10,
        from: { id: from, first_name: "Ana", is_bot: false },
        chat: { id: from, type: "private" },
        date: 100,
        text: "hola",
      },
    };
  }

  it("returns 200 on /health", async () => {
    const res = await worker.fetch(new Request("https://test/health"), env, {} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(res.headers.get("referrer-policy")).toBeNull();
    expect(res.headers.get("x-frame-options")).toBeNull();
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
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "telegram-webhook-secret",
        },
        body: "{}",
      }),
      { ...env, TELEGRAM_WEBHOOK_SECRET: "telegram-webhook-secret" },
      {} as any,
    );

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("internal error");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("rejects Telegram when the webhook secret is absent or incorrect", async () => {
    const missing = withAgent({ TELEGRAM_WEBHOOK_SECRET: "telegram-secret" });
    const missingRes = await worker.fetch(
      new Request("https://test/webhooks/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramBody()),
      }),
      missing.env,
      {} as any,
    );
    expect(missingRes.status).toBe(403);
    expect(missing.ingest).not.toHaveBeenCalled();

    const wrong = withAgent({
      TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
      OWNER_TELEGRAM_CHAT_ID: "999",
    });
    const wrongRes = await worker.fetch(
      new Request("https://test/webhooks/telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "wrong-secret",
        },
        body: JSON.stringify(telegramBody(999)),
      }),
      wrong.env,
      {} as any,
    );
    expect(wrongRes.status).toBe(403);
    expect(wrong.ingest).not.toHaveBeenCalled();
  });

  it("ingests Telegram only with the configured webhook secret", async () => {
    const target = withAgent({ TELEGRAM_WEBHOOK_SECRET: "telegram-secret" });
    const res = await worker.fetch(
      new Request("https://test/webhooks/telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "telegram-secret",
        },
        body: JSON.stringify(telegramBody()),
      }),
      target.env,
      {} as any,
    );

    expect(res.status).toBe(200);
    expect(target.idFromName).toHaveBeenCalledWith("telegram:555");
    expect(target.ingest).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram" }));
  });

  it("rejects ManyChat when its shared secret is unset or incorrect", async () => {
    const body = JSON.stringify({ id: "subscriber-1", last_input_text: "hola" });

    const unset = withAgent();
    const unsetRes = await worker.fetch(
      new Request("https://test/webhooks/manychat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      unset.env,
      {} as any,
    );
    expect(unsetRes.status).toBe(403);
    expect(unset.ingest).not.toHaveBeenCalled();

    const wrong = withAgent({ MANYCHAT_WEBHOOK_SECRET: "manychat-secret" });
    const wrongRes = await worker.fetch(
      new Request("https://test/webhooks/manychat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forja-Webhook-Secret": "wrong-secret",
        },
        body,
      }),
      wrong.env,
      {} as any,
    );
    expect(wrongRes.status).toBe(403);
    expect(wrong.ingest).not.toHaveBeenCalled();
  });

  it("ingests ManyChat only with the configured shared secret", async () => {
    const target = withAgent({ MANYCHAT_WEBHOOK_SECRET: "manychat-secret" });
    const res = await worker.fetch(
      new Request("https://test/webhooks/manychat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forja-Webhook-Secret": "manychat-secret",
        },
        body: JSON.stringify({ id: "subscriber-1", last_input_text: "hola" }),
      }),
      target.env,
      {} as any,
    );

    expect(res.status).toBe(200);
    expect(target.idFromName).toHaveBeenCalledWith("manychat:subscriber-1");
    expect(target.ingest).toHaveBeenCalledWith(expect.objectContaining({ channel: "manychat" }));
  });

  it("silently rejects invalid Twilio signatures without ingesting", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const target = withAgent({ TWILIO_AUTH_TOKEN: "auth-token" });
    const body = new URLSearchParams({
      From: "whatsapp:+5215512345",
      To: "whatsapp:+5215587654",
      Body: "hola",
      NumMedia: "0",
    });
    const res = await worker.fetch(
      new Request("https://test/webhooks/twilio", {
        method: "POST",
        headers: { "X-Twilio-Signature": "invalid" },
        body,
      }),
      target.env,
      {} as any,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<Response></Response>");
    expect(target.ingest).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("twilio webhook rejected: invalid signature");
    warn.mockRestore();
  });

  it("fails closed when Twilio's public URL or auth token is not configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const target = withAgent({ DASHBOARD_BASE_URL: "", TWILIO_AUTH_TOKEN: undefined });
    const res = await worker.fetch(
      new Request("https://test/webhooks/twilio", {
        method: "POST",
        body: new URLSearchParams({ From: "whatsapp:+5215512345", Body: "hola" }),
      }),
      target.env,
      {} as any,
    );

    expect(res.status).toBe(200);
    expect(target.ingest).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ingests Twilio only after validating the exact configured URL and all form parameters", async () => {
    const publicUrl = "https://bot.example.workers.dev/webhooks/twilio";
    const authToken = "auth-token";
    const entries: [string, string][] = [
      ["Body", "hola"],
      ["NumMedia", "0"],
      ["To", "whatsapp:+5215587654"],
      ["From", "whatsapp:+5215512345"],
    ];
    const signature = await twilioExpectedSignature(publicUrl, entries, authToken);
    const target = withAgent({
      DASHBOARD_BASE_URL: "https://proxy.example.invalid",
      TWILIO_WEBHOOK_URL: publicUrl,
      TWILIO_AUTH_TOKEN: authToken,
    });
    const res = await worker.fetch(
      new Request("https://internal-proxy/webhooks/twilio", {
        method: "POST",
        headers: { "X-Twilio-Signature": signature },
        body: new URLSearchParams(entries),
      }),
      target.env,
      {} as any,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<Response></Response>");
    expect(target.idFromName).toHaveBeenCalledWith("twilio:+5215512345");
    expect(target.ingest).toHaveBeenCalledWith(expect.objectContaining({ channel: "twilio" }));
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
