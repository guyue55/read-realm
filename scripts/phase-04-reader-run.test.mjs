import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPhase04ReaderRun,
  parsePhase04ReaderSamples,
} from "./phase-04-reader-run.mjs";

const samples = [
  { scenario: "semantic-layout", semanticAnchorVisible: true, stabilizationMs: 420 },
  { scenario: "pagination-persistence", persistenceMs: 480, semanticAnchorVisible: true },
  { scenario: "bounded-scroll", maxChapterDom: 3, semanticAnchorVisible: true },
];

const reliable = {
  listExitCode: 0,
  listedTestCount: 12,
  serviceReady: true,
  testExitCode: 0,
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
    listedTestCount: 11,
    testExitCode: 1,
    samples: [...samples, samples[0]],
  }).classification, "FAIL");
});
