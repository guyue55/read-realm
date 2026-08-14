#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = "docs/goals/reading-world-v1/reports/phase-04-reader.json";
const uxPath = "docs/goals/reading-world-v1/reports/phase-04-reader-ux.md";
const reviewPath = "docs/goals/reading-world-v1/reviews/phase-04-reader.md";
const checkOnly = process.argv.includes("--check");

const definitions = [
  {
    evidenceId: "EVID-02",
    requirementId: "REQ-01",
    outputPath: "docs/goals/reading-world-v1/evidence/artifacts/core-reading-final.json",
    requiredChecks: [
      "READER_TEST",
      "STORAGE_TEST",
      "WEB_TEST",
      "WORKSPACE_BUILD",
      "READER_EXPERIENCE_LIVE",
    ],
    boundary:
      "证明 PHASE-04 已打开且正文已缓存的本地阅读、语义定位、分页/滚动、书签和恢复；不证明 PWA 断网冷启、导入容量、多端同步、真机矩阵或 Goal 完成。",
  },
  {
    evidenceId: "EVID-07",
    requirementId: "REQ-06",
    outputPath: "docs/goals/reading-world-v1/evidence/artifacts/reader-ux-final.json",
    requiredChecks: [
      "GESTURE_TEST",
      "WEB_TEST",
      "WEB_LINT",
      "WEB_TYPECHECK",
      "READER_RUN_CONTRACT",
      "READER_EXPERIENCE_LIVE",
    ],
    boundary:
      "证明 PHASE-04 的 Chromium 可信移动触控纵切、macOS headed Chrome 真实 Page Visibility 后台恢复与五项人工量表；不声称物理锁屏、页面冻结、移动 OS suspend、Android/iOS 真机矩阵、PHASE-08 或 Goal 完成。",
  },
];

function git(...args) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(code) {
  throw new Error(`PHASE_04_FINAL_${code}`);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

const status = git("status", "--porcelain=v1", "--untracked-files=all");
requireCondition(status.status === 0 && !status.stdout.trim(), "REQUIRES_CLEAN_WORKTREE");
const head = git("rev-parse", "HEAD");
requireCondition(head.status === 0, "HEAD_UNAVAILABLE");
const evidenceCommit = head.stdout.trim();

for (const definition of definitions) {
  requireCondition(!existsSync(resolve(repoRoot, definition.outputPath)), `ALREADY_EXISTS:${definition.evidenceId}`);
}

const reportBytes = readFileSync(resolve(repoRoot, reportPath));
const uxBytes = readFileSync(resolve(repoRoot, uxPath));
const reviewBytes = readFileSync(resolve(repoRoot, reviewPath));
const report = JSON.parse(reportBytes.toString("utf8"));
const ux = uxBytes.toString("utf8");
const review = reviewBytes.toString("utf8");

requireCondition(
  report.goalId === "GOAL-READING-WORLD-V1" &&
    report.controlRevision === "REV-0003" &&
    report.phase === "04" &&
    report.summary?.passed === true &&
    report.summary?.passedCount === 10 &&
    report.summary?.failedCount === 0 &&
    report.summary?.trackedMutationCount === 0 &&
    report.checks?.length === 10,
  "REPORT_NOT_FINALIZABLE",
);

const implementationHead = report.repository?.head;
requireCondition(/^[0-9a-f]{40}$/.test(implementationHead), "IMPLEMENTATION_HEAD_INVALID");
requireCondition(git("merge-base", "--is-ancestor", implementationHead, "HEAD").status === 0, "IMPLEMENTATION_NOT_IN_HISTORY");

const reportSha = sha256(reportBytes);
const uxSha = sha256(uxBytes);
const reviewSha = sha256(reviewBytes);
const candidateMatch = review.match(/\u8bc1\u636e\u5019\u9009 B：`([0-9a-f]{40})`/u);
requireCondition(candidateMatch, "REVIEW_CANDIDATE_MISSING");
const candidateHead = candidateMatch[1];
const candidateParents = git("show", "-s", "--format=%P", candidateHead);
requireCondition(
  candidateParents.status === 0 && candidateParents.stdout.trim() === implementationHead,
  "CANDIDATE_PARENT_MISMATCH",
);
requireCondition(git("merge-base", "--is-ancestor", candidateHead, "HEAD").status === 0, "CANDIDATE_NOT_IN_HISTORY");
requireCondition(
  review.includes("结论：`PASS`") &&
    review.includes(`实现候选 A：\`${implementationHead}\``) &&
    review.includes(`正式报告 SHA-256：\`${reportSha}\``) &&
    review.includes(`UX 记录 SHA-256：\`${uxSha}\``),
  "REVIEW_NOT_PASSING",
);
requireCondition(
  ux.includes(`实现基线：\`${implementationHead}\``) && ux.includes(`候选报告 SHA-256：\`${reportSha}\``),
  "UX_BINDING_MISMATCH",
);

const checks = new Map(report.checks.map((check) => [check.id, check]));
let verifiedRecordCount = 0;
for (const check of report.checks) {
  requireCondition(check.exitCode === 0 && check.trackedWorktreeMutated === false, `CHECK_FAILED:${check.id}`);
  const logBytes = readFileSync(resolve(repoRoot, check.logPath));
  requireCondition(sha256(logBytes) === check.logSha256, `RECORD_SHA_MISMATCH:${check.id}`);
  verifiedRecordCount += 1;
}

const observation = report.readerExperience?.observation;
const samples = new Map(observation?.samples?.map((sample) => [sample.scenario, sample]));
const semantic = samples.get("semantic-layout");
const persistence = samples.get("pagination-persistence");
const lifecycle = samples.get("lifecycle-offline");
const bookmark = samples.get("bookmark-restore");
const bounded = samples.get("bounded-scroll");
const touch = samples.get("mobile-touch");
const background = samples.get("native-background");

requireCondition(
  report.readerExperience?.classification === "PASS" &&
    observation?.classification === "PASS" &&
    observation?.listedTestCount === 15 &&
    observation?.listedTestCountsByProject?.desktop === 14 &&
    observation?.listedTestCountsByProject?.["mobile-touch"] === 1 &&
    observation?.listedTestIdsUnique === true &&
    observation?.listExitCode === 0 &&
    observation?.testExitCode === 0 &&
    observation?.nativeBackgroundExitCode === 0 &&
    observation?.portFreeBefore === true &&
    observation?.portFreeAfter === true &&
    observation?.orphanProcessCount === 0 &&
    samples.size === 7,
  "READER_OBSERVATION_INVALID",
);
requireCondition(
  semantic?.semanticAnchorVisible === true &&
    semantic?.stabilizationMs <= 2000 &&
    persistence?.semanticAnchorVisible === true &&
    persistence?.persistenceMs <= 1000 &&
    lifecycle?.pagehideRestored === true &&
    lifecycle?.offlineObserved === true &&
    lifecycle?.semanticAnchorVisible === true &&
    bookmark?.persisted === true &&
    bookmark?.semanticAnchorVisible === true &&
    bounded?.maxChapterDom <= 3 &&
    bounded?.semanticAnchorVisible === true,
  "CORE_READING_OUTCOMES_INVALID",
);
requireCondition(
  touch?.projectName === "mobile-touch" &&
    touch?.isMobile === true &&
    touch?.hasTouch === true &&
    touch?.maxTouchPoints > 0 &&
    touch?.coarsePointer === true &&
    touch?.trustedTouchObserved === true &&
    touch?.paginationSwipeObserved === true &&
    touch?.drawerTapObserved === true &&
    touch?.progressDragObserved === true &&
    touch?.chapterBoundaryObserved === true,
  "TOUCH_OUTCOMES_INVALID",
);
requireCondition(
  background?.platform === "darwin" &&
    background?.detachedDuringBackground === true &&
    JSON.stringify(background?.windowStateSequence) === JSON.stringify(["normal", "minimized", "normal"]) &&
    JSON.stringify(background?.visibilitySequence) === JSON.stringify(["visible", "hidden", "visible"]) &&
    background?.progressFlushedWhileHidden === true &&
    background?.semanticAnchorVisible === true &&
    background?.restoreMs <= 2000 &&
    background?.characterOffset >= 0,
  "BACKGROUND_OUTCOMES_INVALID",
);

const scoreRows = [...ux.matchAll(/^\| (\u8212\u9002|\u4f4e\u5e72\u6270|\u72b6\u6001\u6e05\u6670|\u6062\u590d\u53ef\u4fe1|\u5355\u624b\u6613\u7528) \| ([0-5])\/5 \|/gmu)];
requireCondition(scoreRows.length === 5, "UX_SCORE_COUNT_INVALID");
const uxScores = Object.fromEntries(scoreRows.map((match) => [match[1], Number(match[2])]));
requireCondition(Object.values(uxScores).every((score) => score >= 4), "UX_SCORE_BELOW_GATE");

for (const definition of definitions) {
  for (const checkId of definition.requiredChecks) {
    requireCondition(checks.has(checkId), `REQUIRED_CHECK_MISSING:${checkId}`);
  }
}

if (checkOnly) {
  process.stdout.write("phase_04_finalizable=true\n");
  process.stdout.write(`implementation_head=${implementationHead}\n`);
  process.stdout.write(`candidate_head=${candidateHead}\n`);
  process.stdout.write(`report_sha256=${reportSha}\n`);
  process.stdout.write(`ux_sha256=${uxSha}\n`);
  process.stdout.write(`review_sha256=${reviewSha}\n`);
  process.exit(0);
}

const generatedAt = new Date().toISOString();
const common = {
  semanticAnchorVisible: semantic.semanticAnchorVisible,
  stabilizationMs: semantic.stabilizationMs,
  progressPersistenceMs: persistence.persistenceMs,
  progressWithinOneSecond: persistence.persistenceMs <= 1000,
  pagehideRestored: lifecycle.pagehideRestored,
  warmOfflineReading: lifecycle.offlineObserved && lifecycle.semanticAnchorVisible,
  bookmarkPersistedAndRestored: bookmark.persisted && bookmark.semanticAnchorVisible,
  boundedScrollMaxChapterDom: bounded.maxChapterDom,
};
const outcomes = {
  "EVID-02": common,
  "EVID-07": {
    mobileProject: touch.projectName,
    isMobile: touch.isMobile,
    hasTouch: touch.hasTouch,
    trustedTouchObserved: touch.trustedTouchObserved,
    paginationSwipeObserved: touch.paginationSwipeObserved,
    progressDragObserved: touch.progressDragObserved,
    chapterBoundaryObserved: touch.chapterBoundaryObserved,
    backgroundWindowStateSequence: background.windowStateSequence,
    backgroundVisibilitySequence: background.visibilitySequence,
    detachedDuringBackground: background.detachedDuringBackground,
    progressFlushedWhileHidden: background.progressFlushedWhileHidden,
    backgroundSemanticAnchorVisible: background.semanticAnchorVisible,
    backgroundRestoreMs: background.restoreMs,
    uxScores,
  },
};

for (const definition of definitions) {
  const evidence = {
    schemaVersion: 1,
    goalId: "GOAL-READING-WORLD-V1",
    controlRevision: "REV-0003",
    phaseId: "PHASE-04",
    evidenceId: definition.evidenceId,
    requirementId: definition.requirementId,
    result: "PASS",
    generatedAt,
    evidenceCommit,
    sourceReport: {
      path: reportPath,
      sha256: reportSha,
      implementationHead,
      candidateHead,
      passedCheckCount: report.summary.passedCount,
      verifiedRecordCount,
      requiredChecks: definition.requiredChecks,
    },
    sourceUx: { path: uxPath, sha256: uxSha },
    sourceReview: { path: reviewPath, sha256: reviewSha, conclusion: "PASS" },
    verifiedOutcomes: outcomes[definition.evidenceId],
    boundary: definition.boundary,
  };
  writeFileSync(resolve(repoRoot, definition.outputPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${definition.evidenceId}=${definition.outputPath}\n`);
}
process.stdout.write(`source_report_sha256=${reportSha}\n`);
process.stdout.write(`evidence_commit=${evidenceCommit}\n`);
