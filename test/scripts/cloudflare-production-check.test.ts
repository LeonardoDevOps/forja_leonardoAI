import { describe, expect, it } from "vitest";
import {
  REQUIRED_PRODUCTION_SECRET_NAMES,
  validateCloudflareProductionEvidence,
} from "../../scripts/cloudflare-production-check";

function validEvidence(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    target: "production",
    evidenceOwner: "platform-owner",
    approvedAt: "2026-07-30T14:00:00Z",
    secretNames: [...REQUIRED_PRODUCTION_SECRET_NAMES],
    edge: {
      admin: { enabled: true, mode: "access", rateLimiting: true },
      api: { enabled: true, mode: "access", rateLimiting: true },
      webhooks: { rateLimiting: "not-required", rationale: "Volumen bajo y observado en staging." },
    },
    egress: {
      decision: "accepted",
      rationale: "Allowlist exacta y ausencia temporal de un proxy administrado.",
      reviewBy: "2099-09-30",
    },
    staging: {
      commitSha: "936e7dc879df6fa53aef71bf8290df3ae0395e58",
      testedAt: "2026-07-30T14:00:00Z",
      checks: {
        telegramValid: true,
        telegramInvalidRejected: true,
        manychatValid: true,
        manychatInvalidRejected: true,
        twilioValid: true,
        twilioInvalidNotIngested: true,
        metaValid: true,
        metaInvalidRejected: true,
        whatsappValid: true,
        whatsappInvalidRejected: true,
        adminValid: true,
        adminInvalidRejected: true,
        apiValid: true,
        apiInvalidRejected: true,
      },
    },
    rollback: {
      versionId: "version-stable-123",
      commandReviewed: true,
      dataCompatibilityReviewed: true,
    },
    monitoring: {
      owner: "platform-owner",
      webhook403: true,
      admin401: true,
      worker5xx: true,
    },
  };
}

describe("validateCloudflareProductionEvidence", () => {
  it("accepts complete redacted evidence", () => {
    expect(validateCloudflareProductionEvidence(validEvidence())).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("fails closed for malformed evidence", () => {
    expect(validateCloudflareProductionEvidence(null)).toEqual({
      ok: false,
      errors: ["La evidencia debe ser un objeto JSON."],
    });
  });

  it("requires every production secret name without accepting values", () => {
    const evidence = validEvidence();
    evidence.secretNames = REQUIRED_PRODUCTION_SECRET_NAMES.filter((name) => name !== "CONTROL_PLANE_TOKEN");

    const result = validateCloudflareProductionEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("No se verificó la existencia de CONTROL_PLANE_TOKEN.");
  });

  it("requires edge protection and rate limiting for admin and API", () => {
    const evidence = validEvidence();
    evidence.edge = {
      admin: { enabled: false, mode: "access", rateLimiting: false },
      api: { enabled: true, mode: "invalid", rateLimiting: true },
      webhooks: { rateLimiting: "enabled" },
    };

    const result = validateCloudflareProductionEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("edge.admin.enabled debe ser true.");
    expect(result.errors).toContain("edge.admin.rateLimiting debe ser true.");
    expect(result.errors).toContain('edge.api.mode debe ser "access" o "waf".');
  });

  it("requires rationale and a future review when DNS risk is accepted", () => {
    const evidence = validEvidence();
    evidence.egress = {
      decision: "accepted",
      rationale: "TODO",
      reviewBy: "2020-01-01",
    };

    const result = validateCloudflareProductionEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("egress.rationale conserva un placeholder.");
    expect(result.errors).toContain("egress.reviewBy debe estar en el futuro.");
  });

  it("requires every positive and negative staging check", () => {
    const evidence = validEvidence();
    const staging = evidence.staging as Record<string, unknown>;
    const checks = staging.checks as Record<string, unknown>;
    checks.twilioInvalidNotIngested = false;

    const result = validateCloudflareProductionEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("staging.checks.twilioInvalidNotIngested debe ser true.");
  });

  it("requires an actionable rollback and all monitoring signals", () => {
    const evidence = validEvidence();
    evidence.rollback = {
      versionId: "<VERSION_ID>",
      commandReviewed: false,
      dataCompatibilityReviewed: false,
    };
    evidence.monitoring = {
      owner: "TODO",
      webhook403: true,
      admin401: false,
      worker5xx: false,
    };

    const result = validateCloudflareProductionEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("rollback.versionId conserva un placeholder.");
    expect(result.errors).toContain("rollback.commandReviewed debe ser true.");
    expect(result.errors).toContain("rollback.dataCompatibilityReviewed debe ser true.");
    expect(result.errors).toContain("monitoring.owner conserva un placeholder.");
    expect(result.errors).toContain("monitoring.admin401 debe ser true.");
    expect(result.errors).toContain("monitoring.worker5xx debe ser true.");
  });
});
