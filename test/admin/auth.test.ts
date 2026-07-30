import { describe, it, expect } from "vitest";
import {
  ADMIN_USERNAME,
  checkBasicCredentials,
  dashboardPasswordMeetsPolicy,
  MIN_DASHBOARD_PASSWORD_LENGTH,
} from "../../src/admin/auth";
import type { Env } from "../../src/env";

const PASSWORD = "test-dashboard-password-123";
const env = { DASHBOARD_PASSWORD: PASSWORD } as unknown as Env;

const validHeader = `Basic ${btoa(`${ADMIN_USERNAME}:${PASSWORD}`)}`;

describe("checkBasicCredentials", () => {
  it("accepts the correct strong dashboard password", () => {
    expect(checkBasicCredentials(validHeader, env)).toBe(true);
  });

  it("is case-insensitive on the Basic scheme keyword", () => {
    expect(checkBasicCredentials(validHeader.replace("Basic", "basic"), env)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const header = `Basic ${btoa(`${ADMIN_USERNAME}:wrongpass`)}`;
    expect(checkBasicCredentials(header, env)).toBe(false);
  });

  it("rejects a wrong username", () => {
    const header = `Basic ${btoa(`root:${PASSWORD}`)}`;
    expect(checkBasicCredentials(header, env)).toBe(false);
  });

  it("rejects an absent header", () => {
    expect(checkBasicCredentials(undefined, env)).toBe(false);
    expect(checkBasicCredentials(null, env)).toBe(false);
    expect(checkBasicCredentials("", env)).toBe(false);
  });

  it("rejects a malformed header (no Basic scheme)", () => {
    const encoded = btoa(`${ADMIN_USERNAME}:${PASSWORD}`);
    expect(checkBasicCredentials(`Bearer ${encoded}`, env)).toBe(false);
    expect(checkBasicCredentials(encoded, env)).toBe(false);
  });

  it("rejects a payload that decodes without a colon separator", () => {
    const header = `Basic ${btoa(`admin${PASSWORD}`)}`;
    expect(checkBasicCredentials(header, env)).toBe(false);
  });

  it("uses the FIRST colon so passwords containing colons still work", () => {
    const password = "long:dashboard:password";
    const colonEnv = { DASHBOARD_PASSWORD: password } as unknown as Env;
    const header = `Basic ${btoa(`admin:${password}`)}`;
    expect(checkBasicCredentials(header, colonEnv)).toBe(true);
  });

  it("fails closed when the configured password is missing or too short", () => {
    const weakPassword = "short-secret";
    const weakHeader = `Basic ${btoa(`${ADMIN_USERNAME}:${weakPassword}`)}`;
    expect(checkBasicCredentials(weakHeader, { DASHBOARD_PASSWORD: weakPassword } as Env)).toBe(false);
    expect(checkBasicCredentials(validHeader, { DASHBOARD_PASSWORD: undefined } as unknown as Env)).toBe(
      false,
    );
  });
});

describe("dashboardPasswordMeetsPolicy", () => {
  it("accepts the minimum length and rejects shorter or whitespace-only values", () => {
    expect(dashboardPasswordMeetsPolicy("a".repeat(MIN_DASHBOARD_PASSWORD_LENGTH))).toBe(true);
    expect(dashboardPasswordMeetsPolicy("a".repeat(MIN_DASHBOARD_PASSWORD_LENGTH - 1))).toBe(false);
    expect(dashboardPasswordMeetsPolicy(" ".repeat(MIN_DASHBOARD_PASSWORD_LENGTH))).toBe(false);
    expect(dashboardPasswordMeetsPolicy(undefined)).toBe(false);
  });
});
