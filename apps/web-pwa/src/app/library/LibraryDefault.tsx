"use client";

import { useEffect, useState, memo, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@reader/storage-core";
import { useVirtualRouter } from "@/lib/route-store";
import { apiUrl, getShareHeaders } from "@/lib/api";
import { strings } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { BookCover } from "@/components/BookCover";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { extractColorsFromTitle } from "@/lib/color-extraction";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { Book, ReadingProgress, LibraryFolder } from "@reader/shared-types";
import { createId } from "@reader/shared-types";
import { cacheEntireBook } from "@/hooks/useReader";
import { PRESET_BOOKLISTS } from "./presetBooks";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FolderScanService, type ImportPreviewNode } from "@/services/FolderScanService";

type LibraryViewMode = "cover" | "compact" | "list";

const LIBRARY_VIEW_KEY = "library-view-mode";

const POETIC_KEYS = [
  "松风阅心", "煮字生涯", "寒夜客来", "静夜钟声", "西窗剪烛", 
  "墨染秋池", "落木萧萧", "独钓寒江", "疏影横斜", "暗香浮动",
  "云破月来", "小楼听雨", "青山对弈", "半窗晴翠", "石栏斜阳",
  "竹露清响", "荷风晚照", "烟雨行舟", "梅雪争春", "枯木逢春",
  "泉流石上", "草木含情", "琴心剑胆", "书香门第", "笔墨春秋",
  "风回小院", "帘外芭蕉", "浮生若梦", "沧海一粟", "坐看云起",
  "行到水穷", "晚风吹雨"
];

function loadLibraryViewMode(): LibraryViewMode {
  if (typeof window === "undefined") return "cover";
  const value = window.localStorage.getItem(LIBRARY_VIEW_KEY);
  return value === "compact" || value === "list" ? value : "cover";
}

function getBookTimestamp(book: Book) {
  return new Date(
    book.lastReadAt || book.updatedAt || book.createdAt,
  ).getTime();
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
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) + "读过";
}

export function LibraryDefault() {
  const router = useVirtualRouter();
  const isOnline = useOnlineStatus();
  const [sortBy, setSortBy] = useState<"title" | "createdAt">("createdAt");
  const [viewMode, setViewModeState] =
    useState<LibraryViewMode>(loadLibraryViewMode);
  const [toastMsg, setToastMsg] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
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
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  // 藏书治理相关状态
  const [selectedGovBook, setSelectedGovBook] = useState<Book | null>(null);
  const [isGovOpen, setIsGovOpen] = useState(false);

  // 检索所有的逻辑文件夹
  const folders = useLiveQuery(() => db.libraryFolders.toArray()) || [];

  const currentFolders = folders
    .filter((f) => f.parentId === currentFolderId)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));

  const navigateToFolder = (folderId: string | undefined) => {
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      try {
        const transition = (document as unknown as {
          startViewTransition: (cb: () => void) => {
            ready?: Promise<void>;
            finished?: Promise<void>;
            catch?: (cb: () => void) => void;
          };
        }).startViewTransition(() => {
          setCurrentFolderId(folderId);
        });
        if (transition) {
          if (transition.ready) transition.ready.catch(() => {});
          if (transition.finished) transition.finished.catch(() => {});
          if (typeof transition.catch === "function") transition.catch(() => {});
        }
      } catch (e) {
        console.warn("[Library] 视图转场 ViewTransition 启动异常，自动降级为无动画状态同步:", e);
        setCurrentFolderId(folderId);
      }
    } else {
      setCurrentFolderId(folderId);
    }
  };

  // ==========================================
  // 🧭 智能记忆与精准漫反：原路折返参数解析
  // ==========================================
  useEffect(() => {
    if (typeof window !== "undefined") {
      let folderId: string | null = null;
      
      // A. 优先从 Hash 后面的 Query 参数中解析（适应 SPA 虚拟路由 Hash 模式）
      const hash = window.location.hash;
      const queryIndex = hash.indexOf("?");
      if (queryIndex !== -1) {
        const hashParams = new URLSearchParams(hash.slice(queryIndex));
        folderId = hashParams.get("folderId");
      }
      
      // B. 降级从 window.location.search 获取
      if (!folderId) {
        const params = new URLSearchParams(window.location.search);
        folderId = params.get("folderId");
      }

      if (folderId) {
        navigateToFolder(folderId);
      }
    }
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
          console.warn(`[Library] 幽灵书箧拦截：检测到不存在的文件夹 ID: ${currentFolderId}，自动软重置回书房主阁并清洗 URL。`);
          navigateToFolder(undefined);
          
          // 🏮 极高可用抗灾：静默抹去浏览器 URL Hash 中已被解散、删除的幽灵 folderId 字段，杜绝返回/刷新死锁
          if (typeof window !== "undefined") {
            const hash = window.location.hash;
            const queryIndex = hash.indexOf("?");
            if (queryIndex !== -1) {
              const baseHash = hash.slice(0, queryIndex);
              window.history.replaceState(window.history.state, "", baseHash);
            }
          }
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
  const handleIncrementalScan = async (folderId: string, folderName: string) => {
    setToastMsg(`🧭 正在对「${folderName}」进行指纹增量重扫...`);
    try {
      let currentId: string | undefined = folderId;
      let sourceId: string | null = null;
      
      const directSource = await db.librarySources.get(currentId);
      if (directSource) {
        sourceId = currentId;
      } else {
        while (currentId) {
          const folder: LibraryFolder | undefined = await db.libraryFolders.get(currentId);
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

      const rootHandle = (source as unknown as { directoryHandle?: FileSystemDirectoryHandle }).directoryHandle;
      if (!rootHandle) {
        setToastMsg("🔌 物理句柄已失效，请重新授权。");
        return;
      }

      const perm = await (rootHandle as unknown as { queryPermission(options?: { mode: "read" | "readwrite" }): Promise<PermissionState> }).queryPermission({ mode: "read" });
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

      const rootPreview = await FolderScanService.scanDirectoryToPreviewTree(currentHandle, undefined, subRelativePath);

      const newFiles: { relativePath: string; size: number; lastModified: number }[] = [];
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

      let oldIndexedFiles = await db.indexedNovelFiles.where("sourceId").equals(sourceId).toArray();
      if (subRelativePath) {
        oldIndexedFiles = oldIndexedFiles.filter(f => f.relativePath.startsWith(subRelativePath));
      }

      const oldFiles = oldIndexedFiles.map(f => ({
        relativePath: f.relativePath,
        size: f.size || 0,
        lastModified: f.lastModified || 0,
        bookId: f.bookId,
      }));

      const reconciliation = FolderScanService.reconcileScanResults(oldFiles, newFiles);

      await db.transaction("rw", [db.indexedNovelFiles, db.books, db.chapters], async () => {
        // (A) 处理移动/改名 (moved) - 100% 元数据及章节句柄自愈
        for (const item of reconciliation.moved) {
          if (item.bookId) {
            await db.indexedNovelFiles
              .where({ sourceId, relativePath: item.from })
              .modify({ relativePath: item.to, updatedAt: new Date().toISOString() });

            const book = await db.books.get(item.bookId);
            if (book) {
              if (book.sourceType === "folder_index" && book.contentLocator) {
                await db.books.update(item.bookId, {
                  "contentLocator.relativePath": item.to,
                  updatedAt: new Date().toISOString()
                });
              } else if (book.sourceType === "folder_multi_file_book" && book.multiFileBook) {
                const updatedChapterFiles = book.multiFileBook.chapterFiles.map(cf => {
                  if (cf.relativePath === item.from) {
                    return { ...cf, relativePath: item.to };
                  }
                  return cf;
                });
                await db.books.update(item.bookId, {
                  "multiFileBook.chapterFiles": updatedChapterFiles,
                  updatedAt: new Date().toISOString()
                });
              }
            }
          }
        }

        // (B) 内容更新 (changed) - 智能重新标记 TOC 为 not_parsed，清空旧缓存
        for (const relativePath of reconciliation.changed) {
          const idxFile = oldIndexedFiles.find(f => f.relativePath === relativePath);
          if (idxFile && idxFile.bookId) {
            await db.chapters.where("bookId").equals(idxFile.bookId).delete();
            await db.books.update(idxFile.bookId, {
              parseStatus: "not_parsed",
              cacheStatus: "metadata_only",
              sourceAvailability: "source_available",
              updatedAt: new Date().toISOString()
            });
            await db.indexedNovelFiles
              .where({ sourceId, relativePath })
              .modify({ status: "changed", updatedAt: new Date().toISOString() });
          }
        }

        // (C) 处理删除缺失 (deleted)
        for (const relativePath of reconciliation.deleted) {
          const idxFile = oldIndexedFiles.find(f => f.relativePath === relativePath);
          if (idxFile) {
            await db.indexedNovelFiles
              .where({ sourceId, relativePath })
              .modify({ status: "missing", updatedAt: new Date().toISOString() });

            if (idxFile.bookId) {
              await db.books.update(idxFile.bookId, {
                sourceAvailability: "source_missing",
                updatedAt: new Date().toISOString()
              });
            }
          }
        }
      });

      const totalMoved = reconciliation.moved.length;
      const totalChanged = reconciliation.changed.length;
      const totalDeleted = reconciliation.deleted.length;
      setToastMsg(`📖 重扫归档结束！自愈改名移动 ${totalMoved} 本，内容变动重编缓存 ${totalChanged} 本，缺失 ${totalDeleted} 本。`);
    } catch (err) {
      console.error("增量重新勘探失败:", err);
      setToastMsg("⚠️ 增量重扫由于磁盘或文件状态读取失败。");
    }
  };

  // 2. 批量将文件夹藏书一键上传云端
  const handleBackupFolder = async (folderId: string, folderName: string) => {
    setToastMsg(`📤 正在并发将「${folderName}」下的书籍同步至云端...`);
    try {
      const subBooks = await db.books.where("sourceFolderId").equals(folderId).toArray();
      const unbackedBooks = subBooks.filter(b => !cloudBooks.some(cb => cb.id === b.id));
      if (unbackedBooks.length === 0) {
        setToastMsg("⛩️ 此书箧内的所有藏书早已全量备份至云端。");
        return;
      }
      
      let successCount = 0;
      for (const book of unbackedBooks) {
        try {
          await handleSingleUpload(book);
          successCount++;
        } catch (e) {
          console.error(`备份藏书 [${book.title}] 失败:`, e);
        }
      }
      setToastMsg(`⛩️ 「${folderName}」一键备份完成，成功同步 ${successCount} 卷，全部归档。`);
    } catch (err) {
      console.error("一键同步失败:", err);
      setToastMsg("⚠️ 一键备份数据库同步队列处理失败。");
    }
  };

  // 3. 文件夹解除物理绑定
  const handleDisconnectFolder = async (folderId: string, folderName: string) => {
    setConfirmState({
      isOpen: true,
      title: "🔏 解除物理句柄硬绑定",
      message: `确认要解除「${folderName}」书箧与本地物理文件夹的关联绑定吗？解绑定后，它将完全转为“纯离线/缓存模式”，安全存储进度，切断对磁盘的 Native Handle 直连。`,
      isDanger: true,
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          await db.transaction("rw", [db.libraryFolders, db.books], async () => {
            await db.libraryFolders.update(folderId, {
              sourceId: undefined,
              sourceType: "virtual",
              updatedAt: new Date().toISOString()
            });
            const subBooks = await db.books.where("sourceFolderId").equals(folderId).toArray();
            for (const b of subBooks) {
              await db.books.update(b.id, {
                sourceFileId: undefined,
                sourceType: undefined,
                contentLocator: undefined,
                updatedAt: new Date().toISOString()
              });
            }
          });
          setToastMsg(`🔏 「${folderName}」已转换为虚拟书柜，物理句柄成功切断绑定。`);
        } catch (err) {
          console.error("解绑文件夹失败:", err);
          setToastMsg("💡 解绑定失败，存储数据库繁忙。");
        }
      }
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
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          await db.books.update(bookId, {
            sourceFileId: undefined,
            sourceType: undefined,
            contentLocator: undefined,
            updatedAt: new Date().toISOString()
          });
          setToastMsg(`🔏 《${title}》已转换为纯离线缓存藏书模式，安全切断直连。`);
        } catch (err) {
          console.error("解绑书籍失败:", err);
          setToastMsg("💡 书籍解除硬关联失败。");
        }
      }
    });
  };

  // 5. 单本藏书强制重新切章自愈
  const handleReconstructBook = async (bookId: string, title: string) => {
    setConfirmState({
      isOpen: true,
      title: "📥 重构自愈藏书",
      message: `您确认要清空《${title}》的旧有章节缓存并强制重新切章吗？这将重新解算原大文件或多章节目录，但原有的阅读进度、书签和手写笔记将绝对保留！`,
      isDanger: true,
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          await db.transaction("rw", [db.chapters, db.books], async () => {
            await db.chapters.where("bookId").equals(bookId).delete();
            await db.books.update(bookId, {
              parseStatus: "not_parsed",
              cacheStatus: "metadata_only",
              updatedAt: new Date().toISOString()
            });
          });
          setToastMsg(`📥 《${title}》已成功重置，下次打开时将重新切章自愈。`);
        } catch (err) {
          console.error("重构书籍失败:", err);
          setToastMsg("💡 书籍重构重设失败。");
        }
      }
    });
  };


  const handleDissolveFolder = async (folderId: string, name: string) => {
    setConfirmState({
      isOpen: true,
      title: "🍃 解散书箧",
      message: `您确认要解散「${name}」书箧吗？解散后，其内的所有藏书将自动归入书架主阁，书籍本身及阅读进度绝不受损。`,
      isDanger: false,
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          await db.transaction("rw", [db.books, db.libraryFolders], async () => {
            await db.books.where("sourceFolderId").equals(folderId).modify({ sourceFolderId: undefined });
            await db.libraryFolders.delete(folderId);
          });
          setToastMsg(`📖 书箧「${name}」已解散，藏书重归主阁。`);
        } catch (e) {
          console.error("解散文件夹失败:", e);
          setToastMsg("💡 解散书箧失败，存储数据库繁忙。");
        }
      }
    });
  };

  // 云端同步及状态判定核心字段
  const cachedBookIdsSet = useLiveQuery(async () => {
    const allKeys = await db.chapters.orderBy("bookId").uniqueKeys() as string[];
    return new Set(allKeys);
  }, []);

  const [cloudBooks, setCloudBooks] = useState<(Book & { lastReadProgress?: string })[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStepText, setSyncStepText] = useState("");
  const [syncingBookId, setSyncingBookId] = useState<string | null>(null);

  // 专家级细粒度隔离状态机：记录每本书独立的同步进度与文案
  const [bookSyncStates, setBookSyncStates] = useState<Record<string, { progress: number; stepText: string }>>({});

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
  const [autoSyncOnStartup, setAutoSyncOnStartupState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const val = window.localStorage.getItem("reader-sync-auto-startup");
    return val !== "false";
  });
  const [autoSyncProgressOnReading, setAutoSyncProgressOnReadingState] = useState<boolean>(() => {
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
    return window.localStorage.getItem("reader-share-token") || "";
  });

  useEffect(() => {
    setShareTokenInput(currentShareToken);
  }, [currentShareToken]);

  const handleGeneratePoeticKey = () => {
    const idx = Math.floor(Math.random() * POETIC_KEYS.length);
    const num = Math.floor(1000 + Math.random() * 9000);
    const key = `${POETIC_KEYS[idx]}-${num}`;
    setShareTokenInput(key);
  };

  const handleBindShareToken = async () => {
    const trimmed = shareTokenInput.trim();
    if (!trimmed) return;
    
    window.localStorage.setItem("reader-share-token", trimmed);
    setCurrentShareToken(trimmed);
    setCloudBooks([]);
    setToastMsg(strings.sync.shareBindSuccess);
    
    // 立即静默触发双向 DualSync
    setTimeout(() => {
      handleDualSync(true); // isSilent = true
    }, 200);
  };

  const handleClearShareToken = () => {
    window.localStorage.removeItem("reader-share-token");
    setCurrentShareToken("");
    setShareTokenInput("");
    setCloudBooks([]);
    setToastMsg(strings.sync.shareClearSuccess);
    
    setTimeout(() => {
      fetchCloudBooks();
    }, 200);
  };

  const handleClearCloudBooks = async () => {
    if (!currentShareToken || !isOnline) return;

    setConfirmState({
      isOpen: true,
      title: "🧼 物理清空云端备份",
      message: "确认要彻底物理擦除云端密阁下的所有藏书与进度备份吗？此操作极其决绝，且无法撤销。是否继续？",
      isDanger: true,
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(apiUrl("/books"), {
            method: "DELETE",
            headers: getShareHeaders(),
          });
          if (res.ok) {
            setToastMsg("🧼 拂尘一扫，云端密阁藏书已全物理清空！");
            setCloudBooks([]);
          } else {
            throw new Error();
          }
        } catch (err) {
          console.error("清空云端备份失败:", err);
          setToastMsg("💡 清空失败，云端同步通道繁忙，请稍后再试。");
        }
      },
    });
  };

  const handleCopyPoeticKey = () => {
    if (!currentShareToken) return;
    navigator.clipboard.writeText(currentShareToken)
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
    const online = typeof navigator !== "undefined" ? navigator.onLine : isOnline;
    if (!online) {
      setCloudBooks([]);
      setToastMsg("🌧️ 书阁已处于离线状态，暂无法同步云端藏书阁。");
      return;
    }
    try {
      const res = await fetch(apiUrl("/books"), {
        headers: getShareHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCloudBooks(data);
      }
    } catch (e) {
      console.error("拉取云端书籍元数据失败:", e);
    }
  }, [isOnline]);

  useEffect(() => {
    fetchCloudBooks();
  }, [fetchCloudBooks]);



  const handleCollectBookList = async (listTitle: string) => {
    const list = PRESET_BOOKLISTS[listTitle];
    if (!list) return;

    try {
      await db.transaction(
        "rw",
        [db.books, db.chapters],
        async () => {
          for (const item of list) {
            await db.books.put(item.book);
            for (const chap of item.chapters) {
              await db.chapters.put(chap);
            }
          }
        }
      );

      if (listTitle === "心灵幽谷与禅修静夜") {
        setToastMsg("🍃 书阁已纳「心灵幽谷与禅修静夜」！清静经、庄子等传世经典已备，静享墨香。");
      } else {
        setToastMsg("🚀 书阁已纳「科技灯火与人类群星」！黑客与画家等科技名篇已备，共探智慧。");
      }
      // 成功导入本地后，触发一次拉取云端对齐（避免缓存不同步）
      fetchCloudBooks();
    } catch (err) {
      console.error("一键收藏精选书单失败:", err);
      setToastMsg("💡 本地存储繁忙，请稍后再试。");
    }
  };

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
        message: "多端共享与云端同步需先在「同步设置」➔「墨问密阁」中生成或绑定属于您的专属「展卷秘钥」。是否立即前去展卷配置？",
        isDanger: false,
        onConfirm: () => {
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
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

    // 核心同步管道执行函数
    const executeSyncPipeline = async () => {
      if (syncMutexRef.current) return;
      syncMutexRef.current = true;

      // 仅在非静默（手动点击）时激活大加载面板与进度
      if (!isSilent) {
        setIsSyncing(true);
        setSyncProgress(0);
        setSyncStepText("正在检测两端书阁差异...");
      }

      let hasSyncFailures = false;

      try {
        const res = await fetch(apiUrl("/books"), {
          headers: getShareHeaders(),
        });
        if (!res.ok) throw new Error("获取云阁典籍列表失败");
        const currentCloudBooks = (await res.json()) as (Book & { lastReadProgress?: string })[];
        setCloudBooks(currentCloudBooks);

        // 🏮 1. 先拉取云端文件夹，准备比对与合并逻辑
        let cloudFolders: LibraryFolder[] = [];
        try {
          const foldersRes = await fetch(apiUrl("/folders"), {
            headers: getShareHeaders(),
          });
          if (foldersRes.ok) {
            cloudFolders = await foldersRes.json();
          } else {
            console.error("获取云端书箧列表失败，接口可能不可用");
          }
        } catch (foldersErr) {
          console.error("获取云端书箧遭遇网络问题:", foldersErr);
        }

        const localFolders = await db.libraryFolders.toArray();

        // 计算逻辑书箧（文件夹）变动差异
        const localOnlyFolders = localFolders.filter(
          (lf) => !cloudFolders.some((cf) => cf.id === lf.id)
        );
        const cloudOnlyFolders = cloudFolders.filter(
          (cf) => !localFolders.some((lf) => lf.id === cf.id)
        );
        const bothFolders = localFolders.filter(
          (lf) => cloudFolders.some((cf) => cf.id === lf.id)
        );

        let foldersDiff = localOnlyFolders.length > 0 || cloudOnlyFolders.length > 0;
        if (!foldersDiff) {
          for (const lf of bothFolders) {
            const cf = cloudFolders.find((c) => c.id === lf.id);
            if (cf && cf.updatedAt !== lf.updatedAt) {
              foldersDiff = true;
              break;
            }
          }
        }

        const localBooks = await db.books.toArray();
        const localOnly = localBooks.filter(
          (lb) => !currentCloudBooks.some((cb) => cb.id === lb.id)
        );
        const cloudOnly = currentCloudBooks.filter(
          (cb) => !localBooks.some((lb) => lb.id === cb.id)
        );
        const both = localBooks.filter(
          (lb) => currentCloudBooks.some((cb) => cb.id === lb.id)
        );

        // 专家级快速无损拦截：若两端数量完全对齐且没有最后阅读时间戳变动，则 50ms 内极静秒退，不触发任何重绘和动画
        let hasDiff = localOnly.length > 0 || cloudOnly.length > 0 || foldersDiff;
        if (!hasDiff) {
          for (const localBook of both) {
            const cloudBook = currentCloudBooks.find((cb) => cb.id === localBook.id);
            if (cloudBook) {
              const cloudTime = cloudBook.lastReadAt ? new Date(cloudBook.lastReadAt).getTime() : 0;
              const localTime = localBook.lastReadAt ? new Date(localBook.lastReadAt).getTime() : 0;
              if (cloudTime !== localTime) {
                hasDiff = true;
                break;
              }
            }
          }
        }

        if (!hasDiff) {
          console.log("[Sync Check] 两端书阁与书箧分类完美一致，50ms 内极静退出同步。");
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
              const localTime = lf.updatedAt ? new Date(lf.updatedAt).getTime() : 0;
              const cloudTime = cf.updatedAt ? new Date(cf.updatedAt).getTime() : 0;
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
              const uploadRes = await fetch(apiUrl("/folders"), {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...getShareHeaders(),
                },
                body: JSON.stringify({ folders: foldersToUpload }),
              });
              if (!uploadRes.ok) throw new Error("同步本地书箧分类至云端失败");
            } catch (uploadErr) {
              console.error("[Sync] 上报书箧失败，安全防丢断路隔离:", uploadErr);
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
              console.error("[Sync] 本地覆写书箧失败，安全防丢断路隔离:", dbErr);
              hasSyncFailures = true;
            }
          }
          console.log(`[Folder Sync] 同步完成。上传了 ${foldersToUpload.length} 个书箧，更新本地 ${foldersToSaveLocally.length} 个书箧。`);
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
            const chapters = await db.chapters.where("bookId").equals(book.id).toArray();
            
            // 若本地章节缓存为空且为本地文件系统类型书籍，触发强制解析，确保云端存有完整章节
            if (chapters.length === 0 && (book.sourceType === "folder_index" || book.sourceType === "folder_multi_file_book")) {
              try {
                setSyncStepText(`正在解析「${book.title}」...`);
                await cacheEntireBook(book.id);
                const parsedChapters = await db.chapters.where("bookId").equals(book.id).toArray();
                chapters.push(...parsedChapters);
                console.log(`[Sync] 上传前预解析完成:「${book.title}」共 ${parsedChapters.length} 章。`);
              } catch (parseErr) {
                console.warn(`[Sync] 上传前预解析「${book.title}」失败，将以无章节状态上传:`, parseErr);
              }
            }
            const progress = await db.progress.get(book.id);
            const lastReadProgress = progress ? JSON.stringify(progress) : undefined;
            
            // 绑定最新进度 JSON
            const bookWithProgress = { ...book, lastReadProgress };

            // 记入活跃持久化上传任务，防刷新和崩溃
            const activeTasks = JSON.parse(localStorage.getItem("reader-active-sync-tasks") || "{}");
            activeTasks[book.id] = "upload";
            localStorage.setItem("reader-active-sync-tasks", JSON.stringify(activeTasks));

            for (let p = 0; p <= 100; p += 25) {
              updateProgress(completedSteps, p);
              await new Promise((r) => setTimeout(r, 15));
            }

            const importRes = await fetch(apiUrl("/books/import"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...getShareHeaders(),
              },
              body: JSON.stringify({ metadata: bookWithProgress, chapters }),
            });
            if (!importRes.ok) throw new Error(`云阁拒绝了典籍「${book.title}」的归档请求`);

            // 任务完结，清除落盘记录
            const nextTasks = JSON.parse(localStorage.getItem("reader-active-sync-tasks") || "{}");
            delete nextTasks[book.id];
            localStorage.setItem("reader-active-sync-tasks", JSON.stringify(nextTasks));
          } catch (singleBookErr) {
            console.error(`[Sync] 备份本地典籍「${book.title}」遭遇错误，已断路保护:`, singleBookErr);
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
            const activeTasks = JSON.parse(localStorage.getItem("reader-active-sync-tasks") || "{}");
            activeTasks[book.id] = "download";
            localStorage.setItem("reader-active-sync-tasks", JSON.stringify(activeTasks));

            for (let p = 0; p <= 100; p += 25) {
              updateProgress(completedSteps, p);
              await new Promise((r) => setTimeout(r, 15));
            }

            await db.transaction("rw", [db.books, db.progress], async () => {
              // 安全防丢历史备份
              const oldProgress = await db.progress.get(book.id);
              if (oldProgress) {
                const key = `reader-progress-rollback-${book.id}`;
                let list: { chapterIndex: number; paragraphIndex?: number; [key: string]: unknown }[] = [];
                try { list = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
                if (!list.some(p => p.chapterIndex === oldProgress.chapterIndex && p.paragraphIndex === oldProgress.paragraphIndex)) {
                  list.push({ ...oldProgress, rollbackAt: new Date().toISOString() });
                  localStorage.setItem(key, JSON.stringify(list.slice(-5)));
                }
              }

              await db.books.put(book);
              if (book.lastReadProgress) {
                try {
                  const parsedProgress = JSON.parse(book.lastReadProgress);
                  await db.progress.put(parsedProgress);
                } catch (e) {
                  console.error("解析进度快照失败:", e);
                }
              }
            });


            // 同步拉取云阁章节内容，避免同步后「查看」出现 404 白屏
            try {
              setSyncStepText(`正在下载「${book.title}」章节内容...`);
              const chaptersRes = await fetch(apiUrl(`/books/${book.id}/chapters`), {
                headers: getShareHeaders(),
              });
              if (chaptersRes.ok) {
                const remoteChapters = await chaptersRes.json();
                if (remoteChapters.length > 0) {
                  await db.transaction("rw", [db.chapters], async () => {
                    for (const chap of remoteChapters) {
                      const transformed = {
                        id: chap.id ? chap.id.split("#")[0] : `${book.id}-${chap.index !== undefined ? chap.index : chap.chapterIndex}`,
                        bookId: book.id,
                        index: chap.index !== undefined ? chap.index : (chap.chapterIndex !== undefined ? chap.chapterIndex : 0),
                        title: chap.title || chap.name || `第 ${(chap.index !== undefined ? chap.index : (chap.chapterIndex !== undefined ? chap.chapterIndex : 0)) + 1} 章`,
                        content: chap.content || chap.body || chap.text || "",
                      };
                      await db.chapters.put(transformed);
                    }
                  });
                  console.log(`[Sync] 已拉取「${book.title}」的 ${remoteChapters.length} 个章节。`);
                } else {
                  console.warn(`[Sync] 云阁中「${book.title}」暂无章节内容，该书可能仅同步了元数据。`);
                // 重置 parseStatus，让阅读器打开时尝试从本地文件系统重新解析
                if (book.sourceType === "folder_index" || book.sourceType === "folder_multi_file_book") {
                  await db.books.update(book.id, { parseStatus: "not_parsed" });
                }
                }
              } else {
                console.warn(`[Sync] 无法从云阁拉取「${book.title}」的章节内容: HTTP ${chaptersRes.status}`);
              }
            } catch (chaptersErr) {
              console.warn(`[Sync] 拉取「${book.title}」章节时网络异常:`, chaptersErr);
              if (book.sourceType === "folder_index" || book.sourceType === "folder_multi_file_book") {
                try { await db.books.update(book.id, { parseStatus: "not_parsed" }); } catch {}
              }
              // 不阻断：章节缺失不触发整书同步失败
            }
            // 任务完结，清除落盘记录
            const nextTasks = JSON.parse(localStorage.getItem("reader-active-sync-tasks") || "{}");
            delete nextTasks[book.id];
            localStorage.setItem("reader-active-sync-tasks", JSON.stringify(nextTasks));
          } catch (singleBookErr) {
            console.error(`[Sync] 拉取云阁新书「${book.title}」遭遇错误，已断路保护:`, singleBookErr);
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
              const cloudBook = currentCloudBooks.find((cb) => cb.id === localBook.id);
              if (cloudBook) {
                const localProgress = await db.progress.get(localBook.id);
                let cloudProgress: ReadingProgress | null = null;
                if (cloudBook.lastReadProgress) {
                  try { cloudProgress = JSON.parse(cloudBook.lastReadProgress); } catch {}
                }

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
                        const cloudTime = cloudBook.lastReadAt ? new Date(cloudBook.lastReadAt).getTime() : 0;
                        const localTime = localBook.lastReadAt ? new Date(localBook.lastReadAt).getTime() : 0;
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
                  const cloudTime = cloudBook.lastReadAt ? new Date(cloudBook.lastReadAt).getTime() : 0;
                  const localTime = localBook.lastReadAt ? new Date(localBook.lastReadAt).getTime() : 0;
                  winner = cloudTime > localTime ? "cloud" : "local";
                }

                // 执行胜出端合并事务
                if (winner === "cloud") {
                  // 云端读得更深：拉下并覆写本地元数据与进度
                  await db.transaction("rw", [db.books, db.progress], async () => {
                    // 备份本地进度防丢
                    const oldProgress = await db.progress.get(localBook.id);
                    if (oldProgress) {
                      const key = `reader-progress-rollback-${localBook.id}`;
                      let list: { chapterIndex: number; paragraphIndex?: number; [key: string]: unknown }[] = [];
                      try { list = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
                      if (!list.some(p => p.chapterIndex === oldProgress.chapterIndex && p.paragraphIndex === oldProgress.paragraphIndex)) {
                        list.push({ ...oldProgress, rollbackAt: new Date().toISOString() });
                        localStorage.setItem(key, JSON.stringify(list.slice(-5)));
                      }
                    }

                    await db.books.update(localBook.id, {
                      lastReadAt: cloudBook.lastReadAt,
                      sourceFolderId: cloudBook.sourceFolderId,
                    });
                    if (cloudBook.lastReadProgress) {
                      try {
                        const parsedProgress = JSON.parse(cloudBook.lastReadProgress);
                        await db.progress.put(parsedProgress);
                      } catch (e) {
                        console.error("更新本地对准进度失败:", e);
                      }
                    }
                  });
                } else if (winner === "local") {
                  // 本地读得更深：仅提交最轻量的进度数据覆盖云端，彻底免去重章节大文本传输
                  const progress = await db.progress.get(localBook.id);
                  const lastReadProgress = progress ? JSON.stringify(progress) : undefined;
                  const lastReadAt = localBook.lastReadAt || new Date().toISOString();

                  if (lastReadProgress) {
                    const progressRes = await fetch(apiUrl(`/books/${localBook.id}/progress`), {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...getShareHeaders(),
                      },
                      body: JSON.stringify({
                        lastReadProgress,
                        lastReadAt,
                        sourceFolderId: localBook.sourceFolderId || null,
                      }),
                    });
                    if (!progressRes.ok) throw new Error(`云阁拒绝了最深本地读痕的轻量进度上报`);
                  }
                }
              }
            } catch (singleBookErr) {
              console.error(`[Sync] 合并重叠图书「${localBook.title}」进度遭遇错误，已断路保护:`, singleBookErr);
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
            setToastMsg("💡 部分书籍由于网络卡顿已安全隔离防断链，其余典籍已安全对齐！");
          } else {
            setSyncStepText(strings.sync.syncSuccess);
            setToastMsg(strings.sync.syncSuccess);
          }
        }

        const finalRes = await fetch(apiUrl("/books"), {
          headers: getShareHeaders(),
        });
        if (finalRes.ok) {
          const finalData = await finalRes.json();
          setCloudBooks(finalData);
        }
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
        await navigator.locks.request("read_realm_global_sync_lock", { ifAvailable: true }, async (lock) => {
          if (!lock) {
            console.log("[Sync Lock] 跨标签页竞态抑制：另一书房标签页正在执行同步事务，本次极静退出。");
            return;
          }
          await executeSyncPipeline();
        });
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
        console.log("[Sync Lock] LocalStorage 锁冲突判定：另一标签页同步尚未结束，本次静默退出。");
        return;
      }

      localStorage.setItem(lockKey, JSON.stringify({ timestamp: now }));

      const lockKeepAlive = setInterval(() => {
        localStorage.setItem(lockKey, JSON.stringify({ timestamp: Date.now() }));
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
  const handleSingleUpload = async (book: Book) => {
    if (syncMutexRef.current) {
      setToastMsg("⏳ 上一项同步操作尚未完成，请稍后再试。");
      return;
    }
    if (isSyncing || syncingBookId) {
      setToastMsg("⏳ 全量同步正在进行中，请等待完成后再拉取单本书籍。");
      return;
    }
    if (!isOnline) {
      setToastMsg("🔌 当前处于离线状态，请连接网络后再行落墨拉取。");
      return;
    }
    syncMutexRef.current = true;
    setSyncingBookId(book.id);
    setIsSyncing(true);
    setBookSyncStates((prev) => ({
      ...prev,
      [book.id]: { progress: 0, stepText: "正在打包本地卷阁..." },
    }));

    try {
      // 记入活跃持久化上传任务，防刷新和崩溃
      const activeTasks = JSON.parse(localStorage.getItem("reader-active-sync-tasks") || "{}");
      activeTasks[book.id] = "upload";
      localStorage.setItem("reader-active-sync-tasks", JSON.stringify(activeTasks));

      const chapters = await db.chapters.where("bookId").equals(book.id).toArray();
            
            // 若本地章节缓存为空且为本地文件系统类型书籍，触发强制解析，确保云端存有完整章节
            if (chapters.length === 0 && (book.sourceType === "folder_index" || book.sourceType === "folder_multi_file_book")) {
              try {
                setSyncStepText(`正在解析「${book.title}」...`);
                await cacheEntireBook(book.id);
                const parsedChapters = await db.chapters.where("bookId").equals(book.id).toArray();
                chapters.push(...parsedChapters);
                console.log(`[Sync] 上传前预解析完成:「${book.title}」共 ${parsedChapters.length} 章。`);
              } catch (parseErr) {
                console.warn(`[Sync] 上传前预解析「${book.title}」失败，将以无章节状态上传:`, parseErr);
              }
            }
      const progress = await db.progress.get(book.id);
      const lastReadProgress = progress ? JSON.stringify(progress) : undefined;
      const bookWithProgress = { ...book, lastReadProgress };

      for (let p = 0; p <= 100; p += 20) {
        setBookSyncStates((prev) => ({
          ...prev,
          [book.id]: { progress: p, stepText: `备份中... ${p}%` },
        }));
        await new Promise((r) => setTimeout(r, 30));
      }

      const res = await fetch(apiUrl("/books/import"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getShareHeaders(),
        },
        body: JSON.stringify({ metadata: bookWithProgress, chapters }),
      });

      if (res.ok) {
        setToastMsg(`🍃 「${book.title}」云端备份成功！`);
        await fetchCloudBooks();
      } else {
        throw new Error();
      }
    } catch {
      setToastMsg("💡 备份失败，请检查网络或后端服务。");
    } finally {
      // 任务完结，清除落盘记录
      const nextTasks = JSON.parse(localStorage.getItem("reader-active-sync-tasks") || "{}");
      delete nextTasks[book.id];
      localStorage.setItem("reader-active-sync-tasks", JSON.stringify(nextTasks));

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

  // 单书快捷拉取 (物理还原进度快照)
  const handleSingleDownload = async (book: Book & { lastReadProgress?: string }) => {
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
    syncMutexRef.current = true;
    setSyncingBookId(book.id);
    setIsSyncing(true);
    setBookSyncStates((prev) => ({
      ...prev,
      [book.id]: { progress: 0, stepText: "正在连接云阁拉取..." },
    }));

    try {
      // 记入活跃持久化下载任务
      const activeTasks = JSON.parse(localStorage.getItem("reader-active-sync-tasks") || "{}");
      activeTasks[book.id] = "download";
      localStorage.setItem("reader-active-sync-tasks", JSON.stringify(activeTasks));

      for (let p = 0; p <= 40; p += 20) {
        setBookSyncStates((prev) => ({
          ...prev,
          [book.id]: { progress: p, stepText: `拉取中... ${p}%` },
        }));
        await new Promise((r) => setTimeout(r, 40));
      }

      const res = await fetch(apiUrl(`/books/${book.id}/chapters`), {
        headers: getShareHeaders(),
      });
      if (res.ok) {
        const chapters = await res.json();

        if (chapters.length === 0) {
          console.warn(`[Download] 云阁中「${book.title}」暂无章节内容，该书章节可能未完成初次上传。`);
          if (book.sourceType === "folder_index" || book.sourceType === "folder_multi_file_book") {
            setToastMsg("📂 此书的章节内容源自本地文件系统，需在原设备上打开一次阅读器完成解析后重新同步，方可在其他设备拉取。");
          } else {
            setToastMsg("💡 云阁中暂无此书的章节内容，请确认原设备已完成章节同步上传。");
          }
          // 不落库空章节，但仍存储元数据供书架展示
          await db.books.put(book);
          // 重置 parseStatus，让阅读器打开时尝试从本地文件系统重新解析
          if (book.sourceType === "folder_index" || book.sourceType === "folder_multi_file_book") {
            await db.books.update(book.id, { parseStatus: "not_parsed" });
          }          await fetchCloudBooks();
          return;
        }
        for (let p = 40; p <= 100; p += 20) {
          setBookSyncStates((prev) => ({
            ...prev,
            [book.id]: { progress: p, stepText: `落库中... ${p}%` },
          }));
          await new Promise((r) => setTimeout(r, 30));
        }

        await db.transaction("rw", [db.books, db.chapters, db.progress], async () => {
          // 在覆盖本地进度前，做 L2 备份
          const oldProgress = await db.progress.get(book.id);
          if (oldProgress) {
            const key = `reader-progress-rollback-${book.id}`;
            let list: { chapterIndex: number; paragraphIndex?: number; [key: string]: unknown }[] = [];
            try { list = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
            if (!list.some(p => p.chapterIndex === oldProgress.chapterIndex && p.paragraphIndex === oldProgress.paragraphIndex)) {
              list.push({ ...oldProgress, rollbackAt: new Date().toISOString() });
              localStorage.setItem(key, JSON.stringify(list.slice(-5)));
            }
          }

          await db.books.put(book);
            // 🏮 核心适配转换层：对准后端异构字段，抵抗变更，保障未来接口防腐性
          for (const chap of chapters) {
            const transformed = {
              id: chap.id ? chap.id.split("#")[0] : `${book.id}-${chap.index !== undefined ? chap.index : chap.chapterIndex}`,
              bookId: book.id,
              index: chap.index !== undefined ? chap.index : (chap.chapterIndex !== undefined ? chap.chapterIndex : 0),
              title: chap.title || chap.name || `第 ${(chap.index !== undefined ? chap.index : (chap.chapterIndex !== undefined ? chap.chapterIndex : 0)) + 1} 章`,
              content: chap.content || chap.body || chap.text || "",
            };
            await db.chapters.put(transformed);
          }
          if (book.lastReadProgress) {
            try {
              const parsedProgress = JSON.parse(book.lastReadProgress);
              await db.progress.put(parsedProgress);
            } catch (e) {
              console.error("解析进度快照失败:", e);
            }
          }
        });

        setToastMsg(`🍃 「${book.title}」已成功拉取至本地书阁！`);
        await fetchCloudBooks();
      } else {
        throw new Error();
      }
    } catch {
      if (!navigator.onLine) {
        setToastMsg("🔌 当前处于离线状态，请连接网络后再行落墨拉取。");
      } else {
        setToastMsg("💡 拉取失败，该书籍可能在云端已被清除。");
      }
    } finally {
      // 任务完结，清除落盘记录
      const nextTasks = JSON.parse(localStorage.getItem("reader-active-sync-tasks") || "{}");
      delete nextTasks[book.id];
      localStorage.setItem("reader-active-sync-tasks", JSON.stringify(nextTasks));

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
    if (isSyncing || syncingBookId) return;

    // 1. 物理安全行级校验 Integrity Grid
    const cloudBook = cloudBooks.find((cb) => cb.id === book.id);
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
        try {
          await db.transaction("rw", [db.chapters], async () => {
            await db.chapters.where("bookId").equals(book.id).delete();
          });
          setToastMsg(strings.sync.offloadSuccess.replace("{title}", book.title));
          await fetchCloudBooks(); // 重新拉取对齐，由于本地 chapters 为空而云端有，书卡在 mergedBooks 会自动转为 Cloud Only 磨砂状态
        } catch (err) {
          console.error("释放本地空间失败:", err);
          setToastMsg("💡 物理释放空间失败，存储数据库繁忙。");
        }
      }
    });
  };

  const books = useLiveQuery(async () => {
    const allBooks = await db.books.toArray();
    return allBooks.sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return getBookTimestamp(b) - getBookTimestamp(a);
    });
  }, [sortBy]);

  // 冷启动自愈：1. 静默自动同步大盘 2. 持久化未完结单书同步任务自愈
  const hasAutoSyncedRef = useRef(false);

  useEffect(() => {
    if (!isOnline) return;

    const runAutoStartupSyncAndRecovery = async () => {
      // 避免重复运行
      if (hasAutoSyncedRef.current) return;
      hasAutoSyncedRef.current = true;

      // 1. 冷启动自动双向对撞同步 (使用 sessionStorage 构筑会话级隔离锁，防刷限流)
      const hasSyncedInSession = sessionStorage.getItem("reader-session-auto-synced");
      if (autoSyncOnStartup && !isSyncing && !syncMutexRef.current && hasSyncedInSession !== "true") {
        console.log("[Sync Self-healing] 触发冷启动静默自动同步...");
        sessionStorage.setItem("reader-session-auto-synced", "true");
        void handleDualSync(true); // 异步极静运行，无需阻塞，handleDualSync 内已有 syncMutexRef 保护
      }

      // 2. 持久化任务重连校验与自愈
      try {
        const activeTasksVal = localStorage.getItem("reader-active-sync-tasks");
        if (activeTasksVal) {
          const activeTasks = JSON.parse(activeTasksVal) as Record<string, "upload" | "download">;
          const localBooks = await db.books.toArray();
          
          for (const [bookId, action] of Object.entries(activeTasks)) {
            // 如果已经在同步该书，安全跳过
            if (syncingBookId === bookId) continue;

            const book = localBooks.find(b => b.id === bookId);
            if (book) {
              console.log(`[Sync Self-healing] 检测到未完结持久任务「${book.title}」(${action})，启动断点自愈重连...`);
              if (action === "upload") {
                void handleSingleUpload(book);
              } else if (action === "download") {
                void handleSingleDownload(book);
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
  }, [isOnline, books, autoSyncOnStartup]);

  // 所有融合后的书籍（本地 + 仅云端存在）
  const mergedBooks = (() => {
    const local = books || [];
    const cloudOnly = cloudBooks.filter(
      (cb) => !local.some((lb) => lb.id === cb.id)
    );
    return [...local, ...cloudOnly].sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return getBookTimestamp(b) - getBookTimestamp(a);
    });
  })();

  // 进行逻辑文件夹层级过滤后的书籍，安全归栈、防丢自愈
  const filteredMergedBooks = mergedBooks.filter((book) => {
    if (currentFolderId === undefined) {
      return !book.sourceFolderId || !folders.some((f) => f.id === book.sourceFolderId);
    }
    return book.sourceFolderId === currentFolderId;
  });

  const getBookAvailabilityStatus = (book: Book, cachedSet: Set<string> | undefined) => {
    if (book.cacheStatus === 'chapters_full' || book.sourceAvailability === 'full_cached') {
      return { label: "⛩️ 雅阅离线", style: "bg-[#2C3539] text-[#E5E9EC] border-[#1C2327]" };
    }
    if (book.sourceType === "folder_index" || book.sourceType === "folder_multi_file_book") {
      if (book.sourceAvailability === 'permission_required') {
        return { label: "🔌 唤醒授权", style: "bg-[#FFF0F0] text-[#A64B4B] border-[#FCE1E1]" };
      }
      if (book.sourceAvailability === 'source_missing') {
        return { label: "❓ 书卷失落", style: "bg-[#F3F4F6] text-[#6E7275] border-[#E5E7EB]" };
      }
      return { label: "🟢 藏书手卷", style: "bg-[#F1F6F0] text-[#5F7D52] border-[#DCE8DB]" };
    }
    if (cachedSet?.has(book.id)) {
      return { label: "🌾 松墨离线", style: "bg-[#F1F6F0] text-[#4C664B] border-[#DCE8DB]" };
    }
    return { label: "☁️ 密阁天青", style: "bg-[#EBF3F6] text-[#4E7A94] border-[#D1E4EC]" };
  };

  const progressByBookId = useLiveQuery(async () => {
    const allProgress = await db.progress.toArray();
    return Object.fromEntries(
      allProgress.map((progress) => [progress.bookId, progress]),
    );
  }, []);

  const setViewMode = (mode: LibraryViewMode) => {
    setViewModeState(mode);
    window.localStorage.setItem(LIBRARY_VIEW_KEY, mode);
  };

  const handleDelete = (bookId: string, title: string) => {
    setConfirmState({
      isOpen: true,
      title: "物理删除典籍",
      message: strings.shelf.deleteConfirm.replace("{title}", title),
      isDanger: true,
      onConfirm: async () => {
        try {
          await db.transaction(
            "rw",
            [db.books, db.chapters, db.progress, db.bookmarks],
            async () => {
              await db.chapters.where("bookId").equals(bookId).delete();
              await db.progress.where("bookId").equals(bookId).delete();
              await db.bookmarks.where("bookId").equals(bookId).delete();
              await db.books.delete(bookId);
            },
          );

          try {
            await fetch(apiUrl(`/books/${bookId}`), {
              method: "DELETE",
              headers: getShareHeaders(),
            });
          } catch (e) {
            console.error("Backend delete failed", e);
          }
          // 删除后拉取刷新云端对齐
          fetchCloudBooks();
        } catch (e) {
          console.error(`Delete error: ${(e as Error).message}`);
        }
      }
    });
  };

  const bookCount = books?.length || 0;
  const totalNotesCount = useLiveQuery(() => db.bookmarks.count(), []);
  const continueBook = books?.[0];
  const continueProgress = continueBook
    ? progressByBookId?.[continueBook.id]
    : undefined;
  const continuePercent = continueBook
    ? getProgressPercent(continueBook, continueProgress)
    : 0;
  const extractedColors = continueBook
    ? extractColorsFromTitle(continueBook.title)
    : null;

  useEffect(() => {
    router.prefetch("/search");
    router.prefetch("/import");
    router.prefetch("/settings");
    books?.slice(0, 8).forEach((book) => router.prefetch(`/reader/${book.id}`));
  }, [books, router]);

  useEffect(() => {
    const autoInitializePreset = async () => {
      if (books !== undefined && books.length === 0) {
        const hasInitialized = window.localStorage.getItem("library-auto-initialized");
        if (!hasInitialized) {
          try {
            const list = PRESET_BOOKLISTS["心灵幽谷与禅修静夜"];
            if (list) {
              await db.transaction(
                "rw",
                [db.books, db.chapters],
                async () => {
                  for (const item of list) {
                    await db.books.put(item.book);
                    for (const chap of item.chapters) {
                      await db.chapters.put(chap);
                    }
                  }
                }
              );
              window.localStorage.setItem("library-auto-initialized", "true");
              setToastMsg("🍃 已为您在书阁首案静心置备「心灵幽谷与禅修静夜」精选传世经典。");
            }
          } catch (e) {
            console.error("Auto initialization failed", e);
          }
        }
      }
    };
    autoInitializePreset();
  }, [books]);

  return (
    <AppShell
      title="「 墨问 」"
      subtitle="沉浸阅读，智能相伴"
      rightNodes={
        <>
          <button
            onClick={() => router.push("/search")}
            className="ui-focus-ring hidden rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white sm:inline-flex"
          >
            搜索
          </button>
          <button
            onClick={() => router.push("/import")}
            className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#527047]"
          >
            导入
          </button>
        </>
      }
    >
      <section className="relative overflow-hidden rounded-[24px] border border-[#E3D5BE] bg-[linear-gradient(135deg,#FFFDFB_0%,#FAF5EB_50%,#F1E7D7_100%)] py-10 px-8 md:py-16 md:px-14 shadow-[0_20px_50px_rgba(80,65,45,0.06)] transition-all duration-300">
        {/* 宣纸淡墨/天青水墨自然晕开慢呼吸效果 */}
        <div className="absolute -right-10 -top-10 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(95,125,82,0.08)_0%,transparent_70%)] ink-breathe-layer reader-gpu-accelerated pointer-events-none select-none" />
        <div className="absolute right-12 -bottom-20 w-80 h-80 rounded-full bg-[radial-gradient(circle,rgba(154,106,58,0.06)_0%,transparent_70%)] ink-breathe-layer reader-gpu-accelerated pointer-events-none select-none" />
        {/* 拟物洒金微茫点缀 */}
        <div className="absolute inset-0 bg-[radial-gradient(#F3D39E_1px,transparent_1px)] bg-[size:24px_24px] opacity-10 pointer-events-none" />
        
        <div className="absolute inset-y-0 right-0 hidden w-1/2 opacity-90 md:block pointer-events-none">
          {/* 中式枯山水写意弧线 */}
          <div className="absolute bottom-0 right-0 h-48 w-80 rounded-tl-[160px] bg-[linear-gradient(135deg,rgba(95,125,82,0.08),rgba(154,106,58,0.08))] ink-breathe-layer reader-gpu-accelerated" />
          <div className="absolute bottom-12 right-24 h-16 w-60 rounded-full bg-[rgba(95,125,82,0.03)] blur-2xl" />
          <div className="absolute bottom-20 right-28 h-32 w-48 rounded-t-full border-t-2 border-double border-[rgba(95,125,82,0.18)]" />
        </div>
        <div className="relative z-10 max-w-xl">
          <h2 className="font-reading-title text-3xl font-semibold leading-tight text-[var(--ui-text)] md:text-4xl">
            大道无形，清天可期
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--ui-muted)]">
            管理本地书籍、继续上次阅读，也可以把新的 TXT / EPUB
            放进这间安静书房。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() =>
                continueBook && router.push(`/reader/${continueBook.id}`)
              }
              disabled={!continueBook}
              className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#527047] disabled:cursor-not-allowed disabled:bg-[rgba(80,65,45,0.18)]"
            >
              继续阅读
            </button>
            <button
              onClick={() => router.push("/search")}
              className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-5 py-2.5 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
            >
              去发现
            </button>
          </div>
        </div>
      </section>

      {continueBook && (
        <section className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 左侧占 2/3：最近阅读卡 */}
            <div className="md:col-span-2">
              <div
                onClick={() => router.push(`/reader/${continueBook.id}`)}
                className="group cursor-pointer rounded-[18px] border p-5 shadow-[0_12px_36px_rgba(80,65,45,0.05)] backdrop-blur-md relative overflow-hidden transition-all duration-500 ease-in-out hover:shadow-[0_18px_48px_rgba(80,65,45,0.09)] hover:-translate-y-0.5 bg-gradient-to-br from-[#FAF6EE] to-[#F3EBD3] dark:from-[#25231F] dark:to-[#1A1916] h-full"
                style={{
                  borderColor: extractedColors?.borderColor || "rgba(227, 213, 190, 0.4)",
                }}
              >
                {/* 🏮 极奢双层渐变宣纸淡入层 (Dual-Layer Gradient Fade-In)，物理规避重排闪烁，实现水墨慢呼吸 */}
                <div
                  className="absolute inset-0 z-0 transition-opacity duration-700 ease-in-out pointer-events-none"
                  style={{
                    background: extractedColors
                      ? `linear-gradient(135deg, ${extractedColors.color1} 0%, ${extractedColors.color2} 100%)`
                      : "transparent",
                    opacity: extractedColors ? 1 : 0,
                  }}
                />

                {/* 拟物装饰高光线 */}
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent z-10" />
                
                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div>
                    <h2
                      className="text-xs font-bold font-reading-title tracking-wide uppercase flex items-center gap-1.5"
                      style={{ color: extractedColors?.accentColor || "var(--ui-accent)" }}
                    >
                      <span>🍃</span> 最近阅读 · Current Flow
                    </h2>
                    <p
                      className="mt-1 text-xs font-medium opacity-80"
                      style={{ color: extractedColors?.textColor || "var(--ui-text)" }}
                    >
                      回到上次停下的地方，继续心流之旅
                    </p>
                  </div>
                  <div 
                    className="text-xs font-bold flex items-center gap-1 transition-transform duration-300 group-hover:translate-x-1"
                    style={{ color: extractedColors?.accentColor || "var(--ui-accent)" }}
                  >
                    <span>继续阅读</span>
                    <span>→</span>
                  </div>
                </div>
                <div className="mt-5 flex gap-5 items-center relative z-10">
                  {/* 拟物旋转叠层阴影封面 */}
                  <div className="relative shrink-0 select-none transition-transform duration-300 group-hover:scale-[1.02] group-hover:rotate-[1deg]">
                    {/* 仿真书后阴影叠层 */}
                    <div className="absolute -left-1.5 top-1.5 w-full h-full rounded-[10px] bg-black/10 blur-[4px] -z-10" />
                    <BookCover
                      title={continueBook.title}
                      className="h-[136px] w-[92px] rotate-[-3.5deg] shadow-[2px_12px_28px_rgba(47,42,36,0.22)]"
                      hoverLift={true}
                    />
                  </div>
                  
                  <div className="min-w-0 flex-1 h-full flex flex-col justify-center">
                    <h3
                      className="truncate text-xl font-bold font-reading-title"
                      style={{ color: extractedColors?.textColor || "var(--ui-text)" }}
                    >
                      {continueBook.title}
                    </h3>
                    <p
                      className="mt-1.5 text-xs font-medium flex items-center gap-2"
                      style={{ color: extractedColors?.accentColor || "var(--ui-muted)" }}
                    >
                      <span
                        className="px-2 py-0.5 rounded font-semibold text-[10px] uppercase"
                        style={{
                          backgroundColor: extractedColors ? `${extractedColors.color2}` : "var(--ui-accent-soft)",
                          color: extractedColors?.accentColor || "var(--ui-accent)",
                        }}
                      >
                        {continueBook.format}
                      </span>
                      <span>{getChapterSummary(continueProgress)}</span>
                      <span className="text-[var(--ui-quiet)]">•</span>
                      <span>{getFriendlyRelativeTime(continueBook.lastReadAt || continueBook.updatedAt)}</span>
                    </p>
                    
                    {/* 高级精细进度条 */}
                    <div className="mt-6">
                      <div
                        className="flex justify-between text-[11px] font-bold mb-1.5"
                        style={{ color: extractedColors?.accentColor || "var(--ui-quiet)" }}
                      >
                        <span>阅读进度</span>
                        <span>{continuePercent}%</span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full relative"
                        style={{ backgroundColor: extractedColors ? `${extractedColors.borderColor}40` : "rgba(80, 65, 45, 0.06)" }}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-500 ease-out"
                          style={{
                            width: `${continuePercent}%`,
                            background: extractedColors
                              ? `linear-gradient(90deg, ${extractedColors.accentColor} 0%, ${extractedColors.borderColor} 100%)`
                              : "linear-gradient(90deg, var(--ui-accent) 0%, #81a073 100%)",
                          }}
                        />
                      </div>
                    </div>
                    
                    <p
                      className="mt-4 text-xs leading-relaxed line-clamp-1 font-medium opacity-80"
                      style={{ color: extractedColors?.accentColor || "var(--ui-quiet)" }}
                    >
                      💡 系统已将所有内容和微秒级进度安全保存在本地。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧占 1/3：阁主阅历修行卡 */}
            <div className="md:col-span-1">
              <div
                onClick={() => router.push("/notes")}
                className="group cursor-pointer rounded-[18px] border border-[#E4D7C2]/70 p-5 shadow-[0_12px_36px_rgba(80,65,45,0.05)] backdrop-blur-md relative overflow-hidden transition-all duration-500 ease-in-out hover:shadow-[0_18px_48px_rgba(80,65,45,0.09)] hover:-translate-y-0.5 bg-gradient-to-br from-[#FAF6EE] to-[#F3EBD3] dark:from-[#25231F] dark:to-[#1A1916] flex flex-col justify-between h-full"
              >
                {/* 天青晕染背景与慢呼吸效果 */}
                <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-[radial-gradient(circle,rgba(103,128,85,0.06)_0%,transparent_70%)] ink-breathe-layer pointer-events-none select-none" />
                <div className="absolute inset-0 bg-[radial-gradient(#F3D39E_1px,transparent_1px)] bg-[size:16px_16px] opacity-10 pointer-events-none" />
                
                <div className="relative z-10 flex items-center justify-between">
                  <h2 className="text-xs font-bold font-reading-title tracking-wide uppercase text-[var(--ui-accent)] flex items-center gap-1.5">
                    <span>💮</span> 墨问修行 · Study
                  </h2>
                  <div className="text-[11px] font-bold text-[var(--ui-accent)] opacity-80 group-hover:translate-x-0.5 transition-transform font-serif">
                    瞻仰 ➔
                  </div>
                </div>

                {/* 朱砂红泥印章与天青勋章并立 */}
                <div className="my-3 flex items-center justify-center gap-4 relative z-10">
                  {/* 物理朱砂盖印 */}
                  <div className="w-14 h-14 rounded-full border-2 border-double border-[#B86B5C] bg-[#B86B5C]/5 dark:bg-[#B86B5C]/10 flex flex-col items-center justify-center font-serif text-[#B86B5C] dark:text-[#E29B8C] font-bold leading-tight rotate-[-6deg] shrink-0 scale-100 group-hover:scale-105 transition-transform duration-300 relative shadow-sm">
                    {/* 印泥斑驳质感 */}
                    <div className="absolute inset-0 rounded-full bg-[radial-gradient(#B86B5C_15%,transparent_20%)] bg-[size:4px_4px] opacity-10" />
                    <span className="text-[8px] scale-90 opacity-75 font-semibold">墨问</span>
                    <span className="text-xs tracking-wider font-black -mt-0.5">修行</span>
                  </div>
                  {/* 动态天数汇总 */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[10px] text-[var(--ui-quiet)] font-serif leading-none">连续展卷</p>
                    <p className="text-base font-bold font-serif text-[var(--ui-text)] mt-1">
                      <span className="text-xl text-[#B86B5C] dark:text-[#E29B8C] font-black font-mono">18</span> 天
                    </p>
                  </div>
                </div>

                {/* 指标展示栏 */}
                <div className="border-t border-[rgba(80,65,45,0.06)] dark:border-white/10 pt-3 relative z-10 flex items-center justify-between text-[11px] font-serif text-[var(--ui-muted)]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-[var(--ui-quiet)]">藏书数量</span>
                    <span className="font-bold text-[var(--ui-text)] font-mono">{bookCount} 册</span>
                  </div>
                  <div className="h-5 w-px bg-[rgba(80,65,45,0.06)] dark:bg-white/10" />
                  <div className="flex flex-col gap-0.5 items-end">
                    <span className="text-[10px] text-[var(--ui-quiet)]">落墨想法</span>
                    <span className="font-bold text-[var(--ui-text)] font-mono">{totalNotesCount || 0} 条</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 🔮 极奢国风磨砂「云同步管理中心」 */}
      <section className="relative overflow-hidden rounded-[18px] border border-[#E4D7C2]/70 bg-gradient-to-br from-white/70 to-[#FAF5EB]/50 backdrop-blur-md p-5 shadow-[0_8px_32px_rgba(80,65,45,0.03)] mt-5">
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
                  ? "发现本地与云端存在数据微澜，建议立即双向同步"
                  : strings.sync.offlineDesc}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {isOnline && (
              <button
                onClick={() => handleDualSync(false)}
                disabled={isSyncing}
                className="ui-focus-ring w-full sm:w-auto rounded-full bg-[var(--ui-accent)] px-5 py-2 text-xs font-bold text-white transition-all hover:bg-[#527047] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isSyncing && !syncingBookId ? "同步中..." : strings.sync.syncBtn}
              </button>
            )}
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-start">
          <button
            onClick={() => setShowSyncConfig(!showSyncConfig)}
            className="mt-3 flex items-center gap-1.5 text-xs font-bold text-[var(--ui-accent)] hover:underline"
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
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoSyncOnStartup && isOnline ? "bg-[var(--ui-accent)]" : "bg-gray-200"
                } ${!isOnline ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoSyncOnStartup && isOnline ? "translate-x-5" : "translate-x-0"
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
                onClick={() => setAutoSyncProgressOnReading(!autoSyncProgressOnReading)}
                disabled={!isOnline}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoSyncProgressOnReading && isOnline ? "bg-[var(--ui-accent)]" : "bg-gray-200"
                } ${!isOnline ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoSyncProgressOnReading && isOnline ? "translate-x-5" : "translate-x-0"
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
              <div id="mo-wen-mi-ge-panel" className="bg-[#FAF6EE] dark:bg-[#1E1B15] border border-[rgba(139,115,85,0.18)] rounded-lg p-3.5 space-y-3 shadow-inner relative overflow-hidden">
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
                      className="flex-1 px-3 py-1.5 text-xs rounded border border-[rgba(139,115,85,0.2)] bg-white/60 dark:bg-black/30 text-[var(--ui-text)] placeholder-[var(--ui-quiet)] focus:outline-none focus:border-[var(--ui-accent)] font-mono transition-colors"
                    />
                    {currentShareToken && currentShareToken === shareTokenInput.trim() ? (
                      <button
                        onClick={handleCopyPoeticKey}
                        className="px-2.5 py-1 text-xs border border-[rgba(139,115,85,0.25)] rounded text-[var(--ui-text)] bg-white/40 hover:bg-white/80 active:scale-95 transition-all font-bold flex items-center gap-1"
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
                    className="px-3 py-1.5 text-xs border border-[rgba(139,115,85,0.25)] rounded text-[var(--ui-text)] bg-[rgba(139,115,85,0.06)] hover:bg-[rgba(139,115,85,0.12)] active:scale-98 transition-all font-medium flex items-center gap-1"
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
                        className={`px-2.5 py-1.5 text-xs border border-[#c25042]/30 text-[#c25042] bg-[#c25042]/5 hover:bg-[#c25042]/10 active:scale-98 rounded transition-all font-bold flex items-center gap-1 ${
                          !isOnline ? "opacity-40 cursor-not-allowed" : ""
                        }`}
                        title="彻底擦除该共享密钥在云端存放的书籍及阅读记录"
                      >
                        <span>🧼</span> 物理清空云端备份
                      </button>
                      <button
                        onClick={handleClearShareToken}
                        className="px-3 py-1.5 text-xs bg-[#8b7355]/80 hover:bg-[#8b7355] active:scale-98 text-white rounded transition-all font-bold flex items-center gap-1"
                      >
                        <span>🍃</span> {strings.sync.shareClearBtn}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleBindShareToken}
                      disabled={!shareTokenInput.trim()}
                      className={`px-3 py-1.5 text-xs bg-[var(--ui-accent)] hover:bg-[var(--ui-accent-hover)] active:scale-98 text-white rounded transition-all font-bold flex items-center gap-1 ${
                        !shareTokenInput.trim() ? "opacity-40 cursor-not-allowed" : ""
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

      <section className="mt-7">
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
                list.unshift({ id: undefined, name: "📖 私人藏书" });
                return list;
              })().map((crumb, idx, arr) => {
                const isLast = idx === arr.length - 1;
                return (
                  <div key={crumb.id || "root"} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="text-sm text-[var(--ui-quiet)]">➔</span>}
                    <button
                      onClick={() => !isLast && navigateToFolder(crumb.id)}
                      className={`font-reading-title transition-all flex items-center gap-1 ${
                        isLast
                          ? "text-[#5C4533] cursor-default"
                          : "text-[var(--ui-muted)] hover:text-[var(--ui-accent)] hover:scale-101 active:scale-98"
                      }`}
                    >
                      {crumb.id && <span>📁</span>}
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
              封面、进度和本地状态集中在一个安静书箧中。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="inline-flex w-fit rounded-full border border-[var(--ui-border)] bg-white/64 p-1 text-sm">
              <button
                onClick={() => setSortBy("title")}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  sortBy === "title"
                    ? "bg-[var(--ui-accent)] font-semibold text-white"
                    : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                }`}
              >
                {strings.shelf.sortTitle}
              </button>
              <button
                onClick={() => setSortBy("createdAt")}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  sortBy === "createdAt"
                    ? "bg-[var(--ui-accent)] font-semibold text-white"
                    : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                }`}
              >
                {strings.shelf.sortRecent}
              </button>
            </div>
            <div className="inline-flex w-fit rounded-full border border-[var(--ui-border)] bg-white/64 p-1 text-sm">
              {[
                ["cover", "封面"],
                ["compact", "紧凑"],
                ["list", "列表"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as LibraryViewMode)}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
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
          <SkeletonLoader type={viewMode === "list" ? "list" : "grid"} count={4} />
        ) : books.length === 0 ? (
          <div className="ui-card flex flex-col items-center justify-center rounded-[16px] p-10 text-center text-[var(--ui-text)]">
            <div className="mb-6 flex h-24 w-32 items-end justify-center rounded-[40px] bg-[rgba(95,125,82,0.07)]">
              <div className="mb-5 h-8 w-14 rounded-t-[14px] border border-[rgba(95,125,82,0.28)] bg-white/70" />
              <div className="-ml-3 mb-5 h-12 w-4 rounded-full border border-[rgba(95,125,82,0.22)] bg-[var(--ui-accent-soft)]" />
            </div>
            <h2 className="mb-2 text-xl font-bold">书架还是空的</h2>
            <p className="mb-6 max-w-sm text-sm leading-6 text-[var(--ui-muted)]">
              拖入一本 TXT / EPUB，或先去发现页找找想读的作品。
            </p>
            <button
              onClick={() => router.push("/import")}
              className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#527047]"
            >
              导入本地书籍
            </button>
          </div>
        ) : viewMode === "list" ? (
          <div className="overflow-hidden rounded-[20px] border border-[#E9DCC8]/60 bg-[#FFFDFB]/60 backdrop-blur-md shadow-[0_12px_36px_rgba(80,65,45,0.03)] divide-y divide-[#E9DCC8]/50">
            <button
              onClick={() => router.push("/import")}
              className="ui-focus-ring flex min-h-[54px] w-full items-center justify-center bg-white/30 px-4 text-sm font-semibold text-[var(--ui-muted)] transition-all duration-300 hover:bg-[var(--ui-accent-soft)] hover:text-[var(--ui-accent)]"
            >
              ＋ 导入书籍 / 关联目录
            </button>

            {/* 1. 渲染当前层级的逻辑文件夹 (书箧) */}
            {currentFolders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => navigateToFolder(folder.id)}
                className="group relative cursor-pointer flex items-center justify-between gap-4 px-6 py-4 bg-gradient-to-r from-[#FFFDF9]/60 to-[#FDF9F2]/60 transition-all duration-300 hover:bg-[#FAF5EB]/50"
              >
                {/* 左侧绿点指示 */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--ui-accent)] opacity-0 scale-50 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100" />
                
                <div className="flex items-center gap-5 min-w-0 flex-1 pl-3">
                  {/* 拟物双耳竹箧图标 */}
                  <div className="relative shrink-0 flex items-center justify-center h-11 w-11 rounded-lg bg-[rgba(154,106,58,0.06)] border border-[rgba(154,106,58,0.12)] text-xl group-hover:scale-105 transition-transform duration-300">
                    📁
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-reading-title text-[15px] font-bold text-[#5C4533] group-hover:text-[var(--ui-accent)] transition-colors">
                      {folder.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--ui-muted)]">
                      逻辑书箧 · 共 {mergedBooks.filter(b => b.sourceFolderId === folder.id).length} 本藏书
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 pr-8 sm:pr-10 relative z-20">
                  {/* 🖌️ 逻辑文件夹独立治理菜单 */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setActiveMenuId(activeMenuId === `folder-${folder.id}` ? null : `folder-${folder.id}`);
                      }}
                      className="p-1.5 rounded-full hover:bg-white/85 dark:hover:bg-[#3d3a37] text-sm text-[#8C6239] hover:text-[var(--ui-accent)] transition-all flex items-center justify-center active:scale-95 border border-transparent hover:border-[#E9DCC8]"
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
                          className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#5C4533] dark:text-[#E5E5E5] hover:bg-[#F2EADA] dark:hover:bg-[#3a3a3a] flex items-center gap-2.5 transition-colors border-b border-[#E9DCC8]/30 dark:border-white/5"
                        >
                          <span>🧭</span> 增量重扫目录
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                            await handleBackupFolder(folder.id, folder.name);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#5C4533] dark:text-[#E5E5E5] hover:bg-[#F2EADA] dark:hover:bg-[#3a3a3a] flex items-center gap-2.5 transition-colors border-b border-[#E9DCC8]/30 dark:border-white/5"
                        >
                          <span>📤</span> 备份书箧云端
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                            await handleDisconnectFolder(folder.id, folder.name);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#A64B4B] hover:bg-[#FFF2ED] flex items-center gap-2.5 transition-colors"
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
                    className="px-2.5 py-1 rounded bg-white/85 hover:bg-[#FFF2ED] hover:text-[var(--ui-danger)] border border-[#E9DCC8] text-xs font-semibold text-[#A64B4B] transition-colors"
                    title="解散书箧，书籍将重归主阁"
                  >
                    解散
                  </button>
                </div>
              </div>
            ))}

            {/* 2. 渲染当前层级的藏书 (Books) */}
            {filteredMergedBooks.map((book) => {
              const progress = progressByBookId?.[book.id];
              const percent = getProgressPercent(book, progress);

              const isLocal = (books || []).some((lb) => lb.id === book.id);
              const isCloud = cloudBooks.some((cb) => cb.id === book.id);
              const isLocalOnly = isLocal && !isCloud;
              const isCloudOnly = !isLocal && isCloud;
              const isSynced = isLocal && isCloud;

              return (
                <div
                  key={book.id}
                  onClick={() => {
                    if (isCloudOnly) {
                      handleSingleDownload(book);
                    } else {
                      router.push(`/reader/${book.id}`);
                    }
                  }}
                  onTouchStart={isLocal ? handleTouchStart(book.id, book.title) : undefined}
                  onTouchEnd={isLocal ? handleTouchEndOrMove(book.id) : undefined}
                  onTouchMove={isLocal ? handleTouchEndOrMove(book.id) : undefined}
                  className={`group relative cursor-pointer flex items-center justify-between gap-4 px-6 py-4 transition-all duration-300 hover:bg-[#FAF5EB]/50 ${
                    isCloudOnly ? "opacity-75 backdrop-blur-[0.5px]" : ""
                  }`}
                >
                  {/* 左侧动态高亮天青原点/指示点 */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--ui-accent)] opacity-0 scale-50 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100" />
                  
                  <div className="flex items-center gap-5 min-w-0 flex-1 pl-3">
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
                          const status = getBookAvailabilityStatus(book, cachedBookIdsSet);
                          return (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap shadow-sm ${status.style}`}>
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
                            <span className="text-[10px] text-[#8C6239] bg-[#FAF5EB] px-1.5 py-0.5 rounded border border-[#E9DCC8]/40 truncate max-w-[120px]" title={book.contentLocator.relativePath}>
                              📁 {book.contentLocator.relativePath.split("/").pop()}
                            </span>
                          </>
                        )}
                        <span className="text-[var(--ui-quiet)]">•</span>
                        <span className="uppercase text-[10px] font-bold text-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-1.5 py-0.5 rounded">
                          {book.format}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pr-8 sm:pr-10 relative z-20">
                    {/* 🖌️ 藏书独立治理菜单 */}
                    {isLocal && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setActiveMenuId(activeMenuId === `book-${book.id}` ? null : `book-${book.id}`);
                          }}
                          className="p-1.5 rounded-full hover:bg-white/85 dark:hover:bg-[#3d3a37] text-sm text-[#8C6239] hover:text-[var(--ui-accent)] transition-all flex items-center justify-center active:scale-95 border border-transparent hover:border-[#E9DCC8]"
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
                              className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#5C4533] dark:text-[#E5E5E5] hover:bg-[#F2EADA] dark:hover:bg-[#3a3a3a] flex items-center gap-2.5 transition-colors border-b border-[#E9DCC8]/30 dark:border-white/5"
                            >
                              <span>📤</span> 单独同步备份
                            </button>
                            {book.contentLocator && (
                              <>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                    await handleReconstructBook(book.id, book.title);
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#5C4533] dark:text-[#E5E5E5] hover:bg-[#F2EADA] dark:hover:bg-[#3a3a3a] flex items-center gap-2.5 transition-colors border-b border-[#E9DCC8]/30 dark:border-white/5"
                                >
                                  <span>📥</span> 强制重构自愈
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                    await handleDisconnectBook(book.id, book.title);
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#A64B4B] hover:bg-[#FFF2ED] flex items-center gap-2.5 transition-colors"
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
                        className="px-2.5 py-1 rounded bg-[#FAF5EB] hover:bg-[#8C6239] hover:text-white border border-[#E4D7C2] text-xs font-semibold text-[#8C6239] transition-all shadow-sm"
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
                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
                          isOnline
                            ? "bg-[var(--ui-accent-soft)] hover:bg-[var(--ui-accent)] hover:text-white text-[var(--ui-accent)]"
                            : "bg-gray-100 text-gray-400 opacity-40 pointer-events-none"
                        }`}
                        title={isOnline ? "" : "🌧️ 离线暂存"}
                      >
                        {syncingBookId === book.id ? "备份中" : isOnline ? strings.sync.backupBtn : "🌧️ 暂存"}
                      </button>
                    )}
                    {isCloudOnly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isOnline) handleSingleDownload(book);
                        }}
                        disabled={!isOnline || isSyncing}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
                          isOnline
                            ? "bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600"
                            : "bg-gray-100 text-gray-400 opacity-40 pointer-events-none"
                        }`}
                        title={isOnline ? "" : "🌧️ 待连网下载"}
                      >
                        {syncingBookId === book.id ? "拉取中" : isOnline ? strings.sync.downloadBtn : "🌧️ 待连"}
                      </button>
                    )}
                    {isSynced && cachedBookIdsSet?.has(book.id) && syncingBookId !== book.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpaceOffload(book);
                        }}
                        className="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-[#8C6239] hover:text-white text-xs font-bold text-[#8C6239] transition-all border border-amber-200 shadow-sm"
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
                        className="absolute right-0 top-1/2 -translate-y-1/2 hidden sm:flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(184,107,92,0.12)] bg-white/95 text-xs font-bold text-[var(--ui-danger)] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-[#FFF0EC]"
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
                        style={{ width: `${bookSyncStates[book.id]?.progress || 0}%` }}
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
            {currentFolders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => navigateToFolder(folder.id)}
                className={`group relative overflow-hidden cursor-pointer ui-card flex flex-col justify-between rounded-[18px] p-4 physics-spring hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(80,65,45,0.07)] bg-gradient-to-br from-[#FFFDF9] via-[#FCFAF2] to-[#FAF6EE] border border-[#E4D7C2]/70 ${
                  viewMode === "compact" ? "min-h-[110px]" : "min-h-[148px]"
                }`}
              >
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

                <div className="mt-4 pt-3 border-t border-[#E4D7C2]/30 flex justify-between items-center relative z-20">
                  <span className="text-[10px] text-[var(--ui-quiet)] font-bold">
                    共 {mergedBooks.filter(b => b.sourceFolderId === folder.id).length} 本藏书
                  </span>
                  <div className="flex items-center gap-2">
                    {/* 🖌️ 逻辑文件夹独立治理菜单 (网格模式) */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setActiveMenuId(activeMenuId === `folder-${folder.id}` ? null : `folder-${folder.id}`);
                        }}
                        className="p-1 rounded-full hover:bg-white/85 dark:hover:bg-[#3d3a37] text-xs text-[#8C6239] hover:text-[var(--ui-accent)] transition-all flex items-center justify-center active:scale-95 border border-[#E9DCC8]"
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
                              await handleIncrementalScan(folder.id, folder.name);
                            }}
                            className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#5C4533] dark:text-[#E5E5E5] hover:bg-[#F2EADA] dark:hover:bg-[#3a3a3a] flex items-center gap-2.5 transition-colors border-b border-[#E9DCC8]/30 dark:border-white/5"
                          >
                            <span>🧭</span> 增量重扫目录
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              await handleBackupFolder(folder.id, folder.name);
                            }}
                            className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#5C4533] dark:text-[#E5E5E5] hover:bg-[#F2EADA] dark:hover:bg-[#3a3a3a] flex items-center gap-2.5 transition-colors border-b border-[#E9DCC8]/30 dark:border-white/5"
                          >
                            <span>📤</span> 备份书箧云端
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              await handleDisconnectFolder(folder.id, folder.name);
                            }}
                            className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#A64B4B] hover:bg-[#FFF2ED] flex items-center gap-2.5 transition-colors"
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
                      className="px-2 py-0.5 rounded bg-white hover:bg-[#FFF2ED] hover:text-[var(--ui-danger)] border border-[#E4D7C2] text-[10px] font-bold text-[#A64B4B] transition-colors"
                      title="解散书箧，书籍将重归主阁"
                    >
                      解散
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredMergedBooks.map((book) => {
              const progress = progressByBookId?.[book.id];
              const percent = getProgressPercent(book, progress);

              const isLocal = (books || []).some((lb) => lb.id === book.id);
              const isCloud = cloudBooks.some((cb) => cb.id === book.id);
              const isLocalOnly = isLocal && !isCloud;
              const isCloudOnly = !isLocal && isCloud;
              const isSynced = isLocal && isCloud;

              return (
                <div
                  key={book.id}
                  onClick={() => {
                    if (isCloudOnly) {
                      handleSingleDownload(book);
                    } else {
                      router.push(`/reader/${book.id}`);
                    }
                  }}
                  onTouchStart={isLocal ? handleTouchStart(book.id, book.title) : undefined}
                  onTouchEnd={isLocal ? handleTouchEndOrMove(book.id) : undefined}
                  onTouchMove={isLocal ? handleTouchEndOrMove(book.id) : undefined}
                  className={`group relative overflow-hidden cursor-pointer ui-card flex flex-col justify-between rounded-[18px] p-4 physics-spring hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(80,65,45,0.07)] ${
                    viewMode === "compact" ? "min-h-[110px]" : "min-h-[148px]"
                  } ${isCloudOnly ? "opacity-75 backdrop-blur-[0.5px]" : ""}`}
                >
                  {/* Delete button: visible on mobile, hover-fade-in on desktop, hidden on mobile for better aesthetics and prevention of misclicks */}
                  {isLocal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(book.id, book.title);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="absolute right-2 top-2 z-20 hidden sm:flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(184,107,92,0.12)] bg-white/95 text-xs font-bold text-[var(--ui-danger)] opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-[#FFF0EC]"
                      title={strings.shelf.delete}
                    >
                      ×
                    </button>
                  )}

                  {/* 状态徽标 (右上角挂载) */}
                  <div className="absolute left-2 top-2 z-20 flex gap-1">
                    {(() => {
                      const status = getBookAvailabilityStatus(book, cachedBookIdsSet);
                      return (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap shadow-sm ${status.style}`}>
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
                      <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                        <span className="rounded bg-[var(--ui-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--ui-accent)]">
                          {book.format}
                        </span>

                        {isLocal && (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setActiveMenuId(activeMenuId === `book-${book.id}` ? null : `book-${book.id}`);
                              }}
                              className="rounded bg-[#FAF5EB] hover:bg-[#8C6239] hover:text-white px-1.5 py-0.5 text-[10px] font-semibold text-[#8C6239] transition-all border border-[#E4D7C2] flex items-center justify-center"
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
                                  className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#5C4533] dark:text-[#E5E5E5] hover:bg-[#F2EADA] dark:hover:bg-[#3a3a3a] flex items-center gap-2.5 transition-colors border-b border-[#E9DCC8]/30 dark:border-white/5"
                                >
                                  <span>📤</span> 单独同步备份
                                </button>
                                {book.contentLocator && (
                                  <>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        await handleReconstructBook(book.id, book.title);
                                      }}
                                      className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#5C4533] dark:text-[#E5E5E5] hover:bg-[#F2EADA] dark:hover:bg-[#3a3a3a] flex items-center gap-2.5 transition-colors border-b border-[#E9DCC8]/30 dark:border-white/5"
                                    >
                                      <span>📥</span> 强制重构自愈
                                    </button>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        await handleDisconnectBook(book.id, book.title);
                                      }}
                                      className="w-full px-4 py-2.5 text-left text-xs font-serif font-bold text-[#A64B4B] hover:bg-[#FFF2ED] flex items-center gap-2.5 transition-colors"
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
                            className="rounded bg-[#FAF5EB] hover:bg-[#8C6239] hover:text-white px-2 py-0.5 text-[10px] font-semibold text-[#8C6239] transition-all border border-[#E4D7C2]"
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
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-all border ${
                              isOnline
                                ? "bg-[#FAF5EB] hover:bg-[#8C6239] hover:text-white text-[#8C6239] border-[#E4D7C2]"
                                : "bg-gray-100 text-gray-400 border-gray-200 opacity-40 pointer-events-none"
                            }`}
                            title={isOnline ? "" : "🌧️ 离线暂存"}
                          >
                            {syncingBookId === book.id ? "备份中" : isOnline ? strings.sync.backupBtn : "🌧️ 暂存"}
                          </button>
                        )}
                        {isCloudOnly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isOnline) handleSingleDownload(book);
                            }}
                            disabled={!isOnline || isSyncing}
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-all border ${
                              isOnline
                                ? "bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 border-blue-100"
                                : "bg-gray-100 text-gray-400 border-gray-200 opacity-40 pointer-events-none"
                            }`}
                            title={isOnline ? "" : "🌧️ 待连网下载"}
                          >
                            {syncingBookId === book.id ? "拉取中" : isOnline ? strings.sync.downloadBtn : "🌧️ 待连"}
                          </button>
                        )}
                        {isSynced && cachedBookIdsSet?.has(book.id) && syncingBookId !== book.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpaceOffload(book);
                            }}
                            className="rounded bg-amber-50 hover:bg-[#8C6239] hover:text-white px-2 py-0.5 text-[10px] font-semibold text-[#8C6239] transition-all border border-amber-200"
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
                        {isCloudOnly ? "云端新书 · 点击拉取" : `${getChapterSummary(progress)} · 已读 ${percent}%`}
                        {book.lastReadAt && !isCloudOnly && ` · ${getFriendlyRelativeTime(book.lastReadAt)}`}
                      </p>
                    </div>
                  </div>

                  {/* 单书同步微型进度条 */}
                  {syncingBookId === book.id && (
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-[rgba(80,65,45,0.06)] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--ui-accent)] to-[#81a073] transition-[width] duration-300 ease-out"
                        style={{ width: `${bookSyncStates[book.id]?.progress || 0}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. 精选推荐主题书单：仅在空书架时作为温馨新手引导展示 */}
      {bookCount === 0 && (
        <section className="mt-10 border-t border-[rgba(80,65,45,0.08)] pt-7">
          <div>
            <h2 className="text-xl font-bold text-[var(--ui-text)]">
              精选推荐书单
            </h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              人文历史、思想群星与禅意生活，一叠好书，静心阅享。
            </p>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <StackingBookListCard
              title="心灵幽谷与禅修静夜"
              description="搜集了瓦尔登湖、庄子内篇、清静经等经典书籍，融汇东西方宁静美学，带您在繁忙都市中找到片刻安详。"
              bookTitles={["瓦尔登湖", "庄子内篇", "清静经"]}
              onClick={() => handleCollectBookList("心灵幽谷与禅修静夜")}
            />
            <StackingBookListCard
              title="科技灯火与人类群星"
              description="从科技历史长河中汲取创新火花，寻回物理硬核与硅谷极客精神。包含了硅谷之谜与创新群星之作。"
              bookTitles={["硅谷之谜", "创新者", "黑客与画家"]}
              onClick={() => handleCollectBookList("科技灯火与人类群星")}
            />
          </div>
        </section>
      )}

      {/* 4. 当书架有藏书时，底部低调显示一个雅致的推荐阁入口引流装饰线 */}
      {bookCount > 0 && (
        <div className="mt-14 mb-4 flex justify-center text-center select-none px-4 overflow-hidden">
          <button
            onClick={() => setShowDrawer(true)}
            className="group flex items-center gap-2 text-xs font-medium text-[var(--ui-quiet)] transition-colors hover:text-[var(--ui-accent)] whitespace-nowrap truncate max-w-full"
          >
            <span className="opacity-30 hidden sm:inline">——————</span>
            <span className="flex items-center gap-1 truncate">🍃 案头书尽？可往「推荐阁 ↗」寻新书</span>
            <span className="opacity-30 hidden sm:inline">——————</span>
          </button>
        </div>
      )}

      {/* 5. 推荐阁侧边抽屉组件 */}
      <CuratedDrawer 
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        onCollect={handleCollectBookList}
      />

      {/* 优雅宣纸毛玻璃 Toast 提示 */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[rgba(80,65,45,0.15)] bg-[rgba(255,252,245,0.85)] px-5 py-2.5 text-xs font-bold text-[var(--ui-text)] shadow-lg backdrop-blur-md physics-spring flex items-center gap-2 animate-bounce-short">
          <span>🍃</span> {toastMsg}
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

interface StackingBookListCardProps {
  title: string;
  description: string;
  bookTitles: string[];
  onClick?: () => void;
  isCompact?: boolean;
}

const StackingBookListCard = memo(function StackingBookListCard({
  title,
  description,
  bookTitles,
  onClick,
  isCompact,
}: StackingBookListCardProps) {
  return (
    <div
      onClick={onClick}
      className={`group ui-card flex items-center justify-between rounded-[18px] bg-gradient-to-br from-white/70 to-white/40 border border-white/60 shadow-[0_12px_32px_rgba(80,65,45,0.05)] cursor-pointer physics-spring hover:shadow-[0_18px_40px_rgba(80,65,45,0.07)] hover:-translate-y-0.5 relative overflow-hidden ${
        isCompact ? "p-4" : "p-6"
      }`}
    >
      <div className="flex-1 min-w-0 pr-2">
        <span className="px-2 py-0.5 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-bold text-[9px] uppercase tracking-wider">
          精选书单
        </span>
        <h3 className={`mt-2 font-bold font-reading-title text-[var(--ui-text)] truncate ${
          isCompact ? "text-sm" : "text-base"
        }`}>
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-[var(--ui-muted)] leading-relaxed line-clamp-2">
          {description}
        </p>
        <p className="mt-3 text-[10px] font-bold text-[var(--ui-accent)] flex items-center gap-1">
          共 {bookTitles.length} 本经典 
          <span className="transition-transform group-hover:translate-x-1 duration-300">→</span>
        </p>
      </div>

      {/* 3D Stacking 叠放书籍效果 */}
      <div className={`relative shrink-0 select-none mr-1 ${
        isCompact ? "w-[90px] h-[110px]" : "w-[110px] h-[130px]"
      }`}>
        {/* 底层图书 (Book 3) */}
        {bookTitles[2] && (
          <div className={`absolute rounded-[8px] origin-bottom-right rotate-[12deg] translate-x-2 translate-y-1 scale-[0.88] opacity-50 transition-all duration-500 group-hover:translate-x-4 group-hover:rotate-[18deg] group-hover:opacity-70 z-10 ${
            isCompact ? "left-4 top-2.5 w-[56px] h-[82px]" : "left-6 top-3 w-[72px] h-[106px]"
          }`}>
            <div className="absolute -left-1 top-1 w-full h-full rounded-[8px] bg-black/10 blur-[3px] -z-10" />
            <BookCover title={bookTitles[2]} className="w-full h-full" compact />
          </div>
        )}

        {/* 中层图书 (Book 2) */}
        {bookTitles[1] && (
          <div className={`absolute rounded-[8px] origin-bottom-right rotate-[3deg] translate-x-1 translate-y-0.5 scale-[0.94] opacity-80 transition-all duration-500 group-hover:translate-x-2 group-hover:rotate-[7deg] group-hover:opacity-95 z-20 ${
            isCompact ? "left-2 top-1.5 w-[56px] h-[82px]" : "left-3 top-1.5 w-[72px] h-[106px]"
          }`}>
            <div className="absolute -left-1 top-1 w-full h-full rounded-[8px] bg-black/12 blur-[4px] -z-10" />
            <BookCover title={bookTitles[1]} className="w-full h-full" compact />
          </div>
        )}

        {/* 顶层图书 (Book 1) */}
        {bookTitles[0] && (
          <div className={`absolute rounded-[8px] origin-bottom-right rotate-[-5deg] transition-all duration-500 group-hover:translate-x-[-6px] group-hover:translate-y-[-1px] group-hover:rotate-[-10deg] group-hover:shadow-[0_12px_24px_rgba(47,42,36,0.18)] z-30 ${
            isCompact ? "left-0 top-0 w-[56px] h-[82px]" : "left-0 top-0 w-[72px] h-[106px]"
          }`}>
            <div className="absolute -left-1 top-1 w-full h-full rounded-[8px] bg-black/15 blur-[5px] -z-10" />
            <BookCover title={bookTitles[0]} className="w-full h-full" compact />
          </div>
        )}
      </div>
    </div>
  );
});

interface CuratedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCollect: (listTitle: string) => void;
}

const CuratedDrawer = memo(function CuratedDrawer({ isOpen, onClose, onCollect }: CuratedDrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 注入滑出动画样式 */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
      
      {/* Backshadow overlay */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300"
      />
      {/* Drawer box */}
      <div className="relative w-full max-w-md h-full bg-[rgba(255,252,246,0.95)] border-l border-[rgba(80,65,45,0.1)] p-6 shadow-2xl flex flex-col backdrop-blur-xl animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(80,65,45,0.08)] pb-4">
          <div>
            <span className="px-2 py-0.5 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-bold text-[9px] uppercase tracking-wider">
              编辑推荐
            </span>
            <h3 className="mt-1 text-lg font-bold font-reading-title text-[var(--ui-text)]">
              墨问 · 推荐阁
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(80,65,45,0.05)] text-[var(--ui-muted)] transition-colors hover:bg-[rgba(80,65,45,0.1)]"
          >
            ×
          </button>
        </div>
        
        {/* Content */}
        <div className="mt-6 flex-1 space-y-6">
          <p className="text-xs text-[var(--ui-muted)] leading-relaxed">
            在这里，我们为您策划了数套传世经典与现代名著。点击一键收藏，书籍将直接置入您的本地书架，开启静心阅享。
          </p>
          
          <div className="space-y-4">
            <StackingBookListCard
              title="心灵幽谷与禅修静夜"
              description="搜集了瓦尔登湖、庄子内篇、清静经等经典书籍，融汇东西方宁静美学，带您在繁忙都市中找到片刻安详。"
              bookTitles={["瓦尔登湖", "庄子内篇", "清静经"]}
              onClick={() => {
                onCollect("心灵幽谷与禅修静夜");
                onClose();
              }}
              isCompact
            />
            <StackingBookListCard
              title="科技灯火与人类群星"
              description="从科技历史长河中汲取创新火花，寻回物理硬核与硅谷极客精神。包含了硅谷之谜与创新群星之作。"
              bookTitles={["硅谷之谜", "创新者", "黑客与画家"]}
              onClick={() => {
                onCollect("科技灯火与人类群星");
                onClose();
              }}
              isCompact
            />
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-8 border-t border-[rgba(80,65,45,0.06)] pt-4 text-center">
          <p className="text-[10px] text-[var(--ui-quiet)] font-medium">
            🍃 江上清风，山间明月，静享数字书室之美。
          </p>
        </div>
      </div>
    </div>
  );
});

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

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (book) {
        setSelectedFolderId(book.sourceFolderId || "root");
      }
    } else {
      document.body.style.overflow = "";
      setIsCreatingFolder(false);
      setNewFolderName("");
      setCacheProgress(null);
      setIsCaching(false);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, book]);

  if (!isOpen || !book) return null;

  const handleMove = async (folderId: string) => {
    try {
      const targetId = folderId === "root" ? undefined : folderId;
      await db.books.update(book.id, { sourceFolderId: targetId });
      onToast(`📖 藏书已归置到 ${folderId === "root" ? "书架主阁" : folders.find(f => f.id === folderId)?.name || "指定书箧"}`);
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
      const newId = createId();
      await db.libraryFolders.add({
        id: newId,
        name: newFolderName.trim(),
        sourceType: "virtual",
        depth: 0,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await db.books.update(book.id, { sourceFolderId: newId });
      onToast(`🎨 已新建书箧「${newFolderName.trim()}」并移入藏书`);
      setIsCreatingFolder(false);
      setNewFolderName("");
      setSelectedFolderId(newId);
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
    if (!confirm(`您确信要从当前设备下架「${book.title}」吗？\n\n此操作会彻底清空其在本机的章节正文缓存并从书架中移除。\n\n⚠️ 注意：此操作为逻辑解绑，绝不会伤害或移动您本地磁盘上的任何实际小说文件！`)) {
      return;
    }
    try {
      await db.transaction("rw", [db.books, db.chapters, db.progress], async () => {
        await db.chapters.where("bookId").equals(book.id).delete();
        await db.progress.where("bookId").equals(book.id).delete();
        await db.books.delete(book.id);
      });
      onToast(`🍃 藏书「${book.title}」已下架，缓存已彻底物理清空。`);
      onClose();
    } catch (e) {
      console.error(e);
      onToast("💡 下架失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 磨砂背景 */}
      <div onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-md transition-opacity" />

      {/* 弹窗框 (宣纸风格) */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-[#E9DCC8] bg-[#FAF8F2] shadow-2xl transition-all p-7 text-[#5C4533] z-10 animate-scale-in">
        {/* 注入淡入和缩放动画 */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes scaleIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          .animate-scale-in {
            animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `}} />

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
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(80,65,45,0.05)] text-[var(--ui-muted)] transition-colors hover:bg-[rgba(80,65,45,0.1)]"
          >
            ×
          </button>
        </div>

        {/* 书籍预览详情卡 */}
        <div className="mt-5 rounded-2xl border border-[#E9DCC8]/40 bg-[#FFFDFB]/60 p-4 flex gap-4">
          <BookCover title={book.title} className="h-16 w-11 shrink-0 rounded shadow-[1px_2px_6px_rgba(0,0,0,0.08)]" compact />
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
                <> · 相对路径: <span className="truncate max-w-[150px] inline-block align-bottom">{book.contentLocator.relativePath}</span></>
              )}
            </p>
          </div>
        </div>

        {/* 治理内容区分三板块 */}
        <div className="mt-6 space-y-6">
          {/* 版块一：归属逻辑文件夹 */}
          <div className="space-y-2">
            <label className="block text-xs font-bold tracking-wide text-[#7C624E]">
              📦 逻辑归置 (当前所属：{folders.find(f => f.id === book.sourceFolderId)?.name || "书架主阁"})
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
                  className="flex-1 rounded-xl border border-[#E9DCC8] bg-white px-3 py-2 text-xs font-semibold shadow-sm focus:border-[var(--ui-accent)] focus:outline-none text-[#5C4533]"
                >
                  <option value="root">📜 书架主阁 (未分类)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                  <option value="__create__" className="text-[var(--ui-accent)] font-bold">
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
                  className="flex-1 rounded-xl border border-[#E9DCC8] bg-white px-3 py-2 text-xs font-semibold shadow-sm focus:border-[var(--ui-accent)] focus:outline-none text-[#5C4533]"
                />
                <button
                  onClick={handleCreateAndMove}
                  className="rounded-xl bg-[var(--ui-accent)] hover:bg-[#527047] text-white px-3 text-xs font-bold transition-colors"
                >
                  新建并移入
                </button>
                <button
                  onClick={() => setIsCreatingFolder(false)}
                  className="rounded-xl border border-[#E9DCC8] bg-white hover:bg-gray-50 text-[var(--ui-muted)] px-3 text-xs font-bold transition-colors"
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
                  <h5 className="text-xs font-bold text-[#5C4533]">一键物理缓存全卷</h5>
                  <p className="mt-0.5 text-[10px] text-[var(--ui-muted)] leading-normal">
                    解析整本书并入库存储，供在断网或离线设备时完整阅读。
                  </p>
                </div>
                <button
                  onClick={handleCache}
                  disabled={isCaching}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shrink-0 ${
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

          {/* 版块三：物理下架 */}
          <div className="space-y-2">
            <label className="block text-xs font-bold tracking-wide text-[#7C624E]">
              🍂 藏书下架治理
            </label>
            <div className="rounded-xl border border-red-200/40 bg-red-50/20 p-3.5 flex justify-between items-center gap-4">
              <div>
                <h5 className="text-xs font-bold text-[#A64B4B]">从本机下架解绑</h5>
                <p className="mt-0.5 text-[10px] text-[var(--ui-muted)] leading-normal">
                  移除此书并清空其在 IndexedDB 内的正文。不影响任何磁盘物理文件。
                </p>
              </div>
              <button
                onClick={handleUnbind}
                className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-[#A64B4B] hover:text-white text-xs font-bold text-[#A64B4B] border border-red-200 transition-colors shrink-0"
              >
                解绑下架
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
