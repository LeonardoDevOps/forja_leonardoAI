import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInsights } from "../../src/admin/views/insights";
import { createD1Stub, makeAdminEnv } from "./helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("renderInsights", () => {
  it("renders empty states, a zero-safe percentage and an escaped completion banner", async () => {
    const d1 = createD1Stub([
      {
        frag: "SUM(CASE WHEN resolution",
        first: { analyzed: 0, resolved: 0, avg_score: null, negative: 0 },
        required: true,
      },
      { frag: "SELECT missed_kb as question", all: [], required: true },
      { frag: "WHERE i.sale_opportunity = 1", all: [], required: true },
      { frag: "ORDER BY i.analyzed_at DESC LIMIT", all: [], required: true },
      { frag: "SELECT COUNT(*) as n", first: null, required: true },
    ]);

    const html = await renderInsights(makeAdminEnv(d1.db), "<3>");

    expect(html).toContain("Análisis completado: &lt;3&gt;");
    expect(html).toContain("Sin huecos detectados");
    expect(html).toContain("Sin ventas abiertas detectadas");
    expect(html).toContain("Aún no hay conversaciones analizadas");
    expect(html).toContain("Todo analizado");
    expect(html).not.toContain("Análisis completado: <3>");
    d1.assertRequiredQueries();
  });

  it("renders populated stats, opportunities, known badges and escaped DB content", async () => {
    const now = Date.now();
    const baseInsight = {
      analyzed_at: now - 60_000,
      topics: "[]",
      missed_kb: null,
      sale_opportunity: 0,
      channel_user_id: "user-1",
    };
    const d1 = createD1Stub([
      {
        frag: "SUM(CASE WHEN resolution",
        first: { analyzed: 4, resolved: 3, avg_score: 4.4, negative: 1 },
      },
      {
        frag: "SELECT missed_kb as question",
        all: [
          { question: "¿Precio <script>?", n: 1 },
          { question: "¿Horario?", n: 2 },
        ],
      },
      {
        frag: "WHERE i.sale_opportunity = 1",
        all: [
          {
            ...baseInsight,
            conversation_id: "conv/unsafe",
            sentiment: "neutral",
            resolution: "unresolved",
            bot_score: 2,
            summary: "Venta <abierta>",
            sale_opportunity: 1,
            display_name: "Ana <Admin>",
            channel: "telegram",
            last_message_at: now - 2 * 3_600_000,
          },
        ],
      },
      {
        frag: "ORDER BY i.analyzed_at DESC LIMIT",
        all: [
          {
            ...baseInsight,
            conversation_id: "conv-1",
            sentiment: "positive",
            resolution: "resolved",
            bot_score: 3,
            summary: "Todo <bien>",
            display_name: "Cliente <uno>",
            channel: "telegram",
            last_message_at: now - 30_000,
          },
          {
            ...baseInsight,
            conversation_id: "conv-2",
            sentiment: "mystery",
            resolution: "other",
            bot_score: null,
            summary: null,
            display_name: null,
            channel: "<custom>",
            last_message_at: null,
          },
        ],
      },
      { frag: "SELECT COUNT(*) as n", first: { n: 2 } },
    ]);

    const html = await renderInsights(makeAdminEnv(d1.db));

    expect(html).toContain("75%");
    expect(html).toContain("4.4");
    expect(html).toContain("2 conversaciones esperando análisis");
    expect(html).toContain("1 cliente preguntó");
    expect(html).toContain("2 clientes preguntaron");
    expect(html).toContain("hace 2 h");
    expect(html).toContain("ahora");
    expect(html).toContain("🙂 Contento");
    expect(html).toContain("✓ Resuelta");
    expect(html).toContain("★★★☆☆");
    expect(html).toContain("Ana &lt;Admin&gt;");
    expect(html).toContain("Venta &lt;abierta&gt;");
    expect(html).toContain("Todo &lt;bien&gt;");
    expect(html).not.toContain("¿Precio <script>?");
  });
});
