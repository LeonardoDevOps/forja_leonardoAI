import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderCampanas } from "../../src/admin/views/campanas";
import { createD1Stub, makeAdminEnv } from "./helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("renderCampanas", () => {
  it("renders empty segments, templates and history without real network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    const d1 = createD1Stub([
      { frag: "FROM conversations c", all: [], required: true },
      { frag: "FROM template_sends WHERE kind", first: { n: 0 }, required: true },
      { frag: "FROM template_sends GROUP BY", all: [], required: true },
    ]);

    const html = await renderCampanas(makeAdminEnv(d1.db));

    expect(html).toContain("<b>0</b> / 250");
    expect(html).toContain("No hay plantillas aprobadas");
    expect(html).toContain("Sin campañas todavía");
    expect(html).toContain("Mandaron QUIERO");
    d1.assertRequiredQueries();
  });

  it("renders escaped success data, segments, templates, quota and history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          contents: [
            {
              sid: "HX<123>",
              friendly_name: "Oferta <VIP>",
              types: {
                "twilio/text": {
                  body: "Este texto de plantilla es deliberadamente largo para comprobar que la vista lo recorta correctamente.",
                },
              },
              variables: { "1": "Ana" },
            },
          ],
        }),
      ),
    );
    const now = Date.now();
    const d1 = createD1Stub([
      {
        frag: "FROM conversations c",
        all: [
          {
            conversationId: "conv-1",
            channel: "twilio",
            channelUserId: "1",
            name: "Ana",
            lastUserAt: now - 60_000,
          },
          {
            conversationId: "conv-2",
            channel: "twilio",
            channelUserId: "2",
            name: "Beto",
            lastUserAt: now - 30 * 3_600_000,
          },
        ],
      },
      { frag: "FROM template_sends WHERE kind", first: { n: 230 } },
      {
        frag: "FROM template_sends GROUP BY",
        all: [
          {
            campaign_key: "campaña <uno>",
            freeform: 3,
            template: 2,
            last_at: now - 2 * 3_600_000,
          },
        ],
      },
    ]);

    const html = await renderCampanas(
      makeAdminEnv(d1.db, {
        WA_DAILY_TEMPLATE_CAP: "250",
        TWILIO_ACCOUNT_SID: "AC-fake",
        TWILIO_AUTH_TOKEN: "token-fake",
      }),
      {
        ok: "1",
        ff: "<3>",
        tp: "2",
        dup: "1",
        quota: "0",
        fail: "0",
      },
    );

    expect(html).toContain("Campaña enviada");
    expect(html).toContain("&lt;3&gt;");
    expect(html).toContain("<b>230</b> / 250");
    expect(html).toContain("width:92%");
    expect(html).toContain("HX&lt;123&gt;");
    expect(html).toContain("Oferta &lt;VIP&gt;");
    expect(html).toContain("…”");
    expect(html).toContain("campaña &lt;uno&gt;");
    expect(html).toContain("hace 2 h");
    expect(html).toContain("<b>2</b> total");
  });

  it("escapes an error banner and falls back when template listing throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Twilio unavailable");
      }),
    );
    const d1 = createD1Stub([
      { frag: "FROM conversations c", all: [] },
      { frag: "FROM template_sends WHERE kind", first: { n: 0 } },
      { frag: "FROM template_sends GROUP BY", all: [] },
    ]);

    const html = await renderCampanas(
      makeAdminEnv(d1.db, {
        TWILIO_ACCOUNT_SID: "AC-fake",
        TWILIO_AUTH_TOKEN: "token-fake",
      }),
      { err: "<falló>" },
    );

    expect(html).toContain("⚠️ &lt;falló&gt;");
    expect(html).toContain("No hay plantillas aprobadas");
    expect(html).not.toContain("⚠️ <falló>");
  });
});
