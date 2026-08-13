#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  classifyGateRun,
  countListedExperimentTests,
  directoryFingerprint,
  pwaDestinationFor,
  qualificationStrategy,
} from "./gate-qualification.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(repoRoot, "apps/web-pwa");
const publicDirectory = resolve(webRoot, "public");
const backupRoot = mkdtempSync(resolve(tmpdir(), "reading-world-gate-00-"));
const publicBackup = resolve(backupRoot, "public");
const isolatedPwaDirectory = resolve(backupRoot, "generated-public");
const experiment = process.argv[2];
const strategy = qualificationStrategy(experiment);

if (existsSync(publicDirectory)) cpSync(publicDirectory, publicBackup, { recursive: true });
const publicFingerprintBefore = directoryFingerprint(publicDirectory);

function restorePublic() {
  rmSync(publicDirectory, { recursive: true, force: true });
  if (existsSync(publicBackup)) {
    mkdirSync(dirname(publicDirectory), { recursive: true });
    cpSync(publicBackup, publicDirectory, { recursive: true });
  }
  rmSync(backupRoot, { recursive: true, force: true });
}

function portIsFree() {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: "127.0.0.1", port: 3102 });
    socket.once("connect", () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.once("error", () => resolvePromise(true));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolvePromise(true);
    });
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3102/#/library");
      if (response.ok) return true;
    } catch {}
    await delay(100);
  }
  return false;
}

function command(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const portFreeBefore = await portIsFree();
const list = command([
  "corepack", "pnpm", "--filter", "web-pwa", "exec", "playwright", "test",
  "e2e/gate-00.spec.ts", "--config", "playwright.gate-00.config.ts", "--grep", experiment, "--list",
]);
const listedTestCount = countListedExperimentTests(list.stdout, experiment);
const build = command(["corepack", "pnpm", "--filter", "web-pwa", "build"], {
  env: {
    READING_WORLD_GATE_01_BUILD: "1",
    ...(strategy.isolatedPwaDestination
      ? { READING_WORLD_PWA_DEST: pwaDestinationFor(webRoot, isolatedPwaDirectory) }
      : {}),
  },
});

let server = null;
let serviceReady = false;
let testResult = { status: 1, stdout: "", stderr: "" };
let serverProcessGroupAlive = false;
try {
  if (portFreeBefore && list.status === 0 && listedTestCount === 1 && build.status === 0) {
    server = spawn(
      process.execPath,
      [resolve(webRoot, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3102"],
      { cwd: webRoot, env: process.env, detached: true, stdio: "ignore" },
    );
    serviceReady = await waitForHealth();
    if (serviceReady) {
      testResult = command([
        "corepack", "pnpm", "--filter", "web-pwa", "exec", "playwright", "test",
        "e2e/gate-00.spec.ts", "--config", "playwright.gate-00.config.ts", "--grep", experiment,
      ], { env: { CI: "1", PLAYWRIGHT_BROWSER_CHANNEL: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome" } });
    }
  }
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
    await Promise.race([
      server.exitCode === null
        ? new Promise((resolvePromise) => server.once("exit", resolvePromise))
        : Promise.resolve(),
      delay(3000),
    ]);
    try { process.kill(-server.pid, "SIGKILL"); } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
    await delay(100);
    try {
      process.kill(-server.pid, 0);
      serverProcessGroupAlive = true;
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  restorePublic();
}

const portFreeAfter = await portIsFree();
const publicFingerprintAfter = directoryFingerprint(publicDirectory);
const publicRestored = publicFingerprintBefore === publicFingerprintAfter;
const targetMatch = String(testResult.stdout).match(/QUALIFICATION_TARGET_COUNT=(\d+)/);
const targetCount = targetMatch ? Number(targetMatch[1]) : 0;
const orphanProcessCount = serverProcessGroupAlive ? 1 : 0;

const outcome = classifyGateRun({
  listExitCode: list.status ?? 1,
  buildExitCode: build.status ?? 1,
  serviceReady,
  testExitCode: testResult.status ?? 1,
  listedTestCount,
  targetCount,
  portFreeBefore,
  portFreeAfter,
  orphanProcessCount,
  publicRestored,
  evidenceRecordsValid: true,
});

process.stdout.write(`QUALIFICATION_OBSERVATION=${JSON.stringify({
  experiment,
  classification: outcome.classification,
  reasons: outcome.reasons,
  listExitCode: list.status ?? 1,
  listedTestCount,
  buildExitCode: build.status ?? 1,
  serviceReady,
  testExitCode: testResult.status ?? 1,
  targetCount,
  portFreeBefore,
  portFreeAfter,
  orphanProcessCount,
  publicRestored,
  publicFingerprintBefore,
  publicFingerprintAfter,
  strategy,
})}\n`);
if (list.stdout) process.stdout.write(`\n[list]\n${list.stdout}`);
if (list.stderr) process.stderr.write(`[list]\n${list.stderr}`);
if (build.stdout) process.stdout.write(`\n[build]\n${build.stdout}`);
if (build.stderr) process.stderr.write(`[build]\n${build.stderr}`);
if (testResult.stdout) process.stdout.write(`\n[test]\n${testResult.stdout}`);
if (testResult.stderr) process.stderr.write(`[test]\n${testResult.stderr}`);
process.exitCode = outcome.classification === "QUALIFIED" ? 0 : 1;
