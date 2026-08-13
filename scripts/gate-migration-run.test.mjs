import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMigrationGateRun,
  parseMigrationGateObservation,
} from "./gate-migration-run.mjs";

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

test("迁移门只接受单一观察行", () => {
  const observation = { riskId: "RISK-03", classification: "PASS" };
  const line = `MIGRATION_GATE_OBSERVATION=${JSON.stringify(observation)}`;
  assert.deepEqual(parseMigrationGateObservation(line), observation);
  assert.throws(
    () => parseMigrationGateObservation(`${line}\n${line}`),
    /MIGRATION_GATE_OBSERVATION_COUNT_2/,
  );
});

test("设施可靠且真实迁移门通过时为 PASS", () => {
  assert.deepEqual(classifyMigrationGateRun(reliableRun), {
    classification: "PASS",
    reasons: [],
  });
});

test("只有设施可靠时的浏览器失败才是 MIGRATION_FAILURE", () => {
  assert.deepEqual(
    classifyMigrationGateRun({ ...reliableRun, testExitCode: 1 }),
    { classification: "MIGRATION_FAILURE", reasons: ["TEST_EXIT_1"] },
  );
});

test("端口、进程、补偿或 records 失效时不可下迁移结论", () => {
  const result = classifyMigrationGateRun({
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
