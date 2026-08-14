#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { verifyEvidenceRecords } from "./gate-qualification.mjs";
import {
  buildPublicLibraryGateFinal,
  canonicalizePublicLibraryGateReportForArchive,
  validatePublicLibraryEvidenceCommitChain,
  validatePublicLibraryGateEvidenceShape,
  validatePublicLibraryHistoryRecordBytes,
} from "./gate-public-library-run.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const attemptPath =
  "docs/goals/reading-world-v1/evidence/artifacts/gate-03-attempt-01.json";
const historyRoot =
  "docs/goals/reading-world-v1/evidence/artifacts/history/gate-03-attempt-01-attempt-01";
const historyPath = `${historyRoot}/gate-03-attempt-01.json`;
const attemptRecordsRoot =
  "docs/goals/reading-world-v1/evidence/artifacts/gate-03-attempt-01.records";
const historyRecordsRoot = `${historyRoot}/gate-03-attempt-01.records`;
const outputPath =
  "docs/goals/reading-world-v1/evidence/artifacts/gate-03-final.json";
const originalIndeterminateEvidenceCommit =
  "a3da1455a583bdb6ea2d26db1179a198f7c042b8";

function git(...args) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function gitBytes(...args) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: null });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readEvidence(path) {
  const bytes = readFileSync(resolve(repoRoot, path));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function verifyRecords(evidence, expectedCount) {
  const result = verifyEvidenceRecords(evidence, (recordPath) => {
    const absolute = resolve(repoRoot, recordPath);
    return existsSync(absolute) ? readFileSync(absolute) : null;
  });
  return result.valid && result.checkedCount === expectedCount ? result : null;
}

if (existsSync(resolve(repoRoot, outputPath))) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_ALREADY_EXISTS");
}
const status = git("status", "--porcelain=v1", "--untracked-files=all");
if (status.status !== 0 || status.stdout.trim()) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_REQUIRES_CLEAN_WORKTREE");
}
const head = git("rev-parse", "HEAD");
if (head.status !== 0) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_HEAD_UNAVAILABLE");
}
const evidenceCommit = head.stdout.trim();
const attemptSource = readEvidence(attemptPath);
const historySource = readEvidence(historyPath);
if (
  !validatePublicLibraryGateEvidenceShape(attemptSource.value, {
    recordsRoot: attemptRecordsRoot,
    requirePassing: true,
  })
) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_CHECK_SET_INVALID");
}
if (
  !validatePublicLibraryGateEvidenceShape(historySource.value, {
    recordsRoot: historyRecordsRoot,
    requirePassing: false,
  })
) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_HISTORY_CHECK_SET_INVALID");
}
const attemptVerification = verifyRecords(attemptSource.value, 11);
if (!attemptVerification) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_RECORDS_INVALID");
}
const historyVerification = verifyRecords(historySource.value, 11);
if (!historyVerification) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_HISTORY_RECORDS_INVALID");
}
if (attemptSource.value.archivedPreviousReport !== historyRoot) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_HISTORY_LINK_INVALID");
}
const commitChain = [
  historySource.value.repository.head,
  originalIndeterminateEvidenceCommit,
  attemptSource.value.repository.head,
  evidenceCommit,
];
if (
  !validatePublicLibraryEvidenceCommitChain(
    commitChain,
    (older, newer) =>
      git("merge-base", "--is-ancestor", older, newer).status === 0,
  )
) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_COMMIT_CHAIN_INVALID");
}

const originalReportResult = gitBytes(
  "show",
  `${originalIndeterminateEvidenceCommit}:${attemptPath}`,
);
if (originalReportResult.status !== 0) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_ORIGINAL_REPORT_UNAVAILABLE");
}
const originalReport = JSON.parse(originalReportResult.stdout.toString("utf8"));
if (
  !validatePublicLibraryGateEvidenceShape(originalReport, {
    recordsRoot: attemptRecordsRoot,
    requirePassing: false,
  }) ||
  JSON.stringify(
    canonicalizePublicLibraryGateReportForArchive(originalReport),
  ) !==
    JSON.stringify(
      canonicalizePublicLibraryGateReportForArchive(historySource.value),
    )
) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_HISTORY_REPORT_MISMATCH");
}
if (
  !validatePublicLibraryHistoryRecordBytes(
    (file) => {
      const result = gitBytes(
        "show",
        `${originalIndeterminateEvidenceCommit}:${attemptRecordsRoot}/${file}`,
      );
      return result.status === 0 ? result.stdout : null;
    },
    (file) => readFileSync(resolve(repoRoot, historyRecordsRoot, file)),
  )
) {
  throw new Error("PUBLIC_LIBRARY_GATE_FINAL_HISTORY_RECORD_MISMATCH");
}

const final = buildPublicLibraryGateFinal({
  attempt: attemptSource.value,
  attemptPath,
  attemptSha256: sha256(attemptSource.bytes),
  evidenceCommit,
  history: {
    path: historyPath,
    sha256: sha256(historySource.bytes),
    implementationHead: historySource.value.repository.head,
    originalEvidenceCommit: originalIndeterminateEvidenceCommit,
    classification: historySource.value.publicLibraryGate?.classification,
    reasons: historySource.value.publicLibraryGate?.reasons,
    recordVerification: historyVerification,
    productFailureCount: 0,
  },
  recordVerification: attemptVerification,
  generatedAt: new Date().toISOString(),
});
writeFileSync(
  resolve(repoRoot, outputPath),
  `${JSON.stringify(final, null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `output=${relative(repoRoot, resolve(repoRoot, outputPath))}\n`,
);
process.stdout.write(`source_attempt_sha256=${final.sourceAttempt.sha256}\n`);
process.stdout.write(`history_sha256=${final.preservedHistory.sha256}\n`);
process.stdout.write(`evidence_commit=${evidenceCommit}\n`);
