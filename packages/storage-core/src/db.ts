import Dexie, { Table } from "dexie";
import type {
  Book,
  ReadingProgress,
  Bookmark,
  LibrarySource,
  LibraryFolder,
  IndexedNovelFile,
  TxtChapterIndex,
  LocalChapter,
} from "@reader/shared-types";
import {
  buildPreUpgradeSnapshot,
} from "./dexie-migration-backup.js";
import {
  META_SHELF_BACKUP_KEY,
  META_SHELF_EMPTY_ACK_KEY,
  META_SHELF_NATIVE_BACKUP_ID_KEY,
  META_SHELF_RECOVERY_GAP_KEY,
  buildBrowserMetaShelfBackup,
  createEmptyShelfAcknowledgement,
  getMetaShelfBackupIdentity,
  getMetaShelfBackupCompleteness,
  hasAcknowledgedEmptyShelf,
  isMetaShelfBackupAcknowledgedEmpty,
  parseMetaShelfBackup,
  readMetaShelfRecoveryGap,
  writeBrowserMetaShelfBackup,
  type MetaShelfBackup,
  type MetadataBackupResult,
  type MetadataRestoreResult,
} from "./metadata-redundancy.js";
import {
  parseLocalDataSnapshot,
  serializeLocalDataSnapshot,
} from "./local-snapshot.js";
import { shouldSweepLegacyImportTask } from "./import-task-retention.js";

export interface ImportTask {
  id: string;
  bookMetadata: Book;
  chapters: LocalChapter[];
  lifecycle?: import("./import-task-lifecycle.js").ImportTaskLifecycle;
  createdAt: string;
  updatedAt?: string;
}

export interface LocalAIUserConfig {
  id: string;
  encryptedKey: string;
  encryptedBaseUrl: string;
  iv: string;
  model: string;
  format: string;
  updatedAt: string;
}

export interface LocalAIView {
  id: string;
  bookId: string;
  chapterIndex: number;
  sourceHash: string;
  summary: string;
  model: string;
  promptVersion: string;
  createdAt: string;
}

export interface LocalMigrationBackup {
  id: string;
  fromVersion: number;
  toVersion: number;
  createdAt: string;
  serializedSnapshot: string;
}

export class ReaderDatabase extends Dexie {
  books!: Table<Book, string>;
  chapters!: Table<LocalChapter, string>;
  progress!: Table<ReadingProgress, string>;
  bookmarks!: Table<Bookmark, string>;
  importTasks!: Table<ImportTask, string>;
  aiViews!: Table<LocalAIView, string>;
  aiUserConfigs!: Table<LocalAIUserConfig, string>;
  migrationBackups!: Table<LocalMigrationBackup, string>;

  librarySources!: Table<LibrarySource, string>;
  libraryFolders!: Table<LibraryFolder, string>;
  indexedNovelFiles!: Table<IndexedNovelFile, string>;
  txtChapterIndices!: Table<TxtChapterIndex, string>;

  constructor() {
    super("ReaderDatabase");
    this.version(6).stores({
      books: "id, title, createdAt, lastReadAt",
      chapters: "id, [bookId+index], bookId, index",
      progress: "bookId",
      bookmarks: "id, bookId, chapterIndex",
      importTasks: "id",
      aiViews: "id, bookId, chapterIndex, sourceHash",
    });

    this.version(7).stores({
      books: "id, title, createdAt, lastReadAt, sourceFolderId",
      chapters: "id, [bookId+index], bookId, index",
      progress: "bookId",
      bookmarks: "id, bookId, chapterIndex",
      importTasks: "id",
      aiViews: "id, bookId, chapterIndex, sourceHash",
      librarySources: "id, type, permissionState, lastScanAt",
      libraryFolders: "id, parentId, sourceId, relativePath",
      indexedNovelFiles: "id, sourceId, parentFolderId, relativePath, bookId, status",
      txtChapterIndices: "chapterId, bookId, index",
    });

    this.version(8).stores({
      books: "id, title, createdAt, lastReadAt, sourceFolderId",
      chapters: "id, [bookId+index], bookId, index",
      progress: "bookId",
      bookmarks: "id, bookId, chapterIndex",
      importTasks: "id",
      aiViews: "id, bookId, chapterIndex, sourceHash",
      librarySources: "id, type, permissionState, lastScanAt",
      libraryFolders: "id, parentId, sourceId, relativePath",
      indexedNovelFiles: "id, sourceId, parentFolderId, relativePath, bookId, status",
      txtChapterIndices: "chapterId, [bookId+index], bookId, index", // 🏮 补全复合索引，彻底修复 SchemaError 崩溃
    });

    this.version(9).stores({
      books: "id, title, createdAt, lastReadAt, sourceFolderId",
      chapters: "id, [bookId+index], bookId, index",
      progress: "bookId",
      bookmarks: "id, bookId, chapterIndex",
      importTasks: "id",
      aiViews: "id, bookId, chapterIndex, sourceHash",
      librarySources: "id, type, permissionState, lastScanAt",
      libraryFolders: "id, parentId, sourceId, relativePath",
      indexedNovelFiles: "id, sourceId, parentFolderId, relativePath, bookId, status",
      txtChapterIndices: "chapterId, [bookId+index], bookId, index",
      aiUserConfigs: "id", // 🏮 AI 用户配置加密存储
    });

    this.version(10).stores({
      books: "id, title, createdAt, lastReadAt, sourceFolderId",
      chapters: "id, [bookId+index], bookId, index",
      progress: "bookId",
      bookmarks: "id, bookId, chapterIndex",
      importTasks: "id",
      aiViews: "id, bookId, chapterIndex, sourceHash",
      librarySources: "id, type, permissionState, lastScanAt",
      libraryFolders: "id, parentId, sourceId, relativePath",
      indexedNovelFiles: "id, sourceId, parentFolderId, relativePath, bookId, status",
      txtChapterIndices: "chapterId, [bookId+index], bookId, index",
      aiUserConfigs: "id",
      migrationBackups: "id, fromVersion, createdAt",
    }).upgrade(async (transaction) => {
      const createdAt = new Date().toISOString();
      const [books, chapters, progress, bookmarks, indexedFiles, sources] =
        await Promise.all([
          transaction.table("books").toArray(),
          transaction.table("chapters").toArray(),
          transaction.table("progress").toArray(),
          transaction.table("bookmarks").toArray(),
          transaction.table("indexedNovelFiles").toArray(),
          transaction.table("librarySources").toArray(),
        ]);
      const snapshot = buildPreUpgradeSnapshot({
        databaseVersion: 9,
        createdAt,
        books,
        chapters,
        progress,
        bookmarks,
        indexedFiles,
        sources,
        settingsValue:
          typeof window === "undefined"
            ? null
            : window.localStorage.getItem("reader-settings"),
      });
      const serializedSnapshot = serializeLocalDataSnapshot(snapshot);
      const backup: LocalMigrationBackup = {
        id: "pre-upgrade-v9-to-v10",
        fromVersion: 9,
        toVersion: 10,
        createdAt,
        serializedSnapshot,
      };
      const backupTable = transaction.table("migrationBackups");
      await backupTable.put(backup);
      const readback = await backupTable.get(backup.id);
      if (
        !readback ||
        readback.serializedSnapshot !== serializedSnapshot ||
        serializeLocalDataSnapshot(
          parseLocalDataSnapshot(readback.serializedSnapshot),
        ) !== serializedSnapshot
      ) {
        throw new Error("LOCAL_DATA_MIGRATION_BACKUP_VERIFICATION_FAILED");
      }
    });

    // 挂载 Dexie AOP 拦截 Hook：当用户进行任何增删改书籍、进度或书签操作时，
    // 自动捕获并触发 1.2 秒缓释防抖双轨备份，从底层打通无侵入式的多端“防蒸发”闭环。
    if (typeof window !== "undefined") {
      let backupTimeout: any = null;
      const triggerBackup = () => {
        if (isTransactionWriting) {
          // 🏮 事务进行中，屏蔽 AOP 高频中间脏状态备份，待 executeSafeWriteTransaction 统一调度
          return;
        }
        if (backupTimeout) {
          clearTimeout(backupTimeout);
        }
        backupTimeout = setTimeout(() => {
          backupTimeout = null;
          // A timer may already be queued when a durable write starts. The
          // committing transaction schedules the authoritative backup itself.
          if (!isTransactionWriting) void backupMetadataToStorage();
        }, 1200); // 1.2秒阻尼防抖，过滤极高频的连续翻页/划线开销
      };

      this.books.hook("creating", triggerBackup);
      this.books.hook("updating", triggerBackup);
      this.books.hook("deleting", triggerBackup);

      this.progress.hook("creating", triggerBackup);
      this.progress.hook("updating", triggerBackup);
      this.progress.hook("deleting", triggerBackup);

      this.bookmarks.hook("creating", triggerBackup);
      this.bookmarks.hook("updating", triggerBackup);
      this.bookmarks.hook("deleting", triggerBackup);
    }
  }
}

export const db = new ReaderDatabase();

// 🏮 1. 新增全局写事务隔离状态阀与状态设置函数
let isTransactionWriting = false;
let transactionWriteDepth = 0;

export function setTransactionWriting(active: boolean) {
  transactionWriteDepth = Math.max(
    0,
    transactionWriteDepth + (active ? 1 : -1),
  );
  isTransactionWriting = transactionWriteDepth > 0;
}

/**
 * 🏮 2. 封装高可用批量写事务包装器
 * 确保原子事务 onSuccess 提交落盘后方才静雅触发 AOP 级冷冷元数据双轨备份
 */
export async function executeSafeWriteTransaction<T>(
  tables: any[],
  runner: () => Promise<T>,
  options: {
    acknowledgeEmptyShelfOnCommit?: boolean | ((result: T) => boolean);
  } = {},
): Promise<T> {
  setTransactionWriting(true);
  let result: T;
  let previousEmptyAck: string | null = null;
  let previousRecoveryGap: string | null = null;
  let emptyAckArmed = false;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      previousEmptyAck = window.localStorage.getItem(
        META_SHELF_EMPTY_ACK_KEY,
      );
      previousRecoveryGap = window.localStorage.getItem(
        META_SHELF_RECOVERY_GAP_KEY,
      );
    }
    result = await db.transaction("rw", tables, async () => {
      const transactionResult = await runner();
      const shouldAcknowledgeEmptyShelf =
        typeof options.acknowledgeEmptyShelfOnCommit === "function"
          ? options.acknowledgeEmptyShelfOnCommit(transactionResult)
          : options.acknowledgeEmptyShelfOnCommit === true;
      if (
        shouldAcknowledgeEmptyShelf &&
        typeof window !== "undefined" &&
        window.localStorage &&
        (await db.books.count()) === 0
      ) {
        const acknowledgedAt = new Date().toISOString();
        const acknowledgement = createEmptyShelfAcknowledgement(
          window.localStorage,
          acknowledgedAt,
        );
        window.localStorage.setItem(
          META_SHELF_EMPTY_ACK_KEY,
          acknowledgement,
        );
        emptyAckArmed = true;
        if (
          window.localStorage.getItem(META_SHELF_EMPTY_ACK_KEY) !==
          acknowledgement
        ) {
          throw new Error("META_SHELF_EMPTY_ACK_READBACK_MISMATCH");
        }
        window.localStorage.removeItem(META_SHELF_RECOVERY_GAP_KEY);
      }
      return transactionResult;
    });
  } catch (error) {
    if (emptyAckArmed && typeof window !== "undefined" && window.localStorage) {
      try {
        if (previousEmptyAck === null) {
          window.localStorage.removeItem(META_SHELF_EMPTY_ACK_KEY);
        } else {
          window.localStorage.setItem(META_SHELF_EMPTY_ACK_KEY, previousEmptyAck);
        }
        if (previousRecoveryGap === null) {
          window.localStorage.removeItem(META_SHELF_RECOVERY_GAP_KEY);
        } else {
          window.localStorage.setItem(
            META_SHELF_RECOVERY_GAP_KEY,
            previousRecoveryGap,
          );
        }
      } catch {}
    }
    throw error;
  } finally {
    setTransactionWriting(false);
  }
  // Only a committed transaction may schedule the authoritative snapshot.
  // Release the write guard first so the serialized backup is not skipped.
  await scheduleMetadataBackup(true);
  return result;
}

// ==========================================================
// 🏮 「防蒸发柜」 双轨冗余镜像备份与冷自愈协议 (E07-S04 / E07-S03)
// ==========================================================

/**
 * 自动持久化双轨备份：将当前 IndexedDB 中的书架元数据、进度与书签打包存储。
 * 1. 优先备份到 localStorage 建立一级防线，配有 5MB 配额物理熔断和超量体积物理裁剪引擎；
 * 2. 检测到 Capacitor / Tauri 套壳宿主时，异步通过原生桥写入独立沙盒 Documents 物理文件，从底层杜绝由于 WebView 空间不足被系统静默驱逐（Eviction）。
 */
let metadataBackupQueue: Promise<void> = Promise.resolve();

async function performMetadataBackup(
  allowDuringWrite: boolean,
): Promise<MetadataBackupResult> {
  if (typeof window === "undefined" || !window.localStorage) {
    return { status: "skipped", storedBookCount: 0, expectedBookCount: 0 };
  }
  if (isTransactionWriting && !allowDuringWrite) {
    return { status: "skipped", storedBookCount: 0, expectedBookCount: 0 };
  }
  try {
    const [originalBooks, fullProgress, fullBookmarks] = await db.transaction(
      "r",
      [db.books, db.progress, db.bookmarks],
      async () =>
        Promise.all([
          db.books.toArray(),
          db.progress.toArray(),
          db.bookmarks.toArray(),
        ]),
    );
    
    // 如果没有任何藏书，不进行覆盖式空备份以防恶意抹除
    if (originalBooks.length === 0) {
      console.log("[Storage] 书架暂无典籍，跳过覆盖旧恢复点。");
      return { status: "skipped", storedBookCount: 0, expectedBookCount: 0 };
    }

    const recordedRecoveryGap = readMetaShelfRecoveryGap(window.localStorage);
    const unresolvedRecoveryGap =
      recordedRecoveryGap > originalBooks.length ? recordedRecoveryGap : 0;
    if (recordedRecoveryGap > 0 && unresolvedRecoveryGap === 0) {
      try {
        window.localStorage.removeItem(META_SHELF_RECOVERY_GAP_KEY);
      } catch {}
    }
    const backupTime = new Date().toISOString();
    const backupData = buildBrowserMetaShelfBackup({
      books: originalBooks,
      progress: fullProgress,
      bookmarks: fullBookmarks,
      backupTime,
      expectedBookCount: unresolvedRecoveryGap,
    });
    
    // 一级防线：浏览器本地持久存储 localStorage (带 QuotaExceeded 熔断自愈)
    const browserResult = writeBrowserMetaShelfBackup(window.localStorage, backupData);
    if (browserResult.status === "failed") {
      console.error("[Storage Backup] 备份写入 LocalStorage 失败，已保留上一份可用备份。");
    } else if (browserResult.status === "skipped_stale") {
      // The wall clock may have moved backwards or another context may have
      // completed a newer snapshot. Do not let this older candidate replace
      // either browser or native recovery media.
      if (!hasAcknowledgedEmptyShelf(window.localStorage)) {
        try {
          window.localStorage.removeItem(META_SHELF_EMPTY_ACK_KEY);
        } catch {}
      }
      return browserResult;
    } else {
      try {
        window.localStorage.removeItem(META_SHELF_EMPTY_ACK_KEY);
      } catch {}
      console.log(`[Storage] 双轨冗余：元数据（最新活跃 ${backupData.books.length} 本书）归档至 localStorage。`);
    }

    // 二级防线：Capacitor 物理沙盒备份 (保留全量，不受 5MB 局限)
    const cap = (window as any).Capacitor;
    let nativeFullBackupSucceeded = false;
    if (cap?.Plugins?.Filesystem) {
      try {
        const { Filesystem, Directory } = cap.Plugins;
        const fullBackup: MetaShelfBackup = {
          backupId: backupData.backupId,
          books: originalBooks,
          progress: fullProgress,
          bookmarks: fullBookmarks,
          backupTime,
          isPartial: false,
          originalBookCount: originalBooks.length,
        };
        const fullSerialized = JSON.stringify(fullBackup);
        await Filesystem.writeFile({
          path: "read_realm_backup/meta_shelf.json",
          data: fullSerialized,
          directory: Directory.Documents,
          encoding: "utf8",
          recursive: true,
        });
        const identity = `id:${backupData.backupId}`;
        window.localStorage.setItem(
          META_SHELF_NATIVE_BACKUP_ID_KEY,
          identity,
        );
        if (
          window.localStorage.getItem(META_SHELF_NATIVE_BACKUP_ID_KEY) !==
          identity
        ) {
          throw new Error("META_SHELF_NATIVE_GENERATION_READBACK_MISMATCH");
        }
        nativeFullBackupSucceeded = true;
        console.log("[Storage] 双轨冗余：全量元数据已成功篆刻至 Capacitor 原生物理沙盒 (Documents/read_realm_backup/meta_shelf.json)");
      } catch (err) {
        console.warn("[Storage] Capacitor 原生沙盒写入遭遇阻碍:", err);
      }
    }
    // 三级防线：Tauri 物理沙盒备份
    else if ((window as any).__TAURI__?.fs) {
      try {
        const { writeTextFile, BaseDirectory } = (window as any).__TAURI__.fs;
        const fullBackup: MetaShelfBackup = {
          backupId: backupData.backupId,
          books: originalBooks,
          progress: fullProgress,
          bookmarks: fullBookmarks,
          backupTime,
          isPartial: false,
          originalBookCount: originalBooks.length,
        };
        const fullSerialized = JSON.stringify(fullBackup);
        await writeTextFile("read_realm_backup/meta_shelf.json", fullSerialized, {
          dir: BaseDirectory.AppLocalData,
        });
        const identity = `id:${backupData.backupId}`;
        window.localStorage.setItem(
          META_SHELF_NATIVE_BACKUP_ID_KEY,
          identity,
        );
        if (
          window.localStorage.getItem(META_SHELF_NATIVE_BACKUP_ID_KEY) !==
          identity
        ) {
          throw new Error("META_SHELF_NATIVE_GENERATION_READBACK_MISMATCH");
        }
        nativeFullBackupSucceeded = true;
        console.log("[Storage] 双轨冗余：全量元数据已成功篆刻至 Tauri 原生物理沙盒 (AppLocalData/read_realm_backup/meta_shelf.json)");
      } catch (err) {
        console.warn("[Storage] Tauri 原生沙盒写入遭遇阻碍:", err);
      }
    }
    if (nativeFullBackupSucceeded) {
      return {
        status: "complete",
        storedBookCount: originalBooks.length,
        expectedBookCount: originalBooks.length,
      };
    }
    return browserResult;
  } catch (err) {
    console.error("[Storage] 自动双轨备份异常中断:", err);
    return { status: "failed", storedBookCount: 0, expectedBookCount: 0 };
  }
}

async function performMetadataBackupWithCrossTabLock(
  allowDuringWrite: boolean,
): Promise<MetadataBackupResult> {
  const lockManager = (
    window.navigator as Navigator & {
      locks?: {
        request<T>(name: string, callback: () => Promise<T>): Promise<T>;
      };
    }
  ).locks;
  if (!lockManager) return performMetadataBackup(allowDuringWrite);
  return lockManager.request("reader-metadata-backup", () =>
    performMetadataBackup(allowDuringWrite),
  );
}

function scheduleMetadataBackup(
  allowDuringWrite: boolean,
): Promise<MetadataBackupResult> {
  if (typeof window === "undefined" || !window.localStorage) {
    return Promise.resolve({
      status: "skipped",
      storedBookCount: 0,
      expectedBookCount: 0,
    });
  }
  const run = () => performMetadataBackupWithCrossTabLock(allowDuringWrite);
  const task = metadataBackupQueue.then(
    run,
    run,
  );
  metadataBackupQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export function backupMetadataToStorage(): Promise<MetadataBackupResult> {
  return scheduleMetadataBackup(false);
}

/**
 * 校验并执行冷启动元数据自愈：
 * 1. 检查 IndexedDB 中的书籍表是否被静默清洗（Eviction）；
 * 2. 若书籍表为空，但本地或原生沙盒存在有效备份，则一键唤醒“降卷自愈”；
 * 3. 使用数据库事务，安全可靠地恢复书架、阅读进度及书签。
 */
export async function checkAndRestoreFromBackup(): Promise<MetadataRestoreResult> {
  if (typeof window === "undefined" || !window.localStorage) {
    return { status: "not_found", restoredBookCount: 0, expectedBookCount: 0, source: null };
  }
  try {
    const booksCount = await db.books.count();
    if (booksCount > 0) {
      try {
        window.localStorage.removeItem(META_SHELF_EMPTY_ACK_KEY);
      } catch {}
      const expectedBookCount = readMetaShelfRecoveryGap(window.localStorage);
      if (expectedBookCount > booksCount) {
        return {
          status: "recovery_gap",
          restoredBookCount: booksCount,
          expectedBookCount,
          source: null,
        };
      }
      if (expectedBookCount > 0) {
        try {
          window.localStorage.removeItem(META_SHELF_RECOVERY_GAP_KEY);
        } catch {}
      }
      // 数据库元数据完整，不需要恢复
      return { status: "not_needed", restoredBookCount: 0, expectedBookCount: booksCount, source: null };
    }

    let nativeBackupStr: string | null = null;
    let nativeSource: MetadataRestoreResult["source"] = null;

    // 1. 尝试从 Capacitor 物理沙盒读取
    const cap = (window as any).Capacitor;
    if (cap?.Plugins?.Filesystem) {
      try {
        const { Filesystem, Directory } = cap.Plugins;
        const result = await Filesystem.readFile({
          path: "read_realm_backup/meta_shelf.json",
          directory: Directory.Documents,
          encoding: "utf8",
        });
        nativeBackupStr = result.data;
        nativeSource = "capacitor";
        console.log("[Storage] 成功从 Capacitor 物理沙盒起封备份文卷。");
      } catch (e) {
        console.warn("[Storage] Capacitor 沙盒读取失败，降级寻求本地存储:", e);
      }
    }
    // 2. 尝试从 Tauri 物理沙盒读取
    else if ((window as any).__TAURI__?.fs) {
      try {
        const { readTextFile, BaseDirectory } = (window as any).__TAURI__.fs;
        nativeBackupStr = await readTextFile("read_realm_backup/meta_shelf.json", {
          dir: BaseDirectory.AppLocalData,
        });
        nativeSource = "tauri";
        console.log("[Storage] 成功从 Tauri 物理沙盒起封备份文卷。");
      } catch (e) {
        console.warn("[Storage] Tauri 沙盒读取失败，降级寻求本地存储:", e);
      }
    }

    if (nativeBackupStr) {
      try {
        const rawNative = JSON.parse(nativeBackupStr) as Record<string, unknown>;
        if (typeof rawNative.backupId === "string") {
          const trackedNativeIdentity = window.localStorage.getItem(
            META_SHELF_NATIVE_BACKUP_ID_KEY,
          );
          if (
            trackedNativeIdentity !==
            getMetaShelfBackupIdentity(nativeBackupStr)
          ) {
            console.warn("[Storage] 忽略未登记或不完整的原生备份代际。");
            nativeBackupStr = null;
            nativeSource = null;
          }
        }
      } catch (error) {
        console.warn("[Storage] 原生备份无法校验，将尝试浏览器恢复点。", error);
        nativeBackupStr = null;
        nativeSource = null;
      }
    }

    const browserBackupStr = window.localStorage.getItem(
      META_SHELF_BACKUP_KEY,
    );
    const candidates = [
      ...(nativeBackupStr && nativeSource
        ? [{ serialized: nativeBackupStr, source: nativeSource }]
        : []),
      ...(browserBackupStr
        ? [{ serialized: browserBackupStr, source: "browser" as const }]
        : []),
    ];
    const recoverableCandidates = candidates
      .filter(
        (candidate) =>
          !isMetaShelfBackupAcknowledgedEmpty(
            window.localStorage,
            candidate.serialized,
          ),
      )
      .sort((left, right) => {
        const leftBackup = parseMetaShelfBackup(left.serialized);
        const rightBackup = parseMetaShelfBackup(right.serialized);
        const timeDifference =
          Date.parse(rightBackup.backupTime) - Date.parse(leftBackup.backupTime);
        if (timeDifference !== 0) return timeDifference;
        if (leftBackup.backupId === rightBackup.backupId) {
          return Number(leftBackup.isPartial) - Number(rightBackup.isPartial);
        }
        return left.source === "browser" ? -1 : 1;
      });

    if (
      recoverableCandidates.length === 0 &&
      (candidates.length > 0 ||
        isMetaShelfBackupAcknowledgedEmpty(window.localStorage, null))
    ) {
      return {
        status: "not_needed",
        restoredBookCount: 0,
        expectedBookCount: 0,
        source: null,
      };
    }

    const selectedCandidate = recoverableCandidates[0];
    const backupStr = selectedCandidate?.serialized ?? null;
    const source = selectedCandidate?.source ?? null;
    if (!backupStr) {
      const concurrentBookCount = await db.books.count();
      if (concurrentBookCount > 0) {
        return {
          status: "not_needed",
          restoredBookCount: 0,
          expectedBookCount: concurrentBookCount,
          source: null,
        };
      }
      return { status: "not_found", restoredBookCount: 0, expectedBookCount: 0, source: null };
    }

    const backup = parseMetaShelfBackup(backupStr);
    if (backup.books.length === 0) {
      return { status: "not_found", restoredBookCount: 0, expectedBookCount: backup.originalBookCount, source };
    }

    const completeness = getMetaShelfBackupCompleteness(backup);
    const previousRecoveryGapMarker = window.localStorage.getItem(
      META_SHELF_RECOVERY_GAP_KEY,
    );
    const restorePreviousRecoveryGapMarker = () => {
      try {
        if (previousRecoveryGapMarker === null) {
          window.localStorage.removeItem(META_SHELF_RECOVERY_GAP_KEY);
        } else {
          window.localStorage.setItem(
            META_SHELF_RECOVERY_GAP_KEY,
            previousRecoveryGapMarker,
          );
        }
      } catch {}
    };
    if (completeness.status === "partial") {
      const expected = String(completeness.expectedBookCount);
      try {
        window.localStorage.setItem(META_SHELF_RECOVERY_GAP_KEY, expected);
        if (window.localStorage.getItem(META_SHELF_RECOVERY_GAP_KEY) !== expected) {
          throw new Error("META_SHELF_RECOVERY_GAP_MARKER_READBACK_MISMATCH");
        }
      } catch (error) {
        restorePreviousRecoveryGapMarker();
        console.error(
          "[Storage] 无法可靠记录部分恢复缺口，已取消恢复且未写入书架。",
          error,
        );
        return {
          status: "failed",
          restoredBookCount: 0,
          expectedBookCount: completeness.expectedBookCount,
          source,
        };
      }
    }

    console.warn("[Storage] 检测到书架为空且存在有效备份，开始恢复书架元数据。");

    const restoreMode = backup.isPartial ? "轻量" : "全量";
    console.log(`[Storage] 发现归档于 ${backup.backupTime} 的${restoreMode}镜像，开始复苏重建事务...`);

    // Use the same write transaction both to re-check emptiness and restore.
    // A different tab may have imported a book while a native backup was read.
    setTransactionWriting(true);
    let concurrentBookCount = 0;
    let didRestore = false;
    try {
      await db.transaction("rw", [db.books, db.progress, db.bookmarks], async () => {
        concurrentBookCount = await db.books.count();
        if (concurrentBookCount > 0) return;
        await Promise.all([db.books.clear(), db.progress.clear(), db.bookmarks.clear()]);
        await db.books.bulkPut(backup.books);
        if (backup.progress.length > 0) await db.progress.bulkPut(backup.progress);
        if (backup.bookmarks.length > 0) await db.bookmarks.bulkPut(backup.bookmarks);
        const [restoredBooks, restoredProgress, restoredBookmarks] = await Promise.all([
          db.books.count(),
          db.progress.count(),
          db.bookmarks.count(),
        ]);
        if (
          restoredBooks !== backup.books.length ||
          restoredProgress !== backup.progress.length ||
          restoredBookmarks !== backup.bookmarks.length
        ) {
          throw new Error("META_SHELF_RESTORE_READBACK_MISMATCH");
        }
        didRestore = true;
      });
    } catch (error) {
      if (completeness.status === "partial") {
        restorePreviousRecoveryGapMarker();
      }
      throw error;
    } finally {
      setTransactionWriting(false);
    }

    if (!didRestore) {
      if (completeness.status === "partial") {
        restorePreviousRecoveryGapMarker();
      }
      const expectedBookCount = readMetaShelfRecoveryGap(window.localStorage);
      return expectedBookCount > concurrentBookCount
        ? {
            status: "recovery_gap",
            restoredBookCount: concurrentBookCount,
            expectedBookCount,
            source: null,
          }
        : {
            status: "not_needed",
            restoredBookCount: 0,
            expectedBookCount: concurrentBookCount,
            source: null,
          };
    }

    console.log(`[Storage] 🎉 妙手回春！「防蒸发柜」自动一键自愈完成！成功召回 ${backup.books.length} 本典籍及其阅读进度。`);
    if (completeness.status === "complete") {
      try {
        window.localStorage.removeItem(META_SHELF_RECOVERY_GAP_KEY);
      } catch {}
    }
    return {
      status: completeness.status,
      restoredBookCount: completeness.storedBookCount,
      expectedBookCount: completeness.expectedBookCount,
      source,
    };
  } catch (err) {
    console.error("[Storage] 降卷自愈过程遭遇致命故障:", err);
    return { status: "failed", restoredBookCount: 0, expectedBookCount: 0, source: null };
  }
}

/**
 * 🧹 本地存储自动垃圾回收自愈引擎 (GC)
 * 1. 自动检索 IndexedDB 物理数据库中的 ImportTask；
 * 2. 驱逐所有 chapters 数量为 0 且创建时间超过 15 分钟以前的空白僵尸导入会话；
 * 3. 释放由于大文件导入中途失败、刷新关闭等意外情况造成的残留垃圾，保持书架及导入面板零污染。
 */
export async function executeStorageGarbageCollection(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    console.log("[Storage GC] 🧹 启动本地物理存储垃圾回收（GC）清道夫机制...");
    const now = Date.now();
    const safetyBufferMs = 15 * 60 * 1000; // 15分钟安全静默缓冲，避免正在导入的活跃任务被中途误删
    
    const allTasks = await db.importTasks.toArray();
    const tasksToSweep = allTasks.filter(task => {
      // 判定条件：没有解析出任何本地章节，且其创建时间已超过 15 分钟
      return shouldSweepLegacyImportTask({
        createdAt: task.createdAt,
        chapterCount: task.chapters?.length ?? 0,
        hasLifecycle: Boolean(task.lifecycle),
        lifecycleState: task.lifecycle?.state,
      }, now, safetyBufferMs);
    });

    if (tasksToSweep.length > 0) {
      const idsToDelete = tasksToSweep.map(t => t.id);
      await db.importTasks.bulkDelete(idsToDelete);
      console.log(`[Storage GC] 🎉 清扫完成！成功物理驱逐了 ${tasksToSweep.length} 个僵尸/空白临时导入任务。IDs:`, idsToDelete);
    } else {
      console.log("[Storage GC] ✨ 物理层级扫描结束，未发现长期滞留的空白僵尸任务。");
    }
  } catch (err) {
    console.error("[Storage GC] 垃圾回收清扫进程遭遇异常:", err);
  }
}
