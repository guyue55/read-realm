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

export function buildProductGateFinal({
  attempt,
  attemptPath,
  attemptSha256,
  evidenceCommit,
  gate00FinalSha256,
  generatedAt,
}) {
  const observation = attempt?.productGate?.observation;
  const strategy = observation?.strategy;
  const sourcePassing =
    attempt?.goalId === "GOAL-READING-WORLD-V1" &&
    attempt?.controlRevision === "REV-0002" &&
    attempt?.experiment === "EXP-09" &&
    attempt?.summary?.passed === true &&
    attempt?.summary?.failedCount === 0 &&
    attempt?.summary?.trackedMutationCount === 0 &&
    attempt?.productGate?.classification === "PASS" &&
    attempt?.productGate?.recordVerification?.valid === true &&
    attempt?.productGate?.recordVerification?.checkedCount === 7 &&
    observation?.prerequisiteValid === true &&
    observation?.listExitCode === 0 &&
    observation?.listedTestCount === 1 &&
    observation?.buildExitCode === 0 &&
    observation?.serviceReady === true &&
    observation?.testExitCode === 0 &&
    observation?.portFreeBefore === true &&
    observation?.portFreeAfter === true &&
    observation?.orphanProcessCount === 0 &&
    observation?.publicRestored === true &&
    strategy?.fixture === "fixed-two-chapter.epub.base64" &&
    strategy?.importMechanism === "compatible-storage" &&
    strategy?.locator === "book-id" &&
    strategy?.isolatedPwaDestination === true &&
    strategy?.serveGeneratedPwaDuringRun === true &&
    strategy?.explicitProcessGroup === true;
  if (!sourcePassing) throw new Error("PRODUCT_GATE_FINAL_SOURCE_NOT_PASSING");
  if (!/^[a-f0-9]{64}$/.test(attemptSha256)) {
    throw new Error("PRODUCT_GATE_FINAL_ATTEMPT_SHA_INVALID");
  }
  if (!/^[a-f0-9]{40,64}$/.test(evidenceCommit)) {
    throw new Error("PRODUCT_GATE_FINAL_EVIDENCE_COMMIT_INVALID");
  }
  if (!/^[a-f0-9]{64}$/.test(gate00FinalSha256)) {
    throw new Error("PRODUCT_GATE_FINAL_GATE_00_SHA_INVALID");
  }

  return {
    schemaVersion: 1,
    goalId: attempt.goalId,
    controlRevision: attempt.controlRevision,
    gateId: "GATE-01",
    result: "PASS",
    generatedAt,
    evidenceCommit,
    prerequisite: { gateId: "GATE-00", sha256: gate00FinalSha256, result: "PASS" },
    sourceAttempt: {
      path: attemptPath,
      sha256: attemptSha256,
      implementationHead: attempt.repository.head,
      experiment: attempt.experiment,
    },
    verifiedOutcomes: {
      inputAndPreview: true,
      libraryAndReading: true,
      progressPersistedWithinOneSecond: true,
      refreshResume: true,
      trueOffline: true,
      minimalBackup: true,
      isolatedRestore: true,
      uniqueBookIdLocator: true,
      listedTestCount: observation.listedTestCount,
      portFreeBefore: observation.portFreeBefore,
      portFreeAfter: observation.portFreeAfter,
      orphanProcessCount: observation.orphanProcessCount,
      publicRestored: observation.publicRestored,
      strategy,
      recordVerification: attempt.productGate.recordVerification,
    },
    boundary:
      "仅证明 PHASE-02 的早期本地纵向薄切片 GATE-01；不证明后续导入扩张、阅读体验终局、同步、PHASE-03~09 或 Goal 完成。",
  };
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
