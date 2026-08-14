import { basename, relative, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";

export function validatePublicLibraryIsolationPaths(root, paths) {
  const absoluteRoot = resolve(root);
  const requiredKeys = [
    "personalDatabase",
    "personalBlobRoot",
    "publicDatabase",
    "publicBlobRoot",
  ];
  if (!paths || requiredKeys.some((key) => !paths[key])) return false;
  const resolvedPaths = Object.fromEntries(
    requiredKeys.map((key) => [key, resolve(String(paths[key]))]),
  );
  const values = Object.values(resolvedPaths);
  if (values.length !== 4 || new Set(values).size !== values.length)
    return false;
  const allInsideRoot = values.every((value) => {
    const location = relative(absoluteRoot, value);
    return (
      location !== "" &&
      location !== ".." &&
      !location.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    );
  });
  const contains = (parent, candidate) => {
    const location = relative(parent, candidate);
    return (
      location === "" ||
      (location !== ".." &&
        !location.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
    );
  };
  const blobRootsOverlap =
    contains(resolvedPaths.personalBlobRoot, resolvedPaths.publicBlobRoot) ||
    contains(resolvedPaths.publicBlobRoot, resolvedPaths.personalBlobRoot);
  const databaseInsideBlobRoot = [
    resolvedPaths.personalDatabase,
    resolvedPaths.publicDatabase,
  ].some(
    (database) =>
      contains(resolvedPaths.personalBlobRoot, database) ||
      contains(resolvedPaths.publicBlobRoot, database),
  );
  return allInsideRoot && !blobRootsOverlap && !databaseInsideBlobRoot;
}

export function publicLibraryExperimentStrategy(experiment) {
  if (experiment !== "EXP-14") {
    throw new Error(`PUBLIC_LIBRARY_EXPERIMENT_NOT_RELEASED:${experiment}`);
  }
  return {
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
  };
}

export function parsePublicLibraryGateObservation(output) {
  const prefix = "GATE03_PUBLIC_LIBRARY_OBSERVATION=";
  const lines = String(output)
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) {
    throw new Error(`GATE03_PUBLIC_LIBRARY_OBSERVATION_COUNT_${lines.length}`);
  }
  return JSON.parse(lines[0].slice(prefix.length));
}

export function countPublicLibraryProductStageMarkers(output, experiment) {
  const marker = `GATE03_PRODUCT_STAGE_ENTERED=${experiment}`;
  return String(output)
    .split(/\r?\n/)
    .filter((line) => stripVTControlCharacters(line).trim() === marker).length;
}

export function classifyPublicLibraryGateRun(run) {
  const reasons = [];
  if (run.controlRevision !== "REV-0003") {
    reasons.push(`CONTROL_REVISION_${run.controlRevision ?? "MISSING"}`);
  }
  if (run.experiment !== "EXP-14") {
    reasons.push(`EXPERIMENT_${run.experiment ?? "MISSING"}`);
  }
  if (run.listExitCode !== 0) reasons.push(`LIST_EXIT_${run.listExitCode}`);
  if (run.listedTestCount !== 1) {
    reasons.push(`LISTED_TEST_COUNT_${run.listedTestCount}`);
  }
  if (run.apiBuildExitCode !== 0) {
    reasons.push(`API_BUILD_EXIT_${run.apiBuildExitCode}`);
  }
  if (run.webBuildExitCode !== 0) {
    reasons.push(`WEB_BUILD_EXIT_${run.webBuildExitCode}`);
  }
  if (!run.apiServiceReady) reasons.push("API_SERVICE_NOT_READY");
  if (!run.webServiceReady) reasons.push("WEB_SERVICE_NOT_READY");
  if (!run.apiPortFreeBefore) reasons.push("API_PORT_BUSY_BEFORE");
  if (!run.webPortFreeBefore) reasons.push("WEB_PORT_BUSY_BEFORE");
  if (!run.apiPortFreeAfter) reasons.push("API_PORT_BUSY_AFTER");
  if (!run.webPortFreeAfter) reasons.push("WEB_PORT_BUSY_AFTER");
  if (run.orphanProcessCount !== 0) {
    reasons.push(`ORPHAN_PROCESS_COUNT_${run.orphanProcessCount}`);
  }
  if (!run.pathIsolationValid) reasons.push("PATH_ISOLATION_INVALID");
  if (!run.isolatedRootCreated) reasons.push("ISOLATED_ROOT_NOT_CREATED");
  if (!run.cleanupComplete) reasons.push("ISOLATED_CLEANUP_FAILED");
  if (run.sentinelSetupError)
    reasons.push("PERSONAL_SENTINEL_OBSERVATION_INVALID");
  if (run.browserChannel !== "chrome") {
    reasons.push(`BROWSER_CHANNEL_${run.browserChannel ?? "MISSING"}`);
  }
  if (run.runnerMode !== "production") {
    reasons.push(`RUNNER_MODE_${run.runnerMode ?? "MISSING"}`);
  }
  if (run.productStageMarkerCount !== 1 || !run.productStageEntered) {
    reasons.push(
      `PRODUCT_STAGE_MARKER_COUNT_${run.productStageMarkerCount ?? 0}`,
    );
  }
  if (!run.evidenceRecordsValid) reasons.push("EVIDENCE_RECORDS_INVALID");

  if (reasons.length > 0) {
    return { classification: "VALIDATOR_INDETERMINATE", reasons };
  }
  const productReasons = [];
  if (run.testExitCode !== 0)
    productReasons.push(`TEST_EXIT_${run.testExitCode}`);
  if (!run.personalDbSentinelUnchanged) {
    productReasons.push("PERSONAL_DB_SENTINEL_CHANGED");
  }
  if (!run.personalBlobSentinelUnchanged) {
    productReasons.push("PERSONAL_BLOB_SENTINEL_CHANGED");
  }
  if (productReasons.length > 0) {
    return {
      classification: "PRODUCT_FAILURE",
      reasons: productReasons,
    };
  }
  return { classification: "PASS", reasons: [] };
}

const publicLibraryGateRecords = [
  ["PATCH_WHITESPACE", "patch_whitespace.txt"],
  ["API_TEST", "api_test.txt"],
  ["API_LINT_NON_FIXING", "api_lint_non_fixing.txt"],
  ["API_TYPECHECK", "api_typecheck.txt"],
  ["API_BUILD", "api_build.txt"],
  ["WEB_TEST", "web_test.txt"],
  ["WEB_LINT", "web_lint.txt"],
  ["WEB_TYPECHECK", "web_typecheck.txt"],
  ["WEB_BUILD", "web_build.txt"],
  ["PUBLIC_LIBRARY_GATE_CONTRACT", "public_library_gate_contract.txt"],
  ["GATE_03_PUBLIC_LIBRARY_LIVE", "gate_03_public_library_live.txt"],
];

export function publicLibraryGateRecordSpecs() {
  return publicLibraryGateRecords.map(([id, file]) => ({ id, file }));
}

export function validatePublicLibraryGateEvidenceShape(
  report,
  { recordsRoot, requirePassing },
) {
  if (!Array.isArray(report?.checks) || report.checks.length !== 11) {
    return false;
  }
  return publicLibraryGateRecords.every(([id, file], index) => {
    const check = report.checks[index];
    return (
      check?.id === id &&
      check?.logPath === `${recordsRoot}/${file}` &&
      /^[a-f0-9]{64}$/.test(check?.logSha256 ?? "") &&
      (!requirePassing ||
        (check?.exitCode === 0 && check?.trackedWorktreeMutated === false))
    );
  });
}

export function canonicalizePublicLibraryGateReportForArchive(report) {
  const canonical = JSON.parse(JSON.stringify(report));
  for (const check of canonical?.checks ?? []) {
    check.logPath = basename(check.logPath ?? "");
  }
  return canonical;
}

export function validatePublicLibraryEvidenceCommitChain(commits, isAncestor) {
  if (
    !Array.isArray(commits) ||
    commits.length !== 4 ||
    new Set(commits).size !== commits.length ||
    commits.some((commit) => !/^[a-f0-9]{40,64}$/.test(commit ?? ""))
  ) {
    return false;
  }
  for (let index = 0; index < commits.length - 1; index += 1) {
    if (!isAncestor(commits[index], commits[index + 1])) return false;
  }
  return true;
}

export function validatePublicLibraryHistoryRecordBytes(
  readOriginal,
  readArchived,
) {
  return publicLibraryGateRecords.every(([, file]) => {
    const original = readOriginal(file);
    const archived = readArchived(file);
    if (!original || !archived || original.length !== archived.length) {
      return false;
    }
    return original.every((byte, index) => byte === archived[index]);
  });
}

export function buildPublicLibraryGateFinal({
  attempt,
  attemptPath,
  attemptSha256,
  evidenceCommit,
  history,
  recordVerification,
  generatedAt,
}) {
  const observation = attempt?.publicLibraryGate?.observation;
  const strategy = observation?.strategy;
  const sourcePassing =
    attempt?.goalId === "GOAL-READING-WORLD-V1" &&
    attempt?.controlRevision === "REV-0003" &&
    attempt?.experiment === "EXP-14" &&
    attempt?.summary?.passed === true &&
    attempt?.summary?.passedCount === 11 &&
    attempt?.summary?.failedCount === 0 &&
    attempt?.summary?.trackedMutationCount === 0 &&
    /^[a-f0-9]{40,64}$/.test(attempt?.repository?.head ?? "") &&
    validatePublicLibraryGateEvidenceShape(attempt, {
      recordsRoot:
        "docs/goals/reading-world-v1/evidence/artifacts/gate-03-attempt-01.records",
      requirePassing: true,
    }) &&
    attempt?.publicLibraryGate?.classification === "PASS" &&
    Array.isArray(attempt?.publicLibraryGate?.reasons) &&
    attempt.publicLibraryGate.reasons.length === 0 &&
    attempt?.publicLibraryGate?.recordVerification?.valid === true &&
    attempt?.publicLibraryGate?.recordVerification?.checkedCount === 11 &&
    observation?.controlRevision === "REV-0003" &&
    observation?.experiment === "EXP-14" &&
    observation?.listExitCode === 0 &&
    observation?.listedTestCount === 1 &&
    observation?.apiBuildExitCode === 0 &&
    observation?.webBuildExitCode === 0 &&
    observation?.apiServiceReady === true &&
    observation?.webServiceReady === true &&
    observation?.testExitCode === 0 &&
    observation?.apiPortFreeBefore === true &&
    observation?.webPortFreeBefore === true &&
    observation?.apiPortFreeAfter === true &&
    observation?.webPortFreeAfter === true &&
    observation?.orphanProcessCount === 0 &&
    observation?.pathIsolationValid === true &&
    observation?.isolatedRootCreated === true &&
    observation?.cleanupComplete === true &&
    observation?.personalDbSentinelUnchanged === true &&
    observation?.personalBlobSentinelUnchanged === true &&
    observation?.sentinelSetupError === null &&
    observation?.browserChannel === "chrome" &&
    observation?.runnerMode === "production" &&
    observation?.productStageMarkerCount === 1 &&
    observation?.productStageEntered === true &&
    observation?.evidenceRecordsValid === true &&
    recordVerification?.valid === true &&
    recordVerification?.checkedCount === 11 &&
    strategy?.fixture === "fixed-legal-two-chapter-txt" &&
    strategy?.maintenanceCredential === "x-public-library-maintenance-key" &&
    strategy?.anonymousCatalog === true &&
    strategy?.immutableFullPackage === true &&
    strategy?.newLocalIds === true &&
    strategy?.atomicLocalCommit === true &&
    strategy?.trueOfflineAfterJoin === true &&
    strategy?.personalSyncSentinel === true &&
    strategy?.isolatedPersonalDatabase === true &&
    strategy?.isolatedPublicDatabase === true &&
    strategy?.isolatedBlobRoots === true &&
    strategy?.productionServers === true &&
    strategy?.systemChrome === true &&
    strategy?.explicitProcessGroups === true &&
    strategy?.cleanupIsolatedRoot === true;
  if (!sourcePassing) {
    throw new Error("PUBLIC_LIBRARY_GATE_FINAL_SOURCE_NOT_PASSING");
  }
  if (!/^[a-f0-9]{64}$/.test(attemptSha256 ?? "")) {
    throw new Error("PUBLIC_LIBRARY_GATE_FINAL_ATTEMPT_SHA_INVALID");
  }
  if (!/^[a-f0-9]{40,64}$/.test(evidenceCommit ?? "")) {
    throw new Error("PUBLIC_LIBRARY_GATE_FINAL_EVIDENCE_COMMIT_INVALID");
  }
  const expectedHistoryReasons = [
    "API_SERVICE_NOT_READY",
    "WEB_SERVICE_NOT_READY",
    "PRODUCT_STAGE_MARKER_COUNT_0",
  ];
  const historyValid =
    typeof history?.path === "string" &&
    /^[a-f0-9]{64}$/.test(history?.sha256 ?? "") &&
    /^[a-f0-9]{40,64}$/.test(history?.implementationHead ?? "") &&
    history?.classification === "VALIDATOR_INDETERMINATE" &&
    JSON.stringify(history?.reasons) ===
      JSON.stringify(expectedHistoryReasons) &&
    history?.recordVerification?.valid === true &&
    history?.recordVerification?.checkedCount === 11 &&
    /^[a-f0-9]{40,64}$/.test(history?.originalEvidenceCommit ?? "") &&
    history?.productFailureCount === 0;
  if (!historyValid) {
    throw new Error("PUBLIC_LIBRARY_GATE_FINAL_HISTORY_INVALID");
  }

  return {
    schemaVersion: 1,
    goalId: attempt.goalId,
    controlRevision: attempt.controlRevision,
    gateId: "GATE-03",
    result: "PASS",
    generatedAt,
    evidenceCommit,
    sourceAttempt: {
      path: attemptPath,
      sha256: attemptSha256,
      implementationHead: attempt.repository.head,
      experiment: attempt.experiment,
    },
    preservedHistory: history,
    verifiedOutcomes: {
      discoverablePublicLibrary: true,
      explicitNonDefaultMaintenanceCredential: true,
      invalidCredentialsRejected: true,
      anonymousCatalog: true,
      categorySearchAndPagination: true,
      immutableFullPackage: true,
      newLocalIds: true,
      atomicLocalCommit: true,
      trueOfflineAfterJoin: true,
      personalFactsUnchanged: true,
      personalDatabaseSentinelUnchanged: true,
      personalBlobSentinelUnchanged: true,
      isolatedStoragePaths: true,
      productionServers: true,
      systemChrome: true,
      listedTestCount: observation.listedTestCount,
      productStageMarkerCount: observation.productStageMarkerCount,
      apiPortFreeBefore: observation.apiPortFreeBefore,
      webPortFreeBefore: observation.webPortFreeBefore,
      apiPortFreeAfter: observation.apiPortFreeAfter,
      webPortFreeAfter: observation.webPortFreeAfter,
      orphanProcessCount: observation.orphanProcessCount,
      cleanupComplete: observation.cleanupComplete,
      strategy,
      recordVerification,
    },
    boundary:
      "仅证明 PHASE-05 / TASK-0503 的 GATE-03 最小公共藏书纵向切片；不证明 TASK-0504~0506、PHASE-05 整体及 PHASE-06~09、VPS 部署或 Goal 完成。",
  };
}

export function phaseFivePublicLibraryChecks(experiment, runtime = {}) {
  if (experiment !== "EXP-14") {
    throw new Error(
      `PHASE-05 REV-0003 当前只放行 EXP-14；${experiment ?? "缺少实验 ID"} 不可执行`,
    );
  }
  const nodePath = runtime.nodePath ?? process.execPath;
  const browserChannel = runtime.browserChannel ?? "chrome";
  const browserEnv = {
    CI: "1",
    PLAYWRIGHT_BROWSER_CHANNEL: browserChannel,
  };
  return [
    { id: "PATCH_WHITESPACE", command: "git", args: ["diff", "--check"] },
    {
      id: "API_TEST",
      command: "corepack",
      args: ["pnpm", "--filter", "api", "exec", "jest", "--runInBand"],
    },
    {
      id: "API_LINT_NON_FIXING",
      command: "corepack",
      args: [
        "pnpm",
        "--filter",
        "api",
        "exec",
        "eslint",
        "{src,apps,libs,test}/**/*.ts",
      ],
    },
    {
      id: "API_TYPECHECK",
      command: "corepack",
      args: ["pnpm", "--filter", "api", "exec", "tsc", "--noEmit"],
    },
    {
      id: "API_BUILD",
      command: "corepack",
      args: ["pnpm", "--filter", "api", "build"],
    },
    {
      id: "WEB_TEST",
      command: "corepack",
      args: ["pnpm", "--filter", "web-pwa", "test"],
    },
    {
      id: "WEB_LINT",
      command: "corepack",
      args: ["pnpm", "--filter", "web-pwa", "lint"],
    },
    {
      id: "WEB_TYPECHECK",
      command: "corepack",
      args: ["pnpm", "--filter", "web-pwa", "exec", "tsc", "--noEmit"],
    },
    {
      id: "WEB_BUILD",
      command: "corepack",
      args: ["pnpm", "--filter", "web-pwa", "build"],
      env: { READING_WORLD_VERIFY_NO_PWA_WRITE: "1" },
    },
    {
      id: "PUBLIC_LIBRARY_GATE_CONTRACT",
      command: nodePath,
      args: [
        "--test",
        "scripts/gate-public-library-run.test.mjs",
        "scripts/verify-reading-world-contract.test.mjs",
      ],
    },
    {
      id: "GATE_03_PUBLIC_LIBRARY_LIVE",
      command: nodePath,
      args: ["scripts/run-gate-03-public-library.mjs", experiment],
      env: browserEnv,
    },
  ];
}
