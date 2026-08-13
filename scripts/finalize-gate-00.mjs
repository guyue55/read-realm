#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { buildQualificationFinal, verifyEvidenceRecords } from "./gate-qualification.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const attemptPath = "docs/goals/reading-world-v1/evidence/artifacts/gate-00-attempt-02.json";
const outputPath = "docs/goals/reading-world-v1/evidence/artifacts/gate-00-final.json";

function git(...args) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

if (existsSync(resolve(repoRoot, outputPath))) {
  throw new Error("QUALIFICATION_FINAL_ALREADY_EXISTS");
}
const status = git("status", "--porcelain=v1", "--untracked-files=all");
if (status.status !== 0 || status.stdout.trim()) {
  throw new Error("QUALIFICATION_FINAL_REQUIRES_CLEAN_WORKTREE");
}
const head = git("rev-parse", "HEAD");
if (head.status !== 0) throw new Error("QUALIFICATION_FINAL_HEAD_UNAVAILABLE");
const evidenceCommit = head.stdout.trim();
const attemptBytes = readFileSync(resolve(repoRoot, attemptPath));
const attempt = JSON.parse(attemptBytes.toString("utf8"));
const recordVerification = verifyEvidenceRecords(attempt, (path) => {
  const absolute = resolve(repoRoot, path);
  return existsSync(absolute) ? readFileSync(absolute) : null;
});
if (!recordVerification.valid || recordVerification.checkedCount !== 3) {
  throw new Error("QUALIFICATION_FINAL_RECORDS_INVALID");
}
for (const commit of [attempt.repository.head, evidenceCommit]) {
  const ancestry = git("merge-base", "--is-ancestor", commit, "HEAD");
  if (ancestry.status !== 0) {
    throw new Error(`QUALIFICATION_FINAL_COMMIT_NOT_IN_HISTORY:${commit}`);
  }
}

const final = buildQualificationFinal({
  attempt,
  attemptPath,
  attemptSha256: sha256(attemptBytes),
  evidenceCommit,
  generatedAt: new Date().toISOString(),
});
writeFileSync(resolve(repoRoot, outputPath), `${JSON.stringify(final, null, 2)}\n`, "utf8");
process.stdout.write(`output=${relative(repoRoot, resolve(repoRoot, outputPath))}\n`);
process.stdout.write(`source_attempt_sha256=${final.sourceAttempt.sha256}\n`);
process.stdout.write(`evidence_commit=${evidenceCommit}\n`);
