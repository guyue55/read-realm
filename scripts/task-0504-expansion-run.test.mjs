import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  TASK_0504_CHECK_RECORDS,
  classifyTask0504ExpansionRun,
  countTask0504ProductStageMarkers,
  parseTask0504ExpansionObservation,
  parseTask0504RunnerObservation,
  task0504LiveResultConsistent,
  task0504ExpansionStrategy,
  validateExactTask0504EvidenceTree,
  validateTask0504EvidenceShape,
  validateTask0504IsolationPaths,
} from "./task-0504-expansion-run.mjs";

test("distinguishes a reliable product failure from an inconsistent live exit", () => {
  assert.equal(
    task0504LiveResultConsistent({
      classification: "TASK0504_FAILURE",
      exitCode: 1,
      signal: null,
    }),
    true,
  );
  assert.equal(
    task0504LiveResultConsistent({
      classification: "PASS",
      exitCode: 1,
      signal: null,
    }),
    false,
  );
  assert.equal(
    task0504LiveResultConsistent({
      classification: "TASK0504_FAILURE",
      exitCode: 1,
      signal: "SIGTERM",
    }),
    false,
  );
});

test("rejects symlink evidence roots and any record outside the exact set", () => {
  const root = mkdtempSync(resolve(tmpdir(), "task-0504-evidence-tree-"));
  try {
    const report = resolve(root, "report.json");
    const records = resolve(root, "records");
    writeFileSync(report, "{}\n");
    mkdirSync(records);
    writeFileSync(resolve(records, "one.txt"), "one\n");
    assert.equal(
      validateExactTask0504EvidenceTree(report, records, ["one.txt"]),
      true,
    );
    writeFileSync(resolve(records, "stale.txt"), "stale\n");
    assert.equal(
      validateExactTask0504EvidenceTree(report, records, ["one.txt"]),
      false,
    );
    rmSync(resolve(records, "stale.txt"));
    const linkedRecords = resolve(root, "linked-records");
    symlinkSync(records, linkedRecords);
    assert.equal(
      validateExactTask0504EvidenceTree(report, linkedRecords, ["one.txt"]),
      false,
    );
    const linkedReport = resolve(root, "linked-report.json");
    symlinkSync(report, linkedReport);
    assert.equal(
      validateExactTask0504EvidenceTree(linkedReport, records, ["one.txt"]),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const passingRun = {
  controlRevision: "REV-0003",
  task: "TASK-0504",
  prerequisiteValid: true,
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
  physicalIsolationValid: true,
  isolatedRootCreated: true,
  cleanupComplete: true,
  sourceTreeUnchanged: true,
  personalDbSentinelUnchanged: true,
  personalBlobSentinelUnchanged: true,
  publicDatabaseFactsValid: true,
  publicProvenanceValid: true,
  publicBlobFactsValid: true,
  sentinelSetupError: null,
  browserChannel: "chrome",
  runnerMode: "production",
  productStageMarkerCount: 1,
  productStageEntered: true,
  productObservationValid: true,
  productObservation: {
    baselineBookCount: 25,
    pageOneCount: 24,
    pageTwoCount: 1,
    scanCreatedCount: 16,
    folderCreatedCount: 7,
    directCreatedCount: 1,
    personalCreatedCount: 1,
    oldBooksRevisionRejected: true,
    oldFacetRevisionsRejected: 3,
    offlineChaptersRead: 2,
    personalBrowserFactsUnchanged: true,
  },
  evidenceRecordsValid: true,
};

test("freezes the exact 14 check record identities", () => {
  assert.equal(TASK_0504_CHECK_RECORDS.length, 14);
  assert.deepEqual(
    TASK_0504_CHECK_RECORDS.map(({ id }) => id),
    [
      "PATCH_WHITESPACE",
      "GATE_03_FINAL_PREREQUISITE",
      "PUBLIC_LIBRARY_EXPANSION_FIXTURE_CONTRACT",
      "API_TEST",
      "API_LINT_NON_FIXING",
      "API_TYPECHECK",
      "API_BUILD",
      "WEB_TEST",
      "WEB_LINT",
      "WEB_TYPECHECK",
      "WEB_BUILD_NO_PWA_WRITE",
      "PUBLIC_PRIVATE_BOUNDARY_CONTRACT",
      "TASK_0504_RUN_CONTRACT",
      "TASK_0504_PUBLIC_LIBRARY_LIVE",
    ],
  );
});

test("accepts exactly one executed product marker and rejects source frames", () => {
  assert.equal(
    countTask0504ProductStageMarkers(
      "TASK0504_PRODUCT_STAGE_ENTERED=TASK-0504\n",
    ),
    1,
  );
  assert.equal(
    countTask0504ProductStageMarkers(
      '95 | console.log("TASK0504_PRODUCT_STAGE_ENTERED=TASK-0504")\n',
    ),
    0,
  );
  assert.equal(
    countTask0504ProductStageMarkers(
      "\u001b[32mTASK0504_PRODUCT_STAGE_ENTERED=TASK-0504\u001b[0m\n",
    ),
    1,
  );
});

test("parses one observation and rejects missing or duplicate observations", () => {
  const line = `TASK0504_EXPANSION_OBSERVATION=${JSON.stringify({ ok: true })}`;
  assert.deepEqual(parseTask0504ExpansionObservation(line), { ok: true });
  assert.throws(() => parseTask0504ExpansionObservation(""));
  assert.throws(() => parseTask0504ExpansionObservation(`${line}\n${line}`));
});

test("parses exactly one outer runner observation", () => {
  const line = `TASK0504_PUBLIC_LIBRARY_EXPANSION_RUN=${JSON.stringify({ classification: "PASS" })}`;
  assert.deepEqual(parseTask0504RunnerObservation(line), {
    classification: "PASS",
  });
  assert.throws(() => parseTask0504RunnerObservation(""));
  assert.throws(() => parseTask0504RunnerObservation(`${line}\n${line}`));
});

test("separates validator indeterminate from reliable product failure", () => {
  assert.deepEqual(classifyTask0504ExpansionRun(passingRun), {
    classification: "PASS",
    reasons: [],
  });
  assert.deepEqual(
    classifyTask0504ExpansionRun({ ...passingRun, apiServiceReady: false }),
    {
      classification: "VALIDATOR_INDETERMINATE",
      reasons: ["API_SERVICE_NOT_READY"],
    },
  );
  assert.deepEqual(
    classifyTask0504ExpansionRun({ ...passingRun, testExitCode: 1 }),
    { classification: "TASK0504_FAILURE", reasons: ["TEST_EXIT_1"] },
  );
  assert.deepEqual(
    classifyTask0504ExpansionRun({ ...passingRun, sourceTreeUnchanged: false }),
    {
      classification: "TASK0504_FAILURE",
      reasons: ["SOURCE_TREE_CHANGED"],
    },
  );
});

test("validates all isolated paths including the maintenance root", () => {
  assert.equal(
    validateTask0504IsolationPaths("/tmp/owned", {
      personalDatabase: "/tmp/owned/personal/reader.sqlite",
      personalBlobRoot: "/tmp/owned/personal/blobs",
      publicDatabase: "/tmp/owned/public/catalog.sqlite",
      publicBlobRoot: "/tmp/owned/public/objects",
      maintenanceRoot: "/tmp/owned/source/library",
    }),
    true,
  );
  assert.equal(
    validateTask0504IsolationPaths("/tmp/owned", {
      personalDatabase: "/tmp/owned/personal/reader.sqlite",
      personalBlobRoot: "/tmp/owned/personal/blobs",
      publicDatabase: "/tmp/owned/public/catalog.sqlite",
      publicBlobRoot: "/tmp/owned/public/objects",
      maintenanceRoot: "/tmp/owned/public",
    }),
    false,
  );
});

test("freezes the 16+7+1+1 fixture and evidence roots", () => {
  assert.deepEqual(task0504ExpansionStrategy(), {
    maintenanceDirectoryBooks: 16,
    browserFolderBooks: 7,
    directFileBooks: 1,
    verifiedPersonalCloudBooks: 1,
    baselineBookCount: 25,
    pageSize: 24,
    browserChannel: "chrome",
    runnerMode: "production",
    publicPrivateIsolation: true,
    sourceTreeReadOnly: true,
  });
  const report = {
    checks: TASK_0504_CHECK_RECORDS.map(({ id, file }) => ({
      id,
      logPath: `docs/goals/reading-world-v1/evidence/artifacts/task-0504-expansion-attempt-01.records/${file}`,
      logSha256: "a".repeat(64),
      exitCode: 0,
      trackedWorktreeMutated: false,
    })),
  };
  assert.equal(
    validateTask0504EvidenceShape(report, {
      recordsRoot:
        "docs/goals/reading-world-v1/evidence/artifacts/task-0504-expansion-attempt-01.records",
      requirePassing: true,
    }),
    true,
  );
  report.checks[0].id = "WRONG";
  assert.equal(
    validateTask0504EvidenceShape(report, {
      recordsRoot:
        "docs/goals/reading-world-v1/evidence/artifacts/task-0504-expansion-attempt-01.records",
      requirePassing: true,
    }),
    false,
  );
});
