#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = resolve(repoRoot, "apps/web-pwa/public");
const backupRoot = mkdtempSync(resolve(tmpdir(), "reading-world-gate-01-"));
const publicBackup = resolve(backupRoot, "public");
let server = null;
let restored = false;

if (existsSync(publicDirectory)) {
  cpSync(publicDirectory, publicBackup, { recursive: true });
}

function restorePublicDirectory() {
  if (restored) return;
  restored = true;
  rmSync(publicDirectory, { recursive: true, force: true });
  if (existsSync(publicBackup)) {
    mkdirSync(dirname(publicDirectory), { recursive: true });
    cpSync(publicBackup, publicDirectory, { recursive: true });
  }
  rmSync(backupRoot, { recursive: true, force: true });
}

function stop(signal = "SIGTERM") {
  if (server && server.exitCode === null) {
    server.kill(signal);
  }
  restorePublicDirectory();
}

process.once("SIGINT", () => {
  stop("SIGINT");
  process.exit(130);
});
process.once("SIGTERM", () => {
  stop("SIGTERM");
  process.exit(0);
});
process.once("exit", restorePublicDirectory);

const build = spawnSync(
  "corepack",
  ["pnpm", "--filter", "web-pwa", "build"],
  {
    cwd: repoRoot,
    env: { ...process.env, READING_WORLD_GATE_01_BUILD: "1" },
    stdio: "inherit",
  },
);

if (build.status !== 0) {
  restorePublicDirectory();
  process.exit(build.status ?? 1);
}

server = spawn(
  process.execPath,
  [
    resolve(repoRoot, "apps/web-pwa/node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3102",
  ],
  {
    cwd: resolve(repoRoot, "apps/web-pwa"),
    env: process.env,
    stdio: "inherit",
  },
);

server.once("exit", (code, signal) => {
  server = null;
  restorePublicDirectory();
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
