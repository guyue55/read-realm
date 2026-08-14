#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  classifyPhase04ReaderRun,
  parsePhase04ReaderSamples,
} from "./phase-04-reader-run.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(repoRoot, "apps/web-pwa");
const port = 3104;
const origin = `http://127.0.0.1:${port}`;

function command(args, env = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function portIsFree() {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolvePromise(false); });
    socket.once("error", () => resolvePromise(true));
    socket.setTimeout(500, () => { socket.destroy(); resolvePromise(true); });
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return true;
    } catch {}
    await delay(100);
  }
  return false;
}

const playwrightArgs = [
  "corepack", "pnpm", "--filter", "web-pwa", "exec", "playwright", "test",
  "e2e/reader-experience.spec.ts", "--config", "playwright.phase-04.config.ts",
  "--project=chromium-chrome", "--timeout=60000", "--reporter=line",
];
const channelEnv = { CI: "1", PLAYWRIGHT_BROWSER_CHANNEL: "chrome" };
const portFreeBefore = await portIsFree();
const list = command([...playwrightArgs, "--list"], channelEnv);
const listedTestCount = (list.stdout.match(/reader-experience\.spec\.ts:/g) ?? []).length;
let server = null;
let serviceReady = false;
let testResult = { status: 1, stdout: "", stderr: "" };
let orphanProcessCount = 0;

try {
  if (portFreeBefore && list.status === 0 && listedTestCount === 13) {
    server = spawn(
      process.execPath,
      [resolve(webRoot, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)],
      { cwd: webRoot, env: process.env, detached: true, stdio: "ignore" },
    );
    serviceReady = await waitForHealth();
    if (serviceReady) testResult = command(playwrightArgs, channelEnv);
  }
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
    await Promise.race([
      server.exitCode === null ? new Promise((resolvePromise) => server.once("exit", resolvePromise)) : Promise.resolve(),
      delay(3000),
    ]);
    try { process.kill(-server.pid, "SIGKILL"); } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
    await delay(100);
    try { process.kill(-server.pid, 0); orphanProcessCount = 1; } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}

let samples = [];
try {
  samples = parsePhase04ReaderSamples(testResult.stdout);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
}
const portFreeAfter = await portIsFree();
const observation = {
  listExitCode: list.status ?? 1,
  listedTestCount,
  serviceReady,
  testExitCode: testResult.status ?? 1,
  portFreeBefore,
  portFreeAfter,
  orphanProcessCount,
  samples,
};
const outcome = classifyPhase04ReaderRun(observation);
process.stdout.write(`PHASE04_READER_OBSERVATION=${JSON.stringify({ ...outcome, ...observation })}\n`);
if (list.stdout) process.stdout.write(`\n[list]\n${list.stdout}`);
if (list.stderr) process.stderr.write(`[list]\n${list.stderr}`);
if (testResult.stdout) process.stdout.write(`\n[test]\n${testResult.stdout}`);
if (testResult.stderr) process.stderr.write(`[test]\n${testResult.stderr}`);
process.exitCode = outcome.classification === "PASS" ? 0 : 1;
