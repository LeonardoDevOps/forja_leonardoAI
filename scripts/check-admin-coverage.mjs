import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUMMARY_PATH = resolve("coverage/coverage-summary.json");
const TARGETS = [
  "src/admin/twilioUsage.ts",
  "src/admin/views/campanas.ts",
  "src/admin/views/stats.ts",
  "src/admin/views/costs.ts",
  "src/admin/views/insights.ts",
  "src/admin/views/kb.ts",
  "src/admin/views/conexiones.ts",
  "src/admin/views/leads.ts",
];
const MINIMUMS = {
  lines: 70,
  statements: 70,
  functions: 70,
  branches: 50,
};
const METRICS = Object.keys(MINIMUMS);

const normalize = (path) => path.replaceAll("\\", "/");

let summary;
try {
  summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8"));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`No se pudo leer ${SUMMARY_PATH}: ${message}`);
  process.exit(1);
}

const entries = Object.entries(summary).filter(([path]) => path !== "total");
let failed = false;

console.log("Cobertura administrativa por archivo (actual/mínimo)");
console.log("Archivo | lines | statements | functions | branches | Estado");
console.log("--- | ---: | ---: | ---: | ---: | ---");

for (const target of TARGETS) {
  const normalizedTarget = normalize(target);
  const entry = entries.find(([path]) => {
    const normalizedPath = normalize(path);
    return normalizedPath === normalizedTarget || normalizedPath.endsWith(`/${normalizedTarget}`);
  });

  if (!entry) {
    failed = true;
    console.log(`${target} | —/70 | —/70 | —/70 | —/50 | FAIL (archivo ausente)`);
    continue;
  }

  const [, coverage] = entry;
  let filePassed = true;
  const values = METRICS.map((metric) => {
    const actual = coverage?.[metric]?.pct;
    const minimum = MINIMUMS[metric];
    const passed = typeof actual === "number" && actual >= minimum;
    if (!passed) filePassed = false;
    return `${typeof actual === "number" ? actual.toFixed(2) : "—"}/${minimum} ${passed ? "PASS" : "FAIL"}`;
  });

  if (!filePassed) failed = true;
  console.log(`${target} | ${values.join(" | ")} | ${filePassed ? "PASS" : "FAIL"}`);
}

if (failed) {
  console.error("Gate de cobertura administrativa: FAIL");
  process.exit(1);
}

console.log(`Gate de cobertura administrativa: PASS (${TARGETS.length * METRICS.length} comparaciones)`);
