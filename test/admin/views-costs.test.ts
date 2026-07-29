import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TwilioUsage } from "../../src/admin/twilioUsage";
import { createD1Stub, makeAdminEnv } from "./helpers";

const twilioState = vi.hoisted(() => ({
  value: {
    available: false,
    error: "Twilio <no disponible>",
    total: 0,
    messagingTotal: 0,
    numbersTotal: 0,
    waConversations: 0,
    categories: [],
    period: "ThisMonth",
  } as TwilioUsage,
}));

vi.mock("../../src/admin/twilioUsage", () => ({
  fetchTwilioUsage: vi.fn(async () => twilioState.value),
}));

import { renderCosts } from "../../src/admin/views/costs";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("renderCosts", () => {
  it("renders empty AI/Twilio states and escapes the unavailable reason", async () => {
    const d1 = createD1Stub([
      { frag: "GROUP BY day, model_used", all: [], required: true },
      { frag: "SELECT value FROM settings", first: null, required: true },
      { frag: "WHERE created_at >= ?", all: [], required: true },
    ]);
    twilioState.value = {
      available: false,
      error: "Twilio <no disponible>",
      total: 0,
      messagingTotal: 0,
      numbersTotal: 0,
      waConversations: 0,
      categories: [],
      period: "ThisMonth",
    };

    const html = await renderCosts(makeAdminEnv(d1.db));

    expect(html).toContain("Aún no hay uso de IA");
    expect(html).toContain("Sin datos");
    expect(html).toContain("Twilio &lt;no disponible&gt;");
    expect(html).toContain("Sin límite configurado");
    expect(html).not.toContain("Presupuesto guardado");
    d1.assertRequiredQueries();
  });

  it("renders model/day totals, budget banner and available Twilio categories", async () => {
    const d1 = createD1Stub([
      {
        frag: "GROUP BY day, model_used",
        all: [
          {
            day: "2026-07-20",
            model_used: "claude-haiku-4-5-20251001",
            input: 1_000_000,
            output: 100_000,
            cached: 100_000,
            msgs: 4,
          },
          {
            day: "2026-07-19",
            model_used: "gpt-4o-mini",
            input: 500_000,
            output: 50_000,
            cached: 0,
            msgs: 2,
          },
        ],
        required: true,
      },
      { frag: "SELECT value FROM settings", first: { value: "1.50" }, required: true },
      {
        frag: "WHERE created_at >= ?",
        all: [
          {
            model_used: "claude-haiku-4-5-20251001",
            input: 1_000_000,
            output: 100_000,
            cached: 100_000,
          },
        ],
        required: true,
      },
    ]);
    twilioState.value = {
      available: true,
      total: 3.5,
      messagingTotal: 2.5,
      numbersTotal: 1,
      waConversations: 9,
      categories: [
        {
          category: "unsafe",
          label: "Mensajes <premium>",
          usage: 9,
          unit: "conversaciones",
          price: 2.5,
        },
      ],
      period: "ThisMonth",
    };

    const html = await renderCosts(makeAdminEnv(d1.db), true);

    expect(html).toContain("Presupuesto guardado");
    expect(html).toContain("claude-haiku-4-5-20251001");
    expect(html).toContain("gpt-4o-mini");
    expect(html).toContain("2026-07-20");
    expect(html).toContain("9 conversaciones");
    expect(html).toContain("Mensajes &lt;premium&gt;");
    expect(html).toContain("Mensajería $2.50 · Números $1.00");
    expect(html).not.toContain("Mensajes <premium>");
    d1.assertRequiredQueries();
  });

  it("renders a configured budget and an available Twilio month without charges", async () => {
    const d1 = createD1Stub([
      { frag: "GROUP BY day, model_used", all: [] },
      { frag: "SELECT value FROM settings", first: { value: "25" } },
      { frag: "WHERE created_at >= ?", all: [] },
    ]);
    twilioState.value = {
      available: true,
      total: 0,
      messagingTotal: 0,
      numbersTotal: 0,
      waConversations: 0,
      categories: [],
      period: "ThisMonth",
    };

    const html = await renderCosts(makeAdminEnv(d1.db));

    expect(html).toContain("de $25.00");
    expect(html).toContain("Sin cargos este mes");
  });
});
