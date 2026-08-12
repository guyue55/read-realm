#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) {
      throw new Error(`未知参数：${name}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数 ${name} 缺少值`);
    }
    parsed[name.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function commandText(command, args) {
  return [command, ...args]
    .map((part) => (/^[A-Za-z0-9_./:=@{},*+-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

function runCapture(command, args, options = {}) {
  const startedAt = new Date();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const endedAt = new Date();
  return {
    command: commandText(command, args),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? String(result.error) : ""),
  };
}

function probe(command, args) {
  const result = runCapture(command, args);
  return {
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sanitizeLogText(value) {
  return value
    .split(repoRoot).join(".")
    .split(homedir()).join("$HOME")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+$/gm, "")
    .replace(/\n+$/, "\n");
}

function trackedWorktreeFingerprint() {
  const status = runCapture("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=no",
  ]);
  const diff = runCapture("git", ["diff", "--binary", "--no-ext-diff"]);
  const staged = runCapture("git", ["diff", "--cached", "--binary", "--no-ext-diff"]);
  if (status.exitCode !== 0 || diff.exitCode !== 0 || staged.exitCode !== 0) {
    throw new Error("无法读取受版本控制工作树状态");
  }
  const payload = `${status.stdout}\n${diff.stdout}\n${staged.stdout}`;
  return {
    sha256: createHash("sha256").update(payload).digest("hex"),
    status: status.stdout.split("\n").filter(Boolean),
  };
}

function archivePreviousReport(outputPath, logDirectory) {
  if (!existsSync(outputPath) && !existsSync(logDirectory)) return null;
  const archiveRoot = resolve(dirname(outputPath), "history");
  mkdirSync(archiveRoot, { recursive: true });
  const stem = outputPath.slice(outputPath.lastIndexOf("/") + 1, -5);
  let attempt = 1;
  let archiveDirectory;
  do {
    archiveDirectory = resolve(
      archiveRoot,
      `${stem}-attempt-${String(attempt).padStart(2, "0")}`,
    );
    attempt += 1;
  } while (existsSync(archiveDirectory));
  mkdirSync(archiveDirectory, { recursive: true });
  const archivedReportPath = resolve(archiveDirectory, `${stem}.json`);
  if (existsSync(outputPath)) {
    renameSync(outputPath, archivedReportPath);
  }
  if (existsSync(logDirectory)) {
    cpSync(logDirectory, resolve(archiveDirectory, `${stem}.records`), {
      recursive: true,
    });
    rmSync(logDirectory, { recursive: true, force: true });
  }
  if (existsSync(archivedReportPath)) {
    const archivedReport = JSON.parse(readFileSync(archivedReportPath, "utf8"));
    for (const check of archivedReport.checks ?? []) {
      check.logPath = relative(
        repoRoot,
        resolve(
          archiveDirectory,
          `${stem}.records`,
          `${String(check.id).toLowerCase()}.txt`,
        ),
      );
    }
    writeFileSync(
      archivedReportPath,
      `${JSON.stringify(archivedReport, null, 2)}\n`,
      "utf8",
    );
  }
  return relative(repoRoot, archiveDirectory);
}

function phaseOneChecks() {
  return [
    { id: "PATCH_WHITESPACE", command: "git", args: ["diff", "--check"] },
    {
      id: "WEB_LINT",
      command: "corepack",
      args: ["pnpm", "--filter", "web-pwa", "lint"],
    },
    {
      id: "API_LINT_NON_FIXING",
      command: "corepack",
      args: [
        "pnpm",
        "--filter",
        "api",
        "exec",
        "eslint",
        "{src,apps,libs,test}/**/*.ts",
      ],
    },
    { id: "WORKSPACE_TEST", command: "corepack", args: ["pnpm", "test"] },
    {
      id: "WORKSPACE_BUILD",
      command: "corepack",
      args: ["pnpm", "build"],
      env: { READING_WORLD_VERIFY_NO_PWA_WRITE: "1" },
    },
    {
      id: "WEB_E2E",
      command: "corepack",
      args: ["pnpm", "--filter", "web-pwa", "test:e2e"],
      env: {
        CI: "1",
        PLAYWRIGHT_BROWSER_CHANNEL:
          process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome",
      },
    },
  ];
}

function checksFor(phase, experiment) {
  if (phase === "01") {
    if (experiment) {
      throw new Error("PHASE-01 不接受 --experiment；实验入口从 PHASE-02 开始实现");
    }
    return phaseOneChecks();
  }
  throw new Error(
    `PHASE-${phase} 的检查合同尚未随对应实现阶段落盘；拒绝生成伪证据`,
  );
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args.phase || !args.output) {
    throw new Error(
      "用法：node scripts/verify-reading-world.mjs --phase 01 --output <path>",
    );
  }

  const outputPath = resolve(repoRoot, args.output);
  const outputRelative = relative(repoRoot, outputPath);
  if (outputRelative.startsWith("..")) {
    throw new Error("--output 必须位于仓库内");
  }

  const logDirectory = `${outputPath.slice(0, -5)}.records`;
  const archivedPreviousReport = archivePreviousReport(outputPath, logDirectory);
  mkdirSync(dirname(outputPath), { recursive: true });
  mkdirSync(logDirectory, { recursive: true });

  const checks = checksFor(args.phase, args.experiment);
  const startedAt = new Date().toISOString();
  const results = [];

  for (const check of checks) {
    process.stdout.write(`[${check.id}] ${commandText(check.command, check.args)}\n`);
    const trackedBefore = trackedWorktreeFingerprint();
    const result = runCapture(check.command, check.args, { env: check.env });
    const trackedAfter = trackedWorktreeFingerprint();
    const mutatedTrackedFiles = trackedBefore.sha256 !== trackedAfter.sha256;
    const logPath = resolve(logDirectory, `${check.id.toLowerCase()}.txt`);
    const log = [
      `$ ${result.command}`,
      `started_at=${result.startedAt}`,
      `ended_at=${result.endedAt}`,
      `duration_ms=${result.durationMs}`,
      `exit_code=${result.exitCode}`,
      `tracked_worktree_mutated=${mutatedTrackedFiles}`,
      `tracked_status_before=${JSON.stringify(trackedBefore.status)}`,
      `tracked_status_after=${JSON.stringify(trackedAfter.status)}`,
      result.signal ? `signal=${result.signal}` : "",
      "",
      "[stdout]",
      sanitizeLogText(result.stdout),
      "",
      "[stderr]",
      sanitizeLogText(result.stderr),
    ]
      .filter((line) => line !== "")
      .join("\n");
    writeFileSync(logPath, `${log}\n`, "utf8");
    results.push({
      id: check.id,
      command: result.command,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      signal: result.signal,
      environment: check.env ?? {},
      trackedWorktreeMutated: mutatedTrackedFiles,
      trackedStatusBefore: trackedBefore.status,
      trackedStatusAfter: trackedAfter.status,
      logPath: relative(repoRoot, logPath),
      logSha256: sha256(logPath),
    });
    process.stdout.write(`[${check.id}] exit=${result.exitCode}\n`);
  }

  const gitHead = probe("git", ["rev-parse", "HEAD"]);
  const gitBranch = probe("git", ["branch", "--show-current"]);
  const gitStatus = probe("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
  const nodeVersion = probe(process.execPath, ["--version"]);
  const pnpmVersion = probe("corepack", ["pnpm", "--version"]);
  const passed = results.every(
    (result) => result.exitCode === 0 && !result.trackedWorktreeMutated,
  );
  const report = {
    schemaVersion: 1,
    goalId: "GOAL-READING-WORLD-V1",
    controlRevision: "REV-0001",
    phase: args.phase,
    experiment: args.experiment ?? null,
    startedAt,
    endedAt: new Date().toISOString(),
    archivedPreviousReport,
    repository: {
      root: ".",
      head: gitHead.stdout,
      branch: gitBranch.stdout,
      statusPorcelain: gitStatus.stdout.split("\n").filter(Boolean),
    },
    runtime: {
      node: nodeVersion.stdout,
      pnpm: pnpmVersion.stdout,
    },
    sourceMutationPolicy:
      "检查命令不得修改受版本控制的源文件；构建缓存、隔离测试数据、日志和本报告属于声明的验证副作用",
    checks: results,
    summary: {
      passed,
      passedCount: results.filter(
        (result) => result.exitCode === 0 && !result.trackedWorktreeMutated,
      ).length,
      failedCount: results.filter(
        (result) => result.exitCode !== 0 || result.trackedWorktreeMutated,
      ).length,
      trackedMutationCount: results.filter(
        (result) => result.trackedWorktreeMutated,
      ).length,
    },
  };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`report=${outputRelative}\n`);
  process.stdout.write(`result=${passed ? "PASS" : "FAIL"}\n`);
  process.exitCode = passed ? 0 : 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
