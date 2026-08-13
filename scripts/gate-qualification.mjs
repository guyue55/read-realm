import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

function exactExperimentPattern(experiment) {
  return new RegExp(`›\\s+${experiment.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:\\s|$)`);
}

export function countListedExperimentTests(output, experiment) {
  const pattern = exactExperimentPattern(experiment);
  return String(output)
    .split(/\r?\n/)
    .filter((line) => pattern.test(line)).length;
}

export function directoryFingerprint(directory) {
  const hash = createHash("sha256");
  const root = resolve(directory);

  function visit(current) {
    for (const name of readdirSync(current).sort()) {
      const path = resolve(current, name);
      const stats = lstatSync(path);
      const relativePath = relative(root, path).split("\\").join("/");
      if (stats.isDirectory()) {
        hash.update(`directory\0${relativePath}\0`);
        visit(path);
      } else if (stats.isFile()) {
        hash.update(`file\0${relativePath}\0`);
        hash.update(readFileSync(path));
        hash.update("\0");
      } else if (stats.isSymbolicLink()) {
        throw new Error(`QUALIFICATION_SYMLINK_UNSUPPORTED:${relativePath}`);
      }
    }
  }

  visit(root);
  return hash.digest("hex");
}

export function parseQualificationObservation(output) {
  const prefix = "QUALIFICATION_OBSERVATION=";
  const lines = String(output)
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) {
    throw new Error(`QUALIFICATION_OBSERVATION_COUNT_${lines.length}`);
  }
  return JSON.parse(lines[0].slice(prefix.length));
}

export function normalizeMachinePaths(value, homeDirectory) {
  return String(value).split(homeDirectory).join("$HOME");
}

export function qualificationStrategy(experiment) {
  if (experiment === "EXP-08") {
    return {
      stableRender: false,
      isolatedPwaDestination: false,
      explicitProcessGroup: true,
    };
  }
  if (experiment === "EXP-12") {
    return {
      stableRender: true,
      isolatedPwaDestination: true,
      explicitProcessGroup: true,
    };
  }
  throw new Error(`QUALIFICATION_STRATEGY_NOT_IMPLEMENTED:${experiment}`);
}

export function pwaDestinationFor(webRoot, temporaryDirectory) {
  const destination = relative(resolve(webRoot), resolve(temporaryDirectory))
    .split("\\")
    .join("/");
  if (!destination || destination.startsWith("/") || resolve(webRoot, destination) !== resolve(temporaryDirectory)) {
    throw new Error("QUALIFICATION_PWA_DESTINATION_INVALID");
  }
  return destination;
}

export function buildQualificationFinal({
  attempt,
  attemptPath,
  attemptSha256,
  evidenceCommit,
  generatedAt,
}) {
  const observation = attempt?.qualification?.observation;
  const sourcePassing =
    attempt?.goalId === "GOAL-READING-WORLD-V1" &&
    attempt?.controlRevision === "REV-0002" &&
    attempt?.qualificationExperiment === "EXP-12" &&
    attempt?.qualification?.classification === "QUALIFIED" &&
    attempt?.qualification?.recordVerification?.valid === true &&
    attempt?.qualification?.recordVerification?.checkedCount === 3 &&
    observation?.listExitCode === 0 &&
    observation?.listedTestCount === 1 &&
    observation?.buildExitCode === 0 &&
    observation?.serviceReady === true &&
    observation?.testExitCode === 0 &&
    observation?.targetCount === 1 &&
    observation?.portFreeBefore === true &&
    observation?.portFreeAfter === true &&
    observation?.orphanProcessCount === 0 &&
    observation?.publicRestored === true &&
    observation?.strategy?.stableRender === true &&
    observation?.strategy?.isolatedPwaDestination === true &&
    observation?.strategy?.explicitProcessGroup === true &&
    attempt?.summary?.passed === true &&
    attempt?.summary?.failedCount === 0 &&
    attempt?.summary?.trackedMutationCount === 0;
  if (!sourcePassing) {
    throw new Error("QUALIFICATION_FINAL_SOURCE_NOT_PASSING");
  }
  if (!/^[a-f0-9]{64}$/.test(attemptSha256)) {
    throw new Error("QUALIFICATION_FINAL_ATTEMPT_SHA_INVALID");
  }
  if (!/^[a-f0-9]{40,64}$/.test(evidenceCommit)) {
    throw new Error("QUALIFICATION_FINAL_EVIDENCE_COMMIT_INVALID");
  }

  return {
    schemaVersion: 1,
    goalId: attempt.goalId,
    controlRevision: attempt.controlRevision,
    gateId: "GATE-00",
    result: "PASS",
    generatedAt,
    evidenceCommit,
    sourceAttempt: {
      path: attemptPath,
      sha256: attemptSha256,
      implementationHead: attempt.repository.head,
      qualificationExperiment: attempt.qualificationExperiment,
    },
    verifiedOutcomes: {
      listedTestCount: observation.listedTestCount,
      targetCount: observation.targetCount,
      buildExitCode: observation.buildExitCode,
      testExitCode: observation.testExitCode,
      serviceReady: observation.serviceReady,
      portFreeBefore: observation.portFreeBefore,
      portFreeAfter: observation.portFreeAfter,
      orphanProcessCount: observation.orphanProcessCount,
      publicRestored: observation.publicRestored,
      strategy: observation.strategy,
      recordVerification: attempt.qualification.recordVerification,
    },
    boundary:
      "仅证明 GATE-01 验证基础设施可判定、可补偿且证据可复算；不证明 GATE-01、PHASE-02 或 Goal 完成。",
  };
}

export function classifyGateRun(run) {
  const reasons = [];
  if (run.listExitCode !== 0) reasons.push(`LIST_EXIT_${run.listExitCode}`);
  if (run.buildExitCode !== 0) reasons.push(`BUILD_EXIT_${run.buildExitCode}`);
  if (!run.serviceReady) reasons.push("SERVICE_NOT_READY");
  if (run.listedTestCount !== 1) reasons.push(`LISTED_TEST_COUNT_${run.listedTestCount}`);
  if (run.targetCount !== 1) reasons.push(`TARGET_COUNT_${run.targetCount}`);
  if (!run.portFreeBefore) reasons.push("PORT_BUSY_BEFORE");
  if (!run.portFreeAfter) reasons.push("PORT_BUSY_AFTER");
  if (run.orphanProcessCount !== 0) {
    reasons.push(`ORPHAN_PROCESS_COUNT_${run.orphanProcessCount}`);
  }
  if (!run.publicRestored) reasons.push("PUBLIC_NOT_RESTORED");
  if (!run.evidenceRecordsValid) reasons.push("EVIDENCE_RECORDS_INVALID");

  if (reasons.length > 0) {
    return { classification: "VALIDATOR_INDETERMINATE", reasons };
  }
  if (run.testExitCode !== 0) {
    return {
      classification: "PRODUCT_FAILURE",
      reasons: [`TEST_EXIT_${run.testExitCode}`],
    };
  }
  return { classification: "QUALIFIED", reasons: [] };
}

export function verifyEvidenceRecords(report, readRecord) {
  const failures = [];
  const seenPaths = new Set();
  let checkedCount = 0;

  for (const check of report?.checks ?? []) {
    const path = check?.logPath;
    if (!path || seenPaths.has(path)) {
      failures.push(path ? `DUPLICATE_PATH:${path}` : "MISSING_PATH");
      continue;
    }
    seenPaths.add(path);
    const bytes = readRecord(path);
    if (!bytes) {
      failures.push(`MISSING_RECORD:${path}`);
      continue;
    }
    checkedCount += 1;
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== check.logSha256) failures.push(`SHA_MISMATCH:${path}`);
  }

  if (checkedCount === 0) failures.push("NO_RECORDS");
  return { valid: failures.length === 0, checkedCount, failures };
}
