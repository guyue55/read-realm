export function classifyImportCapacityRun(observation) {
  const reasons = [];
  if (!observation.portFreeBefore) reasons.push("PORT_BUSY_BEFORE");
  if (observation.generateExitCode !== 0) reasons.push(`GENERATE_EXIT_${observation.generateExitCode}`);
  if (observation.verifyExitCode !== 0) reasons.push(`VERIFY_EXIT_${observation.verifyExitCode}`);
  if (observation.listExitCode !== 0) reasons.push(`LIST_EXIT_${observation.listExitCode}`);
  if (observation.listedTestCount !== 2) reasons.push(`LISTED_TEST_COUNT_${observation.listedTestCount}`);
  if (observation.testExitCode !== 0) reasons.push(`TEST_EXIT_${observation.testExitCode}`);
  if (!observation.cleaned) reasons.push("FIXTURE_NOT_CLEANED");
  if (!observation.portFreeAfter) reasons.push("PORT_BUSY_AFTER");
  return { classification: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}
