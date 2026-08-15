#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  TASK_0504_CHECK_RECORDS,
  canonicalizeTask0504ReportForArchive,
  classifyTask0504ExpansionRun,
  parseTask0504RunnerObservation,
  task0504LiveResultConsistent,
  validateExactTask0504EvidenceTree,
  validateTask0504EvidenceShape,
} from "./task-0504-expansion-run.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedOutput =
  "docs/goals/reading-world-v1/evidence/artifacts/task-0504-expansion-attempt-01.json";

function parseArguments(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== "--task" ||
    argv[1] !== "TASK-0504" ||
    argv[2] !== "--output" ||
    argv[3] !== expectedOutput
  ) {
    throw new Error(
      `TASK0504_FORMAL_COMMAND_INVALID: --task TASK-0504 --output ${expectedOutput}`,
    );
  }
  return { task: argv[1], output: argv[3] };
}

function run(command, args, options = {}) {
  const startedAt = new Date();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  const endedAt = new Date();
  return {
    command: [command, ...args].join(" "),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? String(result.error) : ""),
  };
}

function probe(command, args) {
  const result = run(command, args);
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function trackedFingerprint() {
  const status = run("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=no",
  ]);
  const diff = run("git", ["diff", "--binary", "--no-ext-diff"]);
  const staged = run("git", ["diff", "--cached", "--binary", "--no-ext-diff"]);
  if (status.exitCode || diff.exitCode || staged.exitCode)
    throw new Error("GIT_STATE_UNREADABLE");
  return {
    sha256: createHash("sha256")
      .update(`${status.stdout}\n${diff.stdout}\n${staged.stdout}`)
      .digest("hex"),
    status: status.stdout.split("\n").filter(Boolean),
  };
}

function untrackedOutsideEvidence() {
  const status = probe("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (status.exitCode) throw new Error("GIT_STATE_UNREADABLE");
  const allowed = new Set([
    expectedOutput,
    ...TASK_0504_CHECK_RECORDS.map(
      ({ file }) =>
        `docs/goals/reading-world-v1/evidence/artifacts/task-0504-expansion-attempt-01.records/${file}`,
    ),
  ]);
  return status.stdout
    .split("\n")
    .filter(Boolean)
    .filter((line) => line.startsWith("?? "))
    .filter((line) => {
      const path = line.slice(3).replace(/^"|"$/gu, "");
      return !allowed.has(path);
    });
}

function sanitize(value) {
  return String(value)
    .split(repoRoot)
    .join(".")
    .split(homedir())
    .join("$HOME")
    .split("task-0504-fixture-key")
    .join("$TASK0504_KEY")
    .replace(/\/[^\s"']*reading-world-task-0504-[^\s"']*/gu, "$ISOLATED_ROOT")
    .replace(/\r\n/gu, "\n")
    .replace(/[\t ]+$/gmu, "")
    .replace(/\n+$/u, "\n");
}

function validateExistingEvidence(reportPath, recordsRoot) {
  const absoluteRecordsRoot = resolve(repoRoot, recordsRoot);
  if (
    !validateExactTask0504EvidenceTree(
      reportPath,
      absoluteRecordsRoot,
      TASK_0504_CHECK_RECORDS.map(({ file }) => file),
    )
  ) {
    throw new Error("TASK0504_EXISTING_RECORD_TREE_INVALID");
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (
    !validateTask0504EvidenceShape(report, {
      recordsRoot,
      requirePassing: false,
    })
  ) {
    throw new Error("TASK0504_EXISTING_EVIDENCE_SHAPE_INVALID");
  }
  for (const check of report.checks) {
    const record = resolve(repoRoot, check.logPath);
    if (!existsSync(record) || sha256(record) !== check.logSha256) {
      throw new Error(`TASK0504_EXISTING_RECORD_INVALID:${check.id}`);
    }
  }
  return report;
}

function archiveExisting(outputPath, recordsPath, recordsRelative) {
  const outputExists = existsSync(outputPath);
  const recordsExist = existsSync(recordsPath);
  if (!outputExists && !recordsExist) return null;
  if (outputExists !== recordsExist)
    throw new Error("TASK0504_EXISTING_EVIDENCE_PAIR_INCOMPLETE");
  const original = validateExistingEvidence(outputPath, recordsRelative);
  const originalReportSha256 = sha256(outputPath);
  const originalRecords = Object.fromEntries(
    original.checks.map((check) => [
      check.id,
      {
        sha256: check.logSha256,
        bytes: readFileSync(resolve(repoRoot, check.logPath)),
      },
    ]),
  );
  const historyRoot = resolve(dirname(outputPath), "history");
  let attempt = 1;
  let archive;
  do {
    archive = resolve(
      historyRoot,
      `task-0504-expansion-attempt-01-attempt-${String(attempt).padStart(2, "0")}`,
    );
    attempt += 1;
  } while (existsSync(archive));
  mkdirSync(archive, { recursive: true });
  const archivedReportPath = resolve(
    archive,
    "task-0504-expansion-attempt-01.json",
  );
  const archivedRecordsPath = resolve(
    archive,
    "task-0504-expansion-attempt-01.records",
  );
  renameSync(outputPath, archivedReportPath);
  cpSync(recordsPath, archivedRecordsPath, { recursive: true });
  for (const check of original.checks) {
    const archivedRecord = resolve(
      archivedRecordsPath,
      `${check.id.toLowerCase()}.txt`,
    );
    const expected = originalRecords[check.id];
    if (
      !existsSync(archivedRecord) ||
      sha256(archivedRecord) !== expected.sha256 ||
      !readFileSync(archivedRecord).equals(expected.bytes)
    ) {
      throw new Error(`TASK0504_ARCHIVE_RECORD_MISMATCH:${check.id}`);
    }
  }
  rmSync(recordsPath, { recursive: true, force: true });
  const archived = JSON.parse(readFileSync(archivedReportPath, "utf8"));
  for (const check of archived.checks) {
    check.logPath = relative(
      repoRoot,
      resolve(archivedRecordsPath, `${check.id.toLowerCase()}.txt`),
    );
  }
  if (
    JSON.stringify(canonicalizeTask0504ReportForArchive(original)) !==
    JSON.stringify(canonicalizeTask0504ReportForArchive(archived))
  ) {
    throw new Error("TASK0504_ARCHIVE_CANONICAL_MISMATCH");
  }
  writeFileSync(archivedReportPath, `${JSON.stringify(archived, null, 2)}\n`);
  const frozenFiles = Object.fromEntries([
    [relative(repoRoot, archivedReportPath), sha256(archivedReportPath)],
    ...original.checks.map((check) => {
      const path = resolve(
        archivedRecordsPath,
        `${check.id.toLowerCase()}.txt`,
      );
      return [relative(repoRoot, path), sha256(path)];
    }),
  ]);
  return {
    path: relative(repoRoot, archive),
    originalReportSha256,
    archivedReportSha256: sha256(archivedReportPath),
    originalRecordSha256: Object.fromEntries(
      Object.entries(originalRecords).map(([id, record]) => [
        id,
        record.sha256,
      ]),
    ),
    frozenFiles,
    recordCount: 14,
  };
}

function archiveManifestValid(archive) {
  if (!archive) return true;
  return Object.entries(archive.frozenFiles).every(([path, expected]) => {
    const absolute = resolve(repoRoot, path);
    return existsSync(absolute) && sha256(absolute) === expected;
  });
}

function checks() {
  return [
    { id: "PATCH_WHITESPACE", command: "git", args: ["diff", "--check"] },
    {
      id: "GATE_03_FINAL_PREREQUISITE",
      command: process.execPath,
      args: ["scripts/check-gate-03-final-prerequisite.mjs"],
    },
    {
      id: "PUBLIC_LIBRARY_EXPANSION_FIXTURE_CONTRACT",
      command: process.execPath,
      args: ["--test", "scripts/task-0504-fixture-contract.test.mjs"],
    },
    {
      id: "API_TEST",
      command: "corepack",
      args: ["pnpm", "--filter", "api", "test", "--", "--runInBand"],
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
      env: { NODE_ENV: "production" },
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
      id: "WEB_BUILD_NO_PWA_WRITE",
      command: "corepack",
      args: ["pnpm", "--filter", "web-pwa", "build"],
      env: { NODE_ENV: "production", READING_WORLD_VERIFY_NO_PWA_WRITE: "1" },
    },
    {
      id: "PUBLIC_PRIVATE_BOUNDARY_CONTRACT",
      command: process.execPath,
      args: ["scripts/check-public-library-boundary.mjs"],
    },
    {
      id: "TASK_0504_RUN_CONTRACT",
      command: process.execPath,
      args: [
        "--test",
        "scripts/task-0504-expansion-run.test.mjs",
        "scripts/task-0504-fixture-contract.test.mjs",
        "scripts/verify-public-library-expansion-contract.test.mjs",
      ],
    },
    {
      id: "TASK_0504_PUBLIC_LIBRARY_LIVE",
      command: process.execPath,
      args: ["scripts/run-task-0504-public-library.mjs"],
      env: { CI: "1", PLAYWRIGHT_BROWSER_CHANNEL: "chrome" },
    },
  ];
}

const args = parseArguments(process.argv.slice(2));
const initial = probe("git", [
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
]);
if (initial.exitCode !== 0 || initial.stdout) {
  throw new Error("TASK0504_FORMAL_VERIFICATION_REQUIRES_CLEAN_WORKTREE");
}
const outputPath = resolve(repoRoot, args.output);
const recordsPath = outputPath.slice(0, -5) + ".records";
const recordsRelative = relative(repoRoot, recordsPath);
const archivedPreviousReport = archiveExisting(
  outputPath,
  recordsPath,
  recordsRelative,
);
mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(recordsPath, { recursive: true });
const results = [];
const startedAt = new Date().toISOString();

for (const check of checks()) {
  process.stdout.write(
    `[${check.id}] ${check.command} ${check.args.join(" ")}\n`,
  );
  const trackedBefore = trackedFingerprint();
  const untrackedBefore = untrackedOutsideEvidence();
  const result = run(check.command, check.args, { env: check.env });
  const trackedAfter = trackedFingerprint();
  const untrackedAfter = untrackedOutsideEvidence();
  const trackedWorktreeMutated = trackedBefore.sha256 !== trackedAfter.sha256;
  const archivedHistoryMutated = !archiveManifestValid(archivedPreviousReport);
  const unexpectedUntrackedMutation =
    archivedHistoryMutated ||
    JSON.stringify(untrackedBefore) !== JSON.stringify(untrackedAfter);
  const recordPath = resolve(recordsPath, `${check.id.toLowerCase()}.txt`);
  const log = [
    `$ ${sanitize(result.command)}`,
    `started_at=${result.startedAt}`,
    `ended_at=${result.endedAt}`,
    `duration_ms=${result.durationMs}`,
    `exit_code=${result.exitCode}`,
    `tracked_worktree_mutated=${trackedWorktreeMutated}`,
    `unexpected_untracked_mutation=${unexpectedUntrackedMutation}`,
    `archived_history_mutated=${archivedHistoryMutated}`,
    `tracked_status_before=${JSON.stringify(trackedBefore.status)}`,
    `tracked_status_after=${JSON.stringify(trackedAfter.status)}`,
    `untracked_outside_before=${JSON.stringify(untrackedBefore)}`,
    `untracked_outside_after=${JSON.stringify(untrackedAfter)}`,
    result.signal ? `signal=${result.signal}` : "",
    "",
    "[stdout]",
    sanitize(result.stdout),
    "",
    "[stderr]",
    sanitize(result.stderr),
  ]
    .filter((line) => line !== "")
    .join("\n");
  writeFileSync(recordPath, `${log}\n`);
  results.push({
    id: check.id,
    command: sanitize(result.command),
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    exitCode:
      unexpectedUntrackedMutation && result.exitCode === 0
        ? 1
        : result.exitCode,
    signal: result.signal,
    environment: Object.fromEntries(
      Object.keys(check.env ?? {}).map((key) => [key, check.env[key]]),
    ),
    trackedWorktreeMutated,
    unexpectedUntrackedMutation,
    archivedHistoryMutated,
    trackedStatusBefore: trackedBefore.status,
    trackedStatusAfter: trackedAfter.status,
    logPath: relative(repoRoot, recordPath),
    logSha256: sha256(recordPath),
  });
  process.stdout.write(`[${check.id}] exit=${results.at(-1).exitCode}\n`);
}

const recordFailures = results.filter(
  (check, index) =>
    check.id !== TASK_0504_CHECK_RECORDS[index]?.id ||
    !existsSync(resolve(repoRoot, check.logPath)) ||
    sha256(resolve(repoRoot, check.logPath)) !== check.logSha256,
);
const recordVerification = {
  valid: recordFailures.length === 0,
  checkedCount: results.length,
  failures: recordFailures.map((check) => check.id),
};
const live = results.find(
  (check) => check.id === "TASK_0504_PUBLIC_LIBRARY_LIVE",
);
let observation;
try {
  observation = parseTask0504RunnerObservation(
    readFileSync(resolve(repoRoot, live.logPath), "utf8"),
  );
} catch (error) {
  observation = {
    controlRevision: "REV-0003",
    task: "TASK-0504",
    prerequisiteValid: false,
    listExitCode: 1,
    listedTestCount: 0,
    apiBuildExitCode: 1,
    webBuildExitCode: 1,
    apiServiceReady: false,
    webServiceReady: false,
    testExitCode: live?.exitCode ?? 1,
    apiPortFreeBefore: false,
    webPortFreeBefore: false,
    apiPortFreeAfter: false,
    webPortFreeAfter: false,
    orphanProcessCount: 1,
    pathIsolationValid: false,
    isolatedRootCreated: false,
    cleanupComplete: false,
    productStageMarkerCount: 0,
    productStageEntered: false,
    evidenceRecordsValid: false,
    observationError: error instanceof Error ? error.message : String(error),
  };
}
const liveClassification = classifyTask0504ExpansionRun({
  ...observation,
  evidenceRecordsValid: recordVerification.valid,
});
const infrastructureCheckIds = new Set([
  "PATCH_WHITESPACE",
  "GATE_03_FINAL_PREREQUISITE",
  "PUBLIC_LIBRARY_EXPANSION_FIXTURE_CONTRACT",
  "API_BUILD",
  "WEB_BUILD_NO_PWA_WRITE",
  "TASK_0504_RUN_CONTRACT",
]);
const mutatedChecks = results.filter(
  (check) =>
    check.trackedWorktreeMutated ||
    check.unexpectedUntrackedMutation ||
    check.archivedHistoryMutated,
);
const failedInfrastructureChecks = results.filter(
  (check) => infrastructureCheckIds.has(check.id) && check.exitCode !== 0,
);
const failedProductChecks = results.filter(
  (check) =>
    check.id !== "TASK_0504_PUBLIC_LIBRARY_LIVE" &&
    !infrastructureCheckIds.has(check.id) &&
    check.exitCode !== 0,
);
const liveCheckUnreliable =
  !live ||
  !task0504LiveResultConsistent({
    classification: liveClassification.classification,
    exitCode: live.exitCode,
    signal: live.signal,
  });
let gateClassification = liveClassification;
if (
  !recordVerification.valid ||
  mutatedChecks.length > 0 ||
  failedInfrastructureChecks.length > 0 ||
  liveCheckUnreliable ||
  !archiveManifestValid(archivedPreviousReport)
) {
  gateClassification = {
    classification: "VALIDATOR_INDETERMINATE",
    reasons: [
      ...(!recordVerification.valid ? ["EVIDENCE_RECORDS_INVALID"] : []),
      ...mutatedChecks.map((check) => `CHECK_MUTATION_${check.id}`),
      ...failedInfrastructureChecks.map(
        (check) => `CHECK_EXIT_${check.id}_${check.exitCode}`,
      ),
      ...(liveCheckUnreliable
        ? [
            `LIVE_CHECK_UNRELIABLE_${live?.exitCode ?? "MISSING"}_${live?.signal ?? "NO_SIGNAL"}`,
          ]
        : []),
      ...(!archiveManifestValid(archivedPreviousReport)
        ? ["ARCHIVED_HISTORY_MUTATED"]
        : []),
    ],
  };
} else if (failedProductChecks.length > 0) {
  gateClassification = {
    classification: "TASK0504_FAILURE",
    reasons: failedProductChecks.map(
      (check) => `CHECK_EXIT_${check.id}_${check.exitCode}`,
    ),
  };
}
const repositoryHead = probe("git", ["rev-parse", "HEAD"]);
const repositoryBranch = probe("git", ["branch", "--show-current"]);
const allChecksPassing = results.every(
  (check) =>
    check.exitCode === 0 &&
    !check.trackedWorktreeMutated &&
    !check.unexpectedUntrackedMutation,
);
const report = {
  schemaVersion: 1,
  goalId: "GOAL-READING-WORLD-V1",
  controlRevision: "REV-0003",
  task: "TASK-0504",
  evidenceId: "EVID-62",
  role: "ATTEMPT",
  generatedAt: new Date().toISOString(),
  startedAt,
  repository: {
    root: ".",
    head: repositoryHead.stdout,
    branch: repositoryBranch.stdout,
  },
  archivedPreviousReport,
  checks: results,
  summary: {
    passed: allChecksPassing && gateClassification.classification === "PASS",
    passedCount: results.filter((check) => check.exitCode === 0).length,
    failedCount: results.filter((check) => check.exitCode !== 0).length,
    trackedMutationCount: results.filter(
      (check) => check.trackedWorktreeMutated,
    ).length,
    unexpectedUntrackedMutationCount: results.filter(
      (check) => check.unexpectedUntrackedMutation,
    ).length,
  },
  task0504Gate: { ...gateClassification, observation, recordVerification },
  boundary:
    "仅证明 TASK-0504 公共藏书扩张候选的本轮 ATTEMPT；不证明 EVID-56/58 FINAL、TASK-0505/0506、PHASE-05 整体、VPS 部署或 Goal complete。",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `report=${args.output}\nsha256=${sha256(outputPath)}\nclassification=${gateClassification.classification}\n`,
);
process.exitCode = report.summary.passed ? 0 : 1;
