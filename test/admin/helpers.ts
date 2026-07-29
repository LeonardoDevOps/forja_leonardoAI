import type { Env } from "../../src/env";

export type StubRow = object;

export interface SqlMatcher {
  frag: string;
  first?: StubRow | null;
  all?: StubRow[];
  required?: boolean;
  error?: Error;
}

export interface QueryLogEntry {
  sql: string;
  params: unknown[];
  method: "first" | "all" | "run";
}

export interface D1Stub {
  db: D1Database;
  queries: QueryLogEntry[];
  runs: Array<{ sql: string; params: unknown[] }>;
  assertRequiredQueries(): void;
}

export function createD1Stub(matchers: SqlMatcher[] = []): D1Stub {
  const queries: QueryLogEntry[] = [];
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const hits = new Map<SqlMatcher, number>();

  const matchedFor = (sql: string): SqlMatcher | undefined =>
    matchers.find((matcher) => sql.includes(matcher.frag));

  const makeStmt = (sql: string) => {
    let bound: unknown[] = [];
    const stmt: any = {
      bind: (...params: unknown[]) => {
        bound = params;
        return stmt;
      },
      first: async () => {
        const matcher = matchedFor(sql);
        queries.push({ sql, params: bound, method: "first" });
        if (matcher) hits.set(matcher, (hits.get(matcher) ?? 0) + 1);
        if (matcher?.error) throw matcher.error;
        return matcher?.first ?? null;
      },
      all: async () => {
        const matcher = matchedFor(sql);
        queries.push({ sql, params: bound, method: "all" });
        if (matcher) hits.set(matcher, (hits.get(matcher) ?? 0) + 1);
        if (matcher?.error) throw matcher.error;
        return { results: matcher?.all ?? [] };
      },
      run: async () => {
        const matcher = matchedFor(sql);
        const entry = { sql, params: bound };
        queries.push({ ...entry, method: "run" });
        runs.push(entry);
        if (matcher) hits.set(matcher, (hits.get(matcher) ?? 0) + 1);
        if (matcher?.error) throw matcher.error;
        return {};
      },
    };
    return stmt;
  };

  const db = {
    prepare: (sql: string) => makeStmt(sql),
  } as unknown as D1Database;

  return {
    db,
    queries,
    runs,
    assertRequiredQueries() {
      const missing = matchers.filter((matcher) => matcher.required && !hits.has(matcher));
      if (missing.length > 0) {
        throw new Error(
          `Consultas D1 obligatorias no ejecutadas: ${missing
            .map((matcher) => JSON.stringify(matcher.frag))
            .join(", ")}`,
        );
      }
    },
  };
}

/** Compatibility wrapper for existing tests that only need the D1 binding. */
export function makeStubDb(
  matchers: SqlMatcher[] = [],
  runLog?: Array<{ sql: string; params: unknown[] }>,
): D1Database {
  const stub = createD1Stub(matchers);
  if (runLog) {
    const originalPush = stub.runs.push.bind(stub.runs);
    stub.runs.push = (...entries) => {
      runLog.push(...entries);
      return originalPush(...entries);
    };
  }
  return stub.db;
}

export function makeAdminEnv(db: D1Database = makeStubDb(), overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    DASHBOARD_PASSWORD: "secret123",
    BUSINESS_NAME: "Test Biz",
    BOT_NAME: "Test Bot",
    BOT_LANGUAGE: "es",
    BOT_TIER: "pro",
    BUFFER_SECONDS: "8",
    OWNER_EMAIL: "owner@example.com",
    DASHBOARD_BASE_URL: "https://bot.test",
    ...overrides,
  } as unknown as Env;
}

export function basicHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export function adminRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://bot.test${path}`, init);
}
