import { describe, expect, it, vi } from "vitest";
import type { LocalDataSnapshotEnvelope } from "@reader/shared-types";
import {
  createDefaultLocalDataMigrations,
  runRecoverableLocalDataMigration,
  type LocalDataMigrationStore,
} from "./local-data-migration";
import { parseLocalDataSnapshot, serializeLocalDataSnapshot } from "./local-snapshot";

function versionEightSnapshot(): LocalDataSnapshotEnvelope {
  return {
    kind: "read-realm-local-snapshot",
    schemaVersion: 1,
    createdAt: "2026-08-13T05:15:00+08:00",
    source: { appVersion: "0.1.0", databaseVersion: 8 },
    data: {
      books: [
        {
          id: "book-1",
          title: "迁移样本",
          sourceType: "upload",
          format: "txt",
          status: "reading",
          tags: [],
          chapterCount: 1,
          createdAt: "2026-08-13T05:00:00+08:00",
          updatedAt: "2026-08-13T05:00:00+08:00",
        },
      ],
      chapters: [
        {
          id: "chapter-1",
          bookId: "book-1",
          index: 0,
          title: "第一章",
          content: "旧版数据仍可阅读。",
        },
      ],
      progress: [
        {
          bookId: "book-1",
          chapterId: "chapter-1",
          chapterIndex: 0,
          offset: 12,
          percentage: 10,
          updatedAt: "2026-08-13T05:05:00+08:00",
        },
      ],
      bookmarks: [],
      settings: {
        fontFamily: "kaiti",
        fontSize: 18,
        lineHeight: 1.8,
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
}

function memoryStore(initial: LocalDataSnapshotEnvelope) {
  let current = structuredClone(initial);
  let backup: string | null = null;
  const events: string[] = [];
  const store: LocalDataMigrationStore = {
    readCurrent: vi.fn(async () => structuredClone(current)),
    replaceCurrent: vi.fn(async (snapshot) => {
      events.push(`replace:${snapshot.source.databaseVersion}`);
      current = structuredClone(snapshot);
    }),
    saveBackup: vi.fn(async (serialized) => {
      events.push("backup:save");
      backup = serialized;
    }),
    readBackup: vi.fn(async () => {
      events.push("backup:read");
      return backup;
    }),
  };
  return {
    store,
    events,
    current: () => structuredClone(current),
    backup: () => backup,
  };
}

describe("recoverable local data migration", () => {
  it("backs up and verifies v8 before preserving all data into v9", async () => {
    const initial = versionEightSnapshot();
    const memory = memoryStore(initial);

    const result = await runRecoverableLocalDataMigration({
      store: memory.store,
      targetDatabaseVersion: 9,
      migrations: createDefaultLocalDataMigrations(),
    });

    expect(result).toEqual({
      status: "migrated",
      fromVersion: 8,
      toVersion: 9,
      backupVerified: true,
    });
    expect(memory.events).toEqual(["backup:save", "backup:read", "replace:9"]);
    expect(parseLocalDataSnapshot(memory.backup()!)).toEqual(initial);
    expect(memory.current()).toEqual({
      ...initial,
      source: { ...initial.source, databaseVersion: 9 },
    });
  });

  it("is idempotent when the database is already at the target version", async () => {
    const current = versionEightSnapshot();
    current.source.databaseVersion = 9;
    const memory = memoryStore(current);

    const result = await runRecoverableLocalDataMigration({
      store: memory.store,
      targetDatabaseVersion: 9,
      migrations: createDefaultLocalDataMigrations(),
    });

    expect(result.status).toBe("already_current");
    expect(memory.store.saveBackup).not.toHaveBeenCalled();
    expect(memory.store.replaceCurrent).not.toHaveBeenCalled();
    expect(memory.current()).toEqual(current);
  });

  it("restores and verifies the old snapshot after an injected post-write failure", async () => {
    const initial = versionEightSnapshot();
    const memory = memoryStore(initial);

    await expect(
      runRecoverableLocalDataMigration({
        store: memory.store,
        targetDatabaseVersion: 9,
        migrations: createDefaultLocalDataMigrations(),
        verifyMigrated: async () => {
          throw new Error("INJECTED_POST_WRITE_FAILURE");
        },
      }),
    ).rejects.toThrow("LOCAL_DATA_MIGRATION_FAILED_ROLLED_BACK");

    expect(memory.events).toEqual([
      "backup:save",
      "backup:read",
      "replace:9",
      "backup:read",
      "replace:8",
    ]);
    expect(memory.current()).toEqual(initial);
  });

  it("does not overwrite current data when the backup cannot be read back exactly", async () => {
    const initial = versionEightSnapshot();
    const memory = memoryStore(initial);
    const chapter = initial.data.chapters[0];
    if (!chapter) throw new Error("TEST_FIXTURE_CHAPTER_MISSING");
    memory.store.readBackup = vi.fn(async () =>
      serializeLocalDataSnapshot({
        ...initial,
        data: {
          ...initial.data,
          chapters: [
            {
              ...chapter,
              content: "回读备份被篡改。",
            },
          ],
        },
      }),
    );

    await expect(
      runRecoverableLocalDataMigration({
        store: memory.store,
        targetDatabaseVersion: 9,
        migrations: createDefaultLocalDataMigrations(),
      }),
    ).rejects.toThrow("LOCAL_DATA_MIGRATION_BACKUP_VERIFICATION_FAILED");

    expect(memory.store.replaceCurrent).not.toHaveBeenCalled();
    expect(memory.current()).toEqual(initial);
  });

  it("reports rollback failure without hiding the original migration error", async () => {
    const initial = versionEightSnapshot();
    const memory = memoryStore(initial);
    memory.store.replaceCurrent = vi
      .fn<(snapshot: LocalDataSnapshotEnvelope) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("INJECTED_ROLLBACK_FAILURE"));

    await expect(
      runRecoverableLocalDataMigration({
        store: memory.store,
        targetDatabaseVersion: 9,
        migrations: createDefaultLocalDataMigrations(),
        verifyMigrated: async () => {
          throw new Error("INJECTED_MIGRATION_FAILURE");
        },
      }),
    ).rejects.toThrow(
      "LOCAL_DATA_MIGRATION_FAILED_ROLLBACK_FAILED:INJECTED_MIGRATION_FAILURE:INJECTED_ROLLBACK_FAILURE",
    );
  });

  it("fails before backup or writes when no complete migration path exists", async () => {
    const initial = versionEightSnapshot();
    const memory = memoryStore(initial);

    await expect(
      runRecoverableLocalDataMigration({
        store: memory.store,
        targetDatabaseVersion: 10,
        migrations: createDefaultLocalDataMigrations(),
      }),
    ).rejects.toThrow("LOCAL_DATA_MIGRATION_PATH_MISSING:9:10");

    expect(memory.store.saveBackup).not.toHaveBeenCalled();
    expect(memory.store.replaceCurrent).not.toHaveBeenCalled();
    expect(memory.current()).toEqual(initial);
  });

  it("never changes current data when backup persistence itself fails", async () => {
    const initial = versionEightSnapshot();
    const memory = memoryStore(initial);
    memory.store.saveBackup = vi.fn(async () => {
      throw new Error("INJECTED_BACKUP_WRITE_FAILURE");
    });

    await expect(
      runRecoverableLocalDataMigration({
        store: memory.store,
        targetDatabaseVersion: 9,
        migrations: createDefaultLocalDataMigrations(),
      }),
    ).rejects.toThrow("INJECTED_BACKUP_WRITE_FAILURE");

    expect(memory.store.readBackup).not.toHaveBeenCalled();
    expect(memory.store.replaceCurrent).not.toHaveBeenCalled();
    expect(memory.current()).toEqual(initial);
  });

  it("does not perform a compensating write when a migration step fails before replacement", async () => {
    const initial = versionEightSnapshot();
    const memory = memoryStore(initial);

    await expect(
      runRecoverableLocalDataMigration({
        store: memory.store,
        targetDatabaseVersion: 9,
        migrations: [
          {
            fromVersion: 8,
            toVersion: 9,
            migrate: async () => {
              throw new Error("INJECTED_PRE_WRITE_MIGRATION_FAILURE");
            },
          },
        ],
      }),
    ).rejects.toThrow(
      "LOCAL_DATA_MIGRATION_FAILED_BEFORE_WRITE:INJECTED_PRE_WRITE_MIGRATION_FAILURE",
    );

    expect(memory.store.replaceCurrent).not.toHaveBeenCalled();
    expect(memory.current()).toEqual(initial);
  });
});
