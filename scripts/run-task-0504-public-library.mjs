#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  classifyTask0504ExpansionRun,
  countTask0504ProductStageMarkers,
  parseTask0504ExpansionObservation,
  task0504ExpansionStrategy,
  validateTask0504IsolationPaths,
} from "./task-0504-expansion-run.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = resolve(repoRoot, "apps/api");
const webRoot = resolve(repoRoot, "apps/web-pwa");
const apiPort = 4100;
const webPort = 3100;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const maintenanceKey = "task-0504-fixture-key";
const runId = randomUUID();
const isolationRoot = mkdtempSync(
  resolve(tmpdir(), "reading-world-task-0504-"),
);
const ownershipPath = resolve(isolationRoot, ".reading-world-owned.json");
const ownershipBytes = `${JSON.stringify({ runId, pid: process.pid })}\n`;
writeFileSync(ownershipPath, ownershipBytes, { flag: "wx", mode: 0o600 });
const activeProcessGroups = new Set();

function removeOwnedIsolationRoot() {
  if (
    existsSync(ownershipPath) &&
    readFileSync(ownershipPath, "utf8") === ownershipBytes &&
    existsSync(isolationRoot)
  ) {
    rmSync(isolationRoot, { recursive: true, force: true });
  }
}

function emergencyCleanup(reason) {
  for (const pid of activeProcessGroups) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
  }
  removeOwnedIsolationRoot();
  if (reason instanceof Error)
    process.stderr.write(`${reason.stack ?? reason.message}\n`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    emergencyCleanup(signal);
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
process.once("uncaughtException", (error) => {
  emergencyCleanup(error);
  process.exit(1);
});
process.once("unhandledRejection", (error) => {
  emergencyCleanup(error);
  process.exit(1);
});

const paths = {
  personalDatabase: resolve(isolationRoot, "personal/reader.sqlite"),
  personalBlobRoot: resolve(isolationRoot, "personal/blobs"),
  publicDatabase: resolve(isolationRoot, "public/catalog.sqlite"),
  publicBlobRoot: resolve(isolationRoot, "public/objects"),
  maintenanceRoot: resolve(isolationRoot, "sources/maintenance"),
  browserArtifacts: resolve(isolationRoot, "browser/artifacts"),
  browserTemp: resolve(isolationRoot, "browser/tmp"),
};
for (const directory of [
  dirname(paths.personalDatabase),
  paths.personalBlobRoot,
  dirname(paths.publicDatabase),
  paths.publicBlobRoot,
  paths.maintenanceRoot,
  paths.browserArtifacts,
  paths.browserTemp,
]) {
  mkdirSync(directory, { recursive: true });
}
for (let index = 0; index < 16; index += 1) {
  const suffix = String(index).padStart(2, "0");
  const directory = resolve(
    paths.maintenanceRoot,
    "scan",
    index < 8 ? "经部" : "史部",
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, `TASK-0504-LIVE-scan-${suffix}.txt`),
    `第一章\nTASK-0504 维护目录正文 ${suffix}\n`,
    { flag: "wx", mode: 0o444 },
  );
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function treeManifest(root) {
  const entries = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name, "en"),
    )) {
      const path = resolve(directory, entry.name);
      const stats = lstatSync(path, { bigint: true });
      const item = {
        path: relative(root, path),
        type: entry.isDirectory()
          ? "directory"
          : entry.isFile()
            ? "file"
            : "other",
        size: stats.size.toString(),
        mode: Number(stats.mode & 0o777n),
        mtimeNs: stats.mtimeNs.toString(),
      };
      if (entry.isFile()) item.sha256 = sha256Bytes(readFileSync(path));
      entries.push(item);
      if (entry.isDirectory()) walk(path);
    }
  }
  walk(root);
  return { entries, sha256: sha256Bytes(JSON.stringify(entries)) };
}

function command(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 96 * 1024 * 1024,
  });
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await delay(100);
  }
  return false;
}

function spawnService(executable, args, options) {
  const child = spawn(executable, args, {
    ...options,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid) activeProcessGroups.add(child.pid);
  const output = { stdout: "", stderr: "" };
  child.stdout?.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`.slice(-512_000);
  });
  child.stderr?.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`.slice(-512_000);
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
    activeProcessGroups.delete(pid);
    return 0;
  }
}

function detachedCommand(args, options = {}) {
  return new Promise((resolvePromise) => {
    const startedAt = new Date();
    const child = spawn(args[0], args.slice(1), {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...options.env },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (child.pid) activeProcessGroups.add(child.pid);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
    }, options.timeoutMs ?? 240_000);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout = `${stdout}${String(chunk)}`;
    });
    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`;
    });
    child.once("exit", async (code, signal) => {
      clearTimeout(timeout);
      await delay(250);
      let orphanProcessCount = 0;
      if (child.pid) {
        try {
          process.kill(-child.pid, 0);
          orphanProcessCount = 1;
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (error?.code !== "ESRCH") orphanProcessCount = 1;
        }
        activeProcessGroups.delete(child.pid);
      }
      const endedAt = new Date();
      resolvePromise({
        status: timedOut ? 1 : (code ?? 1),
        signal,
        stdout,
        stderr,
        timedOut,
        orphanProcessCount,
        durationMs: endedAt.getTime() - startedAt.getTime(),
      });
    });
  });
}

function containsPath(parent, candidate) {
  const path = relative(parent, candidate);
  return (
    path === "" ||
    (path !== ".." &&
      !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
  );
}

function validatePhysicalIsolation() {
  const resolved = {
    personalDatabase: realpathSync(paths.personalDatabase),
    personalBlobRoot: realpathSync(paths.personalBlobRoot),
    publicDatabase: realpathSync(paths.publicDatabase),
    publicBlobRoot: realpathSync(paths.publicBlobRoot),
    maintenanceRoot: realpathSync(paths.maintenanceRoot),
  };
  if (new Set(Object.values(resolved)).size !== 5) return false;
  const roots = [
    resolved.personalBlobRoot,
    resolved.publicBlobRoot,
    resolved.maintenanceRoot,
  ];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (
        containsPath(roots[left], roots[right]) ||
        containsPath(roots[right], roots[left])
      )
        return false;
    }
  }
  return ![resolved.personalDatabase, resolved.publicDatabase].some(
    (database) =>
      roots.some(
        (root) => containsPath(root, database) || containsPath(database, root),
      ),
  );
}

function apiRequire() {
  return createRequire(resolve(apiRoot, "package.json"));
}

function canonicalRow(row) {
  return Object.fromEntries(
    Object.entries(row)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, value]) => [
        key,
        typeof value === "bigint" ? value.toString() : value,
      ]),
  );
}

async function databaseSemanticHash(path) {
  const { createClient } = apiRequire()("@libsql/client");
  const client = createClient({ url: `file:${path}` });
  try {
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const state = [];
    for (const table of tables.rows.map((row) => String(row.name))) {
      const result = await client.execute(`SELECT * FROM "${table}"`);
      const rows = result.rows
        .map(canonicalRow)
        .sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b), "en"),
        );
      state.push([table, rows]);
    }
    return sha256Bytes(JSON.stringify(state));
  } finally {
    client.close();
  }
}

async function seedPersonalRemote() {
  const response = await fetch(`${apiOrigin}/books/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-share-token": maintenanceKey,
    },
    body: JSON.stringify({
      metadata: {
        id: "task-0504-personal-book",
        title: "TASK-0504-LIVE-personal",
        author: "TASK-0504 validator",
        sourceType: "upload",
        format: "txt",
        status: "reading",
        tags: [],
        chapterCount: 2,
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
      chapters: [0, 1].map((index) => ({
        id: `task-0504-personal-book-chapter-${index}`,
        index,
        title: `第 ${index + 1} 章`,
        content: `TASK-0504 个人云正文 ${index + 1}`,
      })),
      replaceExisting: true,
    }),
  });
  if (!response.ok) throw new Error(`PERSONAL_REMOTE_SEED_${response.status}`);
}

async function publicDatabaseFacts() {
  const { createClient } = apiRequire()("@libsql/client");
  const client = createClient({ url: `file:${paths.publicDatabase}` });
  try {
    const scalar = async (sql) =>
      Number((await client.execute(sql)).rows[0]?.value ?? -1);
    const integrity = await client.execute("PRAGMA integrity_check");
    const foreignKeys = await client.execute("PRAGMA foreign_key_check");
    const sources = await client.execute(
      "SELECT source_kind AS kind, COUNT(*) AS count FROM public_sources GROUP BY source_kind ORDER BY source_kind",
    );
    const sourceFacts = await client.execute(`
      SELECT s.source_kind, s.source_scope, s.relative_path, s.source_hash,
        s.book_id, b.edition_hash, r.receipt_key,
        r.book_id AS receipt_book_id,
        r.edition_hash AS receipt_edition_hash,
        r.source_hash AS receipt_source_hash,
        r.status AS receipt_status
      FROM public_sources s
      JOIN public_books b ON b.id = s.book_id
      LEFT JOIN public_ingest_receipts r
        ON r.book_id = s.book_id AND r.source_hash = s.source_hash
      ORDER BY s.source_kind, s.source_scope, s.relative_path
    `);
    const packages = await client.execute(
      "SELECT package_hash FROM public_editions ORDER BY package_hash",
    );
    const revision = await client.execute(
      "SELECT revision FROM public_catalog_state WHERE id=1",
    );
    return {
      books: await scalar("SELECT COUNT(*) AS value FROM public_books"),
      editions: await scalar("SELECT COUNT(*) AS value FROM public_editions"),
      receipts: await scalar(
        "SELECT COUNT(*) AS value FROM public_ingest_receipts",
      ),
      sources: Object.fromEntries(
        sources.rows.map((row) => [String(row.kind), Number(row.count)]),
      ),
      sourceFacts: sourceFacts.rows.map(canonicalRow),
      packageHashes: packages.rows.map((row) => String(row.package_hash)),
      revision: Number(revision.rows[0]?.revision ?? -1),
      integrityOk: integrity.rows[0]?.integrity_check === "ok",
      foreignKeyViolations: foreignKeys.rows.length,
    };
  } finally {
    client.close();
  }
}

function sanitize(value) {
  return String(value)
    .split(isolationRoot)
    .join("$ISOLATED_ROOT")
    .split(repoRoot)
    .join(".")
    .split(maintenanceKey)
    .join("$TASK0504_KEY");
}

const sourceBefore = treeManifest(paths.maintenanceRoot);
const isolatedRootCreated = existsSync(isolationRoot);
const lexicalIsolationValid = validateTask0504IsolationPaths(
  isolationRoot,
  paths,
);
const physicalRoots = [
  paths.personalBlobRoot,
  paths.publicBlobRoot,
  paths.maintenanceRoot,
].map((path) => realpathSync(path));
const pathIsolationValid =
  lexicalIsolationValid && new Set(physicalRoots).size === physicalRoots.length;
let physicalIsolationValid = false;
const apiPortFreeBefore = await portIsFree(apiPort);
const webPortFreeBefore = await portIsFree(webPort);
const prerequisite = command([
  process.execPath,
  "scripts/check-gate-03-final-prerequisite.mjs",
]);
const playwrightArgs = [
  "corepack",
  "pnpm",
  "--filter",
  "web-pwa",
  "exec",
  "playwright",
  "test",
  "--config",
  "playwright.task-0504-expansion.config.ts",
  "--workers=1",
  "--retries=0",
  "--timeout=180000",
  "--reporter=line",
];
const playwrightEnvironment = {
  CI: "",
  PLAYWRIGHT_BROWSER_CHANNEL: "chrome",
  READING_WORLD_TASK_0504_OUTPUT_DIR: paths.browserArtifacts,
  TMPDIR: paths.browserTemp,
};
const list = command([...playwrightArgs, "--list"], {
  env: playwrightEnvironment,
});
const listedTestCount = (
  list.stdout.match(/task-0504-public-library-expansion\.spec\.ts:/gu) ?? []
).length;
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

let apiService;
let webService;
let apiServiceReady = false;
let webServiceReady = false;
let testResult = { status: 1, stdout: "", stderr: "" };
let orphanProcessCount = 0;
let cleanupComplete = false;
let sentinelSetupError = null;
let postObservationError = null;
let personalDbSentinelBefore = null;
let personalDbSentinelAfter = null;
let personalBlobSentinelBefore = null;
let personalBlobSentinelAfter = null;
let sourceAfter = null;
let publicFacts = null;
let publicBlobFacts = null;

try {
  if (
    pathIsolationValid &&
    apiPortFreeBefore &&
    webPortFreeBefore &&
    prerequisite.status === 0 &&
    list.status === 0 &&
    listedTestCount === 1 &&
    apiBuild.status === 0 &&
    webBuild.status === 0
  ) {
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
          READER_SQLITE_DB_PATH: paths.personalDatabase,
          READER_BLOB_STORAGE_PATH: paths.personalBlobRoot,
          READER_PUBLIC_LIBRARY_DB_PATH: paths.publicDatabase,
          READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH: paths.publicBlobRoot,
          READER_PUBLIC_LIBRARY_MAINTENANCE_KEY: maintenanceKey,
          READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS: JSON.stringify({
            task0504: {
              label: "TASK-0504 隔离书库",
              path: paths.maintenanceRoot,
            },
          }),
        },
      },
    );
    apiServiceReady = await waitFor(
      `${apiOrigin}/public-library/books?page=1&pageSize=1`,
    );
    if (apiServiceReady) {
      physicalIsolationValid = validatePhysicalIsolation();
    }
    if (apiServiceReady && physicalIsolationValid) {
      await seedPersonalRemote();
      writeFileSync(
        resolve(paths.personalBlobRoot, "validator-sentinel.bin"),
        "TASK-0504 private sentinel\n",
        { flag: "wx" },
      );
      personalDbSentinelBefore = await databaseSemanticHash(
        paths.personalDatabase,
      );
      personalBlobSentinelBefore = treeManifest(paths.personalBlobRoot).sha256;
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
      testResult = await detachedCommand(playwrightArgs, {
        env: playwrightEnvironment,
        timeoutMs: 240_000,
      });
      orphanProcessCount += testResult.orphanProcessCount ?? 0;
    }
  }
} catch (error) {
  sentinelSetupError = error instanceof Error ? error.message : String(error);
} finally {
  orphanProcessCount += await stopProcessGroup(webService);
  orphanProcessCount += await stopProcessGroup(apiService);
  try {
    if (personalDbSentinelBefore)
      personalDbSentinelAfter = await databaseSemanticHash(
        paths.personalDatabase,
      );
    if (personalBlobSentinelBefore)
      personalBlobSentinelAfter = treeManifest(paths.personalBlobRoot).sha256;
    sourceAfter = treeManifest(paths.maintenanceRoot);
    if (existsSync(paths.publicDatabase))
      publicFacts = await publicDatabaseFacts();
    if (existsSync(paths.publicBlobRoot))
      publicBlobFacts = treeManifest(paths.publicBlobRoot);
  } catch (error) {
    postObservationError ??=
      error instanceof Error ? error.message : String(error);
  }
}

const apiPortFreeAfter = await portIsFree(apiPort);
const webPortFreeAfter = await portIsFree(webPort);
const markerCount = countTask0504ProductStageMarkers(testResult.stdout);
let productObservation = null;
let productObservationValid = false;
try {
  productObservation = parseTask0504ExpansionObservation(testResult.stdout);
  productObservationValid = true;
} catch {}
const publicDatabaseFactsValid =
  publicFacts?.books === 26 &&
  publicFacts?.editions === 26 &&
  publicFacts?.receipts === 26 &&
  publicFacts?.integrityOk === true &&
  publicFacts?.foreignKeyViolations === 0 &&
  publicFacts?.revision === 27;
const expectedFixedProvenance = new Set([
  ...Array.from({ length: 16 }, (_, index) => {
    const suffix = String(index).padStart(2, "0");
    const section = index < 8 ? "经部" : "史部";
    return `maintenance_scan\0task0504\0scan/${section}/TASK-0504-LIVE-scan-${suffix}.txt`;
  }),
  ...Array.from({ length: 7 }, (_, index) => {
    const suffix = String(index).padStart(2, "0");
    return `browser_file\0browser-folder\0TASK-0504-LIVE-folder/经部/TASK-0504-LIVE-folder-${suffix}.txt`;
  }),
  "browser_file\0direct-upload\0TASK-0504-LIVE-direct.txt",
  "legacy_json\0gate-03-json\0legacy-json.txt",
]);
const sourceFacts = publicFacts?.sourceFacts ?? [];
const personalProvenance = sourceFacts.filter(
  (fact) => fact.source_kind === "personal_cloud",
);
const actualFixedProvenance = new Set(
  sourceFacts
    .filter((fact) => fact.source_kind !== "personal_cloud")
    .map(
      (fact) =>
        `${String(fact.source_kind)}\0${String(fact.source_scope)}\0${String(fact.relative_path)}`,
    ),
);
const publicProvenanceValid =
  publicFacts?.sources?.maintenance_scan === 16 &&
  publicFacts?.sources?.browser_file === 8 &&
  publicFacts?.sources?.personal_cloud === 1 &&
  publicFacts?.sources?.legacy_json === 1 &&
  sourceFacts.length === 26 &&
  new Set(sourceFacts.map((fact) => String(fact.book_id))).size === 26 &&
  new Set(sourceFacts.map((fact) => String(fact.edition_hash))).size === 26 &&
  new Set(sourceFacts.map((fact) => String(fact.receipt_key))).size === 26 &&
  sourceFacts.every(
    (fact) =>
      /^[a-f0-9]{64}$/u.test(String(fact.source_hash)) &&
      /^[a-f0-9]{64}$/u.test(String(fact.edition_hash)) &&
      typeof fact.receipt_key === "string" &&
      fact.receipt_book_id === fact.book_id &&
      fact.receipt_edition_hash === fact.edition_hash &&
      fact.receipt_source_hash === fact.source_hash &&
      fact.receipt_status === "succeeded",
  ) &&
  actualFixedProvenance.size === expectedFixedProvenance.size &&
  [...expectedFixedProvenance].every((key) => actualFixedProvenance.has(key)) &&
  personalProvenance.length === 1 &&
  personalProvenance[0]?.source_scope === "personal-cloud" &&
  /^personal-[a-f0-9]{64}\.txt$/u.test(
    String(personalProvenance[0]?.relative_path),
  );
const publicBlobFiles =
  publicBlobFacts?.entries?.filter((entry) => entry.type === "file") ?? [];
const publicBlobFactsValid =
  publicBlobFiles.length === 26 &&
  publicBlobFiles.every(
    (entry) =>
      /^[a-f0-9]{64}$/u.test(entry.path) && entry.path === entry.sha256,
  ) &&
  JSON.stringify(publicBlobFiles.map((entry) => entry.path).sort()) ===
    JSON.stringify([...(publicFacts?.packageHashes ?? [])].sort());
const observation = {
  controlRevision: "REV-0003",
  task: "TASK-0504",
  prerequisiteValid: prerequisite.status === 0,
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
  physicalIsolationValid,
  isolatedRootCreated,
  cleanupComplete: false,
  sentinelSetupError,
  postObservationError,
  sourceTreeUnchanged: sourceAfter?.sha256 === sourceBefore.sha256,
  sourceTreeBefore: sourceBefore,
  sourceTreeAfter: sourceAfter,
  personalDbSentinelBefore,
  personalDbSentinelAfter,
  personalDbSentinelUnchanged:
    personalDbSentinelBefore !== null &&
    personalDbSentinelBefore === personalDbSentinelAfter,
  personalBlobSentinelBefore,
  personalBlobSentinelAfter,
  personalBlobSentinelUnchanged:
    personalBlobSentinelBefore !== null &&
    personalBlobSentinelBefore === personalBlobSentinelAfter,
  publicDatabaseFactsValid,
  publicProvenanceValid,
  publicBlobFactsValid,
  publicFacts,
  publicBlobFacts,
  browserChannel: "chrome",
  runnerMode: "production",
  productStageMarkerCount: markerCount,
  productStageEntered: markerCount === 1,
  productObservation,
  productObservationValid,
  evidenceRecordsValid: true,
  strategy: task0504ExpansionStrategy(),
};

try {
  if (
    realpathSync(isolationRoot) === realpathSync(dirname(ownershipPath)) &&
    readFileSync(ownershipPath, "utf8") === ownershipBytes &&
    statSync(isolationRoot).isDirectory()
  ) {
    rmSync(isolationRoot, { recursive: true, force: true });
    cleanupComplete = !existsSync(isolationRoot);
  }
} catch {
  cleanupComplete = false;
}
observation.cleanupComplete = cleanupComplete;
const outcome = classifyTask0504ExpansionRun(observation);
process.stdout.write(
  `TASK0504_PUBLIC_LIBRARY_EXPANSION_RUN=${JSON.stringify({ ...outcome, ...observation })}\n`,
);
for (const [label, result] of [
  ["prerequisite", prerequisite],
  ["list", list],
  ["api-build", apiBuild],
  ["web-build", webBuild],
  ["test", testResult],
]) {
  if (result.stdout)
    process.stdout.write(`\n[${label}]\n${sanitize(result.stdout)}`);
  if (result.stderr)
    process.stderr.write(`\n[${label}]\n${sanitize(result.stderr)}`);
}
for (const [label, service] of [
  ["api-service", apiService],
  ["web-service", webService],
]) {
  if (service?.output.stdout)
    process.stdout.write(`\n[${label}]\n${sanitize(service.output.stdout)}`);
  if (service?.output.stderr)
    process.stderr.write(`\n[${label}]\n${sanitize(service.output.stderr)}`);
}
process.exitCode = outcome.classification === "PASS" ? 0 : 1;
