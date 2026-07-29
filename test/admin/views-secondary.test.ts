import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "../../src/db/leads";
import type { KbDoc } from "../../src/kb/docs";
import { renderConexiones, connectionsSummary } from "../../src/admin/views/conexiones";
import { renderKbEditor, renderKbList } from "../../src/admin/views/kb";
import { exportLeadsCsv, renderLeads } from "../../src/admin/views/leads";
import { createD1Stub, makeAdminEnv } from "./helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("shared D1 test helper", () => {
  it("records SQL/params and reports required queries that were not executed", async () => {
    const d1 = createD1Stub([
      { frag: "SELECT required", all: [{ id: "1" }], required: true },
      { frag: "SELECT missing", required: true },
    ]);

    await d1.db.prepare("SELECT required").bind("value").all();

    expect(d1.queries[0]).toMatchObject({
      sql: "SELECT required",
      params: ["value"],
      method: "all",
    });
    expect(() => d1.assertRequiredQueries()).toThrow(
      'Consultas D1 obligatorias no ejecutadas: "SELECT missing"',
    );
  });
});

describe("KB views", () => {
  it("renders the empty list and each flash banner", async () => {
    const d1 = createD1Stub([{ frag: "SELECT * FROM kb_docs", all: [], required: true }]);
    const env = makeAdminEnv(d1.db);

    const empty = await renderKbList(env);
    const saved = await renderKbList(env, { saved: true });
    const deleted = await renderKbList(env, { deleted: true });
    const reindexed = await renderKbList(env, { reindexed: "<4>" });

    expect(empty).toContain("Aún no tienes documentos propios");
    expect(saved).toContain("Guardado e indexado");
    expect(deleted).toContain("Documento eliminado");
    expect(reindexed).toContain("Reindexado: &lt;4&gt;");
    d1.assertRequiredQueries();
  });

  it("renders populated documents with escaped title/content and relative times", async () => {
    const now = Date.now();
    const docs: KbDoc[] = [
      {
        id: "doc/1",
        title: "Horario <VIP>",
        content: "Abrimos <todos> los días.",
        updated_at: now - 30_000,
      },
      {
        id: "doc-2",
        title: "Políticas",
        content: `${"a".repeat(1_300)}\n\n${"b".repeat(20)}`,
        updated_at: now - 2 * 3_600_000,
      },
      {
        id: "doc-3",
        title: "Antiguo",
        content: "Contenido",
        updated_at: now - 3 * 86_400_000,
      },
    ];
    const d1 = createD1Stub([{ frag: "SELECT * FROM kb_docs", all: docs }]);

    const html = await renderKbList(makeAdminEnv(d1.db));

    expect(html).toContain("Horario &lt;VIP&gt;");
    expect(html).toContain("Abrimos &lt;todos&gt;");
    expect(html).toContain("/admin/kb/doc%2F1/edit");
    expect(html).toContain("ahora");
    expect(html).toContain("hace 2 h");
    expect(html).toContain("hace 3 d");
    expect(html).toContain("fragmentos");
    expect(html).not.toContain("Horario <VIP>");
  });

  it("renders new and existing editors without exposing unescaped document values", () => {
    const env = makeAdminEnv();
    const fresh = renderKbEditor(null, env);
    const existing = renderKbEditor(
      {
        id: "doc/<1>",
        title: 'Título "privado"',
        content: "Contenido <b>crudo</b>",
        updated_at: Date.now(),
      },
      env,
    );

    expect(fresh).toContain("＋ Nuevo documento");
    expect(fresh).not.toContain('name="id"');
    expect(existing).toContain("Editar documento");
    expect(existing).toContain('value="doc/&lt;1&gt;"');
    expect(existing).toContain("Título &quot;privado&quot;");
    expect(existing).toContain("Contenido &lt;b&gt;crudo&lt;/b&gt;");
    expect(existing).toContain("/admin/kb/doc%2F%3C1%3E/delete");
  });
});

describe("connections views", () => {
  it("lists every missing credential and reports zero connected channels", () => {
    const env = makeAdminEnv(undefined, {
      TELEGRAM_BOT_TOKEN: " ",
      DASHBOARD_BASE_URL: "https://bot.test/",
    });
    const html = renderConexiones(env);

    expect(html).toContain("Canales conectados: 0 de 5");
    expect(html).toContain("TELEGRAM_BOT_TOKEN");
    expect(html).toContain("TWILIO_ACCOUNT_SID");
    expect(html).toContain("META_PAGE_ACCESS_TOKEN");
    expect(html).toContain("MANYCHAT_API_KEY");
    expect(html).toContain("WHATSAPP_PHONE_NUMBER_ID");
    expect(html).toContain("https://bot.test/webhooks/telegram");
    expect(connectionsSummary(env)).toEqual({ connected: 0, total: 5 });
  });

  it("recognizes all connected channels, shared Meta fallbacks and the handoff warning", () => {
    const env = makeAdminEnv(undefined, {
      TELEGRAM_BOT_TOKEN: "telegram",
      TWILIO_ACCOUNT_SID: "AC-demo",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_WA_FROM: "+1555000",
      META_PAGE_ACCESS_TOKEN: "page",
      META_VERIFY_TOKEN: "verify",
      META_APP_SECRET: "app",
      MANYCHAT_API_KEY: "manychat",
      WHATSAPP_PHONE_NUMBER_ID: "phone",
      WHATSAPP_ACCESS_TOKEN: "wa-token",
    });
    const html = renderConexiones(env);

    expect(html).toContain("Canales conectados: 5 de 5");
    expect(html.match(/● CONECTADO/g)).toHaveLength(5);
    expect(html).toContain("Sin TWILIO_HANDOFF_CONTENT_SID");
    expect(html).toContain("/webhooks/whatsapp");
    expect(connectionsSummary(env)).toEqual({ connected: 5, total: 5 });
  });
});

const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: "lead-1",
  conversation_id: "telegram:user/1",
  name: "Ana",
  contact: "ana@example.com",
  channel_user_id: "user-1",
  intent: "Quiere comprar",
  notes: null,
  status: "new",
  exported_to: null,
  external_id: null,
  metadata: null,
  created_at: Date.parse("2026-07-19T10:00:00Z"),
  updated_at: Date.parse("2026-07-19T10:00:00Z"),
  ...overrides,
});

describe("leads views and CSV", () => {
  it("renders the empty state", async () => {
    const d1 = createD1Stub([{ frag: "SELECT * FROM leads ORDER BY", all: [] }]);

    const html = await renderLeads(makeAdminEnv(d1.db));

    expect(html).toContain("Aún no hay leads");
    expect(html).toContain("Exportar CSV");
  });

  it("renders populated rows, status labels, conversation state and escaped DB values", async () => {
    const d1 = createD1Stub([
      {
        frag: "SELECT * FROM leads ORDER BY",
        all: [
          lead({
            id: "lead/<1>",
            name: "Ana <script>",
            contact: '"ana"@example.com',
            intent: "Compra <urgente>",
            notes: "Nota & privada",
            status: "sold",
            metadata: '{"origen":"web <x>"}',
          }),
          lead({
            id: "lead-2",
            conversation_id: null,
            name: null,
            contact: null,
            intent: "",
            status: "lost",
            metadata: "{broken",
          }),
        ],
      },
    ]);

    const html = await renderLeads(makeAdminEnv(d1.db));

    expect(html).toContain("Ana &lt;script&gt;");
    expect(html).toContain("&quot;ana&quot;@example.com");
    expect(html).toContain("Compra &lt;urgente&gt;");
    expect(html).toContain("Nota &amp; privada");
    expect(html).toContain("origen:");
    expect(html).toContain("web &lt;x&gt;");
    expect(html).toContain("Vendido");
    expect(html).toContain('value="lost"');
    expect(html).toContain("(sin nombre)");
    expect(html).toContain("Sin conversación ligada");
    expect(html).toContain("telegram%3Auser%2F1");
    expect(html).not.toContain("Ana <script>");
  });

  it("exports commas, quotes, newlines and null values as valid quoted CSV fields", async () => {
    const d1 = createD1Stub([
      {
        frag: "SELECT * FROM leads ORDER BY",
        all: [
          lead({
            name: 'Ana, "VIP"',
            contact: null,
            intent: "Primera línea\nSegunda línea",
            notes: null,
            metadata: '{"tag":"uno,dos"}',
          }),
        ],
      },
    ]);

    const csv = await exportLeadsCsv(makeAdminEnv(d1.db));

    expect(csv).toContain("fecha,nombre,contacto,intent,status,notas,metadata");
    expect(csv).toContain('"Ana, ""VIP"""');
    expect(csv).toContain(',"",');
    expect(csv).toContain('"Primera línea\nSegunda línea"');
    expect(csv).toContain('"{""tag"":""uno,dos""}"');
  });
});
