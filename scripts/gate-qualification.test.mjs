import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyGateRun,
  buildQualificationFinal,
  countListedExperimentTests,
  directoryFingerprint,
  normalizeMachinePaths,
  pwaDestinationFor,
  parseQualificationObservation,
  qualificationStrategy,
  verifyEvidenceRecords,
} from "./gate-qualification.mjs";

const reliableRun = {
  listExitCode: 0,
  buildExitCode: 0,
  serviceReady: true,
  testExitCode: 0,
  listedTestCount: 1,
  targetCount: 1,
  portFreeBefore: true,
  portFreeAfter: true,
  orphanProcessCount: 0,
  publicRestored: true,
  evidenceRecordsValid: true,
};

test("只统计精确实验 ID 的 Playwright 枚举项", () => {
  const output = [
    "Listing tests:",
    "  [chromium] › gate-00.spec.ts:5:5 › EXP-08 validator qualification",
    "  [chromium] › gate-01.spec.ts:5:5 › EXP-080 unrelated",
    "Total: 2 tests in 2 files",
  ].join("\n");

  assert.equal(countListedExperimentTests(output, "EXP-08"), 1);
});

test("所有资格条件可靠且浏览器通过时返回 QUALIFIED", () => {
  assert.deepEqual(classifyGateRun(reliableRun), {
    classification: "QUALIFIED",
    reasons: [],
  });
});

test("目标定位歧义必须归类为验证器不可判定", () => {
  assert.deepEqual(
    classifyGateRun({ ...reliableRun, targetCount: 2 }),
    {
      classification: "VALIDATOR_INDETERMINATE",
      reasons: ["TARGET_COUNT_2"],
    },
  );
});

test("枚举、构建或服务健康失败必须归类为验证器不可判定", () => {
  assert.deepEqual(
    classifyGateRun({
      ...reliableRun,
      listExitCode: 1,
      buildExitCode: 2,
      serviceReady: false,
    }),
    {
      classification: "VALIDATOR_INDETERMINATE",
      reasons: ["LIST_EXIT_1", "BUILD_EXIT_2", "SERVICE_NOT_READY"],
    },
  );
});

test("端口、孤儿进程、补偿或证据任一失效都不可判为产品失败", () => {
  const result = classifyGateRun({
    ...reliableRun,
    testExitCode: 1,
    portFreeAfter: false,
    orphanProcessCount: 1,
    publicRestored: false,
    evidenceRecordsValid: false,
  });

  assert.equal(result.classification, "VALIDATOR_INDETERMINATE");
  assert.deepEqual(result.reasons, [
    "PORT_BUSY_AFTER",
    "ORPHAN_PROCESS_COUNT_1",
    "PUBLIC_NOT_RESTORED",
    "EVIDENCE_RECORDS_INVALID",
  ]);
});

test("只有设施可靠时的非零浏览器退出才可归类为 PRODUCT_FAILURE", () => {
  assert.deepEqual(
    classifyGateRun({ ...reliableRun, testExitCode: 1 }),
    {
      classification: "PRODUCT_FAILURE",
      reasons: ["TEST_EXIT_1"],
    },
  );
});

test("证据记录要求路径唯一、文件存在且 SHA-256 全匹配", () => {
  const bytes = Buffer.from("qualification record\n", "utf8");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const report = {
    checks: [
      { id: "QUALIFICATION", logPath: "records/qualification.txt", logSha256: hash },
    ],
  };

  assert.deepEqual(
    verifyEvidenceRecords(report, (path) =>
      path === "records/qualification.txt" ? bytes : null,
    ),
    { valid: true, checkedCount: 1, failures: [] },
  );
  assert.equal(
    verifyEvidenceRecords(report, () => Buffer.from("changed\n")).valid,
    false,
  );
});

test("目录指纹绑定相对路径与文件字节且不受遍历顺序影响", () => {
  const root = mkdtempSync(join(tmpdir(), "gate-qualification-test-"));
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "b.txt"), "two\n");
  writeFileSync(join(root, "nested", "a.txt"), "one\n");
  const first = directoryFingerprint(root);

  writeFileSync(join(root, "nested", "a.txt"), "changed\n");
  const second = directoryFingerprint(root);

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test("资格观察只接受单一带标记 JSON 行", () => {
  const observation = { experiment: "EXP-08", targetCount: 1 };
  const output = [
    "build output",
    `QUALIFICATION_OBSERVATION=${JSON.stringify(observation)}`,
  ].join("\n");

  assert.deepEqual(parseQualificationObservation(output), observation);
  assert.throws(
    () => parseQualificationObservation(`${output}\n${output}`),
    /QUALIFICATION_OBSERVATION_COUNT_2/,
  );
});

test("证据命令从源头归一化个人目录", () => {
  assert.equal(
    normalizeMachinePaths(
      "/workspace-home/.nvm/versions/node/v24/bin/node --test scripts/check.mjs",
      "/workspace-home",
    ),
    "$HOME/.nvm/versions/node/v24/bin/node --test scripts/check.mjs",
  );
});

test("EXP-12 明确使用稳定渲染、临时 PWA 目录与显式进程组", () => {
  assert.deepEqual(qualificationStrategy("EXP-12"), {
    stableRender: true,
    isolatedPwaDestination: true,
    explicitProcessGroup: true,
  });
  assert.deepEqual(qualificationStrategy("EXP-08"), {
    stableRender: false,
    isolatedPwaDestination: false,
    explicitProcessGroup: true,
  });
  assert.throws(() => qualificationStrategy("EXP-13"), /QUALIFICATION_STRATEGY_NOT_IMPLEMENTED/);
});

test("next-pwa 临时目标使用从 Web 根可逆解析的相对路径", () => {
  const webRoot = "/workspace/apps/web-pwa";
  const temporary = "/private/tmp/reading-world/generated-public";
  const destination = pwaDestinationFor(webRoot, temporary);

  assert.equal(destination, "../../../private/tmp/reading-world/generated-public");
  assert.equal(join(webRoot, destination), temporary);
});

test("GATE-00 FINAL 只从完整通过且 records 闭合的 ATTEMPT 构造", () => {
  const attempt = {
    goalId: "GOAL-READING-WORLD-V1",
    controlRevision: "REV-0002",
    repository: { head: "a".repeat(40) },
    qualificationExperiment: "EXP-12",
    qualification: {
      classification: "QUALIFIED",
      reasons: [],
      recordVerification: { valid: true, checkedCount: 3, failures: [] },
      observation: {
        listExitCode: 0,
        listedTestCount: 1,
        buildExitCode: 0,
        serviceReady: true,
        testExitCode: 0,
        targetCount: 1,
        portFreeBefore: true,
        portFreeAfter: true,
        orphanProcessCount: 0,
        publicRestored: true,
        strategy: {
          stableRender: true,
          isolatedPwaDestination: true,
          explicitProcessGroup: true,
        },
      },
    },
    summary: { passed: true, failedCount: 0, trackedMutationCount: 0 },
  };

  const final = buildQualificationFinal({
    attempt,
    attemptPath: "evidence/gate-00-attempt-02.json",
    attemptSha256: "b".repeat(64),
    evidenceCommit: "c".repeat(40),
    generatedAt: "2026-08-13T09:30:00+08:00",
  });

  assert.equal(final.gateId, "GATE-00");
  assert.equal(final.result, "PASS");
  assert.equal(final.sourceAttempt.sha256, "b".repeat(64));
  assert.equal(final.evidenceCommit, "c".repeat(40));
  assert.throws(
    () => buildQualificationFinal({
      attempt: { ...attempt, summary: { ...attempt.summary, passed: false } },
      attemptPath: "evidence/gate-00-attempt-02.json",
      attemptSha256: "b".repeat(64),
      evidenceCommit: "c".repeat(40),
      generatedAt: "2026-08-13T09:30:00+08:00",
    }),
    /QUALIFICATION_FINAL_SOURCE_NOT_PASSING/,
  );
});
