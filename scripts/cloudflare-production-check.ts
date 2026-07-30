/**
 * Offline validator for the redacted evidence required by the Cloudflare
 * production runbook. It never connects to Cloudflare and never accepts secret
 * values: only secret names, control states and test outcomes.
 */

import { readFileSync } from "node:fs";

export const REQUIRED_PRODUCTION_SECRET_NAMES = [
  "TELEGRAM_WEBHOOK_SECRET",
  "MANYCHAT_WEBHOOK_SECRET",
  "TWILIO_AUTH_TOKEN",
  "DASHBOARD_PASSWORD",
  "CONTROL_PLANE_TOKEN",
] as const;

export const REQUIRED_STAGING_CHECKS = [
  "telegramValid",
  "telegramInvalidRejected",
  "manychatValid",
  "manychatInvalidRejected",
  "twilioValid",
  "twilioInvalidNotIngested",
  "metaValid",
  "metaInvalidRejected",
  "whatsappValid",
  "whatsappInvalidRejected",
  "adminValid",
  "adminInvalidRejected",
  "apiValid",
  "apiInvalidRejected",
] as const;

export interface CloudflareReadinessResult {
  ok: boolean;
  errors: string[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function requiredRecord(parent: UnknownRecord, key: string, errors: string[]): UnknownRecord {
  const value = asRecord(parent[key]);
  if (!value) errors.push(`Falta el objeto ${key}.`);
  return value ?? {};
}

function requiredString(parent: UnknownRecord, key: string, path: string, errors: string[]): string {
  const value = parent[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`Falta ${path}.`);
    return "";
  }
  return value.trim();
}

function isPlaceholder(value: string): boolean {
  return /^(?:TODO|TBD|CHANGEME|PENDING|<[^>]+>|\{\{[^}]+\}\})$/i.test(value);
}

function requireNonPlaceholder(parent: UnknownRecord, key: string, path: string, errors: string[]): string {
  const value = requiredString(parent, key, path, errors);
  if (value && isPlaceholder(value)) errors.push(`${path} conserva un placeholder.`);
  return value;
}

function requireIsoDate(
  parent: UnknownRecord,
  key: string,
  path: string,
  errors: string[],
  future = false,
): string {
  const value = requiredString(parent, key, path, errors);
  const parsed = Date.parse(value);
  if (value && Number.isNaN(parsed)) {
    errors.push(`${path} no es una fecha ISO válida.`);
  } else if (future && parsed <= Date.now()) {
    errors.push(`${path} debe estar en el futuro.`);
  }
  return value;
}

/**
 * Validate operator-supplied, redacted evidence. Unknown input is handled
 * fail-closed so malformed JSON cannot accidentally pass the production gate.
 */
export function validateCloudflareProductionEvidence(input: unknown): CloudflareReadinessResult {
  const errors: string[] = [];
  const root = asRecord(input);
  if (!root) return { ok: false, errors: ["La evidencia debe ser un objeto JSON."] };

  if (root.schemaVersion !== 1) errors.push("schemaVersion debe ser 1.");
  if (root.target !== "production") errors.push('target debe ser "production".');
  requireNonPlaceholder(root, "evidenceOwner", "evidenceOwner", errors);
  requireIsoDate(root, "approvedAt", "approvedAt", errors);

  const secretNames = Array.isArray(root.secretNames)
    ? new Set(root.secretNames.filter((name): name is string => typeof name === "string"))
    : new Set<string>();
  if (!Array.isArray(root.secretNames)) errors.push("secretNames debe ser un array.");
  for (const name of REQUIRED_PRODUCTION_SECRET_NAMES) {
    if (!secretNames.has(name)) errors.push(`No se verificó la existencia de ${name}.`);
  }

  const edge = requiredRecord(root, "edge", errors);
  for (const path of ["admin", "api"] as const) {
    const control = requiredRecord(edge, path, errors);
    if (control.enabled !== true) errors.push(`edge.${path}.enabled debe ser true.`);
    if (control.mode !== "access" && control.mode !== "waf") {
      errors.push(`edge.${path}.mode debe ser "access" o "waf".`);
    }
    if (control.rateLimiting !== true) {
      errors.push(`edge.${path}.rateLimiting debe ser true.`);
    }
  }
  const webhooks = requiredRecord(edge, "webhooks", errors);
  if (webhooks.rateLimiting !== "enabled" && webhooks.rateLimiting !== "not-required") {
    errors.push('edge.webhooks.rateLimiting debe ser "enabled" o "not-required".');
  }
  if (webhooks.rateLimiting === "not-required") {
    requireNonPlaceholder(webhooks, "rationale", "edge.webhooks.rationale", errors);
  }

  const egress = requiredRecord(root, "egress", errors);
  const egressDecision = egress.decision;
  if (egressDecision !== "service-binding" && egressDecision !== "proxy" && egressDecision !== "accepted") {
    errors.push('egress.decision debe ser "service-binding", "proxy" o "accepted".');
  }
  requireNonPlaceholder(egress, "rationale", "egress.rationale", errors);
  if (egressDecision === "accepted") {
    requireIsoDate(egress, "reviewBy", "egress.reviewBy", errors, true);
  } else if (egressDecision === "service-binding" || egressDecision === "proxy") {
    requireIsoDate(egress, "verifiedAt", "egress.verifiedAt", errors);
  }

  const staging = requiredRecord(root, "staging", errors);
  const commitSha = requireNonPlaceholder(staging, "commitSha", "staging.commitSha", errors);
  if (commitSha && !/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    errors.push("staging.commitSha no parece un commit Git.");
  }
  requireIsoDate(staging, "testedAt", "staging.testedAt", errors);
  const stagingChecks = requiredRecord(staging, "checks", errors);
  for (const check of REQUIRED_STAGING_CHECKS) {
    if (stagingChecks[check] !== true) errors.push(`staging.checks.${check} debe ser true.`);
  }

  const rollback = requiredRecord(root, "rollback", errors);
  requireNonPlaceholder(rollback, "versionId", "rollback.versionId", errors);
  if (rollback.commandReviewed !== true) {
    errors.push("rollback.commandReviewed debe ser true.");
  }
  if (rollback.dataCompatibilityReviewed !== true) {
    errors.push("rollback.dataCompatibilityReviewed debe ser true.");
  }

  const monitoring = requiredRecord(root, "monitoring", errors);
  requireNonPlaceholder(monitoring, "owner", "monitoring.owner", errors);
  for (const signal of ["webhook403", "admin401", "worker5xx"] as const) {
    if (monitoring[signal] !== true) errors.push(`monitoring.${signal} debe ser true.`);
  }

  return { ok: errors.length === 0, errors };
}

function evidencePath(args: string[]): string | null {
  const index = args.indexOf("--evidence");
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

const isMain = /cloudflare-production-check\.(?:ts|js)$/.test(process.argv[1] ?? "");

if (isMain) {
  const path = evidencePath(process.argv.slice(2));
  if (!path) {
    console.error(
      "Uso: pnpm cloudflare:preflight -- --evidence .forja-reports/plan014-cloudflare-evidence.json",
    );
    process.exit(2);
  }

  try {
    const evidence: unknown = JSON.parse(readFileSync(path, "utf8"));
    const result = validateCloudflareProductionEvidence(evidence);
    if (!result.ok) {
      console.error("❌ Evidencia Cloudflare incompleta:\n - " + result.errors.join("\n - "));
      process.exit(1);
    }
    console.log("✅ Evidencia Cloudflare completa; no se leyeron valores de secretos.");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "error desconocido";
    console.error(`❌ No se pudo validar la evidencia: ${message}`);
    process.exit(2);
  }
}
