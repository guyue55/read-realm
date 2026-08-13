#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = "docs/goals/reading-world-v1/reports/phase-03-import-portability.json";
const reviewPath = "docs/goals/reading-world-v1/reviews/phase-03-data-portability.md";

const definitions = [
  {
    evidenceId: "EVID-03",
    requirementId: "REQ-02",
    outputPath: "docs/goals/reading-world-v1/evidence/artifacts/import-stress-final.json",
    requiredChecks: ["IMPORT_CAPACITY_CONTRACT", "IMPORT_CAPACITY_LIVE", "DURABLE_FOLDER_LIVE", "IMPORT_FAILURE_RECOVERY_LIVE"],
    verifiedOutcomes: {
      txt200Mb: true,
      epub500Mb: true,
      tenThousandChapters: true,
      uiResponsive: true,
      retryPreservesOriginalAndDraft: true,
      nativeFolderPermissionReauthorized: true,
    },
    boundary: "证明 PHASE-03 的 TXT/EPUB/目录容量与故障恢复；不证明阅读器、书架规模、PWA、同步或 Goal 完成。",
  },
  {
    evidenceId: "EVID-04",
    requirementId: "REQ-03",
    outputPath: "docs/goals/reading-world-v1/evidence/artifacts/backup-restore-final.json",
    requiredChecks: ["WORKSPACE_TEST", "BACKUP_RESTORE_LIVE", "PORTABILITY_CONTRACT"],
    verifiedOutcomes: {
      versionedPublicPackage: true,
      manifestAndSha256: true,
      previewBeforeWrite: true,
      tamperRejectedWithoutWrites: true,
      copyRestoreReadback: true,
      mergeRequiresExplicitConflictChoices: true,
      failedWriteCompensatedAndVerified: true,
    },
    boundary: "证明 PHASE-03 本地完整备份包、预览、合并/副本恢复与逐项校验；不证明私有云同步或灾备部署。",
  },
  {
    evidenceId: "EVID-05",
    requirementId: "REQ-04",
    outputPath: "docs/goals/reading-world-v1/evidence/artifacts/human-export-final.json",
    requiredChecks: ["WORKSPACE_TEST", "BACKUP_RESTORE_LIVE"],
    verifiedOutcomes: {
      markdownUtf8: true,
      jsonUtf8: true,
      bookChapterPositionExcerptNoteAndTime: true,
      noLocalPathOrCredential: true,
      humanReadableDownload: true,
    },
    boundary: "证明书签笔记的 Markdown/JSON 人读导出；不证明所有未来数据类型或跨端同步导出。",
  },
  {
    evidenceId: "EVID-16",
    requirementId: "REQ-15",
    outputPath: "docs/goals/reading-world-v1/evidence/artifacts/provider-boundary-final.json",
    requiredChecks: ["WORKSPACE_TEST", "DURABLE_IMPORT_AND_PROVIDER_LIVE", "PORTABILITY_CONTRACT"],
    verifiedOutcomes: {
      explicitRightsConfirmation: true,
      publicHttpOnlyWithoutEmbeddedCredentials: true,
      backendFallbackOnlyForBrowserCorsOrNetworkTopology: true,
      loginPaywallCaptchaAndAntiBotStop: true,
      scheduledChecksDefaultOffAndBounded: true,
      sourceCheckWritesPreviewOnly: true,
    },
    boundary: "证明合法 URL/自配 Provider 的读取与检查边界；不授权绕过访问限制，也不证明第三方站点永久可用。",
  },
];

function git(...args) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const status = git("status", "--porcelain=v1", "--untracked-files=all");
if (status.status !== 0 || status.stdout.trim()) {
  throw new Error("PHASE_03_FINAL_REQUIRES_CLEAN_WORKTREE");
}
const head = git("rev-parse", "HEAD");
if (head.status !== 0) throw new Error("PHASE_03_FINAL_HEAD_UNAVAILABLE");
const evidenceCommit = head.stdout.trim();

for (const definition of definitions) {
  if (existsSync(resolve(repoRoot, definition.outputPath))) {
    throw new Error(`PHASE_03_FINAL_ALREADY_EXISTS:${definition.evidenceId}`);
  }
}

const reportBytes = readFileSync(resolve(repoRoot, reportPath));
const report = JSON.parse(reportBytes.toString("utf8"));
if (
  report.goalId !== "GOAL-READING-WORLD-V1" ||
  report.controlRevision !== "REV-0002" ||
  report.phase !== "03" ||
  report.summary?.passed !== true ||
  report.summary?.failedCount !== 0 ||
  report.summary?.trackedMutationCount !== 0 ||
  report.checks?.length !== 14
) {
  throw new Error("PHASE_03_REPORT_NOT_FINALIZABLE");
}
if (git("merge-base", "--is-ancestor", report.repository.head, "HEAD").status !== 0) {
  throw new Error("PHASE_03_REPORT_HEAD_NOT_IN_HISTORY");
}

const checks = new Map(report.checks.map((check) => [check.id, check]));
let verifiedRecordCount = 0;
for (const check of report.checks) {
  if (check.exitCode !== 0 || check.trackedWorktreeMutated) {
    throw new Error(`PHASE_03_CHECK_FAILED:${check.id}`);
  }
  const logBytes = readFileSync(resolve(repoRoot, check.logPath));
  if (sha256(logBytes) !== check.logSha256) {
    throw new Error(`PHASE_03_RECORD_SHA_MISMATCH:${check.id}`);
  }
  verifiedRecordCount += 1;
}
const review = readFileSync(resolve(repoRoot, reviewPath), "utf8");
if (!review.includes("审查状态：PASS") || !review.includes(`clean@\`${report.repository.head}\``)) {
  throw new Error("PHASE_03_REVIEW_NOT_PASSING");
}

const generatedAt = new Date().toISOString();
for (const definition of definitions) {
  for (const checkId of definition.requiredChecks) {
    if (!checks.has(checkId)) throw new Error(`PHASE_03_REQUIRED_CHECK_MISSING:${checkId}`);
  }
  const evidence = {
    schemaVersion: 1,
    goalId: "GOAL-READING-WORLD-V1",
    controlRevision: "REV-0002",
    phaseId: "PHASE-03",
    evidenceId: definition.evidenceId,
    requirementId: definition.requirementId,
    result: "PASS",
    generatedAt,
    evidenceCommit,
    sourceReport: {
      path: reportPath,
      sha256: sha256(reportBytes),
      implementationHead: report.repository.head,
      passedCheckCount: report.summary.passedCount,
      verifiedRecordCount,
      requiredChecks: definition.requiredChecks,
    },
    verifiedOutcomes: definition.verifiedOutcomes,
    boundary: definition.boundary,
  };
  writeFileSync(resolve(repoRoot, definition.outputPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${definition.evidenceId}=${definition.outputPath}\n`);
}
process.stdout.write(`source_report_sha256=${sha256(reportBytes)}\n`);
process.stdout.write(`evidence_commit=${evidenceCommit}\n`);
