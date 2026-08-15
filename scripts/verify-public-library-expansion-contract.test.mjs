import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verifierPath = resolve(
  repoRoot,
  "scripts/verify-public-library-expansion.mjs",
);
const source = readFileSync(verifierPath, "utf8");

test("rejects an invalid command before the clean-worktree or evidence write gates", () => {
  const result = spawnSync(
    process.execPath,
    [verifierPath, "--task", "TASK-0505", "--output", "/tmp/forbidden.json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TASK0504_FORMAL_COMMAND_INVALID/u);
});

test("freezes exact task, output, fourteen checks, and ATTEMPT-only boundary", () => {
  assert.match(
    source,
    /docs\/goals\/reading-world-v1\/evidence\/artifacts\/task-0504-expansion-attempt-01\.json/u,
  );
  for (const id of [
    "PATCH_WHITESPACE",
    "GATE_03_FINAL_PREREQUISITE",
    "PUBLIC_LIBRARY_EXPANSION_FIXTURE_CONTRACT",
    "API_TEST",
    "API_LINT_NON_FIXING",
    "API_TYPECHECK",
    "API_BUILD",
    "WEB_TEST",
    "WEB_LINT",
    "WEB_TYPECHECK",
    "WEB_BUILD_NO_PWA_WRITE",
    "PUBLIC_PRIVATE_BOUNDARY_CONTRACT",
    "TASK_0504_RUN_CONTRACT",
    "TASK_0504_PUBLIC_LIBRARY_LIVE",
  ]) {
    assert.match(source, new RegExp(`id: "${id}"`, "u"));
  }
  assert.match(source, /role: "ATTEMPT"/u);
  assert.match(source, /不证明 EVID-56\/58 FINAL/u);
});

test("requires a clean worktree and validates an existing report-record pair before archive", () => {
  assert.match(source, /TASK0504_FORMAL_VERIFICATION_REQUIRES_CLEAN_WORKTREE/u);
  assert.match(source, /TASK0504_EXISTING_EVIDENCE_PAIR_INCOMPLETE/u);
  assert.match(source, /validateTask0504EvidenceShape/u);
  assert.match(source, /TASK0504_EXISTING_RECORD_INVALID/u);
  assert.match(source, /TASK0504_EXISTING_RECORD_TREE_INVALID/u);
  assert.match(source, /TASK0504_ARCHIVE_CANONICAL_MISMATCH/u);
  assert.match(source, /LIVE_CHECK_UNRELIABLE_/u);
});
