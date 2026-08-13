export function productExperimentStrategy(experiment) {
  if (experiment === "EXP-09") {
    return {
      fixture: "fixed-two-chapter.epub.base64",
      importMechanism: "compatible-storage",
      locator: "book-id",
      isolatedPwaDestination: true,
      serveGeneratedPwaDuringRun: true,
      explicitProcessGroup: true,
    };
  }
  throw new Error(`PRODUCT_EXPERIMENT_NOT_RELEASED:${experiment}`);
}

export function parseProductGateObservation(output) {
  const prefix = "PRODUCT_GATE_OBSERVATION=";
  const lines = String(output)
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) {
    throw new Error(`PRODUCT_GATE_OBSERVATION_COUNT_${lines.length}`);
  }
  return JSON.parse(lines[0].slice(prefix.length));
}

export function validateGate00Final(final, verification) {
  return (
    final?.goalId === "GOAL-READING-WORLD-V1" &&
    final?.controlRevision === "REV-0002" &&
    final?.gateId === "GATE-00" &&
    final?.result === "PASS" &&
    /^[a-f0-9]{40,64}$/.test(final?.evidenceCommit ?? "") &&
    /^[a-f0-9]{64}$/.test(final?.sourceAttempt?.sha256 ?? "") &&
    verification?.actualSha256 === verification?.expectedSha256 &&
    verification?.commitIsAncestor === true
  );
}

export function classifyProductGateRun(run) {
  const reasons = [];
  if (!run.prerequisiteValid) reasons.push("GATE_00_FINAL_INVALID");
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
    return { classification: "PRODUCT_FAILURE", reasons: [`TEST_EXIT_${run.testExitCode}`] };
  }
  return { classification: "PASS", reasons: [] };
}
