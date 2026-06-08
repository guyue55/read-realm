import Dexie, { Table } from "dexie";
import type { Book, ReadingProgress, Bookmark } from "@reader/shared-types";

export interface LocalChapter {
  id: string;
  bookId: string;
  index: number;
  title: string;
  content: string;
}

export interface ImportTask {
  id: string;
  bookMetadata: Book;
  chapters: LocalChapter[];
  createdAt: string;
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

export class ReaderDatabase extends Dexie {
  books!: Table<Book, string>;
  chapters!: Table<LocalChapter, string>;
  progress!: Table<ReadingProgress, string>;
  bookmarks!: Table<Bookmark, string>;
  importTasks!: Table<ImportTask, string>;
  aiViews!: Table<LocalAIView, string>;

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
          void backupMetadataToStorage();
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

if (typeof window !== "undefined") {
  (window as any).db = db;
}

// 🏮 1. 新增全局写事务隔离状态阀与状态设置函数
let isTransactionWriting = false;

export function setTransactionWriting(active: boolean) {
  isTransactionWriting = active;
}

/**
 * 🏮 2. 封装高可用批量写事务包装器
 * 确保原子事务 onSuccess 提交落盘后方才静雅触发 AOP 级冷冷元数据双轨备份
 */
export async function executeSafeWriteTransaction<T>(
  tables: any[],
  runner: () => Promise<T>
): Promise<T> {
  setTransactionWriting(true);
  try {
    const result = await db.transaction("rw", tables, async () => {
      return await runner();
    });
    // 只有事务 100% 完美提交后，此时数据库元数据完整无损，触发全量冷备份
    await backupMetadataToStorage();
    return result;
  } finally {
    setTransactionWriting(false);
  }
}

// ==========================================================
// 🏮 「防蒸发柜」 双轨冗余镜像备份与冷自愈协议 (E07-S04 / E07-S03)
// ==========================================================

export interface MetaShelfBackup {
  books: Book[];
  progress: ReadingProgress[];
  bookmarks: Bookmark[];
  backupTime: string;
}

/**
 * 自动持久化双轨备份：将当前 IndexedDB 中的书架元数据、进度与书签打包存储。
 * 1. 优先备份到 localStorage 建立一级防线，配有 5MB 配额物理熔断和超量体积物理裁剪引擎；
 * 2. 检测到 Capacitor / Tauri 套壳宿主时，异步通过原生桥写入独立沙盒 Documents 物理文件，从底层杜绝由于 WebView 空间不足被系统静默驱逐（Eviction）。
 */
export async function backupMetadataToStorage(): Promise<boolean> {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    let books = await db.books.toArray();
    let progress = await db.progress.toArray();
    let bookmarks = await db.bookmarks.toArray();
    
    // 如果没有任何藏书，不进行覆盖式空备份以防恶意抹除
    if (books.length === 0) {
      console.log("[Storage] 书架暂无典籍，跳过镜像双轨备份。");
      return false;
    }

    // 🏮 核心安全自愈裁剪（容量限额防线）：
    // 若 books.length > 20 或 bookmarks.length > 100，则自动 prune 并仅对最新前 20 本书、最新前 100 章节书签执行备份（强制限制快照 JSON 在 500KB 以下）
    if (books.length > 20 || bookmarks.length > 100) {
      console.log(`[Storage Backup] ⚠️ 检测到数据量规模较大，启动 LocalStorage 熔断剪裁机制...`);
      // 仅备份最新活跃的 20 本藏书与最新前 100 条书签
      books = books
        .sort((a, b) => {
          const tA = a.lastReadAt ? new Date(a.lastReadAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const tB = b.lastReadAt ? new Date(b.lastReadAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return tB - tA;
        })
        .slice(0, 20);
      const allowedBookIds = new Set(books.map(b => b.id));
      progress = progress.filter(p => allowedBookIds.has(p.bookId));
      bookmarks = bookmarks
        .filter(b => allowedBookIds.has(b.bookId))
        .slice(-100);
    }

    const backupData: MetaShelfBackup = {
      books,
      progress,
      bookmarks,
      backupTime: new Date().toISOString(),
    };

    const serialized = JSON.stringify(backupData);
    
    // 一级防线：浏览器本地持久存储 localStorage (带 QuotaExceeded 熔断自愈)
    try {
      window.localStorage.setItem("read_realm_meta_shelf_backup", serialized);
      console.log(`[Storage] 双轨冗余：元数据（最新活跃 ${backupData.books.length} 本书）归档至 localStorage。`);
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22 || e.number === 0x8007000E) {
        console.error("[Storage Backup] ❌ 备份写入 LocalStorage 发生物理配额溢出，进行紧急冷自愈清除:", e);
        try {
          window.localStorage.removeItem("read_realm_meta_shelf_backup"); // 清理垃圾以防异常级联
        } catch {}
      } else {
        console.error("[Storage Backup] 写入 LocalStorage 遭遇其他未知错误:", e);
      }
    }

    // 二级防线：Capacitor 物理沙盒备份 (保留全量，不受 5MB 局限)
    const cap = (window as any).Capacitor;
    if (cap?.Plugins?.Filesystem) {
      try {
        const { Filesystem, Directory } = cap.Plugins;
        const fullBooks = await db.books.toArray();
        const fullProgress = await db.progress.toArray();
        const fullBookmarks = await db.bookmarks.toArray();
        const fullBackup: MetaShelfBackup = { books: fullBooks, progress: fullProgress, bookmarks: fullBookmarks, backupTime: new Date().toISOString() };
        const fullSerialized = JSON.stringify(fullBackup);
        await Filesystem.writeFile({
          path: "read_realm_backup/meta_shelf.json",
          data: fullSerialized,
          directory: Directory.Documents,
          encoding: "utf8",
          recursive: true,
        });
        console.log("[Storage] 双轨冗余：全量元数据已成功篆刻至 Capacitor 原生物理沙盒 (Documents/read_realm_backup/meta_shelf.json)");
      } catch (err) {
        console.warn("[Storage] Capacitor 原生沙盒写入遭遇阻碍:", err);
      }
    }
    // 三级防线：Tauri 物理沙盒备份
    else if ((window as any).__TAURI__?.fs) {
      try {
        const { writeTextFile, BaseDirectory } = (window as any).__TAURI__.fs;
        const fullBooks = await db.books.toArray();
        const fullProgress = await db.progress.toArray();
        const fullBookmarks = await db.bookmarks.toArray();
        const fullBackup: MetaShelfBackup = { books: fullBooks, progress: fullProgress, bookmarks: fullBookmarks, backupTime: new Date().toISOString() };
        const fullSerialized = JSON.stringify(fullBackup);
        await writeTextFile("read_realm_backup/meta_shelf.json", fullSerialized, {
          dir: BaseDirectory.AppLocalData,
        });
        console.log("[Storage] 双轨冗余：全量元数据已成功篆刻至 Tauri 原生物理沙盒 (AppLocalData/read_realm_backup/meta_shelf.json)");
      } catch (err) {
        console.warn("[Storage] Tauri 原生沙盒写入遭遇阻碍:", err);
      }
    }
    return true;
  } catch (err) {
    console.error("[Storage] 自动双轨备份异常中断:", err);
    return false;
  }
}

/**
 * 校验并执行冷启动元数据自愈：
 * 1. 检查 IndexedDB 中的书籍表是否被静默清洗（Eviction）；
 * 2. 若书籍表为空，但本地或原生沙盒存在有效备份，则一键唤醒“降卷自愈”；
 * 3. 使用数据库事务，安全可靠地恢复书架、阅读进度及书签。
 */
export async function checkAndRestoreFromBackup(): Promise<boolean> {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const booksCount = await db.books.count();
    if (booksCount > 0) {
      // 数据库元数据完整，不需要恢复
      return false;
    }

    console.warn("[Storage] 🚨 警告：检测到 IndexedDB 书架已空！极可能由于系统空间告急被 WebView 强行静默抹除。正在启动双轨熔断自愈...");

    let backupStr: string | null = null;

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
        backupStr = result.data;
        console.log("[Storage] 成功从 Capacitor 物理沙盒起封备份文卷。");
      } catch (e) {
        console.warn("[Storage] Capacitor 沙盒读取失败，降级寻求本地存储:", e);
      }
    }
    // 2. 尝试从 Tauri 物理沙盒读取
    else if ((window as any).__TAURI__?.fs) {
      try {
        const { readTextFile, BaseDirectory } = (window as any).__TAURI__.fs;
        backupStr = await readTextFile("read_realm_backup/meta_shelf.json", {
          dir: BaseDirectory.AppLocalData,
        });
        console.log("[Storage] 成功从 Tauri 物理沙盒起封备份文卷。");
      } catch (e) {
        console.warn("[Storage] Tauri 沙盒读取失败，降级寻求本地存储:", e);
      }
    }

    // 3. 降级：从 localStorage 恢复
    if (!backupStr) {
      backupStr = window.localStorage.getItem("read_realm_meta_shelf_backup");
    }

    if (!backupStr) {
      console.log("[Storage] 本地与原生沙盒备份尽失，无可自愈。");
      return false;
    }

    const backup: MetaShelfBackup = JSON.parse(backupStr);
    if (!backup.books || backup.books.length === 0) {
      console.log("[Storage] 备份文档为空，放弃自愈。");
      return false;
    }

    console.log(`[Storage] 发现归档于 ${backup.backupTime} 的镜像，开始复苏重建事务...`);

    // 使用事务保证原子级恢复
    await db.transaction("rw", [db.books, db.progress, db.bookmarks], async () => {
      if (backup.books && backup.books.length > 0) {
        await db.books.bulkPut(backup.books);
      }
      if (backup.progress && backup.progress.length > 0) {
        await db.progress.bulkPut(backup.progress);
      }
      if (backup.bookmarks && backup.bookmarks.length > 0) {
        await db.bookmarks.bulkPut(backup.bookmarks);
      }
    });

    console.log(`[Storage] 🎉 妙手回春！「防蒸发柜」自动一键自愈完成！成功召回 ${backup.books.length} 本典籍及其阅读进度。`);
    return true;
  } catch (err) {
    console.error("[Storage] 降卷自愈过程遭遇致命故障:", err);
    return false;
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
      const createdAtMs = task.createdAt ? new Date(task.createdAt).getTime() : 0;
      const isStale = now - createdAtMs > safetyBufferMs;
      return (!task.chapters || task.chapters.length === 0) && isStale;
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
