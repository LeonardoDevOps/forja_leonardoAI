import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const require = createRequire(import.meta.url);
const wranglerPackage = require.resolve("wrangler/package.json");
const wranglerBin = path.join(path.dirname(wranglerPackage), "bin", "wrangler.js");

interface Schedule {
  id: string;
  callback: string;
  type: string;
  payload: unknown;
}

interface AgentMigrationStub {
  seed(): Promise<boolean>;
  ingest(payload: { channel: string; channelUserId: string; text: string }): Promise<{ acknowledged: true }>;
  listSchedules(criteria: { type: "delayed" }): Promise<Schedule[]>;
}

let temporaryRoot: string;
let migrated: Miniflare;
let schedulesBeforeIngest: Schedule[];
let schedulesAfterIngest: Schedule[];

const durableObjects = {
  AGENT: {
    className: "SupportAgent",
    useSQLite: true,
    unsafeUniqueKey: "forja-support-agent",
  },
};

const seedWorker = `
  import { DurableObject } from "cloudflare:workers";

  export class SupportAgent extends DurableObject {
    seed() {
      this.ctx.storage.sql.exec(\`
        CREATE TABLE IF NOT EXISTS cf_agents_state (
          id TEXT PRIMARY KEY NOT NULL,
          state TEXT
        )
      \`);
      this.ctx.storage.sql.exec(\`
        CREATE TABLE IF NOT EXISTS cf_agents_schedules (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (randomblob(9)),
          callback TEXT,
          payload TEXT,
          type TEXT NOT NULL CHECK(type IN ('scheduled', 'delayed', 'cron', 'interval')),
          time INTEGER,
          delayInSeconds INTEGER,
          cron TEXT,
          intervalSeconds INTEGER,
          running INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (unixepoch()),
          execution_started_at INTEGER
        )
      \`);
      const state = ${JSON.stringify(
        JSON.stringify({
          conversationId: null,
          channel: "telegram",
          channelUserId: "migration-user",
          pendingMessages: [{ text: "antes del reinicio", receivedAt: 100 }],
          lastAlarmAt: 4_102_444_800_000,
          lastUserLang: "es",
          toolCallsInLast2Turns: 0,
          lastSearchKbScore: 1,
          imageRetryCount: 0,
        }),
      )};
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO cf_agents_state (id, state) VALUES (?, ?)",
        "cf_state_row_id",
        state,
      );
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO cf_agents_schedules " +
          "(id, callback, payload, type, time, delayInSeconds, running) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
        "old-buffer",
        "processBuffer",
        "{}",
        "delayed",
        4_102_444_800,
        86_400,
        0,
      );
      return true;
    }
  }

  export default { fetch() { return new Response("seed"); } };
`;

async function applyD1Schema(mf: Miniflare): Promise<void> {
  const db = await mf.getD1Database("DB");
  const schema = await readFile(path.join(ROOT, "src", "db", "schema.sql"), "utf8");
  const statements = schema
    .split(";")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  for (const statement of statements) {
    await db.exec(statement);
  }
}

describe("agents 0.3.10 → 0.20.1 migration", () => {
  beforeAll(async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "forja-agents-migration-"));
    const configPath = path.join(temporaryRoot, "wrangler.toml");
    const bundleDirectory = path.join(temporaryRoot, "bundle");
    const bundlePath = path.join(bundleDirectory, "index.js");
    const workerEntry = path.join(ROOT, "src", "index.ts").replaceAll("\\", "/");
    await writeFile(
      configPath,
      [
        'name = "forja-agents-migration"',
        `main = "${workerEntry}"`,
        'compatibility_date = "2026-05-01"',
        'compatibility_flags = ["nodejs_compat"]',
        "",
        "[[durable_objects.bindings]]",
        'name = "AGENT"',
        'class_name = "SupportAgent"',
        "",
        "[[migrations]]",
        'tag = "v1"',
        'new_sqlite_classes = ["SupportAgent"]',
        "",
        "[[d1_databases]]",
        'binding = "DB"',
        'database_name = "forja-agents-migration"',
        'database_id = "00000000-0000-0000-0000-000000000000"',
        "",
        "[vars]",
        'BOT_NAME = "Migration test"',
        'BUSINESS_NAME = "Forja"',
        'BOT_LANGUAGE = "es"',
        'BOT_TIER = "free"',
        'BUFFER_SECONDS = "60"',
        'DASHBOARD_BASE_URL = "https://example.invalid"',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync(
      process.execPath,
      [wranglerBin, "deploy", "--dry-run", "--config", configPath, "--outdir", bundleDirectory],
      { cwd: ROOT, stdio: "pipe" },
    );

    const doPersist = path.join(temporaryRoot, "do");
    const d1Persist = path.join(temporaryRoot, "d1");
    const commonOptions = {
      name: "forja-agents-migration",
      compatibilityDate: "2026-05-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects,
      durableObjectsPersist: doPersist,
    };

    const seed = new Miniflare({
      ...commonOptions,
      modules: [{ type: "ESModule", path: "seed.js", contents: seedWorker }],
    });
    const seedNamespace = await seed.getDurableObjectNamespace("AGENT");
    const seedStub = seedNamespace.get(
      seedNamespace.idFromName("migration-user"),
    ) as unknown as AgentMigrationStub;
    expect(await seedStub.seed()).toBe(true);
    await seed.dispose();

    const bundledWorker = await readFile(bundlePath, "utf8");
    migrated = new Miniflare({
      ...commonOptions,
      modules: [
        { type: "ESModule", path: "index.js", contents: bundledWorker },
        {
          type: "ESModule",
          path: "@react-email/render",
          contents: "export async function render() { return ''; }",
        },
      ],
      d1Databases: ["DB"],
      d1Persist,
      bindings: {
        BOT_NAME: "Migration test",
        BUSINESS_NAME: "Forja",
        BOT_LANGUAGE: "es",
        BOT_TIER: "free",
        BUFFER_SECONDS: "60",
        DASHBOARD_BASE_URL: "https://example.invalid",
      },
    });
    await applyD1Schema(migrated);

    const namespace = await migrated.getDurableObjectNamespace("AGENT");
    const stub = namespace.get(namespace.idFromName("migration-user")) as unknown as AgentMigrationStub;
    schedulesBeforeIngest = await stub.listSchedules({ type: "delayed" });
    await stub.ingest({
      channel: "telegram",
      channelUserId: "migration-user",
      text: "después del reinicio",
    });
    schedulesAfterIngest = await stub.listSchedules({ type: "delayed" });
  }, 30_000);

  afterAll(async () => {
    await migrated?.dispose();
    const parent = path.resolve(temporaryRoot, "..");
    if (parent === path.resolve(tmpdir()) && path.basename(temporaryRoot).startsWith("forja-agents-")) {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("preserves a delayed schedule created by the 0.3.10 schema", () => {
    expect(schedulesBeforeIngest).toHaveLength(1);
    expect(schedulesBeforeIngest[0]).toMatchObject({
      id: "old-buffer",
      callback: "processBuffer",
      type: "delayed",
      payload: {},
    });
  });

  it("rehydrates state and replaces the old debounce with one schedule", () => {
    expect(schedulesAfterIngest).toHaveLength(1);
    expect(schedulesAfterIngest[0]).toMatchObject({
      callback: "processBuffer",
      type: "delayed",
      payload: {},
    });
    expect(schedulesAfterIngest[0].id).not.toBe("old-buffer");
  });
});
