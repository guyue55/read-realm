import type { LocalDataSnapshotEnvelope } from "@reader/shared-types";
import {
  parseLocalDataSnapshot,
  serializeLocalDataSnapshot,
} from "./local-snapshot.js";

const SNAPSHOT_PATH = "data/local-snapshot-v1.json";

export interface PortableBackupManifestEntry {
  path: string;
  mediaType: "application/json";
  byteLength: number;
  sha256: string;
}

export interface PortableBackupPackageV1 {
  kind: "read-realm-portable-backup";
  packageVersion: 1;
  createdAt: string;
  source: LocalDataSnapshotEnvelope["source"];
  manifest: {
    algorithm: "SHA-256";
    entryCount: number;
    entries: PortableBackupManifestEntry[];
  };
  entries: Record<string, string>;
}

export interface PortableBackupPreview {
  contentId: string;
  packageVersion: 1;
  createdAt: string;
  source: LocalDataSnapshotEnvelope["source"];
  counts: {
    books: number;
    chapters: number;
    progress: number;
    bookmarks: number;
    fileRefs: number;
  };
  restoreModes: ["copy"];
  warnings: string[];
  snapshot: LocalDataSnapshotEnvelope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSafeEntryPath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("PORTABLE_BACKUP_UNSAFE_ENTRY_PATH");
  }
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = utf8(value);
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function serializePackage(value: PortableBackupPackageV1): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function decodePackage(value: string): PortableBackupPackageV1 {
  const decoded: unknown = JSON.parse(value);
  if (!isRecord(decoded)) {
    throw new Error("PORTABLE_BACKUP_INVALID_PACKAGE");
  }
  if (decoded.packageVersion !== 1) {
    throw new Error(
      `UNSUPPORTED_PORTABLE_BACKUP_VERSION:${String(decoded.packageVersion)}`,
    );
  }
  if (
    decoded.kind !== "read-realm-portable-backup" ||
    typeof decoded.createdAt !== "string" ||
    !isRecord(decoded.source) ||
    typeof decoded.source.appVersion !== "string" ||
    typeof decoded.source.databaseVersion !== "number" ||
    !Number.isInteger(decoded.source.databaseVersion) ||
    decoded.source.databaseVersion < 0 ||
    !isRecord(decoded.manifest) ||
    decoded.manifest.algorithm !== "SHA-256" ||
    !Number.isInteger(decoded.manifest.entryCount) ||
    !Array.isArray(decoded.manifest.entries) ||
    !isRecord(decoded.entries)
  ) {
    throw new Error("PORTABLE_BACKUP_INVALID_PACKAGE");
  }

  const seen = new Set<string>();
  for (const rawEntry of decoded.manifest.entries) {
    if (
      !isRecord(rawEntry) ||
      typeof rawEntry.path !== "string" ||
      rawEntry.mediaType !== "application/json" ||
      typeof rawEntry.byteLength !== "number" ||
      !Number.isInteger(rawEntry.byteLength) ||
      rawEntry.byteLength < 0 ||
      typeof rawEntry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(rawEntry.sha256)
    ) {
      throw new Error("PORTABLE_BACKUP_INVALID_MANIFEST_ENTRY");
    }
    assertSafeEntryPath(rawEntry.path);
    if (seen.has(rawEntry.path)) {
      throw new Error("PORTABLE_BACKUP_DUPLICATE_MANIFEST_PATH");
    }
    seen.add(rawEntry.path);
  }

  if (decoded.manifest.entryCount !== decoded.manifest.entries.length) {
    throw new Error("PORTABLE_BACKUP_MANIFEST_COUNT_MISMATCH");
  }
  const payloadPaths = Object.keys(decoded.entries);
  if (
    payloadPaths.length !== seen.size ||
    payloadPaths.some((path) => !seen.has(path))
  ) {
    throw new Error("PORTABLE_BACKUP_ENTRY_SET_MISMATCH");
  }
  for (const path of payloadPaths) {
    assertSafeEntryPath(path);
    if (typeof decoded.entries[path] !== "string") {
      throw new Error("PORTABLE_BACKUP_INVALID_ENTRY_PAYLOAD");
    }
  }

  return decoded as unknown as PortableBackupPackageV1;
}

export async function createPortableBackupPackage(
  snapshot: LocalDataSnapshotEnvelope,
): Promise<string> {
  const payload = serializeLocalDataSnapshot(snapshot);
  const bytes = utf8(payload);
  const entry: PortableBackupManifestEntry = {
    path: SNAPSHOT_PATH,
    mediaType: "application/json",
    byteLength: bytes.byteLength,
    sha256: await sha256(payload),
  };
  return serializePackage({
    kind: "read-realm-portable-backup",
    packageVersion: 1,
    createdAt: snapshot.createdAt,
    source: snapshot.source,
    manifest: {
      algorithm: "SHA-256",
      entryCount: 1,
      entries: [entry],
    },
    entries: { [SNAPSHOT_PATH]: payload },
  });
}

export async function inspectPortableBackupPackage(
  serialized: string,
): Promise<PortableBackupPreview> {
  const backup = decodePackage(serialized);
  for (const manifestEntry of backup.manifest.entries) {
    const payload = backup.entries[manifestEntry.path];
    if (
      payload === undefined ||
      utf8(payload).byteLength !== manifestEntry.byteLength ||
      (await sha256(payload)) !== manifestEntry.sha256
    ) {
      throw new Error(`PORTABLE_BACKUP_ENTRY_INTEGRITY_MISMATCH:${manifestEntry.path}`);
    }
  }

  const snapshotPayload = backup.entries[SNAPSHOT_PATH];
  if (snapshotPayload === undefined) {
    throw new Error("PORTABLE_BACKUP_SNAPSHOT_ENTRY_MISSING");
  }
  const snapshot = parseLocalDataSnapshot(snapshotPayload);
  const snapshotManifest = backup.manifest.entries.find(
    (entry) => entry.path === SNAPSHOT_PATH,
  );
  if (!snapshotManifest) {
    throw new Error("PORTABLE_BACKUP_SNAPSHOT_MANIFEST_MISSING");
  }
  if (
    snapshot.createdAt !== backup.createdAt ||
    snapshot.source.appVersion !== backup.source.appVersion ||
    snapshot.source.databaseVersion !== backup.source.databaseVersion
  ) {
    throw new Error("PORTABLE_BACKUP_ENVELOPE_MISMATCH");
  }

  return {
    contentId: snapshotManifest.sha256,
    packageVersion: 1,
    createdAt: backup.createdAt,
    source: backup.source,
    counts: {
      books: snapshot.data.books.length,
      chapters: snapshot.data.chapters.length,
      progress: snapshot.data.progress.length,
      bookmarks: snapshot.data.bookmarks.length,
      fileRefs: snapshot.data.fileRefs.length,
    },
    restoreModes: ["copy"],
    warnings:
      snapshot.data.fileRefs.length > 0
        ? ["备份包含外部文件引用；恢复前需要重新绑定来源。"]
        : [],
    snapshot,
  };
}
