import assert from "node:assert/strict";
import test from "node:test";
import { classifyImportCapacityRun } from "./import-capacity-run.mjs";

const passing = {
  portFreeBefore: true,
  generateExitCode: 0,
  verifyExitCode: 0,
  listExitCode: 0,
  listedTestCount: 2,
  testExitCode: 0,
  cleaned: true,
  portFreeAfter: true,
};

test("capacity runner passes only with exact enumeration and complete compensation", () => {
  assert.deepEqual(classifyImportCapacityRun(passing), { classification: "PASS", reasons: [] });
});

test("capacity runner exposes test, cleanup and port failures", () => {
  assert.deepEqual(classifyImportCapacityRun({
    ...passing,
    listedTestCount: 1,
    testExitCode: 1,
    cleaned: false,
    portFreeAfter: false,
  }), {
    classification: "FAIL",
    reasons: ["LISTED_TEST_COUNT_1", "TEST_EXIT_1", "FIXTURE_NOT_CLEANED", "PORT_BUSY_AFTER"],
  });
});
