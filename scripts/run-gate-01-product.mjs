#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { countListedExperimentTests, directoryFingerprint, pwaDestinationFor } from "./gate-qualification.mjs";
import { classifyProductGateRun, productExperimentStrategy, validateGate00Final } from "./gate-product-run.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(repoRoot, "apps/web-pwa");
const publicDirectory = resolve(webRoot, "public");
const gate00FinalPath = resolve(repoRoot, "docs/goals/reading-world-v1/evidence/artifacts/gate-00-final.json");
const expectedGate00FinalSha256 = "2fd6b61a1fb58a6a6b12b3533e6db5939badd422463884c43d18036538f841c3";
const backupRoot = mkdtempSync(resolve(tmpdir(), "reading-world-gate-01-rev-0002-"));
const publicBackup = resolve(backupRoot, "public");
const isolatedPwaDirectory = resolve(backupRoot, "generated-public");
const experiment = process.argv[2];
const strategy = productExperimentStrategy(experiment);
const gateOrigin = ["http:", "//127.0.0.1:3102"].join("");

if (existsSync(publicDirectory)) cpSync(publicDirectory, publicBackup, { recursive: true });
const publicFingerprintBefore = directoryFingerprint(publicDirectory);

function command(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

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
      const response = await fetch(`${gateOrigin}/#/library`);
      if (response.ok) return true;
    } catch {}
    await delay(100);
  }
  return false;
}

const gate00Bytes = readFileSync(gate00FinalPath);
const gate00Final = JSON.parse(gate00Bytes.toString("utf8"));
const ancestry = command(["git", "merge-base", "--is-ancestor", gate00Final.evidenceCommit, "HEAD"]);
const prerequisiteValid = validateGate00Final(gate00Final, {
  actualSha256: sha256(gate00Bytes),
  expectedSha256: expectedGate00FinalSha256,
  commitIsAncestor: ancestry.status === 0,
});
const portFreeBefore = await portIsFree();
const list = command([
  "corepack", "pnpm", "--filter", "web-pwa", "exec", "playwright", "test",
  "e2e/gate-01.spec.ts", "--config", "playwright.gate-01.rev-0002.config.ts",
  "--grep", experiment, "--list",
]);
const listedTestCount = countListedExperimentTests(list.stdout, experiment);
const build = command(["corepack", "pnpm", "--filter", "web-pwa", "build"], {
  env: {
    READING_WORLD_GATE_01_BUILD: "1",
    READING_WORLD_PWA_DEST: pwaDestinationFor(webRoot, isolatedPwaDirectory),
  },
});
if (build.status === 0 && strategy.serveGeneratedPwaDuringRun) {
  cpSync(isolatedPwaDirectory, publicDirectory, { recursive: true });
}

let server = null;
let serviceReady = false;
let testResult = { status: 1, stdout: "", stderr: "" };
let serverProcessGroupAlive = false;
try {
  if (prerequisiteValid && portFreeBefore && list.status === 0 && listedTestCount === 1 && build.status === 0) {
    server = spawn(
      process.execPath,
      [resolve(webRoot, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3102"],
      { cwd: webRoot, env: process.env, detached: true, stdio: "ignore" },
    );
    serviceReady = await waitForHealth();
    if (serviceReady) {
      testResult = command([
        "corepack", "pnpm", "--filter", "web-pwa", "exec", "playwright", "test",
        "e2e/gate-01.spec.ts", "--config", "playwright.gate-01.rev-0002.config.ts",
        "--grep", experiment,
      ], { env: { CI: "1", PLAYWRIGHT_BROWSER_CHANNEL: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome" } });
    }
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
const observationInput = {
  prerequisiteValid,
  listExitCode: list.status ?? 1,
  listedTestCount,
  buildExitCode: build.status ?? 1,
  serviceReady,
  testExitCode: testResult.status ?? 1,
  portFreeBefore,
  portFreeAfter,
  orphanProcessCount: serverProcessGroupAlive ? 1 : 0,
  publicRestored: publicFingerprintBefore === publicFingerprintAfter,
  evidenceRecordsValid: true,
};
const outcome = classifyProductGateRun(observationInput);
process.stdout.write(`PRODUCT_GATE_OBSERVATION=${JSON.stringify({
  experiment,
  ...outcome,
  ...observationInput,
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
process.exitCode = outcome.classification === "PASS" ? 0 : 1;
