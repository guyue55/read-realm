import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPhase04ReaderRun,
  parsePhase04ReaderSamples,
} from "./phase-04-reader-run.mjs";

const samples = [
  {
    scenario: "semantic-layout",
    semanticAnchorVisible: true,
    stabilizationMs: 420,
    longTaskSupported: true,
    longTaskDurationsMs: [54.2],
    maxLongTaskMs: 54.2,
  },
  { scenario: "pagination-persistence", persistenceMs: 480, semanticAnchorVisible: true },
  { scenario: "bounded-scroll", maxChapterDom: 3, semanticAnchorVisible: true },
  { scenario: "lifecycle-offline", pagehideRestored: true, offlineObserved: true, semanticAnchorVisible: true },
  { scenario: "bookmark-restore", persisted: true, semanticAnchorVisible: true },
  {
    scenario: "mobile-touch",
    projectName: "mobile-touch",
    isMobile: true,
    hasTouch: true,
    maxTouchPoints: 1,
    coarsePointer: true,
    trustedTouchObserved: true,
    paginationSwipeObserved: true,
    drawerTapObserved: true,
    progressDragObserved: true,
    chapterBoundaryObserved: true,
  },
  {
    scenario: "native-background",
    platform: "darwin",
    detachedDuringBackground: true,
    windowStateSequence: ["normal", "minimized", "normal"],
    visibilitySequence: ["visible", "hidden", "visible"],
    progressFlushedWhileHidden: true,
    semanticAnchorVisible: true,
    restoreMs: 680,
  },
];

const reliable = {
  listExitCode: 0,
  listedTestCount: 15,
  listedTestCountsByProject: { desktop: 14, "mobile-touch": 1 },
  listedTestIdsUnique: true,
  serviceReady: true,
  testExitCode: 0,
  nativeBackgroundExitCode: 0,
  portFreeBefore: true,
  portFreeAfter: true,
  orphanProcessCount: 0,
  samples,
};

test("parses exactly one JSON line for every registered reader sample", () => {
  const output = samples.map((sample) => (
    `PHASE04_READER_SAMPLE=${JSON.stringify(sample)}`
  )).join("\n");
  assert.deepEqual(parsePhase04ReaderSamples(output), samples);
  assert.throws(
    () => parsePhase04ReaderSamples(`${output}\nPHASE04_READER_SAMPLE={bad}`),
    /PHASE04_READER_SAMPLE_INVALID/,
  );
});

test("passes only a complete reliable reader run", () => {
  assert.deepEqual(classifyPhase04ReaderRun(reliable), {
    classification: "PASS",
    reasons: [],
  });
});

test("rejects slow persistence, semantic drift, unbounded DOM and infrastructure leaks", () => {
  const result = classifyPhase04ReaderRun({
    ...reliable,
    portFreeAfter: false,
    samples: [
      { ...samples[0], semanticAnchorVisible: false },
      { ...samples[1], persistenceMs: 1001 },
      { ...samples[2], maxChapterDom: 4 },
      samples[3],
      samples[4],
      samples[5],
      samples[6],
    ],
  });
  assert.equal(result.classification, "FAIL");
  assert.deepEqual(result.reasons, [
    "PORT_BUSY_AFTER",
    "SEMANTIC_LAYOUT_NOT_VISIBLE",
    "PERSISTENCE_1001MS",
    "CHAPTER_DOM_4",
  ]);
});

test("missing, duplicate or failed live tests cannot pass", () => {
  assert.equal(classifyPhase04ReaderRun({
    ...reliable,
    listedTestCount: 12,
    testExitCode: 1,
    samples: [...samples, samples[0]],
  }).classification, "FAIL");
});

test("rejects viewport-only mobile claims and incomplete touch journeys", () => {
  const result = classifyPhase04ReaderRun({
    ...reliable,
    samples: [
      ...samples.slice(0, 5),
      {
        ...samples[5],
        isMobile: false,
        hasTouch: false,
        trustedTouchObserved: false,
        progressDragObserved: false,
      },
      samples[6],
    ],
  });
  assert.equal(result.classification, "FAIL");
  assert.deepEqual(result.reasons, [
    "MOBILE_CONTEXT_NOT_EMULATED",
    "TOUCH_CONTEXT_NOT_EMULATED",
    "TRUSTED_TOUCH_NOT_OBSERVED",
    "TOUCH_PROGRESS_DRAG_NOT_OBSERVED",
  ]);
});

test("rejects duplicate or misrouted project enumeration", () => {
  const result = classifyPhase04ReaderRun({
    ...reliable,
    listedTestCountsByProject: { desktop: 15, "mobile-touch": 0 },
    listedTestIdsUnique: false,
  });
  assert.equal(result.classification, "FAIL");
  assert.deepEqual(result.reasons, [
    "DESKTOP_TEST_COUNT_15",
    "MOBILE_TOUCH_TEST_COUNT_0",
    "LISTED_TEST_IDS_NOT_UNIQUE",
  ]);
});

test("rejects synthetic or incomplete native background recovery", () => {
  const result = classifyPhase04ReaderRun({
    ...reliable,
    nativeBackgroundExitCode: 1,
    samples: [
      ...samples.slice(0, -1),
      {
        ...samples.at(-1),
        detachedDuringBackground: false,
        visibilitySequence: ["visible", "visible"],
        progressFlushedWhileHidden: false,
        semanticAnchorVisible: false,
        restoreMs: 2001,
      },
    ],
  });
  assert.equal(result.classification, "FAIL");
  assert.deepEqual(result.reasons, [
    "NATIVE_BACKGROUND_EXIT_1",
    "BACKGROUND_NOT_DETACHED",
    "VISIBILITY_SEQUENCE_INVALID",
    "BACKGROUND_PROGRESS_NOT_FLUSHED",
    "BACKGROUND_ANCHOR_NOT_VISIBLE",
    "BACKGROUND_RESTORE_2001MS",
  ]);
});
