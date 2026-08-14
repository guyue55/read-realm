import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicLibraryGateFinal,
  canonicalizePublicLibraryGateReportForArchive,
  classifyPublicLibraryGateRun,
  countPublicLibraryProductStageMarkers,
  parsePublicLibraryGateObservation,
  phaseFivePublicLibraryChecks,
  publicLibraryGateRecordSpecs,
  publicLibraryExperimentStrategy,
  validatePublicLibraryEvidenceCommitChain,
  validatePublicLibraryGateEvidenceShape,
  validatePublicLibraryHistoryRecordBytes,
  validatePublicLibraryIsolationPaths,
} from "./gate-public-library-run.mjs";

const reliableRun = {
  controlRevision: "REV-0003",
  experiment: "EXP-14",
  listExitCode: 0,
  listedTestCount: 1,
  apiBuildExitCode: 0,
  webBuildExitCode: 0,
  apiServiceReady: true,
  webServiceReady: true,
  testExitCode: 0,
  apiPortFreeBefore: true,
  webPortFreeBefore: true,
  apiPortFreeAfter: true,
  webPortFreeAfter: true,
  orphanProcessCount: 0,
  pathIsolationValid: true,
  isolatedRootCreated: true,
  cleanupComplete: true,
  personalDbSentinelUnchanged: true,
  personalBlobSentinelUnchanged: true,
  sentinelSetupError: null,
  browserChannel: "chrome",
  runnerMode: "production",
  productStageMarkerCount: 1,
  productStageEntered: true,
  evidenceRecordsValid: true,
};

test("EXP-14 固定为隔离公共域、完整本地复制和真断网生产旅程", () => {
  assert.deepEqual(publicLibraryExperimentStrategy("EXP-14"), {
    fixture: "fixed-legal-two-chapter-txt",
    maintenanceCredential: "x-public-library-maintenance-key",
    anonymousCatalog: true,
    immutableFullPackage: true,
    newLocalIds: true,
    atomicLocalCommit: true,
    trueOfflineAfterJoin: true,
    personalSyncSentinel: true,
    isolatedPersonalDatabase: true,
    isolatedPublicDatabase: true,
    isolatedBlobRoots: true,
    productionServers: true,
    systemChrome: true,
    explicitProcessGroups: true,
    cleanupIsolatedRoot: true,
  });
  assert.throws(
    () => publicLibraryExperimentStrategy("EXP-15"),
    /PUBLIC_LIBRARY_EXPERIMENT_NOT_RELEASED:EXP-15/,
  );
});

test("只接受唯一一条 GATE-03 observation", () => {
  const observation = { experiment: "EXP-14", classification: "PASS" };
  const line = `GATE03_PUBLIC_LIBRARY_OBSERVATION=${JSON.stringify(observation)}`;
  assert.deepEqual(parsePublicLibraryGateObservation(line), observation);
  assert.throws(
    () => parsePublicLibraryGateObservation(`${line}\n${line}`),
    /GATE03_PUBLIC_LIBRARY_OBSERVATION_COUNT_2/,
  );
});

test("只有浏览器与固定样本已进入产品断言阶段才认可 marker", () => {
  const marker = "GATE03_PRODUCT_STAGE_ENTERED=EXP-14";
  assert.equal(countPublicLibraryProductStageMarkers(marker, "EXP-14"), 1);
  assert.equal(
    countPublicLibraryProductStageMarkers(`${marker}\n${marker}`, "EXP-14"),
    2,
  );
  assert.equal(
    countPublicLibraryProductStageMarkers(
      `94 | await expect(page).toBeVisible()\n95 | console.log("${marker}")`,
      "EXP-14",
    ),
    0,
  );
  assert.equal(
    countPublicLibraryProductStageMarkers(
      `\u001b[32m${marker}\u001b[0m`,
      "EXP-14",
    ),
    1,
  );
  assert.equal(countPublicLibraryProductStageMarkers("", "EXP-14"), 0);
});

test("设施、隔离、清理和 EXP-14 纵切都可靠时 GATE-03 才 PASS", () => {
  assert.deepEqual(classifyPublicLibraryGateRun(reliableRun), {
    classification: "PASS",
    reasons: [],
  });
});

test("设施可靠时浏览器纵切失败才是 PRODUCT_FAILURE", () => {
  assert.deepEqual(
    classifyPublicLibraryGateRun({ ...reliableRun, testExitCode: 1 }),
    { classification: "PRODUCT_FAILURE", reasons: ["TEST_EXIT_1"] },
  );
});

test("未进入产品阶段的 Playwright 退出不计设计失败", () => {
  assert.deepEqual(
    classifyPublicLibraryGateRun({
      ...reliableRun,
      testExitCode: 1,
      productStageMarkerCount: 0,
      productStageEntered: false,
    }),
    {
      classification: "VALIDATOR_INDETERMINATE",
      reasons: ["PRODUCT_STAGE_MARKER_COUNT_0"],
    },
  );
});

test("设施可靠时个人事实源变化是产品失败而非验证器不确定", () => {
  assert.deepEqual(
    classifyPublicLibraryGateRun({
      ...reliableRun,
      personalDbSentinelUnchanged: false,
      personalBlobSentinelUnchanged: false,
    }),
    {
      classification: "PRODUCT_FAILURE",
      reasons: [
        "PERSONAL_DB_SENTINEL_CHANGED",
        "PERSONAL_BLOB_SENTINEL_CHANGED",
      ],
    },
  );
});

test("端口、生产服务、隔离、进程、清理或 records 失败不可形成产品结论", () => {
  const result = classifyPublicLibraryGateRun({
    ...reliableRun,
    apiServiceReady: false,
    webPortFreeBefore: false,
    apiPortFreeAfter: false,
    orphanProcessCount: 2,
    pathIsolationValid: false,
    cleanupComplete: false,
    sentinelSetupError: "INJECTED_SENTINEL_READ_FAILURE",
    browserChannel: "chromium",
    runnerMode: "development",
    evidenceRecordsValid: false,
    testExitCode: 1,
  });
  assert.deepEqual(result, {
    classification: "VALIDATOR_INDETERMINATE",
    reasons: [
      "API_SERVICE_NOT_READY",
      "WEB_PORT_BUSY_BEFORE",
      "API_PORT_BUSY_AFTER",
      "ORPHAN_PROCESS_COUNT_2",
      "PATH_ISOLATION_INVALID",
      "ISOLATED_CLEANUP_FAILED",
      "PERSONAL_SENTINEL_OBSERVATION_INVALID",
      "BROWSER_CHANNEL_chromium",
      "RUNNER_MODE_development",
      "EVIDENCE_RECORDS_INVALID",
    ],
  });
});

test("PHASE-05 只放行 EXP-14 且包含 API/Web test lint type build、合同与 live", () => {
  const checks = phaseFivePublicLibraryChecks("EXP-14", {
    nodePath: "/node",
    browserChannel: "chrome",
  });
  assert.deepEqual(
    checks.map(({ id }) => id),
    [
      "PATCH_WHITESPACE",
      "API_TEST",
      "API_LINT_NON_FIXING",
      "API_TYPECHECK",
      "API_BUILD",
      "WEB_TEST",
      "WEB_LINT",
      "WEB_TYPECHECK",
      "WEB_BUILD",
      "PUBLIC_LIBRARY_GATE_CONTRACT",
      "GATE_03_PUBLIC_LIBRARY_LIVE",
    ],
  );
  assert.equal(
    checks.find(({ id }) => id === "WEB_BUILD")?.env
      ?.READING_WORLD_VERIFY_NO_PWA_WRITE,
    "1",
  );
  assert.deepEqual(
    checks.find(({ id }) => id === "GATE_03_PUBLIC_LIBRARY_LIVE")?.args,
    ["scripts/run-gate-03-public-library.mjs", "EXP-14"],
  );
  assert.deepEqual(
    checks.find(({ id }) => id === "PUBLIC_LIBRARY_GATE_CONTRACT")?.args,
    [
      "--test",
      "scripts/gate-public-library-run.test.mjs",
      "scripts/verify-reading-world-contract.test.mjs",
    ],
  );
  assert.throws(
    () => phaseFivePublicLibraryChecks("EXP-15", { nodePath: "/node" }),
    /PHASE-05 REV-0003 当前只放行 EXP-14/,
  );
});

test("隔离布局要求个人/公共数据库与 Blob 根都在临时根内且彼此不同", () => {
  const root = "/tmp/gate-03-attempt";
  assert.equal(
    validatePublicLibraryIsolationPaths(root, {
      personalDatabase: `${root}/personal/reader.sqlite`,
      personalBlobRoot: `${root}/personal/blobs`,
      publicDatabase: `${root}/public/catalog.sqlite`,
      publicBlobRoot: `${root}/public/objects`,
    }),
    true,
  );
  assert.equal(
    validatePublicLibraryIsolationPaths(root, {
      personalDatabase: `${root}/personal/reader.sqlite`,
      personalBlobRoot: `${root}/personal/blobs`,
      publicDatabase: `${root}/personal/reader.sqlite`,
      publicBlobRoot: "/tmp/shared-public-objects",
    }),
    false,
  );
  assert.equal(
    validatePublicLibraryIsolationPaths(root, {
      personalDatabase: `${root}/personal/reader.sqlite`,
      personalBlobRoot: `${root}/personal/blobs`,
      publicDatabase: `${root}/public/catalog.sqlite`,
      publicBlobRoot: `${root}/personal/blobs/public`,
    }),
    false,
  );
  assert.equal(
    validatePublicLibraryIsolationPaths(root, {
      personalDatabase: `${root}/personal/blobs/reader.sqlite`,
      personalBlobRoot: `${root}/personal/blobs`,
      publicDatabase: `${root}/public/catalog.sqlite`,
      publicBlobRoot: `${root}/public/objects`,
    }),
    false,
  );
});

test("GATE-03 FINAL 只接受已提交的 PASS EXP-14 并绑定不可判定历史", () => {
  const recordsRoot =
    "docs/goals/reading-world-v1/evidence/artifacts/gate-03-attempt-01.records";
  const attempt = {
    goalId: "GOAL-READING-WORLD-V1",
    controlRevision: "REV-0003",
    experiment: "EXP-14",
    repository: { head: "a".repeat(40) },
    summary: {
      passed: true,
      passedCount: 11,
      failedCount: 0,
      trackedMutationCount: 0,
    },
    checks: publicLibraryGateRecordSpecs().map(({ id, file }) => ({
      id,
      exitCode: 0,
      trackedWorktreeMutated: false,
      logPath: `${recordsRoot}/${file}`,
      logSha256: "f".repeat(64),
    })),
    publicLibraryGate: {
      classification: "PASS",
      reasons: [],
      recordVerification: { valid: true, checkedCount: 11, failures: [] },
      observation: {
        ...reliableRun,
        strategy: publicLibraryExperimentStrategy("EXP-14"),
      },
    },
  };
  const history = {
    path: "evidence/history/gate-03-attempt-01.json",
    sha256: "b".repeat(64),
    implementationHead: "c".repeat(40),
    originalEvidenceCommit: "1".repeat(40),
    classification: "VALIDATOR_INDETERMINATE",
    reasons: [
      "API_SERVICE_NOT_READY",
      "WEB_SERVICE_NOT_READY",
      "PRODUCT_STAGE_MARKER_COUNT_0",
    ],
    recordVerification: { valid: true, checkedCount: 11, failures: [] },
    productFailureCount: 0,
  };
  const final = buildPublicLibraryGateFinal({
    attempt,
    attemptPath: "evidence/gate-03-attempt-01.json",
    attemptSha256: "d".repeat(64),
    evidenceCommit: "e".repeat(40),
    history,
    recordVerification: { valid: true, checkedCount: 11, failures: [] },
    generatedAt: "2026-08-15T07:00:00+08:00",
  });

  assert.equal(final.gateId, "GATE-03");
  assert.equal(final.result, "PASS");
  assert.equal(final.sourceAttempt.experiment, "EXP-14");
  assert.equal(final.verifiedOutcomes.trueOfflineAfterJoin, true);
  assert.equal(final.verifiedOutcomes.personalFactsUnchanged, true);
  assert.equal(
    final.preservedHistory.classification,
    "VALIDATOR_INDETERMINATE",
  );
  assert.match(final.boundary, /TASK-0503/);
  assert.match(final.boundary, /不证明 TASK-0504/);

  assert.throws(
    () =>
      buildPublicLibraryGateFinal({
        attempt: { ...attempt, experiment: "EXP-15" },
        attemptPath: "evidence/gate-03-attempt-01.json",
        attemptSha256: "d".repeat(64),
        evidenceCommit: "e".repeat(40),
        history,
        recordVerification: { valid: true, checkedCount: 11, failures: [] },
        generatedAt: "2026-08-15T07:00:00+08:00",
      }),
    /PUBLIC_LIBRARY_GATE_FINAL_SOURCE_NOT_PASSING/,
  );
  assert.throws(
    () =>
      buildPublicLibraryGateFinal({
        attempt,
        attemptPath: "evidence/gate-03-attempt-01.json",
        attemptSha256: "d".repeat(64),
        evidenceCommit: "e".repeat(40),
        history: { ...history, classification: "PRODUCT_FAILURE" },
        recordVerification: { valid: true, checkedCount: 11, failures: [] },
        generatedAt: "2026-08-15T07:00:00+08:00",
      }),
    /PUBLIC_LIBRARY_GATE_FINAL_HISTORY_INVALID/,
  );
  assert.throws(
    () =>
      buildPublicLibraryGateFinal({
        attempt: { ...attempt, checks: attempt.checks.slice(1) },
        attemptPath: "evidence/gate-03-attempt-01.json",
        attemptSha256: "d".repeat(64),
        evidenceCommit: "e".repeat(40),
        history,
        recordVerification: { valid: true, checkedCount: 11, failures: [] },
        generatedAt: "2026-08-15T07:00:00+08:00",
      }),
    /PUBLIC_LIBRARY_GATE_FINAL_SOURCE_NOT_PASSING/,
  );
});

test("GATE-03 evidence shape 拒绝缺项、错误 ID、外部路径、失败和 mutation", () => {
  const recordsRoot =
    "docs/goals/reading-world-v1/evidence/artifacts/gate-03-attempt-01.records";
  const checks = publicLibraryGateRecordSpecs().map(({ id, file }) => ({
    id,
    exitCode: 0,
    trackedWorktreeMutated: false,
    logPath: `${recordsRoot}/${file}`,
    logSha256: "a".repeat(64),
  }));
  assert.equal(
    validatePublicLibraryGateEvidenceShape(
      { checks },
      { recordsRoot, requirePassing: true },
    ),
    true,
  );
  for (const invalidChecks of [
    checks.slice(1),
    checks.map((check, index) =>
      index === 0 ? { ...check, id: "WRONG" } : check,
    ),
    checks.map((check, index) =>
      index === 0 ? { ...check, logPath: "/tmp/forged.txt" } : check,
    ),
    checks.map((check, index) =>
      index === 0 ? { ...check, exitCode: 1 } : check,
    ),
    checks.map((check, index) =>
      index === 0 ? { ...check, trackedWorktreeMutated: true } : check,
    ),
  ]) {
    assert.equal(
      validatePublicLibraryGateEvidenceShape(
        { checks: invalidChecks },
        { recordsRoot, requirePassing: true },
      ),
      false,
    );
  }
});

test("历史报告只允许 records 根变化，提交链必须逐段有序", () => {
  const report = {
    summary: { passed: false },
    checks: publicLibraryGateRecordSpecs().map(({ id, file }) => ({
      id,
      logPath: `current/${file}`,
      logSha256: "a".repeat(64),
    })),
  };
  const archived = {
    ...report,
    checks: report.checks.map((check) => ({
      ...check,
      logPath: `history/${check.logPath.split("/").at(-1)}`,
    })),
  };
  assert.deepEqual(
    canonicalizePublicLibraryGateReportForArchive(report),
    canonicalizePublicLibraryGateReportForArchive(archived),
  );
  assert.notDeepEqual(
    canonicalizePublicLibraryGateReportForArchive(report),
    canonicalizePublicLibraryGateReportForArchive({
      ...archived,
      summary: { passed: true },
    }),
  );

  const commits = [
    "a".repeat(40),
    "b".repeat(40),
    "c".repeat(40),
    "d".repeat(40),
  ];
  const edges = new Set([
    `${commits[0]}:${commits[1]}`,
    `${commits[1]}:${commits[2]}`,
    `${commits[2]}:${commits[3]}`,
  ]);
  assert.equal(
    validatePublicLibraryEvidenceCommitChain(commits, (older, newer) =>
      edges.has(`${older}:${newer}`),
    ),
    true,
  );
  assert.equal(
    validatePublicLibraryEvidenceCommitChain(
      [commits[0], commits[2], commits[1], commits[3]],
      (older, newer) => edges.has(`${older}:${newer}`),
    ),
    false,
  );
  assert.equal(
    validatePublicLibraryEvidenceCommitChain(
      [commits[0], commits[1], commits[1], commits[3]],
      () => true,
    ),
    false,
  );

  const originalRecords = new Map(
    publicLibraryGateRecordSpecs().map(({ file }) => [file, Buffer.from(file)]),
  );
  const archivedRecords = new Map(originalRecords);
  assert.equal(
    validatePublicLibraryHistoryRecordBytes(
      (file) => originalRecords.get(file),
      (file) => archivedRecords.get(file),
    ),
    true,
  );
  archivedRecords.set("web_test.txt", Buffer.from("tampered"));
  assert.equal(
    validatePublicLibraryHistoryRecordBytes(
      (file) => originalRecords.get(file),
      (file) => archivedRecords.get(file),
    ),
    false,
  );
});
