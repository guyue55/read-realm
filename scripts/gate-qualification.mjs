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
