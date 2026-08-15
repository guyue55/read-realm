"use client";

import { useEffect, useState, memo, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@reader/storage-core";
import {
  rememberViewScrollPosition,
  rememberViewSourceFocus,
  ROUTE_CONTEXT_EVENT,
  useVirtualRouter,
} from "@/lib/route-store";
import { isValidShareToken, normalizeShareToken } from "@/lib/api";
import { strings } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { BookCover } from "@/components/BookCover";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { EmptyState } from "@/components/EmptyState";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type {
  Book,
  ReadingProgress,
  LibraryFolder,
} from "@reader/shared-types";
import { cacheEntireBook } from "@/hooks/useReader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReaderDialogSurface } from "@/components/reader/ReaderDialogSurface";
import { PersonalBookPublicationDialog } from "@/features/library/PersonalBookPublicationDialog";
import {
  FolderScanService,
  type ImportPreviewNode,
} from "@/services/FolderScanService";
import { selectContinueBook } from "@/features/library/library-state";
import {
  countLibraryBooksByFolder,
  filterMergedLibraryBooksByFolder,
  mergeLibraryBooks,
  paginateLibraryItems,
  type LibrarySort,
} from "@/features/library/library-query-service";
import {
  canClampLibraryRoutePage,
  canCommitCloudInventory,
  parseLibraryRouteContext,
  serializeLibraryRouteContext,
  type LibraryRouteView,
} from "@/features/library/library-route-context";
import { libraryQueryService } from "@/features/library/dexie-library-query";
import { libraryCommandService } from "@/features/library/dexie-library-command";
import {
  createLegacyPersonalSyncApiClient,
  readLegacyRemoteProgress,
  type LegacyRemoteBook,
} from "@/features/library/legacy-personal-sync-api";
import { createPersonalSyncService } from "@/features/library/personal-sync-service";
import {
  clearSyncTask,
  markSyncTask,
  readSyncTasks,
  type SyncTaskAction,
} from "@/features/library/sync-tasks";

type LibraryViewMode = "cover" | "compact" | "list";
type LibraryShelfEntry =
  | { kind: "folder"; folder: LibraryFolder }
  | { kind: "book"; book: Book };

const LIBRARY_VIEW_KEY = "library-view-mode";
const LIBRARY_PAGE_SIZE = 48;
const EMPTY_LIBRARY_FOLDERS: LibraryFolder[] = [];

const POETIC_KEYS = [
  "松风阅心",
  "煮字生涯",
  "寒夜客来",
  "静夜钟声",
  "西窗剪烛",
  "墨染秋池",
  "落木萧萧",
  "独钓寒江",
  "疏影横斜",
  "暗香浮动",
  "云破月来",
  "小楼听雨",
  "青山对弈",
  "半窗晴翠",
  "石栏斜阳",
  "竹露清响",
  "荷风晚照",
  "烟雨行舟",
  "梅雪争春",
  "枯木逢春",
  "泉流石上",
  "草木含情",
  "琴心剑胆",
  "书香门第",
  "笔墨春秋",
  "风回小院",
  "帘外芭蕉",
  "浮生若梦",
  "沧海一粟",
  "坐看云起",
  "行到水穷",
  "晚风吹雨",
];

function loadLibraryViewMode(): LibraryViewMode {
  if (typeof window === "undefined") return "cover";
  const value = window.localStorage.getItem(LIBRARY_VIEW_KEY);
  return value === "compact" || value === "list" ? value : "cover";
}

function loadInitialLibraryRouteContext(
  initialDensity: "compact" | "comfortable",
) {
  const storedView = loadLibraryViewMode();
  const fallbackView: LibraryRouteView =
    storedView === "cover" && initialDensity === "compact"
      ? "compact"
      : storedView;
  if (typeof window === "undefined") {
    return parseLibraryRouteContext("/library", fallbackView);
  }

  const location = window.location.hash.includes("?")
    ? window.location.hash
    : `/library${window.location.search}`;
  return parseLibraryRouteContext(location, fallbackView);
}

function markActiveSyncTask(
  bookId: string,
  action: SyncTaskAction,
  shareToken: string,
) {
  markSyncTask(window.localStorage, bookId, action, shareToken);
}

function clearActiveSyncTask(bookId: string, shareToken: string) {
  clearSyncTask(window.localStorage, bookId, shareToken);
}

function createPersonalSyncOperation(shareToken: string) {
  const api = createLegacyPersonalSyncApiClient(shareToken);
  return {
    api,
    service: createPersonalSyncService(api),
    shareToken,
  };
}

function getProgressPercent(book: Book, progress?: ReadingProgress) {
  if (!progress || book.chapterCount <= 0) return 0;
  const chapterProgress =
    ((progress.chapterIndex + 1) / book.chapterCount) * 100;
  return Math.max(
    0,
    Math.min(100, Math.round(progress.percentage || chapterProgress)),
  );
}

function getChapterSummary(progress?: ReadingProgress) {
  if (!progress) return "未开始";
  return `第 ${progress.chapterIndex + 1} 章`;
}

function getFriendlyRelativeTime(dateInput?: string | Date) {
  if (!dateInput) return "未开始";
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "刚刚读过";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} 天前`;
  return (
    date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) +
    "读过"
  );
}

export function LibraryDefault({
  initialDensity = "comfortable",
}: {
  initialDensity?: "compact" | "comfortable";
}) {
  const router = useVirtualRouter();
  const isOnline = useOnlineStatus();
  const [initialRouteContext] = useState(() =>
    loadInitialLibraryRouteContext(initialDensity),
  );
  const [sortBy, setSortBy] = useState<"title" | "createdAt">(
    initialRouteContext.sort === "title" ? "title" : "createdAt",
  );
  const [viewMode, setViewModeState] = useState<LibraryViewMode>(
    initialRouteContext.view,
  );
  const [toastMsg, setToastMsg] = useState("");
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDanger: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isDanger: false,
    onConfirm: () => {},
  });

  // 逻辑文件夹层级导航
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(
    initialRouteContext.folderId,
  );
  const [libraryPageNumber, setLibraryPageNumber] = useState(
    initialRouteContext.page,
  );
  // 藏书治理相关状态
  const [selectedGovBook, setSelectedGovBook] = useState<Book | null>(null);
  const [isGovOpen, setIsGovOpen] = useState(false);

  const librarySort: LibrarySort = sortBy === "title" ? "title" : "recent";
  const librarySnapshot = useLiveQuery(
    () => libraryQueryService.readSnapshot(librarySort),
    [librarySort],
  );
  const books = librarySnapshot?.books;
  const folders = librarySnapshot?.folders ?? EMPTY_LIBRARY_FOLDERS;
  const cachedBookIdsSet = librarySnapshot?.cachedBookIds;
  const progressByBookId = librarySnapshot?.progressByBookId;

  const currentFolders = useMemo(
    () =>
      folders
        .filter((folder) => folder.parentId === currentFolderId)
        .sort(
          (left, right) =>
            (left.sortOrder || 0) - (right.sortOrder || 0) ||
            left.name.localeCompare(right.name),
        ),
    [currentFolderId, folders],
  );

  const navigateToFolder = (folderId: string | undefined) => {
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      try {
        const transition = (
          document as unknown as {
            startViewTransition: (cb: () => void) => {
              ready?: Promise<void>;
              finished?: Promise<void>;
              catch?: (cb: () => void) => void;
            };
          }
        ).startViewTransition(() => {
          setCurrentFolderId(folderId);
          setLibraryPageNumber(1);
        });
        if (transition) {
          if (transition.ready) transition.ready.catch(() => {});
          if (transition.finished) transition.finished.catch(() => {});
          if (typeof transition.catch === "function")
            transition.catch(() => {});
        }
      } catch (e) {
        console.warn(
          "[Library] 视图转场 ViewTransition 启动异常，自动降级为无动画状态同步:",
          e,
        );
        setCurrentFolderId(folderId);
        setLibraryPageNumber(1);
      }
    } else {
      setCurrentFolderId(folderId);
      setLibraryPageNumber(1);
    }
  };

  useEffect(() => {
    const location = serializeLibraryRouteContext({
      folderId: currentFolderId,
      page: libraryPageNumber,
      sort: sortBy === "title" ? "title" : "recent",
      view: viewMode,
    });
    const targetHash = `#${location}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(window.history.state, "", targetHash);
    }
  }, [currentFolderId, libraryPageNumber, sortBy, viewMode]);

  useEffect(() => {
    const restoreRouteContext = () => {
      const context = parseLibraryRouteContext(
        window.location.hash,
        loadLibraryViewMode(),
      );
      setCurrentFolderId(context.folderId);
      setLibraryPageNumber(context.page);
      setSortBy(context.sort === "title" ? "title" : "createdAt");
      setViewModeState(context.view);
    };
    window.addEventListener("popstate", restoreRouteContext);
    window.addEventListener(ROUTE_CONTEXT_EVENT, restoreRouteContext);
    return () => {
      window.removeEventListener("popstate", restoreRouteContext);
      window.removeEventListener(ROUTE_CONTEXT_EVENT, restoreRouteContext);
    };
  }, []);

  // ==========================================
  // 🛡️ 幽灵文件夹容错防线（不存在的逻辑文件夹自动软重置回书架主阁，并清洗 URL 脏参数）
  // ==========================================
  useEffect(() => {
    if (!currentFolderId) return;

    let active = true;
    const verifyAndRecoverGhostFolder = async () => {
      try {
        const folder = await db.libraryFolders.get(currentFolderId);
        if (!folder && active) {
          console.warn(
            `[Library] 幽灵书箧拦截：检测到不存在的文件夹 ID: ${currentFolderId}，自动软重置回书房主阁并清洗 URL。`,
          );
          navigateToFolder(undefined);
        }
      } catch (err) {
        console.error("[Library] 校验幽灵文件夹合法性失败:", err);
      }
    };

    verifyAndRecoverGhostFolder();
    return () => {
      active = false;
    };
  }, [currentFolderId]);

  // ==========================================
  // 🖌️ 「落墨·治理微型下拉菜单（Mini Popover）」
  // ==========================================
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Light Dismiss 自动冷退散
  useEffect(() => {
    if (!activeMenuId) return;
    const handleGlobalClick = () => {
      setActiveMenuId(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [activeMenuId]);

  // 1. 增量重新扫描对比合并事务 (Scan Reconciliation)
  const handleIncrementalScan = async (
    folderId: string,
    folderName: string,
  ) => {
    setToastMsg(`🧭 正在对「${folderName}」进行指纹增量重扫...`);
    try {
      let currentId: string | undefined = folderId;
      let sourceId: string | null = null;

      const directSource = await db.librarySources.get(currentId);
      if (directSource) {
        sourceId = currentId;
      } else {
        while (currentId) {
          const folder: LibraryFolder | undefined =
            await db.libraryFolders.get(currentId);
          if (!folder) break;
          if (folder.sourceId) {
            sourceId = folder.sourceId;
            break;
          }
          currentId = folder.parentId;
        }
      }

      if (!sourceId) {
        setToastMsg("⚠️ 无法定位物理导入来源，无法重扫。");
        return;
      }

      const source = await db.librarySources.get(sourceId);
      if (!source) {
        setToastMsg("🔌 未找到对应的物理书箱，可能已被手动擦除。");
        return;
      }

      const rootHandle = (
        source as unknown as { directoryHandle?: FileSystemDirectoryHandle }
      ).directoryHandle;
      if (!rootHandle) {
        setToastMsg("🔌 物理句柄已失效，请重新授权。");
        return;
      }

      const perm = await (
        rootHandle as unknown as {
          queryPermission(options?: {
            mode: "read" | "readwrite";
          }): Promise<PermissionState>;
        }
      ).queryPermission({ mode: "read" });
      if (perm !== "granted") {
        setToastMsg("🔌 权限已失效，请在导入页面重新授权。");
        return;
      }

      const folderRecord = await db.libraryFolders.get(folderId);
      const subRelativePath = folderRecord?.relativePath || "";

      let currentHandle = rootHandle;
      if (subRelativePath) {
        const parts = subRelativePath.split("/").filter(Boolean);
        for (const part of parts) {
          currentHandle = await currentHandle.getDirectoryHandle(part);
        }
      }

      const rootPreview = await FolderScanService.scanDirectoryToPreviewTree(
        currentHandle,
        undefined,
        subRelativePath,
      );

      const newFiles: {
        relativePath: string;
        size: number;
        lastModified: number;
      }[] = [];
      const collectFiles = (node: ImportPreviewNode) => {
        if (node.kind === "file") {
          newFiles.push({
            relativePath: node.relativePath,
            size: node.size || 0,
            lastModified: node.lastModified || 0,
          });
        }
        if (node.children) {
          for (const child of node.children) {
            collectFiles(child);
          }
        }
      };
      collectFiles(rootPreview);

      let oldIndexedFiles = await db.indexedNovelFiles
        .where("sourceId")
        .equals(sourceId)
        .toArray();
      if (subRelativePath) {
        oldIndexedFiles = oldIndexedFiles.filter((f) =>
          f.relativePath.startsWith(subRelativePath),
        );
      }

      const oldFiles = oldIndexedFiles.map((f) => ({
        relativePath: f.relativePath,
        size: f.size || 0,
        lastModified: f.lastModified || 0,
        bookId: f.bookId,
      }));

      const reconciliation = FolderScanService.reconcileScanResults(
        oldFiles,
        newFiles,
      );

      await db.transaction(
        "rw",
        [db.indexedNovelFiles, db.books, db.chapters],
        async () => {
          // (A) 处理移动/改名 (moved) - 100% 元数据及章节句柄自愈
          for (const item of reconciliation.moved) {
            if (item.bookId) {
              await db.indexedNovelFiles
                .where({ sourceId, relativePath: item.from })
                .modify({
                  relativePath: item.to,
                  updatedAt: new Date().toISOString(),
                });

              const book = await db.books.get(item.bookId);
              if (book) {
                if (book.sourceType === "folder_index" && book.contentLocator) {
                  await db.books.update(item.bookId, {
                    "contentLocator.relativePath": item.to,
                    updatedAt: new Date().toISOString(),
                  });
                } else if (
                  book.sourceType === "folder_multi_file_book" &&
                  book.multiFileBook
                ) {
                  const updatedChapterFiles =
                    book.multiFileBook.chapterFiles.map((cf) => {
                      if (cf.relativePath === item.from) {
                        return { ...cf, relativePath: item.to };
                      }
                      return cf;
                    });
                  await db.books.update(item.bookId, {
                    "multiFileBook.chapterFiles": updatedChapterFiles,
                    updatedAt: new Date().toISOString(),
                  });
                }
              }
            }
          }

          // (B) 内容更新 (changed) - 智能重新标记 TOC 为 not_parsed，清空旧缓存
          for (const relativePath of reconciliation.changed) {
            const idxFile = oldIndexedFiles.find(
              (f) => f.relativePath === relativePath,
            );
            if (idxFile && idxFile.bookId) {
              await db.chapters.where("bookId").equals(idxFile.bookId).delete();
              await db.books.update(idxFile.bookId, {
                parseStatus: "not_parsed",
                cacheStatus: "metadata_only",
                sourceAvailability: "source_available",
                updatedAt: new Date().toISOString(),
              });
              await db.indexedNovelFiles
                .where({ sourceId, relativePath })
                .modify({
                  status: "changed",
                  updatedAt: new Date().toISOString(),
                });
            }
          }

          // (C) 处理删除缺失 (deleted)
          for (const relativePath of reconciliation.deleted) {
            const idxFile = oldIndexedFiles.find(
              (f) => f.relativePath === relativePath,
            );
            if (idxFile) {
              await db.indexedNovelFiles
                .where({ sourceId, relativePath })
                .modify({
                  status: "missing",
                  updatedAt: new Date().toISOString(),
                });

              if (idxFile.bookId) {
                await db.books.update(idxFile.bookId, {
                  sourceAvailability: "source_missing",
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          }
        },
      );

      const totalMoved = reconciliation.moved.length;
      const totalChanged = reconciliation.changed.length;
      const totalDeleted = reconciliation.deleted.length;
      setToastMsg(
        `📖 重扫归档结束！自愈改名移动 ${totalMoved} 本，内容变动重编缓存 ${totalChanged} 本，缺失 ${totalDeleted} 本。`,
      );
    } catch (err) {
      console.error("增量重新勘探失败:", err);
      setToastMsg("⚠️ 增量重扫由于磁盘或文件状态读取失败。");
    }
  };

  // 2. 批量将文件夹藏书一键上传云端
  const handleBackupFolder = async (folderId: string, folderName: string) => {
    setToastMsg(`📤 正在并发将「${folderName}」下的书籍同步至云端...`);
    try {
      const subBooks = await db.books
        .where("sourceFolderId")
        .equals(folderId)
        .toArray();
      const unbackedBooks = subBooks.filter(
        (book) => !cloudBookIds.has(book.id),
      );
      if (unbackedBooks.length === 0) {
        setToastMsg("⛩️ 此书箧内的所有藏书早已全量备份至云端。");
        return;
      }

      let successCount = 0;
      for (const book of unbackedBooks) {
        if (await handleSingleUpload(book)) successCount++;
      }
      setToastMsg(
        successCount === unbackedBooks.length
          ? `⛩️ 「${folderName}」一键备份完成，已核验 ${successCount} 卷完整副本。`
          : `💡 「${folderName}」已核验 ${successCount}/${unbackedBooks.length} 卷，其余保留待重试状态。`,
      );
    } catch (err) {
      console.error("一键同步失败:", err);
      setToastMsg("⚠️ 一键备份数据库同步队列处理失败。");
    }
  };

  // 3. 文件夹解除物理绑定
  const handleDisconnectFolder = async (
    folderId: string,
    folderName: string,
  ) => {
    setConfirmState({
      isOpen: true,
      title: "🔏 解除物理句柄硬绑定",
      message: `确认要解除「${folderName}」书箧与本地物理文件夹的关联绑定吗？解绑定后，它将完全转为“纯离线/缓存模式”，安全存储进度，切断对磁盘的 Native Handle 直连。`,
      isDanger: true,
      onConfirm: async () => {
        let result: Awaited<
          ReturnType<typeof libraryCommandService.disconnectFolder>
        >;
        try {
          result = await libraryCommandService.disconnectFolder(folderId);
        } catch (err) {
          console.error("解绑文件夹失败:", err);
          setToastMsg("💡 解绑定失败，存储数据库繁忙。");
          throw err;
        }
        if (result.status === "applied") {
          setToastMsg(
            `🔏 「${folderName}」已转换为虚拟书柜，${result.affectedBookCount ?? 0} 本完整缓存藏书已安全断开物理来源。`,
          );
          return;
        }
        setToastMsg(
          result.status === "folder_contains_incomplete_books"
            ? "💡 解绑已停止：书箧中有藏书尚未完整缓存，先完整读入正文才能断开原文件。"
            : result.status === "folder_contains_ambiguous_sources"
              ? "💡 解绑已停止：书箧中存在无法确认归属的物理来源，本地数据未变更。"
              : "💡 该书箧已不是可解绑的物理目录，本地数据未变更。",
        );
        throw new Error(`DISCONNECT_FOLDER_${result.status}`);
      },
    });
  };

  // 4. 单本藏书解除物理绑定
  const handleDisconnectBook = async (bookId: string, title: string) => {
    setConfirmState({
      isOpen: true,
      title: "🔏 解除藏书物理绑定",
      message: `您确认要安全切断《${title}》与本地磁盘物理原文件的硬绑定吗？解绑定后，它将转化为“纯粹离线藏书模式”，原有缓存章节、阅读进度和手写笔记绝不丢失！`,
      isDanger: true,
      onConfirm: async () => {
        let result: Awaited<
          ReturnType<typeof libraryCommandService.disconnectBook>
        >;
        try {
          result = await libraryCommandService.disconnectBook(bookId);
        } catch (err) {
          console.error("解绑书籍失败:", err);
          setToastMsg("💡 书籍解除硬关联失败。");
          throw err;
        }
        if (result.status === "applied") {
          setToastMsg(
            `🔏 《${title}》已转换为完整离线藏书，原文件直连已安全切断。`,
          );
          return;
        }
        setToastMsg(
          result.status === "book_not_fully_cached"
            ? "💡 解绑已停止：该书正文尚未完整缓存，断开原文件会导致无法阅读。"
            : "💡 该书没有可解除的物理来源，本地数据未变更。",
        );
        throw new Error(`DISCONNECT_BOOK_${result.status}`);
      },
    });
  };

  // 5. 单本藏书强制重新切章自愈
  const handleReconstructBook = async (bookId: string, title: string) => {
    setConfirmState({
      isOpen: true,
      title: "📥 重构自愈藏书",
      message: `《${title}》的当前正文是可读副本。为避免在原文件丢失、权限失效或解析失败时删掉唯一副本，当前版本不再先清空后重构。请从导入页重新选择原文件，完整解析成功后再原子替换。`,
      isDanger: true,
      onConfirm: async () => {
        let result: Awaited<
          ReturnType<typeof libraryCommandService.requestReconstruct>
        >;
        try {
          result = await libraryCommandService.requestReconstruct(bookId);
        } catch (err) {
          console.error("重构书籍失败:", err);
          setToastMsg("💡 书籍重构重设失败。");
          throw err;
        }
        if (result.status === "reconstruct_requires_reimport") {
          setToastMsg(
            `🛡️ 已保留《${title}》当前正文；请从导入页重新选择原文件后完成安全替换。`,
          );
          return;
        }
        setToastMsg("💡 藏书已不存在，未执行重构。");
        throw new Error(`RECONSTRUCT_BOOK_${result.status}`);
      },
    });
  };

  const handleDissolveFolder = async (folderId: string, name: string) => {
    setConfirmState({
      isOpen: true,
      title: "🍃 解散书箧",
      message: `您确认要解散「${name}」书箧吗？解散后，其内的所有藏书将自动归入书架主阁，书籍本身及阅读进度绝不受损。`,
      isDanger: false,
      onConfirm: async () => {
        let result: Awaited<
          ReturnType<typeof libraryCommandService.dissolveFolder>
        >;
        try {
          result = await libraryCommandService.dissolveFolder(folderId);
        } catch (e) {
          console.error("解散文件夹失败:", e);
          setToastMsg("💡 解散书箧失败，存储数据库繁忙。");
          throw e;
        }
        if (result.status === "applied") {
          setToastMsg(
            `📖 书箧「${name}」已解散，${result.affectedBookCount ?? 0} 本藏书重归主阁。`,
          );
          return;
        }
        setToastMsg(
          result.status === "folder_not_dissolvable"
            ? "💡 物理目录或仍有子目录的书箧不能直接解散，请先处理下层内容或解除绑定。"
            : "💡 书箧已不存在，书架未发生额外变更。",
        );
        throw new Error(`DISSOLVE_FOLDER_${result.status}`);
      },
    });
  };

  const [cloudBooks, setCloudBooks] = useState<LegacyRemoteBook[]>([]);
  const cloudInventoryGenerationRef = useRef(0);
  const [verifiedCloudInventory, setVerifiedCloudInventory] = useState<{
    token: string;
    generation: number;
  } | null>(null);
  const [cloudInventoryReloadNonce, setCloudInventoryReloadNonce] = useState(0);
  const localBookIds = useMemo(
    () => new Set((books ?? []).map((book) => book.id)),
    [books],
  );
  const cloudBookIds = useMemo(
    () => new Set(cloudBooks.map((book) => book.id)),
    [cloudBooks],
  );
  const cloudBooksById = useMemo(
    () => new Map(cloudBooks.map((book) => [book.id, book])),
    [cloudBooks],
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStepText, setSyncStepText] = useState("");
  const [syncingBookId, setSyncingBookId] = useState<string | null>(null);

  // 专家级细粒度隔离状态机：记录每本书独立的同步进度与文案
  const [bookSyncStates, setBookSyncStates] = useState<
    Record<string, { progress: number; stepText: string }>
  >({});

  // 物理互斥信号锁，防止高频点按引起 IndexedDB 写入竞态
  const syncMutexRef = useRef(false);

  // 长按手势防抖/定时器引用
  const longPressTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  const handleTouchStart = (bookId: string, title: string) => () => {
    if (longPressTimeoutRef.current[bookId]) {
      clearTimeout(longPressTimeoutRef.current[bookId]);
    }
    longPressTimeoutRef.current[bookId] = setTimeout(() => {
      if (navigator.vibrate) {
        navigator.vibrate(50); // 移动端极其高雅之拟物物理微震动
      }
      handleDelete(bookId, title);
    }, 600);
  };

  const handleTouchEndOrMove = (bookId: string) => () => {
    if (longPressTimeoutRef.current[bookId]) {
      clearTimeout(longPressTimeoutRef.current[bookId]);
      delete longPressTimeoutRef.current[bookId];
    }
  };

  // 用户同步首选项配置
  const [autoSyncOnStartup, setAutoSyncOnStartupState] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return true;
      const val = window.localStorage.getItem("reader-sync-auto-startup");
      return val !== "false";
    },
  );
  const [autoSyncProgressOnReading, setAutoSyncProgressOnReadingState] =
    useState<boolean>(() => {
      if (typeof window === "undefined") return true;
      const val = window.localStorage.getItem("reader-sync-auto-progress");
      return val !== "false";
    });
  const [showSyncConfig, setShowSyncConfig] = useState(false);

  const setAutoSyncOnStartup = (val: boolean) => {
    setAutoSyncOnStartupState(val);
    window.localStorage.setItem("reader-sync-auto-startup", String(val));
  };

  const setAutoSyncProgressOnReading = (val: boolean) => {
    setAutoSyncProgressOnReadingState(val);
    window.localStorage.setItem("reader-sync-auto-progress", String(val));
  };

  // 多端共享相关状态与方法
  const [shareTokenInput, setShareTokenInput] = useState("");
  const [currentShareToken, setCurrentShareToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return normalizeShareToken(
      window.localStorage.getItem("reader-share-token"),
    );
  });
  const currentShareTokenRef = useRef(currentShareToken);

  useEffect(() => {
    currentShareTokenRef.current = currentShareToken;
    setShareTokenInput(currentShareToken);
  }, [currentShareToken]);

  const invalidateCloudInventory = useCallback(() => {
    const generation = cloudInventoryGenerationRef.current + 1;
    cloudInventoryGenerationRef.current = generation;
    setVerifiedCloudInventory(null);
    return generation;
  }, []);

  const commitCloudInventory = useCallback(
    (shareToken: string, generation: number, nextBooks: LegacyRemoteBook[]) => {
      if (
        !canCommitCloudInventory({
          activeShareToken: currentShareTokenRef.current,
          activeGeneration: cloudInventoryGenerationRef.current,
          requestShareToken: shareToken,
          requestGeneration: generation,
        })
      ) {
        return false;
      }
      setCloudBooks(nextBooks);
      setVerifiedCloudInventory({ token: shareToken, generation });
      return true;
    },
    [],
  );

  const handleGeneratePoeticKey = () => {
    const idx = Math.floor(Math.random() * POETIC_KEYS.length);
    const num = Math.floor(1000 + Math.random() * 9000);
    const key = `${POETIC_KEYS[idx]}-${num}`;
    setShareTokenInput(key);
  };

  const handleBindShareToken = async () => {
    const trimmed = shareTokenInput.trim();
    if (!trimmed) return;
    if (!isValidShareToken(trimmed)) {
      setToastMsg("分享口令仅支持中文、英文、数字、下划线和短横线，最长 64 位");
      return;
    }
    if (syncMutexRef.current) {
      setToastMsg("⏳ 同步操作尚未完成，请稍后再切换私有密钥。");
      return;
    }

    window.localStorage.setItem("reader-share-token", trimmed);
    currentShareTokenRef.current = trimmed;
    setCurrentShareToken(trimmed);
    setCloudBooks([]);
    invalidateCloudInventory();
    setCloudInventoryReloadNonce((nonce) => nonce + 1);
    setToastMsg(strings.sync.shareBindSuccess);
  };

  const handleClearShareToken = () => {
    if (syncMutexRef.current) {
      setToastMsg("⏳ 同步操作尚未完成，请稍后再清除私有密钥。");
      return;
    }
    window.localStorage.removeItem("reader-share-token");
    currentShareTokenRef.current = "";
    setCurrentShareToken("");
    setShareTokenInput("");
    setCloudBooks([]);
    invalidateCloudInventory();
    setToastMsg(strings.sync.shareClearSuccess);
  };

  const handleClearCloudBooks = async () => {
    if (!currentShareToken || !isOnline) return;
    const operation = createPersonalSyncOperation(currentShareToken);

    setConfirmState({
      isOpen: true,
      title: "🧼 物理清空云端备份",
      message:
        "确认要彻底物理擦除云端密阁下的所有藏书与进度备份吗？此操作极其决绝，且无法撤销。是否继续？",
      isDanger: true,
      onConfirm: async () => {
        if (
          syncMutexRef.current ||
          currentShareTokenRef.current !== operation.shareToken
        ) {
          setToastMsg("⏳ 同步状态或私有密钥已变更，本次清空未执行。");
          throw new Error("REMOTE_CLEAR_CONTEXT_CHANGED");
        }
        syncMutexRef.current = true;
        const inventoryGeneration = invalidateCloudInventory();
        try {
          await operation.api.clearBooks();
          const remaining = await operation.api.listBooks();
          if (remaining.length > 0) {
            throw new Error("REMOTE_CLEAR_READBACK_NOT_EMPTY");
          }
          setToastMsg("🧼 私人云端已清空，并完成空库回读核验。");
          commitCloudInventory(operation.shareToken, inventoryGeneration, []);
        } catch (err) {
          console.error("清空云端备份失败:", err);
          setToastMsg("💡 清空未通过云端回读核验，不宣称成功，请稍后重试。");
          throw err;
        } finally {
          syncMutexRef.current = false;
        }
      },
    });
  };

  const handleCopyPoeticKey = () => {
    if (!currentShareToken) return;
    navigator.clipboard
      .writeText(currentShareToken)
      .then(() => {
        setToastMsg(strings.sync.shareCopySuccess);
      })
      .catch((err) => {
        console.error("复制秘钥失败", err);
      });
  };

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  // 拉取云端书籍列表
  const fetchCloudBooks = useCallback(async () => {
    const shareToken = currentShareToken;
    if (!shareToken) {
      setCloudBooks([]);
      return;
    }
    const operation = createPersonalSyncOperation(shareToken);
    const online =
      typeof navigator !== "undefined" ? navigator.onLine : isOnline;
    if (!online) {
      setToastMsg("🌧️ 当前离线，保留上次已验证的云端状态，暂不可重新核验。");
      return;
    }
    const inventoryGeneration = invalidateCloudInventory();
    try {
      const verifiedBooks = await operation.api.listBooks();
      commitCloudInventory(shareToken, inventoryGeneration, verifiedBooks);
    } catch (e) {
      console.error("拉取云端书籍元数据失败:", e);
      setToastMsg("💡 云端状态暂不可核验，本地书架与阅读不受影响。");
    }
  }, [
    commitCloudInventory,
    currentShareToken,
    invalidateCloudInventory,
    isOnline,
  ]);

  useEffect(() => {
    void fetchCloudBooks();
  }, [cloudInventoryReloadNonce, fetchCloudBooks]);

  // 双向一键智能同步中心（支持多进程分布式互斥、最深阅读进度对碰与细粒度容错隔离）
  const handleDualSync = async (isSilent: boolean = false) => {
    if (isSyncing || !isOnline) return;

    // 限制同步：必须配置共享密钥才能同步
    if (!currentShareToken) {
      if (isSilent) {
        return;
      }
      setConfirmState({
        isOpen: true,
        title: "🏯 阁主未启共享密阁",
        message:
          "多端共享与云端同步需先在「同步设置」➔「墨问密阁」中生成或绑定属于您的专属「展卷秘钥」。是否立即前去展卷配置？",
        isDanger: false,
        onConfirm: () => {
          setShowSyncConfig(true);
          setTimeout(() => {
            const el = document.getElementById("mo-wen-mi-ge-panel");
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              const inputEl = el.querySelector("input");
              if (inputEl) {
                (inputEl as HTMLInputElement).focus();
              }
            }
          }, 150);
        },
      });
      return;
    }
    const operation = createPersonalSyncOperation(currentShareToken);
    const syncShareToken = operation.shareToken;

    // 核心同步管道执行函数
    const executeSyncPipeline = async () => {
      if (syncMutexRef.current) return;
      syncMutexRef.current = true;
      const inventoryGeneration = invalidateCloudInventory();

      // 仅在非静默（手动点击）时激活大加载面板与进度
      if (!isSilent) {
        setIsSyncing(true);
        setSyncProgress(0);
        setSyncStepText("正在检测两端书阁差异...");
      }

      let hasSyncFailures = false;

      try {
        const currentCloudBooks = await operation.api.listBooks();

        // 🏮 1. 先拉取云端文件夹，准备比对与合并逻辑
        let cloudFolders: LibraryFolder[] = [];
        try {
          cloudFolders = await operation.api.listFolders();
        } catch (foldersErr) {
          console.error("获取云端书箧遭遇网络问题:", foldersErr);
        }

        const localInventory = await libraryQueryService.readSyncInventory();
        const localFolders = localInventory.folders;

        // 计算逻辑书箧（文件夹）变动差异
        const localOnlyFolders = localFolders.filter(
          (lf) => !cloudFolders.some((cf) => cf.id === lf.id),
        );
        const cloudOnlyFolders = cloudFolders.filter(
          (cf) => !localFolders.some((lf) => lf.id === cf.id),
        );
        const bothFolders = localFolders.filter((lf) =>
          cloudFolders.some((cf) => cf.id === lf.id),
        );

        let foldersDiff =
          localOnlyFolders.length > 0 || cloudOnlyFolders.length > 0;
        if (!foldersDiff) {
          for (const lf of bothFolders) {
            const cf = cloudFolders.find((c) => c.id === lf.id);
            if (cf && cf.updatedAt !== lf.updatedAt) {
              foldersDiff = true;
              break;
            }
          }
        }

        const localBooks = localInventory.books;
        const localOnly = localBooks.filter(
          (lb) => !currentCloudBooks.some((cb) => cb.id === lb.id),
        );
        const cloudOnly = currentCloudBooks.filter(
          (cb) => !localBooks.some((lb) => lb.id === cb.id),
        );
        const both = localBooks.filter((lb) =>
          currentCloudBooks.some((cb) => cb.id === lb.id),
        );

        // 专家级快速无损拦截：若两端数量完全对齐且没有最后阅读时间戳变动，则 50ms 内极静秒退，不触发任何重绘和动画
        let hasDiff =
          localOnly.length > 0 || cloudOnly.length > 0 || foldersDiff;
        if (!hasDiff) {
          for (const localBook of both) {
            const cloudBook = currentCloudBooks.find(
              (cb) => cb.id === localBook.id,
            );
            if (cloudBook) {
              const cloudTime = cloudBook.lastReadAt
                ? new Date(cloudBook.lastReadAt).getTime()
                : 0;
              const localTime = localBook.lastReadAt
                ? new Date(localBook.lastReadAt).getTime()
                : 0;
              if (cloudTime !== localTime) {
                hasDiff = true;
                break;
              }
            }
          }
        }

        if (!hasDiff) {
          console.log(
            "[Sync Check] 两端书阁与书箧分类完美一致，50ms 内极静退出同步。",
          );
          return;
        }

        // 🏮 2. 如果存在书箧差异，执行 2-Way Merging 双向对碰（LWW - Last Write Wins）
        if (foldersDiff) {
          if (!isSilent) {
            setSyncStepText("正在对齐两端书箧分类...");
          }
          const foldersToUpload: LibraryFolder[] = [];
          const foldersToSaveLocally: LibraryFolder[] = [];

          for (const lf of localFolders) {
            const cf = cloudFolders.find((c) => c.id === lf.id);
            if (!cf) {
              foldersToUpload.push(lf);
            } else {
              const localTime = lf.updatedAt
                ? new Date(lf.updatedAt).getTime()
                : 0;
              const cloudTime = cf.updatedAt
                ? new Date(cf.updatedAt).getTime()
                : 0;
              if (localTime > cloudTime) {
                foldersToUpload.push(lf);
              } else if (cloudTime > localTime) {
                foldersToSaveLocally.push(cf);
              }
            }
          }

          for (const cf of cloudFolders) {
            if (!localFolders.some((l) => l.id === cf.id)) {
              foldersToSaveLocally.push(cf);
            }
          }

          // A. 同步上报至云端
          if (foldersToUpload.length > 0) {
            try {
              await operation.api.syncFolders(foldersToUpload);
            } catch (uploadErr) {
              console.error(
                "[Sync] 上报书箧失败，安全防丢断路隔离:",
                uploadErr,
              );
              hasSyncFailures = true;
            }
          }

          // B. 写入本地 IndexedDB 库
          if (foldersToSaveLocally.length > 0) {
            try {
              await db.transaction("rw", [db.libraryFolders], async () => {
                await db.libraryFolders.bulkPut(foldersToSaveLocally);
              });
            } catch (dbErr) {
              console.error(
                "[Sync] 本地覆写书箧失败，安全防丢断路隔离:",
                dbErr,
              );
              hasSyncFailures = true;
            }
          }
          console.log(
            `[Folder Sync] 同步完成。上传了 ${foldersToUpload.length} 个书箧，更新本地 ${foldersToSaveLocally.length} 个书箧。`,
          );
        }

        const totalSteps = localOnly.length + cloudOnly.length + both.length;
        let completedSteps = 0;

        const updateProgress = (stepCount: number, subProgress: number) => {
          const base = (stepCount / Math.max(1, totalSteps)) * 100;
          const addition = subProgress / Math.max(1, totalSteps);
          setSyncProgress(Math.min(100, Math.round(base + addition)));
        };

        // 1. 备份本地专享 (单个书籍 fetch 粒度异常断路隔离)
        for (const book of localOnly) {
          try {
            setSyncStepText(`正在备份「${book.title}」至云阁...`);
            // 记入活跃持久化上传任务，防刷新和崩溃
            markActiveSyncTask(book.id, "upload", syncShareToken);

            let outcome = await operation.service.uploadBook(book.id, {
              onUploaded: (uploaded, total) => {
                updateProgress(
                  completedSteps,
                  Math.round((uploaded / Math.max(total, 1)) * 100),
                );
                setSyncStepText(
                  `正在核验「${book.title}」章节 ${uploaded}/${total}`,
                );
              },
            });
            if (
              outcome.status === "failed" &&
              outcome.code === "invalid_local_upload" &&
              (book.sourceType === "folder_index" ||
                book.sourceType === "folder_multi_file_book")
            ) {
              setSyncStepText(`正在完整解析「${book.title}」...`);
              await cacheEntireBook(book.id);
              outcome = await operation.service.uploadBook(book.id, {
                onUploaded: (uploaded, total) => {
                  updateProgress(
                    completedSteps,
                    Math.round((uploaded / Math.max(total, 1)) * 100),
                  );
                  setSyncStepText(
                    `正在核验「${book.title}」章节 ${uploaded}/${total}`,
                  );
                },
              });
            }
            if (outcome.status === "failed") {
              throw new Error(`云端整书备份失败：${outcome.code}`);
            }

            // 任务完结，清除落盘记录
            clearActiveSyncTask(book.id, syncShareToken);
          } catch (singleBookErr) {
            console.error(
              `[Sync] 备份本地典籍「${book.title}」遭遇错误，已断路保护:`,
              singleBookErr,
            );
            hasSyncFailures = true;
          } finally {
            completedSteps++;
            updateProgress(completedSteps, 0);
          }
        }

        // 2. 拉取云端新书 (单个书籍 fetch 粒度异常断路隔离)
        for (const book of cloudOnly) {
          try {
            setSyncStepText(`正在从云阁拉取「${book.title}」...`);

            // 记入活跃持久化下载任务
            markActiveSyncTask(book.id, "download", syncShareToken);

            setSyncStepText(`正在下载「${book.title}」完整章节...`);
            const outcome = await operation.service.downloadBook(book, {
              onPage: (loaded, total) => {
                updateProgress(
                  completedSteps,
                  Math.round((loaded / Math.max(total, 1)) * 100),
                );
                setSyncStepText(
                  `正在下载「${book.title}」章节 ${loaded}/${total}`,
                );
              },
            });
            if (outcome.status === "failed") {
              throw new Error(`云端整书拉取失败：${outcome.code}`);
            }
            // 任务完结，清除落盘记录
            clearActiveSyncTask(book.id, syncShareToken);
          } catch (singleBookErr) {
            console.error(
              `[Sync] 拉取云阁新书「${book.title}」遭遇错误，已断路保护:`,
              singleBookErr,
            );
            hasSyncFailures = true;
          } finally {
            completedSteps++;
            updateProgress(completedSteps, 0);
          }
        }

        // 3. 进度双向对撞与咬合 (最深阅读进度大值优先对碰)
        if (both.length > 0) {
          setSyncStepText("正在合并两端阅读痕迹...");
          for (const localBook of both) {
            try {
              const cloudBook = currentCloudBooks.find(
                (cb) => cb.id === localBook.id,
              );
              if (cloudBook) {
                const localProgress = await db.progress.get(localBook.id);
                const cloudProgress: ReadingProgress | null =
                  readLegacyRemoteProgress(cloudBook) ?? null;

                // 确定合并获胜端：最深阅读字数/章节大值优先对碰，彻底免疫设备分布式时钟偏差 (Clock Skew)
                let winner: "local" | "cloud" = "local";

                if (localProgress && cloudProgress) {
                  const localIdx = localProgress.chapterIndex ?? 0;
                  const cloudIdx = cloudProgress.chapterIndex ?? 0;

                  if (cloudIdx > localIdx) {
                    winner = "cloud";
                  } else if (localIdx > cloudIdx) {
                    winner = "local";
                  } else {
                    // 章节完全咬合，精细对比段落阅读百分比
                    const localPct = localProgress.percentage ?? 0;
                    const cloudPct = cloudProgress.percentage ?? 0;

                    if (cloudPct > localPct) {
                      winner = "cloud";
                    } else if (localPct > cloudPct) {
                      winner = "local";
                    } else {
                      // 章节百分比对齐，精细比对段落序号段偏量
                      const localPara = localProgress.paragraphIndex ?? 0;
                      const cloudPara = cloudProgress.paragraphIndex ?? 0;

                      if (cloudPara > localPara) {
                        winner = "cloud";
                      } else if (localPara > cloudPara) {
                        winner = "local";
                      } else {
                        // 物理阅读进度完全处于同一维度！降级比对时钟，取最后修改时间
                        const cloudTime = cloudBook.lastReadAt
                          ? new Date(cloudBook.lastReadAt).getTime()
                          : 0;
                        const localTime = localBook.lastReadAt
                          ? new Date(localBook.lastReadAt).getTime()
                          : 0;
                        winner = cloudTime > localTime ? "cloud" : "local";
                      }
                    }
                  }
                } else if (cloudProgress && !localProgress) {
                  winner = "cloud";
                } else if (localProgress && !cloudProgress) {
                  winner = "local";
                } else {
                  // 两端均无有效进度记录，依据书籍元数据更新时间戳
                  const cloudTime = cloudBook.lastReadAt
                    ? new Date(cloudBook.lastReadAt).getTime()
                    : 0;
                  const localTime = localBook.lastReadAt
                    ? new Date(localBook.lastReadAt).getTime()
                    : 0;
                  winner = cloudTime > localTime ? "cloud" : "local";
                }

                // 执行胜出端合并事务
                if (winner === "cloud") {
                  // 云端读得更深：拉下并覆写本地元数据与进度
                  await db.transaction(
                    "rw",
                    [db.books, db.progress],
                    async () => {
                      // 备份本地进度防丢
                      const oldProgress = await db.progress.get(localBook.id);
                      if (oldProgress) {
                        const key = `reader-progress-rollback-${localBook.id}`;
                        let list: {
                          chapterIndex: number;
                          paragraphIndex?: number;
                          [key: string]: unknown;
                        }[] = [];
                        try {
                          list = JSON.parse(localStorage.getItem(key) || "[]");
                        } catch {}
                        if (
                          !list.some(
                            (p) =>
                              p.chapterIndex === oldProgress.chapterIndex &&
                              p.paragraphIndex === oldProgress.paragraphIndex,
                          )
                        ) {
                          list.push({
                            ...oldProgress,
                            rollbackAt: new Date().toISOString(),
                          });
                          localStorage.setItem(
                            key,
                            JSON.stringify(list.slice(-5)),
                          );
                        }
                      }

                      await db.books.update(localBook.id, {
                        lastReadAt: cloudBook.lastReadAt,
                        sourceFolderId: cloudBook.sourceFolderId,
                      });
                      if (cloudProgress) await db.progress.put(cloudProgress);
                    },
                  );
                } else if (winner === "local") {
                  // 本地读得更深：仅提交最轻量的进度数据覆盖云端，彻底免去重章节大文本传输
                  const progress = await db.progress.get(localBook.id);
                  const lastReadAt =
                    localBook.lastReadAt || new Date().toISOString();

                  if (progress) {
                    await operation.api.updateProgress(localBook.id, progress, {
                      lastReadAt,
                      sourceFolderId: localBook.sourceFolderId || null,
                    });
                  }
                }
              }
            } catch (singleBookErr) {
              console.error(
                `[Sync] 合并重叠图书「${localBook.title}」进度遭遇错误，已断路保护:`,
                singleBookErr,
              );
              hasSyncFailures = true;
            } finally {
              completedSteps++;
              updateProgress(completedSteps, 0);
              await new Promise((r) => setTimeout(r, 10));
            }
          }
        }

        // 仅在非静默（手动点击）时更新主加载进度与弹出 Toast 提示
        if (!isSilent) {
          setSyncProgress(100);
          if (hasSyncFailures) {
            setSyncStepText("部分书籍备份受阻，其余同步成功");
            setToastMsg(
              "💡 部分书籍由于网络卡顿已安全隔离防断链，其余典籍已安全对齐！",
            );
          } else {
            setSyncStepText(strings.sync.syncSuccess);
            setToastMsg(strings.sync.syncSuccess);
          }
        }

        const verifiedBooks = await operation.api.listBooks();
        commitCloudInventory(
          syncShareToken,
          inventoryGeneration,
          verifiedBooks,
        );
      } catch (e) {
        console.error("一键双向同步过程遭遇异常:", e);
        if (!isSilent) {
          setToastMsg(strings.sync.syncFailed);
        }
      } finally {
        syncMutexRef.current = false;
        if (!isSilent) {
          setTimeout(() => {
            setIsSyncing(false);
            setSyncProgress(0);
            setSyncStepText("");
          }, 500);
        }
      }
    };

    // 4. 跨标签页分布式互斥多标签进程锁，彻底隔离多端写冲突
    if (typeof navigator !== "undefined" && navigator.locks) {
      try {
        await navigator.locks.request(
          "read_realm_global_sync_lock",
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              console.log(
                "[Sync Lock] 跨标签页竞态抑制：另一书房标签页正在执行同步事务，本次极静退出。",
              );
              return;
            }
            await executeSyncPipeline();
          },
        );
      } catch (err) {
        console.warn("[Sync Lock] Web Locks API 请求异常，降级直跑:", err);
        await executeSyncPipeline();
      }
    } else {
      // 降级使用 LocalStorage 带 8 秒租约心跳时间戳分布式排他锁
      const lockKey = "read_realm_sync_local_lock";
      const now = Date.now();
      const rawLock = localStorage.getItem(lockKey);
      let isLockAvailable = true;

      if (rawLock) {
        try {
          const { timestamp } = JSON.parse(rawLock);
          if (now - timestamp < 8000) {
            isLockAvailable = false;
          }
        } catch {
          localStorage.removeItem(lockKey);
        }
      }

      if (!isLockAvailable) {
        console.log(
          "[Sync Lock] LocalStorage 锁冲突判定：另一标签页同步尚未结束，本次静默退出。",
        );
        return;
      }

      localStorage.setItem(lockKey, JSON.stringify({ timestamp: now }));

      const lockKeepAlive = setInterval(() => {
        localStorage.setItem(
          lockKey,
          JSON.stringify({ timestamp: Date.now() }),
        );
      }, 3000);

      try {
        await executeSyncPipeline();
      } finally {
        clearInterval(lockKeepAlive);
        localStorage.removeItem(lockKey);
      }
    }
  };

  // 单书快捷备份 (细粒度隔离进度状态)
  const handleSingleUpload = async (book: Book): Promise<boolean> => {
    if (!currentShareToken) {
      setToastMsg("💡 请先在同步设置中绑定私有分享密钥，再备份到云端。");
      return false;
    }
    if (syncMutexRef.current) {
      setToastMsg("⏳ 上一项同步操作尚未完成，请稍后再试。");
      return false;
    }
    if (isSyncing || syncingBookId) {
      setToastMsg("⏳ 全量同步正在进行中，请等待完成后再拉取单本书籍。");
      return false;
    }
    if (!isOnline) {
      setToastMsg("🔌 当前处于离线状态，请连接网络后再行落墨拉取。");
      return false;
    }
    const operation = createPersonalSyncOperation(currentShareToken);
    syncMutexRef.current = true;
    setSyncingBookId(book.id);
    setIsSyncing(true);
    setBookSyncStates((prev) => ({
      ...prev,
      [book.id]: { progress: 0, stepText: "正在打包本地卷阁..." },
    }));

    try {
      // 记入活跃持久化上传任务，防刷新和崩溃
      markActiveSyncTask(book.id, "upload", operation.shareToken);

      let outcome = await operation.service.uploadBook(book.id, {
        onUploaded: (uploaded, total) => {
          setBookSyncStates((prev) => ({
            ...prev,
            [book.id]: {
              progress: Math.round((uploaded / Math.max(total, 1)) * 100),
              stepText: `核验章节 ${uploaded}/${total}`,
            },
          }));
        },
      });
      if (
        outcome.status === "failed" &&
        outcome.code === "invalid_local_upload" &&
        (book.sourceType === "folder_index" ||
          book.sourceType === "folder_multi_file_book")
      ) {
        setBookSyncStates((prev) => ({
          ...prev,
          [book.id]: { progress: 10, stepText: "正在完整解析本地正文..." },
        }));
        await cacheEntireBook(book.id);
        outcome = await operation.service.uploadBook(book.id, {
          onUploaded: (uploaded, total) => {
            setBookSyncStates((prev) => ({
              ...prev,
              [book.id]: {
                progress: Math.round((uploaded / Math.max(total, 1)) * 100),
                stepText: `核验章节 ${uploaded}/${total}`,
              },
            }));
          },
        });
      }
      if (outcome.status === "failed") {
        throw new Error(`云端整书备份失败：${outcome.code}`);
      }

      clearActiveSyncTask(book.id, operation.shareToken);
      setToastMsg(`🍃 「${book.title}」云端完整副本已读回核验。`);
      await fetchCloudBooks();
      return true;
    } catch (error) {
      console.error(`备份藏书「${book.title}」失败:`, error);
      setToastMsg("💡 备份未通过完整性核验，已保留待重试状态。");
      return false;
    } finally {
      syncMutexRef.current = false;
      setIsSyncing(false);
      setSyncingBookId(null);
      setBookSyncStates((prev) => {
        const next = { ...prev };
        delete next[book.id];
        return next;
      });
    }
  };

  // 单书快捷拉取 (物理还原进度快照)
  const handleSingleDownload = async (book: LegacyRemoteBook) => {
    if (!currentShareToken) {
      setToastMsg("💡 请先绑定原私有分享密钥，再从云端拉取。");
      return;
    }
    if (syncMutexRef.current) {
      setToastMsg("⏳ 上一项同步操作尚未完成，请稍后再试。");
      return;
    }
    if (isSyncing || syncingBookId) {
      setToastMsg("⏳ 全量同步正在进行中，请等待完成后再拉取单本书籍。");
      return;
    }
    if (!navigator.onLine || !isOnline) {
      setToastMsg("🔌 当前处于离线状态，请连接网络后再行落墨拉取。");
      return;
    }
    const operation = createPersonalSyncOperation(currentShareToken);
    syncMutexRef.current = true;
    setSyncingBookId(book.id);
    setIsSyncing(true);
    setBookSyncStates((prev) => ({
      ...prev,
      [book.id]: { progress: 0, stepText: "正在连接云阁拉取..." },
    }));

    try {
      // 记入活跃持久化下载任务
      markActiveSyncTask(book.id, "download", operation.shareToken);

      for (let p = 0; p <= 40; p += 20) {
        setBookSyncStates((prev) => ({
          ...prev,
          [book.id]: { progress: p, stepText: `拉取中... ${p}%` },
        }));
        await new Promise((r) => setTimeout(r, 40));
      }

      const outcome = await operation.service.downloadBook(book, {
        onPage: (loaded, total) => {
          setBookSyncStates((prev) => ({
            ...prev,
            [book.id]: {
              progress: Math.min(
                85,
                40 + Math.round((loaded / Math.max(total, 1)) * 45),
              ),
              stepText: `拉取章节 ${loaded}/${total}`,
            },
          }));
        },
      });
      if (outcome.status === "failed") {
        throw new Error(`云端整书拉取失败：${outcome.code}`);
      }
      for (let p = 40; p <= 100; p += 20) {
        setBookSyncStates((prev) => ({
          ...prev,
          [book.id]: { progress: p, stepText: `落库中... ${p}%` },
        }));
        await new Promise((r) => setTimeout(r, 30));
      }

      setToastMsg(`🍃 「${book.title}」已成功拉取至本地书阁！`);
      clearActiveSyncTask(book.id, operation.shareToken);
      await fetchCloudBooks();
    } catch {
      if (!navigator.onLine) {
        setToastMsg("🔌 当前处于离线状态，请连接网络后再行落墨拉取。");
      } else {
        setToastMsg("💡 拉取失败，该书籍可能在云端已被清除。");
      }
    } finally {
      syncMutexRef.current = false;
      setTimeout(() => {
        setIsSyncing(false);
        setSyncingBookId(null);
        setBookSyncStates((prev) => {
          const next = { ...prev };
          delete next[book.id];
          return next;
        });
      }, 300);
    }
  };

  // 单书物理空间释放 (Space Offloading 与等价行级 Integrity 校验)
  const handleSpaceOffload = async (book: Book) => {
    if (!currentShareToken) {
      setToastMsg("💡 请先绑定原私有分享密钥，再核验云端副本。");
      return;
    }
    if (syncMutexRef.current || isSyncing || syncingBookId) return;
    const operation = createPersonalSyncOperation(currentShareToken);

    // 1. 物理安全行级校验 Integrity Grid
    const cloudBook = cloudBooksById.get(book.id);
    if (!cloudBook) {
      setToastMsg(strings.sync.offloadNoCloudError);
      return;
    }

    if (cloudBook.chapterCount !== book.chapterCount) {
      const errorMsg = strings.sync.offloadCountMismatchError
        .replace("{cloudCount}", String(cloudBook.chapterCount))
        .replace("{localCount}", String(book.chapterCount));
      setToastMsg(errorMsg);
      return;
    }

    setConfirmState({
      isOpen: true,
      title: "释放本地空间",
      message: strings.sync.offloadConfirm.replace("{title}", book.title),
      isDanger: false,
      onConfirm: async () => {
        if (syncMutexRef.current) {
          setToastMsg("⏳ 同步操作尚未完成，暂不释放本地正文。");
          throw new Error("OFFLOAD_SYNC_BUSY");
        }
        syncMutexRef.current = true;
        try {
          const outcome = await operation.service.offloadVerifiedBook(book.id);
          if (outcome.status === "failed") {
            setToastMsg("💡 云端正文未通过逐章核验，已取消释放本地空间。");
            throw new Error("OFFLOAD_REMOTE_VERIFICATION_FAILED");
          }
          setToastMsg(
            strings.sync.offloadSuccess.replace("{title}", book.title),
          );
          await fetchCloudBooks();
        } catch (err) {
          console.error("释放本地空间失败:", err);
          setToastMsg("💡 物理释放空间失败，存储数据库繁忙。");
          throw err;
        } finally {
          syncMutexRef.current = false;
        }
      },
    });
  };

  // 冷启动自愈：1. 静默自动同步大盘 2. 持久化未完结单书同步任务自愈
  const recoveredShareTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOnline || !currentShareToken) return;

    const runAutoStartupSyncAndRecovery = async () => {
      const recoveryShareToken = currentShareToken;
      if (recoveredShareTokenRef.current === recoveryShareToken) return;
      recoveredShareTokenRef.current = recoveryShareToken;

      // 1. 冷启动自动双向对撞同步 (使用 sessionStorage 构筑会话级隔离锁，防刷限流)
      const hasSyncedInSession = sessionStorage.getItem(
        "reader-session-auto-synced",
      );
      if (
        autoSyncOnStartup &&
        !isSyncing &&
        !syncMutexRef.current &&
        hasSyncedInSession !== "true"
      ) {
        console.log("[Sync Self-healing] 触发冷启动静默自动同步...");
        sessionStorage.setItem("reader-session-auto-synced", "true");
        await handleDualSync(true);
      }

      // 2. 持久化任务重连校验与自愈
      try {
        const activeTasks = readSyncTasks(window.localStorage);
        if (Object.keys(activeTasks).length > 0) {
          const { books: localBooks } =
            await libraryQueryService.readSyncInventory();
          if (currentShareTokenRef.current !== recoveryShareToken) return;
          const scopedTasks = Object.values(activeTasks).filter(
            (task) => task.shareToken === recoveryShareToken,
          );
          const needsRemoteRecovery = scopedTasks.some(
            (task) => task.action === "download",
          );
          const remoteBooks = needsRemoteRecovery
            ? await createPersonalSyncOperation(
                recoveryShareToken,
              ).api.listBooks()
            : [];
          if (currentShareTokenRef.current !== recoveryShareToken) return;

          for (const { bookId, action, shareToken } of scopedTasks) {
            if (currentShareTokenRef.current !== recoveryShareToken) return;
            // 如果已经在同步该书，安全跳过
            if (syncingBookId === bookId) continue;

            const localBook = localBooks.find((book) => book.id === bookId);
            const remoteBook = remoteBooks.find((book) => book.id === bookId);
            if (action === "delete") {
              try {
                await createPersonalSyncOperation(shareToken).api.deleteBook(
                  bookId,
                );
                clearActiveSyncTask(bookId, shareToken);
              } catch (error) {
                console.error(
                  `[Sync Self-healing] 云端删除任务 ${bookId} 仍待重试:`,
                  error,
                );
              }
              continue;
            }
            const recoveryBook = action === "upload" ? localBook : remoteBook;
            if (recoveryBook) {
              console.log(
                `[Sync Self-healing] 检测到未完结持久任务「${recoveryBook.title}」(${action})，启动断点自愈重连...`,
              );
              if (action === "upload" && localBook) {
                await handleSingleUpload(localBook);
              } else if (action === "download" && remoteBook) {
                await handleSingleDownload(remoteBook);
              }
            }
          }
        }
      } catch (e) {
        console.error("恢复持久化活跃同步任务失败:", e);
      }
    };

    // 在本地书籍加载完或准备妥当后运行
    if (books !== undefined) {
      const timer = setTimeout(runAutoStartupSyncAndRecovery, 200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, books, autoSyncOnStartup, currentShareToken]);

  // 所有融合后的书籍（本地 + 仅云端存在）
  const mergedBooks = useMemo(
    () => mergeLibraryBooks(books ?? [], cloudBooks, librarySort),
    [books, cloudBooks, librarySort],
  );
  const folderBookCounts = useMemo(
    () => countLibraryBooksByFolder(mergedBooks),
    [mergedBooks],
  );

  // 进行逻辑文件夹层级过滤后的书籍，安全归栈、防丢自愈
  const filteredMergedBooks = useMemo(
    () =>
      filterMergedLibraryBooksByFolder({
        mergedBooks,
        folders,
        currentFolderId,
      }),
    [currentFolderId, folders, mergedBooks],
  );
  const libraryShelfEntries = useMemo<LibraryShelfEntry[]>(
    () => [
      ...currentFolders.map((folder) => ({ kind: "folder" as const, folder })),
      ...filteredMergedBooks.map((book) => ({ kind: "book" as const, book })),
    ],
    [currentFolders, filteredMergedBooks],
  );
  const libraryRenderPage = useMemo(
    () =>
      paginateLibraryItems(
        libraryShelfEntries,
        libraryPageNumber,
        LIBRARY_PAGE_SIZE,
      ),
    [libraryPageNumber, libraryShelfEntries],
  );
  const renderedShelfEntries = useMemo(
    () => ({
      folders: libraryRenderPage.items.flatMap((entry) =>
        entry.kind === "folder" ? [entry.folder] : [],
      ),
      books: libraryRenderPage.items.flatMap((entry) =>
        entry.kind === "book" ? [entry.book] : [],
      ),
    }),
    [libraryRenderPage.items],
  );

  const libraryPageClampReady = canClampLibraryRoutePage({
    localInventoryReady: books !== undefined,
    activeShareToken: currentShareToken,
    verifiedCloudToken:
      verifiedCloudInventory?.generation === cloudInventoryGenerationRef.current
        ? verifiedCloudInventory.token
        : null,
  });

  useEffect(() => {
    if (libraryPageClampReady && libraryRenderPage.page !== libraryPageNumber) {
      setLibraryPageNumber(libraryRenderPage.page);
    }
  }, [libraryPageClampReady, libraryPageNumber, libraryRenderPage.page]);

  const getBookAvailabilityStatus = (
    book: Book,
    cachedSet: Set<string> | undefined,
  ) => {
    if (
      book.cacheStatus === "chapters_full" ||
      book.sourceAvailability === "full_cached"
    ) {
      return {
        label: "已下载",
        style:
          "bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-[var(--color-primary)]/20",
      };
    }
    if (
      book.sourceType === "folder_index" ||
      book.sourceType === "folder_multi_file_book"
    ) {
      if (book.sourceAvailability === "permission_required") {
        return {
          label: "需要授权",
          style:
            "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20",
        };
      }
      if (book.sourceAvailability === "source_missing") {
        return {
          label: "源文件缺失",
          style:
            "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border-[var(--color-border)]",
        };
      }
      return {
        label: "源文件可读",
        style:
          "bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-[var(--color-primary)]/20",
      };
    }
    if (cachedSet?.has(book.id)) {
      return {
        label: "已下载",
        style:
          "bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-[var(--color-primary)]/20",
      };
    }
    if (cloudBookIds.has(book.id)) {
      return {
        label: "云端有副本",
        style:
          "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20",
      };
    }
    return {
      label: "仅书目信息",
      style:
        "bg-[var(--color-surface-muted)] text-[var(--color-muted)] border-[var(--color-border)]",
    };
  };

  const setViewMode = (mode: LibraryViewMode) => {
    setViewModeState(mode);
    window.localStorage.setItem(LIBRARY_VIEW_KEY, mode);
  };

  const goToLibraryPage = useCallback((page: number) => {
    setLibraryPageNumber(page);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("[data-library-shelf]")
        ?.scrollIntoView({ block: "start" });
    });
  }, []);

  const rememberLibrarySource = (bookId: string) => {
    const main = document.querySelector<HTMLElement>("[data-app-main]");
    rememberViewScrollPosition("library", main?.scrollTop ?? 0);
    rememberViewSourceFocus("library", bookId);
  };

  const openLibraryBook = (book: Book, cloudOnly: boolean) => {
    rememberLibrarySource(book.id);
    if (cloudOnly) {
      void handleSingleDownload(book);
    } else {
      router.push(`/reader/${book.id}`);
    }
  };

  const handleDelete = (bookId: string, title: string) => {
    setConfirmState({
      isOpen: true,
      title: "物理删除典籍",
      message: strings.shelf.deleteConfirm.replace("{title}", title),
      isDanger: true,
      onConfirm: async () => {
        try {
          const result = await libraryCommandService.removeBook(bookId);
          if (result.status !== "applied") {
            setToastMsg("这本书已不在本地，未发起云端删除。请刷新书架后重试。");
            throw new Error(`remove_book_${result.status}`);
          }

          if (currentShareToken) {
            const operation = createPersonalSyncOperation(currentShareToken);
            markActiveSyncTask(bookId, "delete", operation.shareToken);
            try {
              await operation.api.deleteBook(bookId);
              clearActiveSyncTask(bookId, operation.shareToken);
            } catch (error) {
              console.error("Backend delete failed", error);
              setToastMsg("💡 已从本地移除；云端删除待网络恢复后重试。");
            }
          }
          // 删除后拉取刷新云端对齐
          fetchCloudBooks();
        } catch (e) {
          console.error(`Delete error: ${(e as Error).message}`);
          if (!(e instanceof Error && e.message.startsWith("remove_book_"))) {
            setToastMsg("删除未完成，本地书籍与云端副本均按原状态保留。");
          }
          throw e;
        }
      },
    });
  };

  const bookCount = books?.length || 0;
  const progressMap = new Map(Object.entries(progressByBookId || {}));
  const continueBook = selectContinueBook(books || [], progressMap);
  const continueProgress = continueBook
    ? progressByBookId?.[continueBook.id]
    : undefined;
  const continuePercent = continueBook
    ? getProgressPercent(continueBook, continueProgress)
    : 0;
  useEffect(() => {
    router.prefetch("/search");
    router.prefetch("/import");
    router.prefetch("/settings");
    books?.slice(0, 8).forEach((book) => router.prefetch(`/reader/${book.id}`));
  }, [books, router]);

  return (
    <AppShell
      title="书架"
      subtitle="本地优先，离线也能继续阅读"
      rightNodes={
        <>
          <button
            onClick={() => router.push("/search")}
            className="ui-focus-ring hidden min-h-11 rounded-[var(--radius-control)] border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white sm:inline-flex sm:items-center"
          >
            搜索
          </button>
          <button
            onClick={() => router.push("/import")}
            className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)]"
          >
            导入
          </button>
        </>
      }
    >
      {continueBook && (
        <section className="mt-1">
          <div className="grid grid-cols-1 gap-4">
            {/* 左侧占 2/3：最近阅读卡 */}
            <div>
              <button
                aria-label={`继续阅读《${continueBook.title}》`}
                onClick={() => router.push(`/reader/${continueBook.id}`)}
                className="ui-card ui-focus-ring group relative w-full cursor-pointer overflow-hidden p-4 text-left transition-colors hover:border-[var(--ui-accent)] sm:p-5"
                type="button"
              >
                {/* 🏮 极奢双层渐变宣纸淡入层 (Dual-Layer Gradient Fade-In)，物理规避重排闪烁，实现水墨慢呼吸 */}
                <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(135deg,transparent,var(--ui-accent-soft))] opacity-40" />

                {/* 拟物装饰高光线 */}
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent z-10" />

                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--ui-accent)]">
                      最近阅读
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--ui-muted)]">
                      回到上次停下的位置
                    </p>
                  </div>
                  <div className="hidden text-sm font-semibold text-[var(--ui-accent)] sm:flex sm:items-center sm:gap-1">
                    <span>继续阅读</span>
                    <span>→</span>
                  </div>
                </div>
                <div className="relative z-10 mt-3 flex items-center gap-4">
                  {/* 拟物旋转叠层阴影封面 */}
                  <div className="relative shrink-0 select-none transition-transform duration-300 group-hover:scale-[1.02] group-hover:rotate-[1deg]">
                    {/* 仿真书后阴影叠层 */}
                    <BookCover
                      title={continueBook.title}
                      className="h-[104px] w-[70px] shadow-[var(--shadow-paper)]"
                    />
                  </div>

                  <div className="min-w-0 flex-1 h-full flex flex-col justify-center">
                    <h3 className="truncate [font-family:var(--font-display)] text-lg font-semibold text-[var(--ui-text)]">
                      {continueBook.title}
                    </h3>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ui-muted)]">
                      <span className="rounded-[var(--radius-control)] bg-[var(--ui-accent-soft)] px-2 py-0.5 text-xs font-semibold uppercase text-[var(--ui-accent)]">
                        {continueBook.format}
                      </span>
                      <span>{getChapterSummary(continueProgress)}</span>
                      <span className="text-[var(--ui-quiet)]">•</span>
                      <span>
                        {getFriendlyRelativeTime(
                          continueBook.lastReadAt || continueBook.updatedAt,
                        )}
                      </span>
                    </p>

                    {/* 高级精细进度条 */}
                    <div className="mt-3">
                      <div className="mb-1.5 flex justify-between text-xs font-semibold text-[var(--ui-muted)]">
                        <span>阅读进度</span>
                        <span>{continuePercent}%</span>
                      </div>
                      <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--ui-soft-border)]">
                        <div
                          style={{ width: `${continuePercent}%` }}
                          className="h-full rounded-full bg-[var(--ui-accent)] transition-[width] duration-200"
                        />
                      </div>
                    </div>

                    <span className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--ui-accent)] px-4 text-sm font-semibold text-white sm:hidden">
                      继续阅读
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 云同步只在已绑定或执行中展示。 */}
      {(currentShareToken || isSyncing) && (
        <section
          data-library-sync
          className="ui-card relative mt-5 overflow-hidden p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(95,125,82,0.08)] text-lg text-[var(--ui-accent)]">
                {isSyncing ? "🌀" : isOnline ? "☁️" : "🌧️"}
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--ui-text)] flex items-center gap-2">
                  <span>{strings.sync.title}</span>
                  {isOnline ? (
                    <span className="px-2 py-0.5 rounded bg-[rgba(95,125,82,0.08)] text-[10px] font-bold text-[var(--ui-accent)] uppercase">
                      {strings.shelf.syncingCloud}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-red-50 text-[10px] font-bold text-red-500 uppercase">
                      已离线
                    </span>
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--ui-muted)] leading-relaxed">
                  {isSyncing && !syncingBookId
                    ? syncStepText
                    : isOnline
                      ? "已连接多端同步，可按需同步本地与云端数据"
                      : strings.sync.offlineDesc}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {isOnline && (
                <button
                  onClick={() => handleDualSync(false)}
                  disabled={isSyncing}
                  className="ui-focus-ring min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--ui-accent)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)] disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
                >
                  {isSyncing && !syncingBookId
                    ? "同步中..."
                    : strings.sync.syncBtn}
                </button>
              )}
            </div>
          </div>

          <div className="relative z-10 flex flex-col items-start">
            <button
              onClick={() => setShowSyncConfig(!showSyncConfig)}
              className="ui-focus-ring mt-3 flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-sm font-semibold text-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)]"
            >
              <span>⚙️ {strings.sync.syncSettingsTitle}</span>
              <span>{showSyncConfig ? "▲" : "▼"}</span>
            </button>
          </div>

          {showSyncConfig && (
            <div className="mt-4 pt-4 border-t border-[rgba(80,65,45,0.08)] space-y-4 animate-fade-in relative z-10">
              {/* 启动自动云同步 */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-bold text-[var(--ui-text)] flex items-center gap-1.5">
                    <span>🍃</span> {strings.sync.autoSyncStartupLabel}
                  </label>
                  <p className="text-[11px] text-[var(--ui-muted)] leading-relaxed mt-0.5">
                    {strings.sync.autoSyncStartupDesc}
                  </p>
                </div>
                <button
                  onClick={() => setAutoSyncOnStartup(!autoSyncOnStartup)}
                  disabled={!isOnline}
                  aria-label={strings.sync.autoSyncStartupLabel}
                  aria-pressed={autoSyncOnStartup}
                  className={`ui-focus-ring relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0.5 transition-colors duration-200 ease-in-out ${
                    autoSyncOnStartup && isOnline
                      ? "bg-[var(--ui-accent)]"
                      : "bg-gray-200"
                  } ${!isOnline ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      autoSyncOnStartup && isOnline
                        ? "translate-x-4"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* 阅读翻页自动备份 */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-bold text-[var(--ui-text)] flex items-center gap-1.5">
                    <span>📖</span> {strings.sync.autoSyncProgressLabel}
                  </label>
                  <p className="text-[11px] text-[var(--ui-muted)] leading-relaxed mt-0.5">
                    {strings.sync.autoSyncProgressDesc}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setAutoSyncProgressOnReading(!autoSyncProgressOnReading)
                  }
                  disabled={!isOnline}
                  aria-label={strings.sync.autoSyncProgressLabel}
                  aria-pressed={autoSyncProgressOnReading}
                  className={`ui-focus-ring relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0.5 transition-colors duration-200 ease-in-out ${
                    autoSyncProgressOnReading && isOnline
                      ? "bg-[var(--ui-accent)]"
                      : "bg-gray-200"
                  } ${!isOnline ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      autoSyncProgressOnReading && isOnline
                        ? "translate-x-4"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* 墨问密阁 · 多端共享 */}
              <div className="pt-4 border-t border-[rgba(80,65,45,0.06)] flex flex-col gap-3.5">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-bold text-[var(--ui-text)] flex items-center gap-1.5">
                    <span>🏯</span> {strings.sync.shareTitle}
                  </label>
                  <p className="text-[11px] text-[var(--ui-muted)] leading-relaxed mt-1">
                    {strings.sync.shareDesc}
                  </p>
                </div>

                {/* 宣纸肌理微透卡片 */}
                <div
                  id="mo-wen-mi-ge-panel"
                  className="bg-[#FAF6EE] dark:bg-[#1E1B15] border border-[rgba(139,115,85,0.18)] rounded-lg p-3.5 space-y-3 shadow-inner relative overflow-hidden"
                >
                  {/* 斑驳洒金宣纸肌理衬底 (CSS 拟物) */}
                  <div className="absolute inset-0 bg-[radial-gradient(#8b7355_1px,transparent_1px)] [background-size:16px_16px] opacity-[0.03] pointer-events-none" />

                  <div className="flex flex-col gap-1.5 relative z-10">
                    <span className="text-[11px] font-bold text-[var(--ui-quiet)]">
                      {strings.sync.shareKeyLabel}
                    </span>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={shareTokenInput}
                        onChange={(e) => setShareTokenInput(e.target.value)}
                        placeholder={strings.sync.shareKeyPlaceholder}
                        className="ui-focus-ring min-h-11 min-w-0 flex-1 rounded-[var(--radius-field)] border border-[rgba(139,115,85,0.2)] bg-white/60 px-3 text-sm text-[var(--ui-text)] placeholder-[var(--ui-quiet)] transition-colors focus:border-[var(--ui-accent)] dark:bg-black/30"
                      />
                      {currentShareToken &&
                      currentShareToken === shareTokenInput.trim() ? (
                        <button
                          onClick={handleCopyPoeticKey}
                          aria-label="复制私有云密钥"
                          className="ui-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[rgba(139,115,85,0.25)] bg-white/40 px-3 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white/80"
                          title="复制秘钥"
                        >
                          <span>📋</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1 relative z-10">
                    {/* 感念天机 */}
                    <button
                      onClick={handleGeneratePoeticKey}
                      className="ui-focus-ring flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--radius-control)] border border-[rgba(139,115,85,0.25)] bg-[rgba(139,115,85,0.06)] px-3 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-[rgba(139,115,85,0.12)]"
                    >
                      <span>🖌️</span> {strings.sync.shareGenerateBtn}
                    </button>

                    <div className="flex-1" />

                    {/* 动作按钮 */}
                    {currentShareToken ? (
                      <div className="flex gap-2">
                        <button
                          onClick={handleClearCloudBooks}
                          disabled={!isOnline}
                          className={`ui-focus-ring flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--radius-control)] border border-[#c25042]/30 bg-[#c25042]/5 px-3 text-sm font-semibold text-[#c25042] transition-colors hover:bg-[#c25042]/10 ${
                            !isOnline ? "opacity-40 cursor-not-allowed" : ""
                          }`}
                          title="彻底擦除该共享密钥在云端存放的书籍及阅读记录"
                        >
                          <span>🧼</span> 物理清空云端备份
                        </button>
                        <button
                          onClick={handleClearShareToken}
                          className="ui-focus-ring flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--radius-control)] bg-[#8b7355]/80 px-3 text-sm font-semibold text-white transition-colors hover:bg-[#8b7355]"
                        >
                          <span>🍃</span> {strings.sync.shareClearBtn}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleBindShareToken}
                        disabled={!shareTokenInput.trim()}
                        className={`ui-focus-ring flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--radius-control)] bg-[var(--ui-accent)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)] ${
                          !shareTokenInput.trim()
                            ? "opacity-40 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        <span>🤝</span> {strings.sync.shareBindBtn}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 300ms 黄金阻尼微百分比进度加载条 */}
          {isSyncing && !syncingBookId && (
            <div className="mt-4 pt-3 border-t border-[rgba(80,65,45,0.06)] relative z-10">
              <div className="flex justify-between text-[11px] font-bold text-[var(--ui-quiet)] mb-1.5">
                <span>{syncStepText}</span>
                <span>{syncProgress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(80,65,45,0.06)] relative">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--ui-accent)] via-[#81a073] to-[#9a6a3a] transition-[width] duration-300 ease-out"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-7" data-library-shelf>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {/* 可交互多级面包屑 */}
            <div className="flex items-center flex-wrap gap-2 text-xl font-bold text-[var(--ui-text)] select-none">
              {(() => {
                const list: { id: string | undefined; name: string }[] = [];
                let currentId = currentFolderId;
                while (currentId) {
                  const folder = folders.find((f) => f.id === currentId);
                  if (folder) {
                    list.unshift({ id: folder.id, name: folder.name });
                    currentId = folder.parentId;
                  } else {
                    // 🏮 极端防死锁自救：如果当前的 currentFolderId 存在但找不到对应的物理/逻辑文件夹，
                    // 依旧优雅塞入占位项，以此让父级面包屑“私人藏书”恢复为可点击交互状态，赋予阁主 100% 手动脱困自愈的能力！
                    list.unshift({ id: currentId, name: "未知逻辑空间" });
                    break;
                  }
                }
                list.unshift({ id: undefined, name: "我的书架" });
                return list;
              })().map((crumb, idx, arr) => {
                const isLast = idx === arr.length - 1;
                return (
                  <div
                    key={crumb.id || "root"}
                    className="flex items-center gap-1.5"
                  >
                    {idx > 0 && (
                      <span className="text-sm text-[var(--ui-quiet)]">➔</span>
                    )}
                    <button
                      onClick={() => !isLast && navigateToFolder(crumb.id)}
                      className={`font-reading-title transition-all flex items-center gap-1 ${
                        isLast
                          ? "text-[#5C4533] cursor-default"
                          : "text-[var(--ui-muted)] hover:text-[var(--ui-accent)] hover:scale-101 active:scale-98"
                      }`}
                    >
                      <span>{crumb.name}</span>
                    </button>
                    {isLast && (
                      <span className="text-xs font-normal text-[var(--ui-quiet)] ml-1">
                        ({bookCount})
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              查看书目、阅读进度和正文可用状态。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="inline-flex w-fit rounded-[var(--radius-control)] border border-[var(--ui-border)] bg-white/64 p-1 text-sm">
              <button
                onClick={() => {
                  setSortBy("title");
                  setLibraryPageNumber(1);
                }}
                className={`min-h-11 rounded-[8px] px-3 py-2 transition-colors ${
                  sortBy === "title"
                    ? "bg-[var(--ui-accent)] font-semibold text-white"
                    : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                }`}
              >
                {strings.shelf.sortTitle}
              </button>
              <button
                onClick={() => {
                  setSortBy("createdAt");
                  setLibraryPageNumber(1);
                }}
                className={`min-h-11 rounded-[8px] px-3 py-2 transition-colors ${
                  sortBy === "createdAt"
                    ? "bg-[var(--ui-accent)] font-semibold text-white"
                    : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                }`}
              >
                {strings.shelf.sortRecent}
              </button>
            </div>
            <div className="inline-flex w-fit rounded-[var(--radius-control)] border border-[var(--ui-border)] bg-white/64 p-1 text-sm">
              {[
                ["cover", "封面"],
                ["compact", "紧凑"],
                ["list", "列表"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as LibraryViewMode)}
                  className={`min-h-11 min-w-11 rounded-[8px] px-3 py-2 transition-colors ${
                    viewMode === mode
                      ? "bg-[var(--ui-accent)] font-semibold text-white"
                      : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {books === undefined ? (
          <SkeletonLoader
            type={viewMode === "list" ? "list" : "grid"}
            count={4}
          />
        ) : libraryShelfEntries.length === 0 ? (
          <EmptyState
            title="书架还是空的"
            description="导入一本 TXT 或 EPUB 开始阅读，或从藏经阁加入公共藏书。"
            primaryAction={{
              label: "导入本地书籍",
              accessibleLabel: "前往导入本地书籍",
              onClick: () => router.push("/import"),
            }}
            secondaryAction={{
              label: "浏览藏经阁",
              accessibleLabel: "前往藏经阁浏览公共藏书",
              onClick: () => router.push("/public-library"),
            }}
          />
        ) : viewMode === "list" ? (
          <div className="overflow-hidden rounded-[20px] border border-[#E9DCC8]/60 bg-[#FFFDFB]/60 backdrop-blur-md shadow-[0_12px_36px_rgba(80,65,45,0.03)] divide-y divide-[#E9DCC8]/50">
            <button
              onClick={() => router.push("/import")}
              className="ui-focus-ring flex min-h-[54px] w-full items-center justify-center bg-white/30 px-4 text-sm font-semibold text-[var(--ui-muted)] transition-all duration-300 hover:bg-[var(--ui-accent-soft)] hover:text-[var(--ui-accent)]"
            >
              ＋ 导入书籍 / 关联目录
            </button>

            {/* 1. 渲染当前层级的逻辑文件夹 (书箧) */}
            {renderedShelfEntries.folders.map((folder) => (
              <div
                key={folder.id}
                data-folder-id={folder.id}
                className="group relative cursor-pointer flex items-center justify-between gap-4 px-6 py-4 bg-gradient-to-r from-[#FFFDF9]/60 to-[#FDF9F2]/60 transition-all duration-300 hover:bg-[#FAF5EB]/50"
              >
                {/* 左侧绿点指示 */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--ui-accent)] opacity-0 scale-50 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100" />

                <button
                  type="button"
                  data-library-entry-primary
                  aria-label={`进入书箧「${folder.name}」`}
                  onClick={() => navigateToFolder(folder.id)}
                  className="ui-focus-ring relative z-10 flex min-w-0 flex-1 items-center gap-5 rounded-[var(--radius-control)] pl-3 text-left"
                >
                  {/* 拟物双耳竹箧图标 */}
                  <div className="relative shrink-0 flex items-center justify-center h-11 w-11 rounded-lg bg-[rgba(154,106,58,0.06)] border border-[rgba(154,106,58,0.12)] text-xl group-hover:scale-105 transition-transform duration-300">
                    📁
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-reading-title text-[15px] font-bold text-[#5C4533] group-hover:text-[var(--ui-accent)] transition-colors">
                      {folder.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--ui-muted)]">
                      逻辑书箧 · 共 {folderBookCounts.get(folder.id) ?? 0}{" "}
                      本藏书
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-4 shrink-0 pr-8 sm:pr-10 relative z-20">
                  {/* 🖌️ 逻辑文件夹独立治理菜单 */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setActiveMenuId(
                          activeMenuId === `folder-${folder.id}`
                            ? null
                            : `folder-${folder.id}`,
                        );
                      }}
                      className="ui-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-transparent text-sm text-[#8C6239] transition-colors hover:border-[#E9DCC8] hover:bg-white/85 hover:text-[var(--ui-accent)] dark:hover:bg-[#3d3a37]"
                      title="书箧落墨治理"
                    >
                      🖌️
                    </button>
                    {activeMenuId === `folder-${folder.id}` && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 mt-2 w-48 bg-[#FCF9F2]/95 dark:bg-[#1E1E1E]/95 backdrop-blur-md border border-[#E9DCC8] dark:border-white/10 rounded-xl shadow-2xl py-2 z-50 origin-top-right transition-all duration-200"
                      >
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                            await handleIncrementalScan(folder.id, folder.name);
                          }}
                          className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 border-b border-[#E9DCC8]/30 px-4 text-left text-sm font-semibold text-[#5C4533] transition-colors hover:bg-[#F2EADA] dark:border-white/5 dark:text-[#E5E5E5] dark:hover:bg-[#3a3a3a]"
                        >
                          <span>🧭</span> 增量重扫目录
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                            await handleBackupFolder(folder.id, folder.name);
                          }}
                          className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 border-b border-[#E9DCC8]/30 px-4 text-left text-sm font-semibold text-[#5C4533] transition-colors hover:bg-[#F2EADA] dark:border-white/5 dark:text-[#E5E5E5] dark:hover:bg-[#3a3a3a]"
                        >
                          <span>📤</span> 备份书箧云端
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                            await handleDisconnectFolder(
                              folder.id,
                              folder.name,
                            );
                          }}
                          className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm font-semibold text-[#A64B4B] transition-colors hover:bg-[#FFF2ED]"
                        >
                          <span>🔏</span> 解除物理绑定
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDissolveFolder(folder.id, folder.name);
                    }}
                    className="ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border border-[#E9DCC8] bg-white/85 px-3 text-sm font-semibold text-[#A64B4B] transition-colors hover:bg-[#FFF2ED] hover:text-[var(--ui-danger)]"
                    title="解散书箧，书籍将重归主阁"
                  >
                    解散
                  </button>
                </div>
              </div>
            ))}

            {/* 2. 渲染当前层级的藏书 (Books) */}
            {renderedShelfEntries.books.map((book) => {
              const progress = progressByBookId?.[book.id];
              const percent = getProgressPercent(book, progress);

              const isLocal = localBookIds.has(book.id);
              const isCloud = cloudBookIds.has(book.id);
              const isLocalOnly = isLocal && !isCloud;
              const isCloudOnly = !isLocal && isCloud;
              const isSynced = isLocal && isCloud;

              return (
                <div
                  key={book.id}
                  data-book-id={book.id}
                  onTouchStart={
                    isLocal ? handleTouchStart(book.id, book.title) : undefined
                  }
                  onTouchEnd={
                    isLocal ? handleTouchEndOrMove(book.id) : undefined
                  }
                  onTouchMove={
                    isLocal ? handleTouchEndOrMove(book.id) : undefined
                  }
                  className={`group relative cursor-pointer flex items-center justify-between gap-4 px-6 py-4 transition-all duration-300 hover:bg-[#FAF5EB]/50 ${
                    isCloudOnly ? "opacity-75 backdrop-blur-[0.5px]" : ""
                  }`}
                >
                  {/* 左侧动态高亮天青原点/指示点 */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--ui-accent)] opacity-0 scale-50 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100" />

                  <button
                    type="button"
                    data-library-entry-primary
                    aria-label={`打开《${book.title}》`}
                    onClick={() => openLibraryBook(book, isCloudOnly)}
                    className="ui-focus-ring relative z-10 flex min-w-0 flex-1 items-center gap-5 rounded-[var(--radius-control)] pl-3 text-left"
                  >
                    {/* 实体比例微型 3D 封面 */}
                    <div className="relative shrink-0 select-none transition-transform duration-300 group-hover:scale-[1.03] group-hover:rotate-[1deg]">
                      <div className="absolute -left-1 top-1 w-full h-full rounded-[4px] bg-black/5 blur-[2px] -z-10" />
                      <BookCover
                        title={book.title}
                        className="h-[64px] w-[44px] rounded-[4px] shadow-[1px_3px_8px_rgba(47,42,36,0.1)]"
                        compact
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <h3 className="truncate font-reading-title text-[15px] font-bold text-[var(--ui-text)] group-hover:text-[var(--ui-accent)] transition-colors tracking-wide">
                          {book.title}
                        </h3>
                        {/* 自适应极奢状态徽标 */}
                        {(() => {
                          const status = getBookAvailabilityStatus(
                            book,
                            cachedBookIdsSet,
                          );
                          return (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap shadow-sm ${status.style}`}
                            >
                              {status.label}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-xs text-[var(--ui-muted)]">
                        <span>{book.author || "本地书籍"}</span>
                        {book.contentLocator && (
                          <>
                            <span className="text-[var(--ui-quiet)]">•</span>
                            <span
                              className="text-[10px] text-[#8C6239] bg-[#FAF5EB] px-1.5 py-0.5 rounded border border-[#E9DCC8]/40 truncate max-w-[120px]"
                              title={book.contentLocator.relativePath}
                            >
                              📁{" "}
                              {book.contentLocator.relativePath
                                .split("/")
                                .pop()}
                            </span>
                          </>
                        )}
                        <span className="text-[var(--ui-quiet)]">•</span>
                        <span className="uppercase text-[10px] font-bold text-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-1.5 py-0.5 rounded">
                          {book.format}
                        </span>
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0 pr-8 sm:pr-10 relative z-20">
                    {/* 🖌️ 藏书独立治理菜单 */}
                    {isLocal && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setActiveMenuId(
                              activeMenuId === `book-${book.id}`
                                ? null
                                : `book-${book.id}`,
                            );
                          }}
                          className="ui-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-transparent text-sm text-[#8C6239] transition-colors hover:border-[#E9DCC8] hover:bg-white/85 hover:text-[var(--ui-accent)] dark:hover:bg-[#3d3a37]"
                          title="藏书落墨治理"
                        >
                          🖌️
                        </button>
                        {activeMenuId === `book-${book.id}` && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 mt-2 w-48 bg-[#FCF9F2]/95 dark:bg-[#1E1E1E]/95 backdrop-blur-md border border-[#E9DCC8] dark:border-white/10 rounded-xl shadow-2xl py-2 z-50 origin-top-right transition-all duration-200"
                          >
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                setActiveMenuId(null);
                                await handleSingleUpload(book);
                              }}
                              className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 border-b border-[#E9DCC8]/30 px-4 text-left text-sm font-semibold text-[#5C4533] transition-colors hover:bg-[#F2EADA] dark:border-white/5 dark:text-[#E5E5E5] dark:hover:bg-[#3a3a3a]"
                            >
                              <span>📤</span> 单独同步备份
                            </button>
                            {book.contentLocator && (
                              <>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                    await handleReconstructBook(
                                      book.id,
                                      book.title,
                                    );
                                  }}
                                  className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 border-b border-[#E9DCC8]/30 px-4 text-left text-sm font-semibold text-[#5C4533] transition-colors hover:bg-[#F2EADA] dark:border-white/5 dark:text-[#E5E5E5] dark:hover:bg-[#3a3a3a]"
                                >
                                  <span>📥</span> 强制重构自愈
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                    await handleDisconnectBook(
                                      book.id,
                                      book.title,
                                    );
                                  }}
                                  className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm font-semibold text-[#A64B4B] transition-colors hover:bg-[#FFF2ED]"
                                >
                                  <span>🔏</span> 解除物理绑定
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 🏮 藏书治理快捷动作 */}
                    {isLocal && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGovBook(book);
                          setIsGovOpen(true);
                        }}
                        className="ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border border-[#E4D7C2] bg-[#FAF5EB] px-3 text-sm font-semibold text-[#8C6239] transition-colors hover:bg-[#8C6239] hover:text-white"
                        title="藏书管理与目录治理"
                      >
                        🏮 治理
                      </button>
                    )}

                    {isLocalOnly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isOnline) handleSingleUpload(book);
                        }}
                        disabled={!isOnline || isSyncing}
                        className={`ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] px-3 text-sm font-semibold transition-colors ${
                          isOnline
                            ? "bg-[var(--ui-accent-soft)] hover:bg-[var(--ui-accent)] hover:text-white text-[var(--ui-accent)]"
                            : "bg-gray-100 text-gray-400 opacity-40 pointer-events-none"
                        }`}
                        title={isOnline ? "" : "🌧️ 离线暂存"}
                      >
                        {syncingBookId === book.id
                          ? "备份中"
                          : isOnline
                            ? strings.sync.backupBtn
                            : "🌧️ 暂存"}
                      </button>
                    )}
                    {isCloudOnly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isOnline) handleSingleDownload(book);
                        }}
                        disabled={!isOnline || isSyncing}
                        className={`ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] px-3 text-sm font-semibold transition-colors ${
                          isOnline
                            ? "bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600"
                            : "bg-gray-100 text-gray-400 opacity-40 pointer-events-none"
                        }`}
                        title={isOnline ? "" : "🌧️ 待连网下载"}
                      >
                        {syncingBookId === book.id
                          ? "拉取中"
                          : isOnline
                            ? strings.sync.downloadBtn
                            : "🌧️ 待连"}
                      </button>
                    )}
                    {isSynced &&
                      cachedBookIdsSet?.has(book.id) &&
                      syncingBookId !== book.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSpaceOffload(book);
                          }}
                          className="ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-[#8C6239] transition-colors hover:bg-[#8C6239] hover:text-white"
                          title="释放本地物理章节，保留云端书架索引"
                        >
                          {strings.sync.offloadBtn}
                        </button>
                      )}

                    {/* 极细微型进度条与百分比 */}
                    {!isCloudOnly && (
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-1 overflow-hidden rounded-full bg-[rgba(80,65,45,0.06)] relative hidden sm:block">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[var(--ui-accent)] to-[#81a073] transition-[width]"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-[var(--ui-quiet)] w-10 text-right">
                          {percent}%
                        </span>
                      </div>
                    )}

                    {/* 悬展删除操作 */}
                    {isLocal && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(book.id, book.title);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        className="ui-focus-ring absolute right-0 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] border border-[rgba(184,107,92,0.12)] bg-white/95 text-sm font-semibold text-[var(--ui-danger)] opacity-0 transition-opacity duration-200 hover:bg-[#FFF0EC] group-hover:opacity-100 sm:flex"
                        title={strings.shelf.delete}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* 单书同步进度条 */}
                  {syncingBookId === book.id && (
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-[rgba(80,65,45,0.06)] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--ui-accent)] to-[#81a073] transition-[width] duration-300 ease-out"
                        style={{
                          width: `${bookSyncStates[book.id]?.progress || 0}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={
              viewMode === "compact"
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
            <button
              onClick={() => router.push("/import")}
              className={`ui-focus-ring flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[rgba(95,125,82,0.2)] bg-white/30 p-6 text-[var(--ui-muted)] transition-all hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)] hover:text-[var(--ui-accent)] ${
                viewMode === "compact" ? "min-h-[110px]" : "min-h-[148px]"
              }`}
            >
              <span className="mb-2 text-2xl font-light">＋</span>
              <span className="text-sm font-semibold">导入书籍</span>
            </button>

            {/* 1. 渲染当前层级的逻辑文件夹 (网格/紧凑卡片) */}
            {renderedShelfEntries.folders.map((folder) => (
              <div
                key={folder.id}
                data-folder-id={folder.id}
                className={`group relative overflow-hidden cursor-pointer ui-card flex flex-col justify-between rounded-[18px] p-4 physics-spring hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(80,65,45,0.07)] bg-gradient-to-br from-[#FFFDF9] via-[#FCFAF2] to-[#FAF6EE] border border-[#E4D7C2]/70 ${
                  viewMode === "compact" ? "min-h-[110px]" : "min-h-[148px]"
                }`}
              >
                <button
                  type="button"
                  data-library-entry-primary
                  aria-label={`进入书箧「${folder.name}」`}
                  onClick={() => navigateToFolder(folder.id)}
                  className="ui-focus-ring absolute inset-x-0 top-0 z-10 h-24 rounded-[inherit]"
                >
                  <span className="sr-only">进入书箧「{folder.name}」</span>
                </button>
                {/* 装饰用：黄铜提手拉扣 */}
                <div className="absolute top-1/2 -translate-y-1/2 right-4 w-2 h-8 rounded-full border border-[rgba(139,115,85,0.35)] bg-[#FAF0D9]/80 flex flex-col items-center justify-center gap-1.5 shrink-0 opacity-80 group-hover:bg-[#EEDBB5] group-hover:scale-105 transition-all">
                  <div className="w-1 h-1 rounded-full bg-[#8B7355]/40" />
                  <div className="w-1 h-2 rounded-full bg-[#8B7355]/30" />
                  <div className="w-1 h-1 rounded-full bg-[#8B7355]/40" />
                </div>

                <div className="flex gap-4 mt-2">
                  {/* 书箧大图标 */}
                  <div className="relative shrink-0 select-none flex items-center justify-center h-[54px] w-[54px] rounded-2xl bg-[rgba(154,106,58,0.05)] border border-[rgba(154,106,58,0.12)] text-3xl group-hover:scale-105 transition-transform duration-300">
                    📁
                  </div>
                  <div className="min-w-0 flex-1 pr-4">
                    <h3 className="line-clamp-2 text-[15px] font-bold leading-snug font-reading-title text-[#5C4533] group-hover:text-[var(--ui-accent)] transition-colors">
                      {folder.name}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--ui-muted)]">
                      逻辑书箧
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#E4D7C2]/30 pt-3">
                  <span className="text-[10px] text-[var(--ui-quiet)] font-bold">
                    共 {folderBookCounts.get(folder.id) ?? 0} 本藏书
                  </span>
                  <div className="relative z-20 flex items-center gap-2">
                    {/* 🖌️ 逻辑文件夹独立治理菜单 (网格模式) */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setActiveMenuId(
                            activeMenuId === `folder-${folder.id}`
                              ? null
                              : `folder-${folder.id}`,
                          );
                        }}
                        className="ui-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[#E9DCC8] text-sm text-[#8C6239] transition-colors hover:bg-white/85 hover:text-[var(--ui-accent)] dark:hover:bg-[#3d3a37]"
                        title="书箧落墨治理"
                      >
                        🖌️
                      </button>
                      {activeMenuId === `folder-${folder.id}` && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-full mb-2 w-48 bg-[#FCF9F2]/95 dark:bg-[#1E1E1E]/95 backdrop-blur-md border border-[#E9DCC8] dark:border-white/10 rounded-xl shadow-2xl py-2 z-50 origin-bottom-right transition-all duration-200"
                        >
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              await handleIncrementalScan(
                                folder.id,
                                folder.name,
                              );
                            }}
                            className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 border-b border-[#E9DCC8]/30 px-4 text-left text-sm font-semibold text-[#5C4533] transition-colors hover:bg-[#F2EADA] dark:border-white/5 dark:text-[#E5E5E5] dark:hover:bg-[#3a3a3a]"
                          >
                            <span>🧭</span> 增量重扫目录
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              await handleBackupFolder(folder.id, folder.name);
                            }}
                            className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 border-b border-[#E9DCC8]/30 px-4 text-left text-sm font-semibold text-[#5C4533] transition-colors hover:bg-[#F2EADA] dark:border-white/5 dark:text-[#E5E5E5] dark:hover:bg-[#3a3a3a]"
                          >
                            <span>📤</span> 备份书箧云端
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              await handleDisconnectFolder(
                                folder.id,
                                folder.name,
                              );
                            }}
                            className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm font-semibold text-[#A64B4B] transition-colors hover:bg-[#FFF2ED]"
                          >
                            <span>🔏</span> 解除物理绑定
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDissolveFolder(folder.id, folder.name);
                      }}
                      className="ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border border-[#E4D7C2] bg-white px-3 text-sm font-semibold text-[#A64B4B] transition-colors hover:bg-[#FFF2ED] hover:text-[var(--ui-danger)]"
                      title="解散书箧，书籍将重归主阁"
                    >
                      解散
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {renderedShelfEntries.books.map((book) => {
              const progress = progressByBookId?.[book.id];
              const percent = getProgressPercent(book, progress);

              const isLocal = localBookIds.has(book.id);
              const isCloud = cloudBookIds.has(book.id);
              const isLocalOnly = isLocal && !isCloud;
              const isCloudOnly = !isLocal && isCloud;
              const isSynced = isLocal && isCloud;

              return (
                <div
                  key={book.id}
                  data-book-id={book.id}
                  onTouchStart={
                    isLocal ? handleTouchStart(book.id, book.title) : undefined
                  }
                  onTouchEnd={
                    isLocal ? handleTouchEndOrMove(book.id) : undefined
                  }
                  onTouchMove={
                    isLocal ? handleTouchEndOrMove(book.id) : undefined
                  }
                  className={`group relative overflow-hidden cursor-pointer ui-card flex flex-col justify-between rounded-[18px] p-4 physics-spring hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(80,65,45,0.07)] ${
                    viewMode === "compact" ? "min-h-[110px]" : "min-h-[148px]"
                  } ${isCloudOnly ? "opacity-75 backdrop-blur-[0.5px]" : ""}`}
                >
                  <button
                    type="button"
                    data-library-entry-primary
                    aria-label={`打开《${book.title}》`}
                    onClick={() => openLibraryBook(book, isCloudOnly)}
                    className="ui-focus-ring absolute inset-x-0 top-0 z-10 h-24 rounded-[inherit]"
                  >
                    <span className="sr-only">打开《{book.title}》</span>
                  </button>
                  {/* Delete button: visible on mobile, hover-fade-in on desktop, hidden on mobile for better aesthetics and prevention of misclicks */}
                  {isLocal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(book.id, book.title);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="ui-focus-ring absolute right-2 top-2 z-20 hidden h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border border-[rgba(184,107,92,0.12)] bg-white/95 text-sm font-semibold text-[var(--ui-danger)] opacity-0 transition-opacity duration-200 hover:bg-[#FFF0EC] group-hover:opacity-100 sm:flex"
                      title={strings.shelf.delete}
                    >
                      ×
                    </button>
                  )}

                  {/* 状态徽标 (右上角挂载) */}
                  <div className="pointer-events-none absolute left-2 top-2 z-20 flex gap-1">
                    {(() => {
                      const status = getBookAvailabilityStatus(
                        book,
                        cachedBookIdsSet,
                      );
                      return (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap shadow-sm ${status.style}`}
                        >
                          {status.label}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex gap-4 mt-6">
                    {viewMode === "cover" && (
                      <div className="relative shrink-0 select-none">
                        {/* 仿真阴影叠层 */}
                        <div className="absolute -left-1 top-1 w-full h-full rounded-[10px] bg-black/8 blur-[3px] -z-10" />
                        <BookCover
                          title={book.title}
                          className="h-[116px] w-[78px] shadow-[1px_6px_16px_rgba(47,42,36,0.14)]"
                          compact
                          hoverLift={true}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[15px] font-bold leading-snug font-reading-title text-[var(--ui-text)] group-hover:text-[var(--ui-accent)] transition-colors">
                        {book.title}
                      </h3>
                      <p className="mt-1 truncate text-xs text-[var(--ui-muted)]">
                        {book.author || "本地书籍"}
                      </p>
                      <div className="relative z-20 mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-[var(--ui-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--ui-accent)]">
                          {book.format}
                        </span>

                        {isLocal && (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setActiveMenuId(
                                  activeMenuId === `book-${book.id}`
                                    ? null
                                    : `book-${book.id}`,
                                );
                              }}
                              className="ui-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[#E4D7C2] bg-[#FAF5EB] px-3 text-sm font-semibold text-[#8C6239] transition-colors hover:bg-[#8C6239] hover:text-white"
                              title="藏书落墨治理"
                            >
                              🖌️
                            </button>
                            {activeMenuId === `book-${book.id}` && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 bottom-full mb-2 w-48 bg-[#FCF9F2]/95 dark:bg-[#1E1E1E]/95 backdrop-blur-md border border-[#E9DCC8] dark:border-white/10 rounded-xl shadow-2xl py-2 z-50 origin-bottom-left transition-all duration-200"
                              >
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                    await handleSingleUpload(book);
                                  }}
                                  className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 border-b border-[#E9DCC8]/30 px-4 text-left text-sm font-semibold text-[#5C4533] transition-colors hover:bg-[#F2EADA] dark:border-white/5 dark:text-[#E5E5E5] dark:hover:bg-[#3a3a3a]"
                                >
                                  <span>📤</span> 单独同步备份
                                </button>
                                {book.contentLocator && (
                                  <>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        await handleReconstructBook(
                                          book.id,
                                          book.title,
                                        );
                                      }}
                                      className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 border-b border-[#E9DCC8]/30 px-4 text-left text-sm font-semibold text-[#5C4533] transition-colors hover:bg-[#F2EADA] dark:border-white/5 dark:text-[#E5E5E5] dark:hover:bg-[#3a3a3a]"
                                    >
                                      <span>📥</span> 强制重构自愈
                                    </button>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        await handleDisconnectBook(
                                          book.id,
                                          book.title,
                                        );
                                      }}
                                      className="ui-focus-ring flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm font-semibold text-[#A64B4B] transition-colors hover:bg-[#FFF2ED]"
                                    >
                                      <span>🔏</span> 解除物理绑定
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {isLocal && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGovBook(book);
                              setIsGovOpen(true);
                            }}
                            className="ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border border-[#E4D7C2] bg-[#FAF5EB] px-3 text-sm font-semibold text-[#8C6239] transition-colors hover:bg-[#8C6239] hover:text-white"
                            title="藏书管理与目录治理"
                          >
                            🏮 治理
                          </button>
                        )}
                        {isLocalOnly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isOnline) handleSingleUpload(book);
                            }}
                            disabled={!isOnline || isSyncing}
                            className={`ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border px-3 text-sm font-semibold transition-colors ${
                              isOnline
                                ? "bg-[#FAF5EB] hover:bg-[#8C6239] hover:text-white text-[#8C6239] border-[#E4D7C2]"
                                : "bg-gray-100 text-gray-400 border-gray-200 opacity-40 pointer-events-none"
                            }`}
                            title={isOnline ? "" : "🌧️ 离线暂存"}
                          >
                            {syncingBookId === book.id
                              ? "备份中"
                              : isOnline
                                ? strings.sync.backupBtn
                                : "🌧️ 暂存"}
                          </button>
                        )}
                        {isCloudOnly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isOnline) handleSingleDownload(book);
                            }}
                            disabled={!isOnline || isSyncing}
                            className={`ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border px-3 text-sm font-semibold transition-colors ${
                              isOnline
                                ? "bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 border-blue-100"
                                : "bg-gray-100 text-gray-400 border-gray-200 opacity-40 pointer-events-none"
                            }`}
                            title={isOnline ? "" : "🌧️ 待连网下载"}
                          >
                            {syncingBookId === book.id
                              ? "拉取中"
                              : isOnline
                                ? strings.sync.downloadBtn
                                : "🌧️ 待连"}
                          </button>
                        )}
                        {isSynced &&
                          cachedBookIdsSet?.has(book.id) &&
                          syncingBookId !== book.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSpaceOffload(book);
                              }}
                              className="ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-[#8C6239] transition-colors hover:bg-[#8C6239] hover:text-white"
                              title="释放本地章节，保留云阁索引"
                            >
                              {strings.sync.offloadBtn}
                            </button>
                          )}
                      </div>

                      {/* 精美细线进度条 */}
                      {!isCloudOnly && (
                        <div className="mt-4">
                          <div className="h-1 overflow-hidden rounded-full bg-[rgba(80,65,45,0.06)] relative">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[var(--ui-accent)] to-[#81a073] transition-[width]"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <p className="mt-1.5 text-[10px] text-[var(--ui-quiet)] font-medium">
                        {isCloudOnly
                          ? "云端新书 · 点击拉取"
                          : `${getChapterSummary(progress)} · 已读 ${percent}%`}
                        {book.lastReadAt &&
                          !isCloudOnly &&
                          ` · ${getFriendlyRelativeTime(book.lastReadAt)}`}
                      </p>
                    </div>
                  </div>

                  {/* 单书同步微型进度条 */}
                  {syncingBookId === book.id && (
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-[rgba(80,65,45,0.06)] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--ui-accent)] to-[#81a073] transition-[width] duration-300 ease-out"
                        style={{
                          width: `${bookSyncStates[book.id]?.progress || 0}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {books !== undefined &&
          libraryRenderPage.totalItems > LIBRARY_PAGE_SIZE && (
            <nav
              aria-label="书架分页"
              data-library-pagination
              className="mt-5 flex flex-col items-center justify-between gap-3 rounded-[18px] border border-[var(--ui-border)] bg-white/55 px-4 py-3 sm:flex-row"
            >
              <p className="text-xs text-[var(--ui-muted)]" aria-live="polite">
                第 {libraryRenderPage.page} / {libraryRenderPage.totalPages} 页
                <span className="mx-2 text-[var(--ui-quiet)]">·</span>
                当前 {libraryRenderPage.rangeStart}–{libraryRenderPage.rangeEnd}{" "}
                项，共 {libraryRenderPage.totalItems} 项
              </p>
              <div className="grid w-full grid-cols-4 gap-2 sm:w-auto">
                <button
                  type="button"
                  disabled={libraryRenderPage.page === 1}
                  onClick={() => goToLibraryPage(1)}
                  className="ui-focus-ring min-h-11 rounded-full border border-[var(--ui-border)] bg-white/75 px-3 text-xs font-semibold text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  首页
                </button>
                <button
                  type="button"
                  disabled={libraryRenderPage.page === 1}
                  onClick={() => goToLibraryPage(libraryRenderPage.page - 1)}
                  className="ui-focus-ring min-h-11 rounded-full border border-[var(--ui-border)] bg-white/75 px-3 text-xs font-semibold text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={
                    libraryRenderPage.page === libraryRenderPage.totalPages
                  }
                  onClick={() => goToLibraryPage(libraryRenderPage.page + 1)}
                  className="ui-focus-ring min-h-11 rounded-full border border-[var(--ui-border)] bg-white/75 px-3 text-xs font-semibold text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  下一页
                </button>
                <button
                  type="button"
                  disabled={
                    libraryRenderPage.page === libraryRenderPage.totalPages
                  }
                  onClick={() => goToLibraryPage(libraryRenderPage.totalPages)}
                  className="ui-focus-ring min-h-11 rounded-full border border-[var(--ui-border)] bg-white/75 px-3 text-xs font-semibold text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  末页
                </button>
              </div>
            </nav>
          )}
      </section>

      {/* 优雅宣纸毛玻璃 Toast 提示 */}
      {toastMsg && (
        <div
          aria-live="polite"
          className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center rounded-[var(--radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-sm font-medium text-[var(--ui-text)] shadow-[var(--shadow-raised)] md:bottom-6"
          role="status"
        >
          {toastMsg}
        </div>
      )}

      {/* 🏮 国风宣纸拟物 Custom Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        isDanger={confirmState.isDanger}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        fallbackFocus={() =>
          document.querySelector<HTMLElement>(
            "[data-library-shelf] button, [aria-label='书架']",
          )
        }
      />

      {/* 🏮 落砚·藏书治理弹窗 */}
      <BookGovernanceDialog
        isOpen={isGovOpen}
        book={selectedGovBook}
        folders={folders}
        onClose={() => {
          setIsGovOpen(false);
          setSelectedGovBook(null);
        }}
        onToast={(msg) => setToastMsg(msg)}
      />
    </AppShell>
  );
}

// ==========================================
// 🏮 落砚·藏书治理弹窗 (BookGovernanceDialog)
// ==========================================
const BookGovernanceDialog = memo(function BookGovernanceDialog({
  isOpen,
  book,
  folders,
  onClose,
  onToast,
}: {
  isOpen: boolean;
  book: Book | null;
  folders: LibraryFolder[];
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [cacheProgress, setCacheProgress] = useState<number | null>(null);
  const [isCaching, setIsCaching] = useState(false);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [unbindConfirmOpen, setUnbindConfirmOpen] = useState(false);
  const [publicationCredential, setPublicationCredential] = useState("");
  const publicationTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setPublicationCredential(
        normalizeShareToken(window.localStorage.getItem("reader-share-token")),
      );
      if (book) {
        setSelectedFolderId(book.sourceFolderId || "root");
      }
    } else {
      document.body.style.overflow = "";
      setIsCreatingFolder(false);
      setNewFolderName("");
      setCacheProgress(null);
      setIsCaching(false);
      setPublicationOpen(false);
      setUnbindConfirmOpen(false);
      setPublicationCredential("");
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, book]);

  if (!isOpen || !book) return null;

  const handleMove = async (folderId: string) => {
    try {
      const result = await libraryCommandService.moveBook(book.id, folderId);
      if (result.status === "applied") {
        onToast(
          `📖 藏书已归置到 ${folderId === "root" ? "书架主阁" : folders.find((f) => f.id === folderId)?.name || "指定书箧"}`,
        );
      } else {
        onToast(
          result.status === "folder_not_found"
            ? "💡 目标书箧已不存在"
            : "💡 藏书已不在本地",
        );
      }
    } catch (e) {
      console.error(e);
      onToast("💡 移动藏书失败");
    }
  };

  const handleCreateAndMove = async () => {
    if (!newFolderName.trim()) {
      onToast("💡 书箧名称不能为空");
      return;
    }
    try {
      const result = await libraryCommandService.createFolderAndMove(
        book.id,
        newFolderName,
      );
      if (result.status === "applied") {
        onToast(`🎨 已新建书箧「${newFolderName.trim()}」并移入藏书`);
        setIsCreatingFolder(false);
        setNewFolderName("");
        if (result.folderId) setSelectedFolderId(result.folderId);
      } else if (result.status === "invalid_folder_name") {
        onToast("💡 书箧名称需为 1–80 个字符");
      } else {
        onToast("💡 藏书已不在本地，未建立空书箧");
      }
    } catch (e) {
      console.error(e);
      onToast("💡 新建书箧并移动失败");
    }
  };

  const handleCache = async () => {
    if (isCaching) return;
    setIsCaching(true);
    setCacheProgress(0);
    try {
      await cacheEntireBook(book.id, (p) => {
        setCacheProgress(Math.round(p));
      });
      onToast(`🌾 「${book.title}」已全量成功缓存，归入松墨离线阁。`);
      setCacheProgress(100);
      setTimeout(() => setCacheProgress(null), 1000);
    } catch (e) {
      console.error(e);
      onToast("💡 缓存整本书失败，请检查网络或物理源目录权限");
    } finally {
      setIsCaching(false);
    }
  };

  const handleUnbind = async () => {
    try {
      const result = await libraryCommandService.removeBook(book.id);
      if (result.status === "applied") {
        onToast(`《${book.title}》已从本机移除，原始磁盘文件未被修改。`);
        onClose();
      } else {
        onToast("这本书已不在本地，未重复执行移除。");
        throw new Error(`remove_book_${result.status}`);
      }
    } catch (e) {
      console.error(e);
      onToast("从本机移除失败，请检查当前状态后重试。");
      throw e;
    }
  };

  const canPublish = Boolean(publicationCredential) && book.format === "txt";

  return createPortal(
    <>
      <ReaderDialogSurface
        open={isOpen}
        label={`藏书治理：${book.title}`}
        onClose={onClose}
        fallbackFocus={() =>
          document.querySelector<HTMLElement>("[data-library-shelf]")
        }
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 p-3 backdrop-blur-md sm:p-4"
        data-book-governance-dialog="true"
      >
        {/* 弹窗框 (宣纸风格) */}
        <div
          onClick={(event) => event.stopPropagation()}
          className="relative my-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-[#E9DCC8] bg-[#FAF8F2] p-5 text-[#5C4533] shadow-2xl transition-all z-10 animate-scale-in sm:p-7"
        >
          {/* 注入淡入和缩放动画 */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
          @keyframes scaleIn {
            from { transform: translateY(6px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .animate-scale-in {
            animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `,
            }}
          />

          {/* 顶部栏 */}
          <div className="flex items-center justify-between border-b border-[#E9DCC8]/60 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏮</span>
              <div>
                <h3 className="font-reading-title text-base font-bold text-[#4A321F]">
                  落砚 · 藏书治理阁
                </h3>
                <p className="text-[11px] text-[var(--ui-muted)]">
                  治理、归档及缓存对策管理
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="reader-focus-ring flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[rgba(80,65,45,0.05)] text-[var(--ui-muted)] transition-colors hover:bg-[rgba(80,65,45,0.1)]"
              aria-label="关闭藏书治理"
            >
              ×
            </button>
          </div>

          {/* 书籍预览详情卡 */}
          <div className="mt-5 rounded-2xl border border-[#E9DCC8]/40 bg-[#FFFDFB]/60 p-4 flex gap-4">
            <BookCover
              title={book.title}
              className="h-16 w-11 shrink-0 rounded shadow-[1px_2px_6px_rgba(0,0,0,0.08)]"
              compact
            />
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <h4 className="truncate font-reading-title text-sm font-bold text-[#4A321F]">
                {book.title}
              </h4>
              <p className="mt-0.5 truncate text-xs text-[var(--ui-muted)]">
                作者：{book.author || "本地佚名"}
              </p>
              <p className="mt-1 text-[10px] text-[var(--ui-quiet)] font-medium">
                格式：<span className="uppercase">{book.format}</span>
                {book.contentLocator?.relativePath && (
                  <>
                    {" "}
                    · 相对路径:{" "}
                    <span className="truncate max-w-[150px] inline-block align-bottom">
                      {book.contentLocator.relativePath}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* 治理内容区分三板块 */}
          <div className="mt-6 space-y-6">
            {/* 版块一：归属逻辑文件夹 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold tracking-wide text-[#7C624E]">
                📦 逻辑归置 (当前所属：
                {folders.find((f) => f.id === book.sourceFolderId)?.name ||
                  "书架主阁"}
                )
              </label>
              {!isCreatingFolder ? (
                <div className="flex gap-2">
                  <select
                    value={selectedFolderId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__create__") {
                        setIsCreatingFolder(true);
                      } else {
                        setSelectedFolderId(val);
                        handleMove(val);
                      }
                    }}
                    className="min-h-[44px] flex-1 rounded-xl border border-[#E9DCC8] bg-white px-3 py-2 text-xs font-semibold shadow-sm focus:border-[var(--ui-accent)] focus:outline-none text-[#5C4533]"
                  >
                    <option value="root">📜 书架主阁 (未分类)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                    <option
                      value="__create__"
                      className="text-[var(--ui-accent)] font-bold"
                    >
                      ＋ 新建逻辑书箧...
                    </option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="请输入新书箧名称..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="min-h-[44px] flex-1 rounded-xl border border-[#E9DCC8] bg-white px-3 py-2 text-xs font-semibold shadow-sm focus:border-[var(--ui-accent)] focus:outline-none text-[#5C4533]"
                  />
                  <button
                    onClick={handleCreateAndMove}
                    className="min-h-[44px] rounded-xl bg-[var(--ui-accent)] hover:bg-[#527047] text-white px-3 text-xs font-bold transition-colors"
                  >
                    新建并移入
                  </button>
                  <button
                    onClick={() => setIsCreatingFolder(false)}
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-[#E9DCC8] bg-white hover:bg-gray-50 text-[var(--ui-muted)] px-3 text-xs font-bold transition-colors"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>

            {/* 版块二：全量离线缓存 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold tracking-wide text-[#7C624E]">
                🌾 全量离线缓存
              </label>
              <div className="rounded-xl border border-[#E9DCC8]/40 bg-white/50 p-3.5">
                <div className="flex justify-between items-center gap-4">
                  <div>
                    <h5 className="text-xs font-bold text-[#5C4533]">
                      一键物理缓存全卷
                    </h5>
                    <p className="mt-0.5 text-[10px] text-[var(--ui-muted)] leading-normal">
                      解析整本书并入库存储，供在断网或离线设备时完整阅读。
                    </p>
                  </div>
                  <button
                    onClick={handleCache}
                    disabled={isCaching}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                      isCaching
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-[#F1F6F0] hover:bg-[var(--ui-accent)] hover:text-white text-[var(--ui-accent)] border-[var(--ui-accent-soft)]"
                    }`}
                  >
                    {isCaching ? "缓存中..." : "一键缓存"}
                  </button>
                </div>

                {/* 300ms 黄金阻尼微百分比进度加载条 */}
                {cacheProgress !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[9px] font-bold text-[var(--ui-quiet)] mb-1">
                      <span>切片解析与安全写入中</span>
                      <span>{cacheProgress}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-[rgba(80,65,45,0.06)] relative">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--ui-accent)] to-[#81a073] transition-[width] duration-300"
                        style={{ width: `${cacheProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold tracking-wide text-[#7C624E]">
                🏛️ 公共藏经阁
              </label>
              <div className="rounded-xl border border-[#E9DCC8]/50 bg-white/55 p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-[#5C4533]">
                      发布已验证的云端正文
                    </h5>
                    <p className="mt-1 text-[11px] leading-5 text-[var(--ui-muted)]">
                      {!publicationCredential
                        ? "需先在同步设置绑定私有云密钥；匿名浏览仍可正常使用。"
                        : book.format !== "txt"
                          ? "当前首版仅支持已上传私人云端的 TXT 藏书。"
                          : "先核验同一私有云密钥下的云端章节，再创建独立公共明文副本。"}
                    </p>
                  </div>
                  <button
                    ref={publicationTriggerRef}
                    type="button"
                    disabled={!canPublish}
                    onClick={() => setPublicationOpen(true)}
                    className="reader-focus-ring min-h-[44px] shrink-0 rounded-full border border-[#C9D7C2] bg-[#F1F6F0] px-4 text-xs font-bold text-[#4F7047] transition-colors hover:bg-[#5F7D52] hover:text-white disabled:cursor-not-allowed disabled:border-[#E4DED4] disabled:bg-[#F4F1EB] disabled:text-[#9C9388]"
                  >
                    公开入阁
                  </button>
                </div>
              </div>
            </div>

            {/* 版块三：物理下架 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold tracking-wide text-[#7C624E]">
                🍂 藏书下架治理
              </label>
              <div className="rounded-xl border border-red-200/40 bg-red-50/20 p-3.5 flex justify-between items-center gap-4">
                <div>
                  <h5 className="text-xs font-bold text-[#A64B4B]">
                    从本机下架解绑
                  </h5>
                  <p className="mt-0.5 text-[10px] text-[var(--ui-muted)] leading-normal">
                    移除此书并清空其在 IndexedDB
                    内的正文。不影响任何磁盘物理文件。
                  </p>
                </div>
                <button
                  onClick={() => setUnbindConfirmOpen(true)}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-red-50 hover:bg-[#A64B4B] hover:text-white text-xs font-bold text-[#A64B4B] border border-red-200 transition-colors shrink-0"
                >
                  解绑下架
                </button>
              </div>
            </div>
          </div>
        </div>
      </ReaderDialogSurface>
      <ConfirmDialog
        isOpen={unbindConfirmOpen}
        title="从本机移除"
        message={`确认从本机移除《${book.title}》吗？正文、进度和笔记会从本机删除，但不会移动或修改磁盘上的原始文件。`}
        confirmText="移除"
        isDanger
        onConfirm={handleUnbind}
        onClose={() => setUnbindConfirmOpen(false)}
        fallbackFocus={() =>
          document.querySelector<HTMLElement>(
            "[data-library-shelf] button, [aria-label='书架']",
          )
        }
      />
      <PersonalBookPublicationDialog
        open={publicationOpen}
        book={book}
        credential={publicationCredential}
        onClose={() => setPublicationOpen(false)}
        fallbackFocus={() => publicationTriggerRef.current}
      />
    </>,
    document.body,
  );
});
