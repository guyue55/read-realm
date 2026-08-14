import { relative, resolve } from "node:path";
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
