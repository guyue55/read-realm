const REQUIRED_SCENARIOS = [
  "semantic-layout",
  "pagination-persistence",
  "bounded-scroll",
  "lifecycle-offline",
  "bookmark-restore",
  "mobile-touch",
  "native-background",
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
  if (observation.listedTestCount !== 15) reasons.push(`LISTED_TEST_COUNT_${observation.listedTestCount}`);
  if (observation.listedTestCountsByProject?.desktop !== 14) {
    reasons.push(`DESKTOP_TEST_COUNT_${observation.listedTestCountsByProject?.desktop ?? 0}`);
  }
  if (observation.listedTestCountsByProject?.["mobile-touch"] !== 1) {
    reasons.push(`MOBILE_TOUCH_TEST_COUNT_${observation.listedTestCountsByProject?.["mobile-touch"] ?? 0}`);
  }
  if (observation.listedTestIdsUnique !== true) reasons.push("LISTED_TEST_IDS_NOT_UNIQUE");
  if (!observation.serviceReady) reasons.push("SERVICE_NOT_READY");
  if (observation.testExitCode !== 0) reasons.push(`TEST_EXIT_${observation.testExitCode}`);
  if (observation.nativeBackgroundExitCode !== 0) {
    reasons.push(`NATIVE_BACKGROUND_EXIT_${observation.nativeBackgroundExitCode}`);
  }
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
  const mobileTouch = byScenario.get("mobile-touch")?.[0];
  if (mobileTouch) {
    if (mobileTouch.projectName !== "mobile-touch") reasons.push("TOUCH_PROJECT_INVALID");
    if (mobileTouch.isMobile !== true) reasons.push("MOBILE_CONTEXT_NOT_EMULATED");
    if (mobileTouch.hasTouch !== true) reasons.push("TOUCH_CONTEXT_NOT_EMULATED");
    if (!Number.isInteger(mobileTouch.maxTouchPoints) || mobileTouch.maxTouchPoints < 1) {
      reasons.push("TOUCH_POINTS_UNAVAILABLE");
    }
    if (mobileTouch.coarsePointer !== true) reasons.push("COARSE_POINTER_NOT_OBSERVED");
    if (mobileTouch.trustedTouchObserved !== true) reasons.push("TRUSTED_TOUCH_NOT_OBSERVED");
    if (mobileTouch.paginationSwipeObserved !== true) reasons.push("TOUCH_PAGINATION_SWIPE_NOT_OBSERVED");
    if (mobileTouch.drawerTapObserved !== true) reasons.push("TOUCH_DRAWER_TAP_NOT_OBSERVED");
    if (mobileTouch.progressDragObserved !== true) reasons.push("TOUCH_PROGRESS_DRAG_NOT_OBSERVED");
    if (mobileTouch.chapterBoundaryObserved !== true) reasons.push("TOUCH_CHAPTER_BOUNDARY_NOT_OBSERVED");
  }
  const nativeBackground = byScenario.get("native-background")?.[0];
  if (nativeBackground) {
    if (nativeBackground.platform !== "darwin") reasons.push("NATIVE_BACKGROUND_PLATFORM_INVALID");
    if (nativeBackground.detachedDuringBackground !== true) reasons.push("BACKGROUND_NOT_DETACHED");
    if (JSON.stringify(nativeBackground.windowStateSequence)
      !== JSON.stringify(["normal", "minimized", "normal"])) {
      reasons.push("WINDOW_STATE_SEQUENCE_INVALID");
    }
    if (JSON.stringify(nativeBackground.visibilitySequence)
      !== JSON.stringify(["visible", "hidden", "visible"])) {
      reasons.push("VISIBILITY_SEQUENCE_INVALID");
    }
    if (nativeBackground.progressFlushedWhileHidden !== true) {
      reasons.push("BACKGROUND_PROGRESS_NOT_FLUSHED");
    }
    if (nativeBackground.semanticAnchorVisible !== true) {
      reasons.push("BACKGROUND_ANCHOR_NOT_VISIBLE");
    }
    if (!Number.isFinite(nativeBackground.restoreMs) || nativeBackground.restoreMs > 2000) {
      reasons.push(`BACKGROUND_RESTORE_${nativeBackground.restoreMs}MS`);
    }
  }
  return { classification: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

export const phase04ReaderScenarios = Object.freeze([...REQUIRED_SCENARIOS]);
