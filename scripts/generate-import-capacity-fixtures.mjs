#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(code, message = code) {
  process.stderr.write(`${message}\n`);
  process.exitCode = code === "IMPORT_CAPACITY_PROFILE_INVALID" ? 2 : 1;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`IMPORT_CAPACITY_ARGUMENT_INVALID:${name ?? "missing"}`);
    }
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function writeRepeated(stream, chunk, minimumBytes) {
  let written = 0;
  while (written < minimumBytes) {
    const remaining = minimumBytes - written;
    const bytes = remaining < chunk.length ? chunk.subarray(0, remaining) : chunk;
    if (!stream.write(bytes)) await once(stream, "drain");
    written += bytes.length;
  }
  stream.end();
  await once(stream, "finish");
}

async function writeTxt(path, minimumBytes, chapterCount) {
  const stream = createWriteStream(path, { flags: "wx" });
  let written = 0;
  for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
    const bytes = Buffer.from(`第${chapter}章 固定容量章\n这是用于本地导入压力验证的确定性正文。\n\n`);
    if (!stream.write(bytes)) await once(stream, "drain");
    written += bytes.length;
  }
  const filler = Buffer.from("容量填充正文，不含章节标题。\n".repeat(4096));
  while (written < minimumBytes) {
    if (!stream.write(filler)) await once(stream, "drain");
    written += filler.length;
  }
  stream.end();
  await once(stream, "finish");
}

async function writeEpub(path, minimumBytes, scratchRoot) {
  const root = resolve(scratchRoot, "epub");
  mkdirSync(resolve(root, "META-INF"), { recursive: true });
  mkdirSync(resolve(root, "OEBPS"), { recursive: true });
  writeFileSync(resolve(root, "mimetype"), "application/epub+zip");
  writeFileSync(
    resolve(root, "META-INF/container.xml"),
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  writeFileSync(
    resolve(root, "OEBPS/content.opf"),
    '<?xml version="1.0"?><package version="2.0" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>固定容量 EPUB</dc:title></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="payload" href="payload.bin" media-type="application/octet-stream"/></manifest><spine><itemref idref="chapter"/></spine></package>',
  );
  writeFileSync(
    resolve(root, "OEBPS/chapter.xhtml"),
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head><body><h1>第一章</h1><p>固定容量 EPUB 正文。</p></body></html>',
  );
  const payloadBytes = minimumBytes;
  const payload = createWriteStream(resolve(root, "OEBPS/payload.bin"), { flags: "wx" });
  const chunk = Buffer.alloc(1024 * 1024);
  for (let index = 0; index < chunk.length; index += 1) chunk[index] = index % 251;
  await writeRepeated(payload, chunk, payloadBytes);

  const zipped = spawnSync("zip", ["-X", "-0", "-q", path, "mimetype"], {
    cwd: root,
    encoding: "utf8",
  });
  if (zipped.status !== 0) throw new Error(`IMPORT_CAPACITY_ZIP_FAILED:${zipped.stderr}`);
  const appended = spawnSync("zip", ["-X", "-0", "-q", "-r", path, "META-INF", "OEBPS"], {
    cwd: root,
    encoding: "utf8",
  });
  if (appended.status !== 0) throw new Error(`IMPORT_CAPACITY_ZIP_FAILED:${appended.stderr}`);
  if (statSync(path).size < minimumBytes) {
    throw new Error(`IMPORT_CAPACITY_EPUB_TOO_SMALL:${statSync(path).size}:${minimumBytes}`);
  }
}

function sha256(path) {
  const hash = createHash("sha256");
  return new Promise((resolveHash, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function verifyManifest(manifestPath) {
  const absoluteManifest = resolve(manifestPath);
  const manifest = JSON.parse(readFileSync(absoluteManifest, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.fixtures)) {
    throw new Error("IMPORT_CAPACITY_MANIFEST_INVALID");
  }
  for (const fixture of manifest.fixtures) {
    const path = resolve(dirname(absoluteManifest), fixture.filename);
    if (!existsSync(path)) throw new Error(`IMPORT_CAPACITY_FIXTURE_MISSING:${fixture.filename}`);
    const size = statSync(path).size;
    if (size !== fixture.actualBytes || size < fixture.minimumBytes) {
      throw new Error(`IMPORT_CAPACITY_SIZE_MISMATCH:${fixture.filename}`);
    }
    if (await sha256(path) !== fixture.sha256) {
      throw new Error(`IMPORT_CAPACITY_SHA_MISMATCH:${fixture.filename}`);
    }
  }
  process.stdout.write(`verified=${manifest.fixtures.length}\n`);
}

function readOwnedManifest(manifestPath) {
  const absoluteManifest = resolve(manifestPath);
  if (!existsSync(absoluteManifest) || absoluteManifest !== resolve(dirname(absoluteManifest), "manifest.json")) {
    throw new Error(`IMPORT_CAPACITY_CLEAN_REFUSED:${absoluteManifest}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(absoluteManifest, "utf8"));
  } catch {
    throw new Error(`IMPORT_CAPACITY_CLEAN_REFUSED:${absoluteManifest}`);
  }
  if (
    manifest.schemaVersion !== 1 ||
    manifest.generator !== "scripts/generate-import-capacity-fixtures.mjs" ||
    !Array.isArray(manifest.fixtures) ||
    manifest.fixtures.length !== 2
  ) {
    throw new Error(`IMPORT_CAPACITY_CLEAN_REFUSED:${absoluteManifest}`);
  }
  const root = dirname(absoluteManifest);
  const expectedNames = new Set(["capacity-and-chapters.txt", "capacity.epub"]);
  for (const fixture of manifest.fixtures) {
    if (!expectedNames.delete(fixture.filename)) {
      throw new Error(`IMPORT_CAPACITY_CLEAN_REFUSED:${absoluteManifest}`);
    }
    const fixturePath = resolve(root, fixture.filename);
    if (dirname(fixturePath) !== root || !existsSync(fixturePath)) {
      throw new Error(`IMPORT_CAPACITY_CLEAN_REFUSED:${absoluteManifest}`);
    }
  }
  if (expectedNames.size !== 0) throw new Error(`IMPORT_CAPACITY_CLEAN_REFUSED:${absoluteManifest}`);
  const entries = readdirSync(root).sort();
  if (entries.join("\n") !== ["capacity-and-chapters.txt", "capacity.epub", "manifest.json"].join("\n")) {
    throw new Error(`IMPORT_CAPACITY_CLEAN_REFUSED:${absoluteManifest}`);
  }
  return { absoluteManifest, manifest, root };
}

async function cleanOwnedFixtures(manifestPath) {
  await verifyManifest(manifestPath);
  const { absoluteManifest, manifest, root } = readOwnedManifest(manifestPath);
  for (const fixture of manifest.fixtures) unlinkSync(resolve(root, fixture.filename));
  unlinkSync(absoluteManifest);
  rmdirSync(root);
  process.stdout.write(`cleaned=${root}\n`);
}

function replaceOwnedOutput(outputRoot) {
  const manifestPath = resolve(outputRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`IMPORT_CAPACITY_REPLACE_REFUSED:${outputRoot}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error(`IMPORT_CAPACITY_REPLACE_REFUSED:${outputRoot}`);
  }
  if (
    manifest.schemaVersion !== 1 ||
    manifest.generator !== "scripts/generate-import-capacity-fixtures.mjs" ||
    !Array.isArray(manifest.fixtures)
  ) {
    throw new Error(`IMPORT_CAPACITY_REPLACE_REFUSED:${outputRoot}`);
  }
  rmSync(outputRoot, { recursive: true, force: true });
}

async function generate(profile, output, replace) {
  const profiles = {
    quick: { txtBytes: 256 * 1024, epubBytes: 512 * 1024, chapters: 100 },
    full: { txtBytes: 200 * 1024 * 1024, epubBytes: 500 * 1024 * 1024, chapters: 10_000 },
  };
  const selected = profiles[profile];
  if (!selected) {
    fail("IMPORT_CAPACITY_PROFILE_INVALID");
    return;
  }
  const outputRoot = resolve(output ?? `.tmp/import-capacity/${profile}`);
  if (existsSync(outputRoot)) {
    if (replace === "true") replaceOwnedOutput(outputRoot);
    else throw new Error(`IMPORT_CAPACITY_OUTPUT_EXISTS:${outputRoot}`);
  }
  mkdirSync(outputRoot, { recursive: true });
  const scratch = mkdtempSync(resolve(tmpdir(), "reading-world-epub-"));
  try {
    const txtPath = resolve(outputRoot, "capacity-and-chapters.txt");
    const epubPath = resolve(outputRoot, "capacity.epub");
    await writeTxt(txtPath, selected.txtBytes, selected.chapters);
    await writeEpub(epubPath, selected.epubBytes, scratch);
    const definitions = [
      {
        kind: "txt-capacity-and-chapters",
        filename: "capacity-and-chapters.txt",
        minimumBytes: selected.txtBytes,
        expectedChapterCount: selected.chapters,
      },
      {
        kind: "epub-capacity",
        filename: "capacity.epub",
        minimumBytes: selected.epubBytes,
        expectedChapterCount: 1,
      },
    ];
    const fixtures = [];
    for (const definition of definitions) {
      const path = resolve(outputRoot, definition.filename);
      fixtures.push({
        ...definition,
        actualBytes: statSync(path).size,
        sha256: await sha256(path),
      });
    }
    const manifest = {
      schemaVersion: 1,
      profile,
      generator: "scripts/generate-import-capacity-fixtures.mjs",
      fixtures,
    };
    writeFileSync(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`manifest=${resolve(outputRoot, "manifest.json")}\n`);
  } catch (error) {
    rmSync(outputRoot, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.clean) {
    await cleanOwnedFixtures(options.clean);
  } else if (options.verify) {
    await verifyManifest(options.verify);
  } else {
    await generate(options.profile ?? "quick", options.output, options.replace);
  }
} catch (error) {
  fail("IMPORT_CAPACITY_GENERATION_FAILED", error instanceof Error ? error.message : String(error));
}
