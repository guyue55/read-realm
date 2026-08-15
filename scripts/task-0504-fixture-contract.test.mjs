import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const spec = readFileSync(
  resolve(
    repoRoot,
    "apps/web-pwa/e2e/task-0504-public-library-expansion.spec.ts",
  ),
  "utf8",
);
const config = readFileSync(
  resolve(repoRoot, "apps/web-pwa/playwright.task-0504-expansion.config.ts"),
  "utf8",
);

test("freezes one production journey and the exact executed marker", () => {
  assert.match(
    config,
    /testMatch: "task-0504-public-library-expansion\.spec\.ts"/u,
  );
  assert.doesNotMatch(config, /webServer/u);
  assert.match(config, /READING_WORLD_TASK_0504_OUTPUT_DIR/u);
  assert.equal(
    (
      spec.match(
        /test\("TASK-0504 mixed-source production expansion journey"/gu,
      ) ?? []
    ).length,
    1,
  );
  assert.equal(
    (spec.match(/TASK0504_PRODUCT_STAGE_ENTERED=TASK-0504/gu) ?? []).length,
    1,
  );
  assert.equal(
    (spec.match(/TASK0504_EXPANSION_OBSERVATION=/gu) ?? []).length,
    1,
  );
});

test("freezes the mixed 16 plus 7 plus 1 plus 1 fixture", () => {
  assert.match(spec, /index < 7/u);
  assert.match(spec, /new File/u);
  assert.match(spec, /scanCreatedCount: 16/u);
  assert.match(spec, /folderCreatedCount: 7/u);
  assert.match(spec, /directCreatedCount: 1/u);
  assert.match(spec, /personalCreatedCount: 1/u);
  assert.match(spec, /baselineBookCount: 25/u);
  assert.match(spec, /pageOneCount: 24/u);
  assert.match(spec, /pageTwoCount: 1/u);
});

test("keeps public, anonymous, and personal request credentials separated", () => {
  assert.match(spec, /x-public-library-maintenance-key/u);
  assert.match(spec, /x-share-token/u);
  assert.match(spec, /anonymousReads/u);
  assert.match(spec, /personalRequests/u);
  assert.match(spec, /personalBrowserFactsUnchanged/u);
  assert.match(spec, /服务端目录扫描失败/u);
  assert.match(spec, /fixed public failure/u);
  assert.match(spec, /馆藏刚刚有更新/u);
  assert.match(spec, /delayedOldResponse/u);
  assert.match(spec, /mixed-invalid\.epub/u);
  assert.match(spec, /已存在 2/u);
  assert.match(spec, /仅支持 TXT 文件/u);
  assert.ok(
    (spec.match(/readJoinedBookThroughShelf\(page, joinedBookId\)/gu) ?? [])
      .length >= 2,
  );
});

test("binds the same-now publication plus overlay revision regression", () => {
  const repositoryTest = readFileSync(
    resolve(
      repoRoot,
      "apps/api/src/modules/public-library/public-library.repository.spec.ts",
    ),
    "utf8",
  );
  assert.match(
    repositoryTest,
    /expect\(programming\.publishedAt\)\.toBe\(classics\.publishedAt\)/u,
  );
  assert.match(
    repositoryTest,
    /for \(const view of \['maintainers', 'categories', 'tags'\]/u,
  );
  assert.match(repositoryTest, /PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE/u);
});
