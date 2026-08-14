const REQUIRED_SCENARIOS = [
  "semantic-layout",
  "pagination-persistence",
  "bounded-scroll",
  "lifecycle-offline",
  "bookmark-restore",
];

export function parsePhase04ReaderSamples(output) {
  return String(output)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("PHASE04_READER_SAMPLE="))
    .map((line) => {
      try {
        return JSON.parse(line.slice("PHASE04_READER_SAMPLE=".length));
      } catch {
        throw new Error("PHASE04_READER_SAMPLE_INVALID");
      }
    });
}

export function classifyPhase04ReaderRun(observation) {
  const reasons = [];
  if (!observation.portFreeBefore) reasons.push("PORT_BUSY_BEFORE");
  if (observation.listExitCode !== 0) reasons.push(`LIST_EXIT_${observation.listExitCode}`);
  if (observation.listedTestCount !== 14) reasons.push(`LISTED_TEST_COUNT_${observation.listedTestCount}`);
  if (!observation.serviceReady) reasons.push("SERVICE_NOT_READY");
  if (observation.testExitCode !== 0) reasons.push(`TEST_EXIT_${observation.testExitCode}`);
  if (!observation.portFreeAfter) reasons.push("PORT_BUSY_AFTER");
  if (observation.orphanProcessCount !== 0) {
    reasons.push(`ORPHAN_PROCESS_COUNT_${observation.orphanProcessCount}`);
  }

  const byScenario = new Map();
  for (const sample of observation.samples ?? []) {
    const values = byScenario.get(sample.scenario) ?? [];
    values.push(sample);
    byScenario.set(sample.scenario, values);
  }
  for (const scenario of REQUIRED_SCENARIOS) {
    const values = byScenario.get(scenario) ?? [];
    if (values.length !== 1) reasons.push(`${scenario.toUpperCase().replaceAll("-", "_")}_COUNT_${values.length}`);
  }

  const semantic = byScenario.get("semantic-layout")?.[0];
  if (semantic) {
    if (semantic.semanticAnchorVisible !== true) reasons.push("SEMANTIC_LAYOUT_NOT_VISIBLE");
    if (semantic.longTaskSupported !== true) reasons.push("LONGTASK_OBSERVER_UNAVAILABLE");
    if (!Array.isArray(semantic.longTaskDurationsMs)
      || semantic.longTaskDurationsMs.some((value) => !Number.isFinite(value) || value < 50)) {
      reasons.push("LONGTASK_SAMPLES_INVALID");
    }
    if (!Number.isFinite(semantic.maxLongTaskMs) || semantic.maxLongTaskMs < 0) {
      reasons.push("LONGTASK_MAX_INVALID");
    }
  }
  const persistence = byScenario.get("pagination-persistence")?.[0];
  if (persistence) {
    if (persistence.semanticAnchorVisible !== true) reasons.push("PAGINATION_ANCHOR_NOT_VISIBLE");
    if (!Number.isFinite(persistence.persistenceMs) || persistence.persistenceMs > 1000) {
      reasons.push(`PERSISTENCE_${persistence.persistenceMs}MS`);
    }
  }
  const bounded = byScenario.get("bounded-scroll")?.[0];
  if (bounded) {
    if (bounded.semanticAnchorVisible !== true) reasons.push("SCROLL_ANCHOR_NOT_VISIBLE");
    if (!Number.isFinite(bounded.maxChapterDom) || bounded.maxChapterDom > 3) {
      reasons.push(`CHAPTER_DOM_${bounded.maxChapterDom}`);
    }
  }
  const lifecycle = byScenario.get("lifecycle-offline")?.[0];
  if (lifecycle) {
    if (lifecycle.pagehideRestored !== true) reasons.push("PAGEHIDE_RESTORE_NOT_OBSERVED");
    if (lifecycle.offlineObserved !== true) reasons.push("TRUE_OFFLINE_NOT_OBSERVED");
    if (lifecycle.semanticAnchorVisible !== true) reasons.push("LIFECYCLE_ANCHOR_NOT_VISIBLE");
  }
  const bookmark = byScenario.get("bookmark-restore")?.[0];
  if (bookmark) {
    if (bookmark.persisted !== true) reasons.push("BOOKMARK_NOT_PERSISTED");
    if (bookmark.semanticAnchorVisible !== true) reasons.push("BOOKMARK_ANCHOR_NOT_VISIBLE");
  }
  return { classification: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

export const phase04ReaderScenarios = Object.freeze([...REQUIRED_SCENARIOS]);
