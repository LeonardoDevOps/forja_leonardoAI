import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderStats } from "../../src/admin/views/stats";
import { createD1Stub, makeAdminEnv } from "./helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("renderStats", () => {
  it("renders all empty states and zero-safe business metrics", async () => {
    const d1 = createD1Stub([
      { frag: "GROUP BY day ORDER BY day ASC", all: [], required: true },
      { frag: "COUNT(DISTINCT conversation_id)", first: null, required: true },
      { frag: "FROM leads WHERE created_at > ? GROUP BY status", all: [], required: true },
      { frag: "GROUP BY dow, hour", all: [], required: true },
      { frag: "GROUP BY model_used", all: [], required: true },
      { frag: "role = 'assistant'", first: null, required: true },
      { frag: "GROUP BY c.channel", all: [], required: true },
      { frag: "json_each", error: new Error("JSON1 unavailable"), required: true },
      {
        frag: "SUM(CASE WHEN resolution",
        first: { analyzed: 0, resolved: 0, avg_score: null, negative: 0 },
        required: true,
      },
    ]);

    const html = await renderStats(makeAdminEnv(d1.db));

    expect(html).toContain("Aún no hay actividad");
    expect(html).toContain("Costo por conversación");
    expect(html).toContain("Costo por lead");
    expect(html).toContain("Aún sin tool calls registradas");
    expect(html).toContain("Sin datos");
    expect(html).toContain("Resueltas sin humano");
    d1.assertRequiredQueries();
  });

  it("renders representative charts, funnel, heatmap, channels, tools and costs", async () => {
    const d1 = createD1Stub([
      {
        frag: "GROUP BY day ORDER BY day ASC",
        all: [
          { day: "2026-07-19", msgs: 2 },
          { day: "2026-07-20", msgs: 5 },
        ],
      },
      { frag: "COUNT(DISTINCT conversation_id)", first: { n: 4 } },
      {
        frag: "FROM leads WHERE created_at > ? GROUP BY status",
        all: [
          { status: "new", n: 2 },
          { status: "contacted", n: 1 },
          { status: "sold", n: 1 },
        ],
      },
      {
        frag: "GROUP BY dow, hour",
        all: [
          { dow: 1, hour: 9, n: 1 },
          { dow: 2, hour: 20, n: 4 },
        ],
      },
      {
        frag: "GROUP BY model_used",
        all: [
          {
            model_used: "claude-haiku-4-5-20251001",
            input: 1_000_000,
            output: 100_000,
            cached: 100_000,
          },
        ],
      },
      { frag: "role = 'assistant'", first: { n: 30 } },
      {
        frag: "GROUP BY c.channel",
        all: [
          { channel: "telegram", n: 8 },
          { channel: "<custom>", n: 2 },
        ],
      },
      {
        frag: "json_each",
        all: [
          { tool: "searchKb", n: 5 },
          { tool: "<unsafe>", n: 1 },
          { tool: "", n: 9 },
        ],
      },
      {
        frag: "SUM(CASE WHEN resolution",
        first: { analyzed: 4, resolved: 3, avg_score: 4.25, negative: 1 },
      },
    ]);

    const html = await renderStats(makeAdminEnv(d1.db));

    expect(html).toContain('aria-label="Mensajes por día"');
    expect(html).toContain("1.0");
    expect(html).toContain("Dom");
    expect(html).toContain("Mar 20:00 — 4 mensajes");
    expect(html).toContain("75%");
    expect(html).toContain("Telegram");
    expect(html).toContain("&lt;custom&gt;");
    expect(html).toContain("searchKb");
    expect(html).toContain("&lt;unsafe&gt;");
    expect(html).not.toContain("<unsafe>");
  });
});
