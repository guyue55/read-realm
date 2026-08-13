#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { verifyEvidenceRecords } from "./gate-qualification.mjs";
import { buildProductGateFinal } from "./gate-product-run.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const attemptPath = "docs/goals/reading-world-v1/evidence/artifacts/gate-01-rev-0002-attempt-01.json";
const gate00Path = "docs/goals/reading-world-v1/evidence/artifacts/gate-00-final.json";
const outputPath = "docs/goals/reading-world-v1/evidence/artifacts/gate-01-final.json";

function git(...args) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

if (existsSync(resolve(repoRoot, outputPath))) {
  throw new Error("PRODUCT_GATE_FINAL_ALREADY_EXISTS");
}
const status = git("status", "--porcelain=v1", "--untracked-files=all");
if (status.status !== 0 || status.stdout.trim()) {
  throw new Error("PRODUCT_GATE_FINAL_REQUIRES_CLEAN_WORKTREE");
}
const head = git("rev-parse", "HEAD");
if (head.status !== 0) throw new Error("PRODUCT_GATE_FINAL_HEAD_UNAVAILABLE");
const evidenceCommit = head.stdout.trim();
const attemptBytes = readFileSync(resolve(repoRoot, attemptPath));
const attempt = JSON.parse(attemptBytes.toString("utf8"));
const gate00Bytes = readFileSync(resolve(repoRoot, gate00Path));
const recordVerification = verifyEvidenceRecords(attempt, (recordPath) => {
  const absolute = resolve(repoRoot, recordPath);
  return existsSync(absolute) ? readFileSync(absolute) : null;
});
if (!recordVerification.valid || recordVerification.checkedCount !== 7) {
  throw new Error("PRODUCT_GATE_FINAL_RECORDS_INVALID");
}
for (const commit of [attempt.repository.head, evidenceCommit]) {
  if (git("merge-base", "--is-ancestor", commit, "HEAD").status !== 0) {
    throw new Error(`PRODUCT_GATE_FINAL_COMMIT_NOT_IN_HISTORY:${commit}`);
  }
}

const final = buildProductGateFinal({
  attempt,
  attemptPath,
  attemptSha256: sha256(attemptBytes),
  evidenceCommit,
  gate00FinalSha256: sha256(gate00Bytes),
  generatedAt: new Date().toISOString(),
});
writeFileSync(resolve(repoRoot, outputPath), `${JSON.stringify(final, null, 2)}\n`, "utf8");
process.stdout.write(`output=${relative(repoRoot, resolve(repoRoot, outputPath))}\n`);
process.stdout.write(`source_attempt_sha256=${final.sourceAttempt.sha256}\n`);
process.stdout.write(`gate_00_sha256=${final.prerequisite.sha256}\n`);
process.stdout.write(`evidence_commit=${evidenceCommit}\n`);
