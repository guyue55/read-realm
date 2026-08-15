import { lstatSync, readdirSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";

export const TASK_0504_CHECK_RECORDS = Object.freeze(
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
  ].map((id) => ({ id, file: `${id.toLowerCase()}.txt` })),
);

export function task0504LiveResultConsistent({
  classification,
  exitCode,
  signal,
}) {
  if (signal !== null) return false;
  if (
    classification !== "PASS" &&
    classification !== "TASK0504_FAILURE" &&
    classification !== "VALIDATOR_INDETERMINATE"
  ) {
    return false;
  }
  return exitCode === (classification === "PASS" ? 0 : 1);
}

export function validateExactTask0504EvidenceTree(
  reportPath,
  recordsRoot,
  expectedFiles,
) {
  try {
    const reportStat = lstatSync(reportPath);
    const recordsStat = lstatSync(recordsRoot);
    if (
      reportStat.isSymbolicLink() ||
      !reportStat.isFile() ||
      recordsStat.isSymbolicLink() ||
      !recordsStat.isDirectory()
    ) {
      return false;
    }
    const expected = new Set(expectedFiles);
    const entries = readdirSync(recordsRoot, { withFileTypes: true });
    return (
      entries.length === expected.size &&
      entries.every((entry) => {
        if (
          !expected.has(entry.name) ||
          entry.isSymbolicLink() ||
          !entry.isFile()
        ) {
          return false;
        }
        const stat = lstatSync(resolve(recordsRoot, entry.name));
        return !stat.isSymbolicLink() && stat.isFile();
      })
    );
  } catch {
    return false;
  }
}

export function task0504ExpansionStrategy() {
  return {
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
  };
}

function isInside(parent, candidate) {
  const location = relative(resolve(parent), resolve(candidate));
  return (
    location !== "" &&
    location !== ".." &&
    !location.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  );
}

function contains(parent, candidate) {
  return resolve(parent) === resolve(candidate) || isInside(parent, candidate);
}

export function validateTask0504IsolationPaths(root, paths) {
  const keys = [
    "personalDatabase",
    "personalBlobRoot",
    "publicDatabase",
    "publicBlobRoot",
    "maintenanceRoot",
  ];
  if (!paths || keys.some((key) => !paths[key])) return false;
  const resolved = Object.fromEntries(
    keys.map((key) => [key, resolve(String(paths[key]))]),
  );
  const values = Object.values(resolved);
  if (new Set(values).size !== values.length) return false;
  if (!values.every((value) => isInside(root, value))) return false;
  const roots = [
    resolved.personalBlobRoot,
    resolved.publicBlobRoot,
    resolved.maintenanceRoot,
  ];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (
        contains(roots[left], roots[right]) ||
        contains(roots[right], roots[left])
      ) {
        return false;
      }
    }
  }
  return ![resolved.personalDatabase, resolved.publicDatabase].some(
    (database) => roots.some((directory) => contains(directory, database)),
  );
}

export function countTask0504ProductStageMarkers(output) {
  const marker = "TASK0504_PRODUCT_STAGE_ENTERED=TASK-0504";
  return String(output)
    .split(/\r?\n/)
    .filter((line) => stripVTControlCharacters(line).trim() === marker).length;
}

export function parseTask0504ExpansionObservation(output) {
  const prefix = "TASK0504_EXPANSION_OBSERVATION=";
  const lines = String(output)
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) {
    throw new Error(`TASK0504_EXPANSION_OBSERVATION_COUNT_${lines.length}`);
  }
  return JSON.parse(lines[0].slice(prefix.length));
}

export function parseTask0504RunnerObservation(output) {
  const prefix = "TASK0504_PUBLIC_LIBRARY_EXPANSION_RUN=";
  const lines = String(output)
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) {
    throw new Error(`TASK0504_RUN_OBSERVATION_COUNT_${lines.length}`);
  }
  return JSON.parse(lines[0].slice(prefix.length));
}

function validateProductObservation(observation) {
  return (
    observation?.baselineBookCount === 25 &&
    observation?.pageOneCount === 24 &&
    observation?.pageTwoCount === 1 &&
    observation?.scanCreatedCount === 16 &&
    observation?.folderCreatedCount === 7 &&
    observation?.directCreatedCount === 1 &&
    observation?.personalCreatedCount === 1 &&
    observation?.oldBooksRevisionRejected === true &&
    observation?.oldFacetRevisionsRejected === 3 &&
    observation?.offlineChaptersRead === 2 &&
    observation?.personalBrowserFactsUnchanged === true
  );
}

export function classifyTask0504ExpansionRun(run) {
  const validatorReasons = [];
  if (run.controlRevision !== "REV-0003") {
    validatorReasons.push(
      `CONTROL_REVISION_${run.controlRevision ?? "MISSING"}`,
    );
  }
  if (run.task !== "TASK-0504") {
    validatorReasons.push(`TASK_${run.task ?? "MISSING"}`);
  }
  if (!run.prerequisiteValid) validatorReasons.push("GATE_03_FINAL_INVALID");
  if (run.listExitCode !== 0)
    validatorReasons.push(`LIST_EXIT_${run.listExitCode}`);
  if (run.listedTestCount !== 1) {
    validatorReasons.push(`LISTED_TEST_COUNT_${run.listedTestCount ?? 0}`);
  }
  if (run.apiBuildExitCode !== 0) {
    validatorReasons.push(`API_BUILD_EXIT_${run.apiBuildExitCode}`);
  }
  if (run.webBuildExitCode !== 0) {
    validatorReasons.push(`WEB_BUILD_EXIT_${run.webBuildExitCode}`);
  }
  if (!run.apiServiceReady) validatorReasons.push("API_SERVICE_NOT_READY");
  if (!run.webServiceReady) validatorReasons.push("WEB_SERVICE_NOT_READY");
  if (!run.apiPortFreeBefore) validatorReasons.push("API_PORT_BUSY_BEFORE");
  if (!run.webPortFreeBefore) validatorReasons.push("WEB_PORT_BUSY_BEFORE");
  if (!run.apiPortFreeAfter) validatorReasons.push("API_PORT_BUSY_AFTER");
  if (!run.webPortFreeAfter) validatorReasons.push("WEB_PORT_BUSY_AFTER");
  if (run.orphanProcessCount !== 0) {
    validatorReasons.push(`ORPHAN_PROCESS_COUNT_${run.orphanProcessCount}`);
  }
  if (!run.pathIsolationValid) validatorReasons.push("PATH_ISOLATION_INVALID");
  if (!run.physicalIsolationValid)
    validatorReasons.push("PHYSICAL_ISOLATION_INVALID");
  if (!run.isolatedRootCreated)
    validatorReasons.push("ISOLATED_ROOT_NOT_CREATED");
  if (!run.cleanupComplete) validatorReasons.push("ISOLATED_CLEANUP_FAILED");
  if (run.sentinelSetupError) {
    validatorReasons.push("SENTINEL_OBSERVATION_INVALID");
  }
  if (run.browserChannel !== "chrome") {
    validatorReasons.push(`BROWSER_CHANNEL_${run.browserChannel ?? "MISSING"}`);
  }
  if (run.runnerMode !== "production") {
    validatorReasons.push(`RUNNER_MODE_${run.runnerMode ?? "MISSING"}`);
  }
  if (run.productStageMarkerCount !== 1 || !run.productStageEntered) {
    validatorReasons.push(
      `PRODUCT_STAGE_MARKER_COUNT_${run.productStageMarkerCount ?? 0}`,
    );
  }
  if (!run.evidenceRecordsValid)
    validatorReasons.push("EVIDENCE_RECORDS_INVALID");
  if (validatorReasons.length > 0) {
    return {
      classification: "VALIDATOR_INDETERMINATE",
      reasons: validatorReasons,
    };
  }

  const productReasons = [];
  if (run.testExitCode !== 0)
    productReasons.push(`TEST_EXIT_${run.testExitCode}`);
  if (!run.sourceTreeUnchanged) productReasons.push("SOURCE_TREE_CHANGED");
  if (!run.personalDbSentinelUnchanged)
    productReasons.push("PERSONAL_DB_SENTINEL_CHANGED");
  if (!run.personalBlobSentinelUnchanged)
    productReasons.push("PERSONAL_BLOB_SENTINEL_CHANGED");
  if (run.postObservationError)
    productReasons.push("POST_PRODUCT_OBSERVATION_FAILED");
  if (!run.publicDatabaseFactsValid)
    productReasons.push("PUBLIC_DATABASE_FACTS_INVALID");
  if (!run.publicProvenanceValid)
    productReasons.push("PUBLIC_PROVENANCE_INVALID");
  if (!run.publicBlobFactsValid)
    productReasons.push("PUBLIC_BLOB_FACTS_INVALID");
  if (
    !run.productObservationValid ||
    !validateProductObservation(run.productObservation)
  ) {
    productReasons.push("PRODUCT_OBSERVATION_INVALID");
  }
  if (productReasons.length > 0) {
    return { classification: "TASK0504_FAILURE", reasons: productReasons };
  }
  return { classification: "PASS", reasons: [] };
}

export function validateTask0504EvidenceShape(
  report,
  { recordsRoot, requirePassing },
) {
  if (!Array.isArray(report?.checks) || report.checks.length !== 14)
    return false;
  return TASK_0504_CHECK_RECORDS.every(({ id, file }, index) => {
    const check = report.checks[index];
    return (
      check?.id === id &&
      check?.logPath === `${recordsRoot}/${file}` &&
      /^[a-f0-9]{64}$/u.test(check?.logSha256 ?? "") &&
      (!requirePassing ||
        (check?.exitCode === 0 && check?.trackedWorktreeMutated === false))
    );
  });
}

export function canonicalizeTask0504ReportForArchive(report) {
  const canonical = JSON.parse(JSON.stringify(report));
  for (const check of canonical?.checks ?? []) {
    check.logPath = basename(check.logPath ?? "");
  }
  return canonical;
}
