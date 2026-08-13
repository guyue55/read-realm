export function parseMigrationGateObservation(output) {
  const prefix = "MIGRATION_GATE_OBSERVATION=";
  const lines = String(output)
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) {
    throw new Error(`MIGRATION_GATE_OBSERVATION_COUNT_${lines.length}`);
  }
  return JSON.parse(lines[0].slice(prefix.length));
}

export function classifyMigrationGateRun(run) {
  const reasons = [];
  if (!run.prerequisiteValid) reasons.push("PREREQUISITE_INVALID");
  if (run.listExitCode !== 0) reasons.push(`LIST_EXIT_${run.listExitCode}`);
  if (run.listedTestCount !== 1) reasons.push(`LISTED_TEST_COUNT_${run.listedTestCount}`);
  if (run.buildExitCode !== 0) reasons.push(`BUILD_EXIT_${run.buildExitCode}`);
  if (!run.serviceReady) reasons.push("SERVICE_NOT_READY");
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
    return { classification: "MIGRATION_FAILURE", reasons: [`TEST_EXIT_${run.testExitCode}`] };
  }
  return { classification: "PASS", reasons: [] };
}
