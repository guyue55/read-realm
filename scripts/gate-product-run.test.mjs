import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductGateFinal,
  classifyProductGateRun,
  parseProductGateObservation,
  productExperimentStrategy,
  validateGate00Final,
} from "./gate-product-run.mjs";

const reliableRun = {
  prerequisiteValid: true,
  listExitCode: 0,
  listedTestCount: 1,
  buildExitCode: 0,
  serviceReady: true,
  testExitCode: 0,
  portFreeBefore: true,
  portFreeAfter: true,
  orphanProcessCount: 0,
  publicRestored: true,
  evidenceRecordsValid: true,
};

test("EXP-09 固定为 EPUB、兼容存储、唯一书 ID 与资格设施策略", () => {
  assert.deepEqual(productExperimentStrategy("EXP-09"), {
    fixture: "fixed-two-chapter.epub.base64",
    importMechanism: "compatible-storage",
    locator: "book-id",
    isolatedPwaDestination: true,
    serveGeneratedPwaDuringRun: true,
    explicitProcessGroup: true,
  });
  assert.throws(
    () => productExperimentStrategy("EXP-10"),
    /PRODUCT_EXPERIMENT_NOT_RELEASED:EXP-10/,
  );
});

test("设施可靠且纵切通过时产品门为 PASS", () => {
  assert.deepEqual(classifyProductGateRun(reliableRun), {
    classification: "PASS",
    reasons: [],
  });
});

test("只有设施可靠时的浏览器失败才是 PRODUCT_FAILURE", () => {
  assert.deepEqual(
    classifyProductGateRun({ ...reliableRun, testExitCode: 1 }),
    { classification: "PRODUCT_FAILURE", reasons: ["TEST_EXIT_1"] },
  );
});

test("前置门、枚举、服务、端口、进程、补偿或 records 失败均不可下产品结论", () => {
  const result = classifyProductGateRun({
    ...reliableRun,
    prerequisiteValid: false,
    listedTestCount: 2,
    testExitCode: 1,
    portFreeAfter: false,
    orphanProcessCount: 1,
    publicRestored: false,
    evidenceRecordsValid: false,
  });

  assert.equal(result.classification, "VALIDATOR_INDETERMINATE");
  assert.deepEqual(result.reasons, [
    "GATE_00_FINAL_INVALID",
    "LISTED_TEST_COUNT_2",
    "PORT_BUSY_AFTER",
    "ORPHAN_PROCESS_COUNT_1",
    "PUBLIC_NOT_RESTORED",
    "EVIDENCE_RECORDS_INVALID",
  ]);
});

test("产品门只接受单一观察行", () => {
  const observation = { experiment: "EXP-09", classification: "PASS" };
  const line = `PRODUCT_GATE_OBSERVATION=${JSON.stringify(observation)}`;
  assert.deepEqual(parseProductGateObservation(line), observation);
  assert.throws(
    () => parseProductGateObservation(`${line}\n${line}`),
    /PRODUCT_GATE_OBSERVATION_COUNT_2/,
  );
});

test("EVID-45 前置门绑定 REV-0002、GATE-00、PASS 与历史提交", () => {
  const final = {
    goalId: "GOAL-READING-WORLD-V1",
    controlRevision: "REV-0002",
    gateId: "GATE-00",
    result: "PASS",
    evidenceCommit: "a".repeat(40),
    sourceAttempt: { sha256: "b".repeat(64) },
  };
  assert.equal(validateGate00Final(final, {
    actualSha256: "c".repeat(64),
    expectedSha256: "c".repeat(64),
    commitIsAncestor: true,
  }), true);
  assert.equal(validateGate00Final({ ...final, result: "FAIL" }, {
    actualSha256: "c".repeat(64),
    expectedSha256: "c".repeat(64),
    commitIsAncestor: true,
  }), false);
});

test("GATE-01 FINAL 只从 EXP-09 完整通过且 7 条 records 闭合的 ATTEMPT 构造", () => {
  const attempt = {
    goalId: "GOAL-READING-WORLD-V1",
    controlRevision: "REV-0002",
    experiment: "EXP-09",
    repository: { head: "a".repeat(40) },
    summary: { passed: true, failedCount: 0, trackedMutationCount: 0 },
    productGate: {
      classification: "PASS",
      reasons: [],
      recordVerification: { valid: true, checkedCount: 7, failures: [] },
      observation: {
        prerequisiteValid: true,
        listExitCode: 0,
        listedTestCount: 1,
        buildExitCode: 0,
        serviceReady: true,
        testExitCode: 0,
        portFreeBefore: true,
        portFreeAfter: true,
        orphanProcessCount: 0,
        publicRestored: true,
        strategy: {
          fixture: "fixed-two-chapter.epub.base64",
          importMechanism: "compatible-storage",
          locator: "book-id",
          isolatedPwaDestination: true,
          serveGeneratedPwaDuringRun: true,
          explicitProcessGroup: true,
        },
      },
    },
  };
  const final = buildProductGateFinal({
    attempt,
    attemptPath: "evidence/gate-01-attempt.json",
    attemptSha256: "b".repeat(64),
    evidenceCommit: "c".repeat(40),
    gate00FinalSha256: "d".repeat(64),
    generatedAt: "2026-08-13T10:00:00+08:00",
  });
  assert.equal(final.gateId, "GATE-01");
  assert.equal(final.result, "PASS");
  assert.equal(final.sourceAttempt.experiment, "EXP-09");
  assert.equal(final.verifiedOutcomes.trueOffline, true);
  assert.throws(
    () => buildProductGateFinal({
      attempt: { ...attempt, experiment: "EXP-10" },
      attemptPath: "evidence/gate-01-attempt.json",
      attemptSha256: "b".repeat(64),
      evidenceCommit: "c".repeat(40),
      gate00FinalSha256: "d".repeat(64),
      generatedAt: "2026-08-13T10:00:00+08:00",
    }),
    /PRODUCT_GATE_FINAL_SOURCE_NOT_PASSING/,
  );
});
