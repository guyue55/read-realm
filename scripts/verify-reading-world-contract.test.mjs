import assert from "node:assert/strict";
import test from "node:test";

import { checksFor } from "./verify-reading-world.mjs";

test("formal verifier routes PHASE-05 EXP-14 to the public-library contract", () => {
  const checks = checksFor("05", "EXP-14", undefined, undefined);
  assert.equal(checks.at(-1)?.id, "GATE_03_PUBLIC_LIBRARY_LIVE");
  assert.equal(
    checks.some(({ id }) => id === "GATE_01_VERTICAL_SLICE"),
    false,
  );
});

test("formal verifier rejects unreleased PHASE-05 experiments and other gate parameters", () => {
  assert.throws(
    () => checksFor("05", "EXP-15", undefined, undefined),
    /PHASE-05 REV-0003 当前只放行 EXP-14/,
  );
  assert.throws(
    () => checksFor("05", "EXP-14", "EXP-12", undefined),
    /PHASE-05 只接受 --experiment EXP-14/,
  );
});
