#!/usr/bin/env node

import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { classifyImportCapacityRun } from "./import-capacity-run.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(repoRoot, ".tmp/import-capacity/full");
const manifestPath = resolve(fixtureRoot, "manifest.json");

function command(args, env = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function emit(label, result) {
  process.stdout.write(`\n[${label}] exit=${result.status ?? 1}\n`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function portIsFree(port) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolvePromise(false); });
    socket.once("error", () => resolvePromise(true));
    socket.setTimeout(500, () => { socket.destroy(); resolvePromise(true); });
  });
}

function cleanOwnedFixture() {
  if (!existsSync(fixtureRoot)) return { status: 0, stdout: "fixture_absent=true\n", stderr: "" };
  if (!existsSync(manifestPath)) {
    return { status: 1, stdout: "", stderr: "IMPORT_CAPACITY_CLEAN_REFUSED:manifest missing\n" };
  }
  return command([process.execPath, "scripts/generate-import-capacity-fixtures.mjs", "--clean", manifestPath]);
}

const portFreeBefore = (await Promise.all([portIsFree(3100), portIsFree(4100)])).every(Boolean);
let generate = { status: 1, stdout: "", stderr: "not run" };
let verify = { status: 1, stdout: "", stderr: "not run" };
let list = { status: 1, stdout: "", stderr: "not run" };
let testResult = { status: 1, stdout: "", stderr: "not run" };
let cleanup = { status: 1, stdout: "", stderr: "not run" };

try {
  const preclean = cleanOwnedFixture();
  emit("preclean", preclean);
  if (preclean.status !== 0) throw new Error("IMPORT_CAPACITY_PRECLEAN_FAILED");
  generate = command([process.execPath, "scripts/generate-import-capacity-fixtures.mjs", "--profile", "full", "--output", fixtureRoot]);
  emit("generate", generate);
  if (generate.status === 0) {
    verify = command([process.execPath, "scripts/generate-import-capacity-fixtures.mjs", "--verify", manifestPath]);
    emit("verify", verify);
    list = command([
      "corepack", "pnpm", "--filter", "web-pwa", "exec", "playwright", "test",
      "e2e/import-stress.spec.ts", "--project=chromium-chrome", "--list",
    ], { PLAYWRIGHT_BROWSER_CHANNEL: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome" });
    emit("list", list);
    if (verify.status === 0 && list.status === 0) {
      testResult = command([
        "corepack", "pnpm", "--filter", "web-pwa", "exec", "playwright", "test",
        "e2e/import-stress.spec.ts", "--project=chromium-chrome", "--timeout=600000", "--reporter=line",
      ], { CI: "1", PLAYWRIGHT_BROWSER_CHANNEL: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome" });
      emit("test", testResult);
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
} finally {
  cleanup = cleanOwnedFixture();
  emit("cleanup", cleanup);
}

const portFreeAfter = (await Promise.all([portIsFree(3100), portIsFree(4100)])).every(Boolean);
const listedTestCount = (list.stdout.match(/import-stress\.spec\.ts:/g) ?? []).length;
const observation = {
  portFreeBefore,
  generateExitCode: generate.status ?? 1,
  verifyExitCode: verify.status ?? 1,
  listExitCode: list.status ?? 1,
  listedTestCount,
  testExitCode: testResult.status ?? 1,
  cleaned: cleanup.status === 0 && !existsSync(fixtureRoot),
  portFreeAfter,
};
const outcome = classifyImportCapacityRun(observation);
process.stdout.write(`IMPORT_CAPACITY_OBSERVATION=${JSON.stringify({ ...outcome, ...observation })}\n`);
process.exitCode = outcome.classification === "PASS" ? 0 : 1;
