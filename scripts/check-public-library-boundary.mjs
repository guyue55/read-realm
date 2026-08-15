#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(repoRoot, "apps/api/src/modules/public-library");
const forbidden = [
  /modules\/database\/schema/u,
  /BookRepository/u,
  /ChapterRepository/u,
  /ShareToken/u,
  /x-share-token/iu,
  /READER_SQLITE_DB_PATH/u,
  /READER_BLOB_STORAGE_PATH/u,
];

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const violations = [];
for (const path of files(root)) {
  if (extname(path) !== ".ts" || /\.spec\.ts$/u.test(path)) continue;
  const source = readFileSync(path, "utf8");
  for (const rule of forbidden) {
    if (rule.test(source)) violations.push({ path, rule: String(rule) });
  }
}
if (violations.length > 0) {
  process.stderr.write(`${JSON.stringify(violations, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("PUBLIC_PRIVATE_BOUNDARY_OK\n");
}
