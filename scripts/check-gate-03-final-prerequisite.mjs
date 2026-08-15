#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const finalPath = resolve(
  repoRoot,
  "docs/goals/reading-world-v1/evidence/artifacts/gate-03-final.json",
);

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertRecordSet(reportPath, expectedCount) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (!Array.isArray(report.checks) || report.checks.length !== expectedCount) {
    throw new Error(`GATE03_RECORD_COUNT_INVALID:${reportPath}`);
  }
  for (const check of report.checks) {
    const recordPath = resolve(repoRoot, check.logPath);
    if (sha256(recordPath) !== check.logSha256) {
      throw new Error(`GATE03_RECORD_SHA_INVALID:${check.id}`);
    }
  }
  return report;
}

const final = JSON.parse(readFileSync(finalPath, "utf8"));
if (
  final.schemaVersion !== 1 ||
  final.goalId !== "GOAL-READING-WORLD-V1" ||
  final.controlRevision !== "REV-0003" ||
  final.gateId !== "GATE-03" ||
  final.result !== "PASS" ||
  sha256(finalPath) !==
    "58b732862ea4f0172d13bfc0a56d66ff209cd58a8645c05bf3bb008b5eb916ce"
) {
  throw new Error("GATE03_FINAL_INVALID");
}
if (
  sha256(resolve(repoRoot, final.sourceAttempt.path)) !==
  final.sourceAttempt.sha256
) {
  throw new Error("GATE03_SOURCE_ATTEMPT_INVALID");
}
if (
  sha256(resolve(repoRoot, final.preservedHistory.path)) !==
  final.preservedHistory.sha256
) {
  throw new Error("GATE03_HISTORY_ATTEMPT_INVALID");
}
const source = assertRecordSet(resolve(repoRoot, final.sourceAttempt.path), 11);
const history = assertRecordSet(
  resolve(repoRoot, final.preservedHistory.path),
  11,
);
if (
  source.publicLibraryGate?.classification !== "PASS" ||
  history.publicLibraryGate?.classification !== "VALIDATOR_INDETERMINATE"
) {
  throw new Error("GATE03_CLASSIFICATION_INVALID");
}
process.stdout.write(
  `${JSON.stringify({ gateId: "GATE-03", result: "PASS", currentRecords: 11, historyRecords: 11 })}\n`,
);
