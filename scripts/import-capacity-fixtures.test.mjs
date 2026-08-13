import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/generate-import-capacity-fixtures.mjs");

test("quick profile creates verifiable TXT and EPUB fixtures", async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "reading-world-capacity-"));
  const output = resolve(temporaryRoot, "fixtures");
  try {
    const generated = spawnSync(process.execPath, [script, "--profile", "quick", "--output", output], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(generated.status, 0, generated.stderr);

    const manifest = JSON.parse(await readFile(resolve(output, "manifest.json"), "utf8"));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.profile, "quick");
    assert.deepEqual(manifest.fixtures.map((fixture) => fixture.kind), [
      "txt-capacity-and-chapters",
      "epub-capacity",
    ]);
    for (const fixture of manifest.fixtures) {
      assert.match(fixture.sha256, /^[a-f0-9]{64}$/);
      assert.equal((await stat(resolve(output, fixture.filename))).size, fixture.actualBytes);
      assert.ok(fixture.actualBytes >= fixture.minimumBytes);
    }
    const txt = new TextDecoder("utf-8", { fatal: true }).decode(
      await readFile(resolve(output, "capacity-and-chapters.txt")),
    );
    assert.equal((txt.match(/^第\d+章 固定容量章$/gm) ?? []).length, 100);

    const verified = spawnSync(process.execPath, [script, "--verify", resolve(output, "manifest.json")], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /verified=2/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("refuses unknown profiles before creating output", () => {
  const result = spawnSync(process.execPath, [script, "--profile", "huge"], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /IMPORT_CAPACITY_PROFILE_INVALID/);
});

test("replace only accepts a directory owned by this generator", async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "reading-world-capacity-replace-"));
  const output = resolve(temporaryRoot, "fixtures");
  try {
    const first = spawnSync(process.execPath, [script, "--profile", "quick", "--output", output], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(first.status, 0, first.stderr);
    const replaced = spawnSync(process.execPath, [
      script,
      "--profile", "quick",
      "--output", output,
      "--replace", "true",
    ], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(replaced.status, 0, replaced.stderr);

    const foreign = resolve(temporaryRoot, "foreign");
    await import("node:fs/promises").then(({ mkdir, writeFile }) =>
      mkdir(foreign).then(() => writeFile(resolve(foreign, "manifest.json"), "{}")),
    );
    const refused = spawnSync(process.execPath, [
      script,
      "--profile", "quick",
      "--output", foreign,
      "--replace", "true",
    ], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /IMPORT_CAPACITY_REPLACE_REFUSED/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("clean removes only a verified generator-owned fixture directory", async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "reading-world-capacity-clean-"));
  const output = resolve(temporaryRoot, "fixtures");
  try {
    const generated = spawnSync(process.execPath, [script, "--profile", "quick", "--output", output], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(generated.status, 0, generated.stderr);
    const cleaned = spawnSync(process.execPath, [script, "--clean", resolve(output, "manifest.json")], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(cleaned.status, 0, cleaned.stderr);
    await assert.rejects(stat(output), { code: "ENOENT" });

    const foreign = resolve(temporaryRoot, "foreign");
    await import("node:fs/promises").then(({ mkdir, writeFile }) =>
      mkdir(foreign).then(() => writeFile(resolve(foreign, "manifest.json"), JSON.stringify({
        schemaVersion: 1,
        generator: "scripts/generate-import-capacity-fixtures.mjs",
        fixtures: [],
      }))),
    );
    const refused = spawnSync(process.execPath, [script, "--clean", resolve(foreign, "manifest.json")], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /IMPORT_CAPACITY_(?:MANIFEST_INVALID|CLEAN_REFUSED)/);
    assert.equal((await stat(foreign)).isDirectory(), true);

    const mixed = resolve(temporaryRoot, "mixed");
    const mixedGenerated = spawnSync(process.execPath, [script, "--profile", "quick", "--output", mixed], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(mixedGenerated.status, 0, mixedGenerated.stderr);
    await import("node:fs/promises").then(({ writeFile }) => writeFile(resolve(mixed, "keep.txt"), "user data"));
    const mixedRefused = spawnSync(process.execPath, [script, "--clean", resolve(mixed, "manifest.json")], {
      cwd: resolve("."),
      encoding: "utf8",
    });
    assert.equal(mixedRefused.status, 1);
    assert.match(mixedRefused.stderr, /IMPORT_CAPACITY_CLEAN_REFUSED/);
    assert.equal((await stat(resolve(mixed, "capacity.epub"))).isFile(), true);
    assert.equal((await stat(resolve(mixed, "keep.txt"))).isFile(), true);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
