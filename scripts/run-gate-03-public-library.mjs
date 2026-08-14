#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  countListedExperimentTests,
  directoryFingerprint,
} from "./gate-qualification.mjs";
import {
  classifyPublicLibraryGateRun,
  countPublicLibraryProductStageMarkers,
  publicLibraryExperimentStrategy,
  validatePublicLibraryIsolationPaths,
} from "./gate-public-library-run.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = resolve(repoRoot, "apps/api");
const webRoot = resolve(repoRoot, "apps/web-pwa");
const experiment = process.argv[2];
const strategy = publicLibraryExperimentStrategy(experiment);
const controlRevision = "REV-0003";
const apiPort = 4100;
const webPort = 3100;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const browserChannel = "chrome";
const maintenanceKey = "gate-03-fixture-key";
const isolationRoot = mkdtempSync(
  resolve(tmpdir(), "reading-world-gate-03-exp-14-"),
);
const isolatedPaths = {
  personalDatabase: resolve(isolationRoot, "personal/reader.sqlite"),
  personalBlobRoot: resolve(isolationRoot, "personal/blobs"),
  publicDatabase: resolve(isolationRoot, "public/catalog.sqlite"),
  publicBlobRoot: resolve(isolationRoot, "public/objects"),
};
const isolatedRootCreated = existsSync(isolationRoot);
const pathIsolationValid = validatePublicLibraryIsolationPaths(
  isolationRoot,
  isolatedPaths,
);

function command(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function canonicalRow(row) {
  return Object.fromEntries(
    Object.entries(row)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        typeof value === "bigint" ? value.toString() : value,
      ]),
  );
}

async function personalDatabaseStateHash(client) {
  const tableOrders = [
    ["books", "id"],
    ["library_folders", "id"],
    ["chapters", "id"],
    ["storage_objects", "hash"],
    ["ai_views", "id"],
  ];
  const state = [];
  for (const [table, order] of tableOrders) {
    const result = await client.execute(
      `SELECT * FROM "${table}" ORDER BY "${order}";`,
    );
    state.push([table, result.rows.map(canonicalRow)]);
  }
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function apiRequire() {
  return createRequire(resolve(apiRoot, "package.json"));
}

async function createPersonalSentinels() {
  mkdirSync(dirname(isolatedPaths.personalDatabase), { recursive: true });
  mkdirSync(isolatedPaths.personalBlobRoot, { recursive: true });
  const requireFromApi = apiRequire();
  const { createClient } = requireFromApi("@libsql/client");
  const { prepareDatabase } = requireFromApi(
    "./dist/modules/database/database-bootstrap.js",
  );
  const client = createClient({
    url: `file:${isolatedPaths.personalDatabase}`,
  });
  try {
    await prepareDatabase(client);
    await client.execute({
      sql: `
        INSERT INTO books (
          id, title, author, source_type, format, status,
          chapter_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        "gate-03-personal-sentinel",
        "GATE-03 personal DB sentinel",
        "validator",
        "local_file",
        "txt",
        "ready",
        0,
        "2026-08-15T00:00:00.000Z",
        "2026-08-15T00:00:00.000Z",
      ],
    });
    const personalDbSentinelBefore = await personalDatabaseStateHash(client);
    writeFileSync(
      resolve(isolatedPaths.personalBlobRoot, "gate-03-personal-sentinel.bin"),
      "reading-world-gate-03-personal-blob-sentinel-v1\n",
      "utf8",
    );
    return {
      personalDbSentinelBefore,
      personalBlobSentinelBefore: directoryFingerprint(
        isolatedPaths.personalBlobRoot,
      ),
    };
  } finally {
    client.close();
  }
}

async function readPersonalDbSentinel() {
  const { createClient } = apiRequire()("@libsql/client");
  const client = createClient({
    url: `file:${isolatedPaths.personalDatabase}`,
  });
  try {
    return await personalDatabaseStateHash(client);
  } finally {
    client.close();
  }
}

function portIsFree(port) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: "127.0.0.1", port });
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

async function waitFor(url) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await delay(100);
  }
  return false;
}

function spawnService(commandPath, args, options) {
  const child = spawn(commandPath, args, {
    ...options,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stdout: "", stderr: "" };
  child.stdout?.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`.slice(-256_000);
  });
  child.stderr?.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`.slice(-256_000);
  });
  return { child, output };
}

async function stopProcessGroup(service) {
  const pid = service?.child?.pid;
  if (!pid) return 0;
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  await Promise.race([
    service.child.exitCode === null
      ? new Promise((resolvePromise) =>
          service.child.once("exit", resolvePromise),
        )
      : Promise.resolve(),
    delay(3000),
  ]);
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  await delay(100);
  try {
    process.kill(-pid, 0);
    return 1;
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return 0;
  }
}

const reuseProductionServersEnv = {
  CI: "",
  PLAYWRIGHT_BROWSER_CHANNEL: browserChannel,
};
const playwrightArgs = [
  "corepack",
  "pnpm",
  "--filter",
  "web-pwa",
  "exec",
  "playwright",
  "test",
  "e2e/public-library.spec.ts",
  "--config",
  "playwright.config.ts",
  "--grep",
  experiment,
  "--workers=1",
  "--retries=0",
  "--timeout=120000",
  "--reporter=line",
];
const apiPortFreeBefore = await portIsFree(apiPort);
const webPortFreeBefore = await portIsFree(webPort);
const list = command([...playwrightArgs, "--list"], {
  env: reuseProductionServersEnv,
});
const listedTestCount = countListedExperimentTests(list.stdout, experiment);
const apiBuild = command(["corepack", "pnpm", "--filter", "api", "build"], {
  env: { NODE_ENV: "production" },
});
const webBuild = command(["corepack", "pnpm", "--filter", "web-pwa", "build"], {
  env: {
    NODE_ENV: "production",
    NEXT_PUBLIC_API_BASE_URL: apiOrigin,
    READING_WORLD_VERIFY_NO_PWA_WRITE: "1",
  },
});

let apiService = null;
let webService = null;
let apiServiceReady = false;
let webServiceReady = false;
let testResult = { status: 1, stdout: "", stderr: "" };
let orphanProcessCount = 0;
let cleanupComplete = false;
let personalDbSentinelBefore = null;
let personalDbSentinelAfter = null;
let personalBlobSentinelBefore = null;
let personalBlobSentinelAfter = null;
let sentinelSetupError = null;

if (pathIsolationValid && apiBuild.status === 0) {
  try {
    ({ personalDbSentinelBefore, personalBlobSentinelBefore } =
      await createPersonalSentinels());
  } catch (error) {
    sentinelSetupError = error instanceof Error ? error.message : String(error);
  }
}

try {
  const canStart =
    pathIsolationValid &&
    apiPortFreeBefore &&
    webPortFreeBefore &&
    list.status === 0 &&
    listedTestCount === 1 &&
    apiBuild.status === 0 &&
    webBuild.status === 0 &&
    personalDbSentinelBefore !== null &&
    personalBlobSentinelBefore !== null;
  if (canStart) {
    apiService = spawnService(
      process.execPath,
      [resolve(apiRoot, "dist/main.js")],
      {
        cwd: apiRoot,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(apiPort),
          API_HOST: "127.0.0.1",
          CORS_ORIGIN: webOrigin,
          READER_SQLITE_DB_PATH: isolatedPaths.personalDatabase,
          READER_BLOB_STORAGE_PATH: isolatedPaths.personalBlobRoot,
          READER_PUBLIC_LIBRARY_DB_PATH: isolatedPaths.publicDatabase,
          READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH: isolatedPaths.publicBlobRoot,
          READER_PUBLIC_LIBRARY_MAINTENANCE_KEY: maintenanceKey,
        },
      },
    );
    apiServiceReady = await waitFor(
      `${apiOrigin}/public-library/books?page=1&pageSize=1`,
    );
    if (apiServiceReady) {
      webService = spawnService(
        process.execPath,
        [
          resolve(webRoot, "node_modules/next/dist/bin/next"),
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(webPort),
        ],
        {
          cwd: webRoot,
          env: {
            ...process.env,
            NODE_ENV: "production",
            NEXT_PUBLIC_API_BASE_URL: apiOrigin,
          },
        },
      );
      webServiceReady = await waitFor(`${webOrigin}/#/library`);
    }
    if (apiServiceReady && webServiceReady) {
      testResult = command(playwrightArgs, {
        env: reuseProductionServersEnv,
      });
    }
  }
} finally {
  orphanProcessCount += await stopProcessGroup(webService);
  orphanProcessCount += await stopProcessGroup(apiService);
  try {
    if (personalDbSentinelBefore !== null) {
      personalDbSentinelAfter = await readPersonalDbSentinel();
    }
    if (
      personalBlobSentinelBefore !== null &&
      existsSync(isolatedPaths.personalBlobRoot)
    ) {
      personalBlobSentinelAfter = directoryFingerprint(
        isolatedPaths.personalBlobRoot,
      );
    }
  } catch (error) {
    sentinelSetupError ??=
      error instanceof Error ? error.message : String(error);
  }
  try {
    rmSync(isolationRoot, { recursive: true, force: true });
    cleanupComplete = !existsSync(isolationRoot);
  } catch {
    cleanupComplete = false;
  }
}

const apiPortFreeAfter = await portIsFree(apiPort);
const webPortFreeAfter = await portIsFree(webPort);
const productStageMarkerCount = countPublicLibraryProductStageMarkers(
  testResult.stdout,
  experiment,
);
const observationInput = {
  controlRevision,
  experiment,
  listExitCode: list.status ?? 1,
  listedTestCount,
  apiBuildExitCode: apiBuild.status ?? 1,
  webBuildExitCode: webBuild.status ?? 1,
  apiServiceReady,
  webServiceReady,
  testExitCode: testResult.status ?? 1,
  apiPortFreeBefore,
  webPortFreeBefore,
  apiPortFreeAfter,
  webPortFreeAfter,
  orphanProcessCount,
  pathIsolationValid,
  isolatedRootCreated,
  cleanupComplete,
  personalDbSentinelUnchanged:
    personalDbSentinelBefore !== null &&
    personalDbSentinelBefore === personalDbSentinelAfter,
  personalBlobSentinelUnchanged:
    personalBlobSentinelBefore !== null &&
    personalBlobSentinelBefore === personalBlobSentinelAfter,
  personalDbSentinelBefore,
  personalDbSentinelAfter,
  personalBlobSentinelBefore,
  personalBlobSentinelAfter,
  sentinelSetupError,
  browserChannel,
  runnerMode: "production",
  productStageMarkerCount,
  productStageEntered: productStageMarkerCount === 1,
  evidenceRecordsValid: true,
};
const outcome = classifyPublicLibraryGateRun(observationInput);
process.stdout.write(
  `GATE03_PUBLIC_LIBRARY_OBSERVATION=${JSON.stringify({
    ...outcome,
    ...observationInput,
    strategy,
  })}\n`,
);

for (const [label, result] of [
  ["list", list],
  ["api-build", apiBuild],
  ["web-build", webBuild],
  ["test", testResult],
]) {
  if (result.stdout) process.stdout.write(`\n[${label}]\n${result.stdout}`);
  if (result.stderr) process.stderr.write(`[${label}]\n${result.stderr}`);
}
for (const [label, service] of [
  ["api-service", apiService],
  ["web-service", webService],
]) {
  if (service?.output.stdout) {
    process.stdout.write(`\n[${label}]\n${service.output.stdout}`);
  }
  if (service?.output.stderr) {
    process.stderr.write(`[${label}]\n${service.output.stderr}`);
  }
}
process.exitCode = outcome.classification === "PASS" ? 0 : 1;
