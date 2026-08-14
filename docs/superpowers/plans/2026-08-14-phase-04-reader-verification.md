# PHASE-04 Reader Verification Implementation Plan

> **Execution:** follow the existing REV-0003 goal control and complete each item in place. This plan may produce candidate reports, but it must not mark PHASE-04 or the Goal complete before independent recomputation.

**Goal:** Turn TASK-0404 into a reproducible reader-quality gate covering persistence, semantic recovery, bounded rendering, touch safety, immersive layout, and phase-local responsiveness observations.

**Architecture:** Keep product behavior tests in Playwright with isolated IndexedDB fixtures. Emit one machine-readable sample line per live journey, validate those samples in a small Node contract, and let `verify-reading-world.mjs --phase 04` bind unit, build, E2E, record hashes, REV-0003, and the clean implementation HEAD into one report. PHASE-04 responsiveness samples detect obvious reader freezes only; PHASE-08 remains the sole owner of Web Vitals thresholds and cross-environment p75 claims.

## Frozen boundaries

- Run a fresh non-writing production build, then serve that exact build through an isolated PHASE-04 Playwright configuration. Require every owned port free before and after the dedicated runner, terminate its process group, and restore generated public assets.
- Use a unique book ID and clear only the test browser profile's IndexedDB stores. Never read or mutate real user data.
- A progress interaction passes only when the corresponding IndexedDB semantic anchor is durable within 1,000ms.
- Pagination recovery passes only when the exact saved chapter and paragraph return and the saved character offset is contained by the visible page after reload, viewport change, font change, and page-mode round trip.
- Continuous reading passes only while the active DOM chapter window stays ordered, contains the active chapter, and never exceeds three chapters.
- Touch targets are at least 44×44px in portrait and landscape; hidden chrome must return the canvas to immersive insets and remain unfocusable. Mobile sampling uses `isMobile` and `hasTouch`, not viewport size alone.
- Record phase-local interaction stabilization and long-task observations without claiming LCP, INP, CLS, device-class p75, or PHASE-08 completion.
- A formal report is generated only from a clean product commit. A prior failed report is archived, not overwritten.

## Task 1: Contract and RED tests

- Add `scripts/phase-04-reader-run.mjs` with pure marker parsing and classification helpers.
- Add Node tests proving missing/duplicate samples, persistence over 1,000ms, semantic drift, unbounded DOM, busy ports, and E2E failure cannot pass.
- Add a verifier contract test proving PHASE-04 resolves to REV-0003 and an explicit fixed check list.
- Run the focused Node tests and retain the expected RED before implementation.

## Task 2: Isolated live sampler

- Add `apps/web-pwa/e2e/reader-phase-04.spec.ts` with isolated scroll and pagination fixtures.
- Sample scheduled progress durability, lifecycle flush, reload, simulated network loss after shell load, viewport/font/page-mode changes, exact semantic containment, bounded chapter DOM, and steady-state interaction timing.
- Emit exactly one `PHASE04_READER_SAMPLE=<json>` line for each registered scenario.
- Add a runner that first enumerates the exact tests, checks owned ports, runs system Chrome, parses/classifies all samples, and emits one `PHASE04_READER_OBSERVATION=<json>` line.

## Task 3: PHASE-04 verifier

- Add PHASE-04 checks for patch whitespace, reader-core, gesture-core, storage-core, Web unit tests, Web lint/typecheck, non-writing production build, the complete reader-experience E2E, the dedicated live sampler, and a phase artifact contract.
- Set PHASE-04 `controlRevision` to REV-0003 and attach the parsed reader observation to the report.
- Reject formal PASS if records do not hash, any check mutates tracked source, the live runner is indeterminate/failing, or the sample registry is incomplete.

## Task 4: Candidate verification and repair

- Run unit/contract checks, then focused Playwright. Classify infrastructure failures separately from product failures.
- Repair product defects with a failing reproduction before implementation; rerun the smallest test, then reader suites, lint/typecheck, and build.
- Ensure `apps/web-pwa/public/sw.js`, ports, processes, screenshots, and temporary browser data are restored/clean.

## Task 5: Reports, review, and evidence

- From a clean implementation commit, run the sole PHASE-04 command and preserve any failed attempt under `reports/history/`.
- Write `reports/phase-04-reader-ux.md` with device/viewport, cold/warm procedure, samples, five explicit human scores (舒适、低干扰、状态清晰、恢复可信、单手易用), observations, and boundaries.
- Write `reviews/phase-04-reader.md`, then request an independent read-only recomputation against the locked report/revision/HEAD.
- Generate EVID-02 and EVID-07 only through a clean-only finalizer that verifies report fields, record SHA-256 values, independent PASS review, and distinct required checks/outcomes.
- Update evidence index, phase status, and execution ledger only after the independent review passes. Do not enter PHASE-05 earlier.
