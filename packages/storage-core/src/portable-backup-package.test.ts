import { describe, expect, it } from "vitest";
import type { LocalDataSnapshotEnvelope } from "@reader/shared-types";
import {
  createPortableBackupPackage,
  inspectPortableBackupPackage,
} from "./portable-backup-package";

const snapshot: LocalDataSnapshotEnvelope = {
  kind: "read-realm-local-snapshot",
  schemaVersion: 1,
  createdAt: "2026-08-13T22:40:00+08:00",
  source: { appVersion: "0.1.0", databaseVersion: 10 },
  data: {
    books: [
      {
        id: "book-1",
        title: "可携带世界",
        sourceType: "upload",
        format: "txt",
        status: "reading",
        tags: [],
        chapterCount: 1,
        createdAt: "2026-08-13T22:39:00+08:00",
        updatedAt: "2026-08-13T22:39:00+08:00",
      },
    ],
    chapters: [
      {
        id: "chapter-1",
        bookId: "book-1",
        index: 0,
        title: "第一章",
        content: "包内正文。",
      },
    ],
    progress: [
      {
        bookId: "book-1",
        chapterId: "chapter-1",
        chapterIndex: 0,
        offset: 3,
        percentage: 50,
        updatedAt: "2026-08-13T22:40:00+08:00",
      },
    ],
    bookmarks: [
      {
        id: "bookmark-1",
        bookId: "book-1",
        chapterIndex: 0,
        offset: 3,
        contentPreview: "包内正文",
        createdAt: "2026-08-13T22:40:00+08:00",
        note: "保留这句话",
      },
    ],
    settings: {
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "scroll",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    },
    fileRefs: [],
  },
};

describe("portable backup package", () => {
  it("creates a deterministic v1 package with a SHA-256 manifest", async () => {
    const first = await createPortableBackupPackage(snapshot);
    const second = await createPortableBackupPackage(snapshot);

    expect(second).toBe(first);
    const decoded = JSON.parse(first);
    expect(decoded).toMatchObject({
      kind: "read-realm-portable-backup",
      packageVersion: 1,
      createdAt: snapshot.createdAt,
      source: snapshot.source,
      manifest: {
        algorithm: "SHA-256",
        entryCount: 1,
        entries: [
          {
            path: "data/local-snapshot-v1.json",
            mediaType: "application/json",
            byteLength: expect.any(Number),
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        ],
      },
    });
    expect(Object.keys(decoded.entries)).toEqual([
      "data/local-snapshot-v1.json",
    ]);
  });

  it("returns a read-only impact preview after validating every manifest item", async () => {
    const serialized = await createPortableBackupPackage(snapshot);

    await expect(inspectPortableBackupPackage(serialized)).resolves.toEqual({
      contentId: expect.stringMatching(/^[a-f0-9]{64}$/),
      packageVersion: 1,
      createdAt: snapshot.createdAt,
      source: snapshot.source,
      counts: {
        books: 1,
        chapters: 1,
        progress: 1,
        bookmarks: 1,
        fileRefs: 0,
      },
      restoreModes: ["merge", "copy"],
      warnings: [],
      snapshot,
    });
  });

  it("rejects payload tampering before returning a preview", async () => {
    const decoded = JSON.parse(await createPortableBackupPackage(snapshot));
    decoded.entries["data/local-snapshot-v1.json"] = decoded.entries[
      "data/local-snapshot-v1.json"
    ].replace("包内正文。", "被篡改的正文。");

    await expect(
      inspectPortableBackupPackage(`${JSON.stringify(decoded)}\n`),
    ).rejects.toThrow("PORTABLE_BACKUP_ENTRY_INTEGRITY_MISMATCH");
  });

  it("rejects missing, duplicate, unlisted and traversal entry paths", async () => {
    const valid = JSON.parse(await createPortableBackupPackage(snapshot));

    const missing = structuredClone(valid);
    delete missing.entries["data/local-snapshot-v1.json"];
    await expect(
      inspectPortableBackupPackage(`${JSON.stringify(missing)}\n`),
    ).rejects.toThrow("PORTABLE_BACKUP_ENTRY_SET_MISMATCH");

    const duplicate = structuredClone(valid);
    duplicate.manifest.entries.push(duplicate.manifest.entries[0]);
    duplicate.manifest.entryCount = 2;
    await expect(
      inspectPortableBackupPackage(`${JSON.stringify(duplicate)}\n`),
    ).rejects.toThrow("PORTABLE_BACKUP_DUPLICATE_MANIFEST_PATH");

    const unlisted = structuredClone(valid);
    unlisted.entries["data/unlisted.json"] = "{}";
    await expect(
      inspectPortableBackupPackage(`${JSON.stringify(unlisted)}\n`),
    ).rejects.toThrow("PORTABLE_BACKUP_ENTRY_SET_MISMATCH");

    const traversal = structuredClone(valid);
    traversal.manifest.entries[0].path = "../local-snapshot.json";
    traversal.entries["../local-snapshot.json"] =
      traversal.entries["data/local-snapshot-v1.json"];
    delete traversal.entries["data/local-snapshot-v1.json"];
    await expect(
      inspectPortableBackupPackage(`${JSON.stringify(traversal)}\n`),
    ).rejects.toThrow("PORTABLE_BACKUP_UNSAFE_ENTRY_PATH");
  });

  it("rejects future package versions with a stable error", async () => {
    const decoded = JSON.parse(await createPortableBackupPackage(snapshot));
    decoded.packageVersion = 2;

    await expect(
      inspectPortableBackupPackage(`${JSON.stringify(decoded)}\n`),
    ).rejects.toThrow("UNSUPPORTED_PORTABLE_BACKUP_VERSION:2");
  });

  it("rejects invalid database versions and negative manifest sizes", async () => {
    const invalidDatabaseVersion = JSON.parse(
      await createPortableBackupPackage(snapshot),
    );
    invalidDatabaseVersion.source.databaseVersion = -1;
    await expect(
      inspectPortableBackupPackage(
        `${JSON.stringify(invalidDatabaseVersion)}\n`,
      ),
    ).rejects.toThrow("PORTABLE_BACKUP_INVALID_PACKAGE");

    const negativeSize = JSON.parse(await createPortableBackupPackage(snapshot));
    negativeSize.manifest.entries[0].byteLength = -1;
    await expect(
      inspectPortableBackupPackage(`${JSON.stringify(negativeSize)}\n`),
    ).rejects.toThrow("PORTABLE_BACKUP_INVALID_MANIFEST_ENTRY");
  });
});
