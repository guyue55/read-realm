"use client";

import { AppShell } from "@/components/AppShell";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { apiUrl, getShareHeaders } from "@/lib/api";
import { strings, describeAppError } from "@/lib/i18n";
import { useVirtualRouter } from "@/lib/route-store";
import { parseUrlBookInBrowser } from "@/lib/url-import";
import type { ParsedBook } from "@reader/parser-core";
import { createId, type Book } from "@reader/shared-types";
import { db } from "@reader/storage-core";
import { useEffect, useRef, useState } from "react";

import { FolderPreviewTree } from "@/components/FolderPreviewTree";
import { FolderScanService, getFileFormat, type ImportPreviewNode } from "@/services/FolderScanService";

interface BatchTask {
  id: string;
  name: string;
  size: number;
  status: "waiting" | "parsing" | "success" | "failed";
  progressText: string;
}


/**
 * 🎨 内存归并优化：递归折叠单链逻辑文件夹，原样保留多分支结构
 * 规则：
 * 1. 若为叶子节点（物理文件或多物理文件组成的一体书），直接原样返回
 * 2. 递归优化所有物理子节点。若优化后子节点数量为 0，代表空文件夹，剔除
 * 3. 若优化后有效子节点数量为 1，说明该节点属于“单子单链多余文件夹壳”，执行折叠：抛弃自身，将唯一子节点提升
 * 4. 若优化后子节点数量多于 1，说明存在多分支结构（有多本书或多个子文件夹），必须原样完整保存层级结构
 */
function optimizeImportTree(
  node: ImportPreviewNode,
  ignoredNodes: Set<string>,
  customTypes: Map<string, ImportPreviewNode["detectedType"] | "ignore">
): ImportPreviewNode[] {
  const isIgnored = ignoredNodes.has(node.id) || customTypes.get(node.id) === "ignore";
  if (isIgnored) return [];

  const currentType = customTypes.get(node.id) || node.detectedType;

  // 1. 文件节点，或者被强制识别、装配为“多文件整书”的逻辑节点，视同最终实体，无需折叠
  if (node.kind === "file" || currentType === "multi_file_book") {
    return [node];
  }

  // 2. 递归净化所有子树
  if (node.kind === "directory" && node.children) {
    const optimizedChildren: ImportPreviewNode[] = [];
    for (const child of node.children) {
      const result = optimizeImportTree(child, ignoredNodes, customTypes);
      optimizedChildren.push(...result);
    }

    // 2.1 变为空文件夹，排除
    if (optimizedChildren.length === 0) {
      return [];
    }

    // 2.2 核心合并：该目录下只有一本书/文件，执行折叠拆解多余外层！直接返回其唯一子节点
    if (optimizedChildren.length === 1) {
      return optimizedChildren;
    }

    // 2.3 有多个（书籍/文件夹），原样保留层级
    node.children = optimizedChildren;
    return [node];
  }

  return [node];
}

export default function ImportPage() {
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState<string>("等待导入");
  const activeTaskIdRef = useRef<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace(`/#${window.location.pathname}${window.location.search}`);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        console.log("[Worker GC] 已强制物理销毁空转解析 Worker 进程。");
        workerRef.current = null;
      }

      if (activeTaskIdRef.current) {
        const staleId = activeTaskIdRef.current;
        void (async () => {
          try {
            const task = await db.importTasks.get(staleId);
            if (task && task.chapters.length === 0) {
              await db.importTasks.delete(staleId);
              console.log(`[Storage GC] 组件离场！已清除临时空白任务: ${staleId}`);
            }
          } catch (err) {
            console.warn("[Storage GC] 离场自愈清理失败:", err);
          }
        })();
      }
    };
  }, []);

  const [isProcessing, setIsProcessing] = useState(false);
  const [activeMode, setActiveMode] = useState<"single" | "batch" | "folder" | "url">("single");
  const [urlInput, setUrlInput] = useState("");
  const router = useVirtualRouter();

  // 1. 批量上传相关 State
  const [batchTasks, setBatchTasks] = useState<BatchTask[]>([]);
  const batchQueueRef = useRef<Array<{ id: string; file: File }>>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // 2. 文件夹扫描相关 State
  const [scanStatus, setScanStatus] = useState("");
  const [previewTree, setPreviewTree] = useState<ImportPreviewNode | null>(null);
  const [ignoredNodes, setIgnoredNodes] = useState<Set<string>>(new Set());
  const [customTypes, setCustomTypes] = useState<Map<string, ImportPreviewNode["detectedType"] | "ignore" | "category_folder">>(new Map());
  const [scanningSourceHandle, setScanningSourceHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const createImportTask = async (
    parsedBook: ParsedBook,
    sourceType: "upload" | "url",
    options: { format: "txt" | "epub" | "html"; sourceUrl?: string },
  ) => {
    if (parsedBook.chapters.length === 0) {
      throw new Error("未解析到章节内容");
    }

    const taskId = createId();
    const now = new Date().toISOString();
    const bookMetadata = {
      id: createId(),
      title: parsedBook.title,
      sourceType,
      sourceUrl: options.sourceUrl,
      format: options.format,
      status: "to_read" as const,
      tags: [],
      chapterCount: parsedBook.chapters.length,
      wordCount: parsedBook.chapters.reduce(
        (total, chapter) => total + chapter.content.length,
        0,
      ),
      createdAt: now,
      updatedAt: now,
    };

    const chaptersToSave = parsedBook.chapters.map((ch, index) => ({
      id: createId(),
      bookId: bookMetadata.id,
      index,
      title: ch.title || `第 ${index + 1} 章`,
      content: ch.content,
      wordCount: ch.content.length,
      createdAt: now,
      updatedAt: now,
    }));

    await db.importTasks.add({
      id: taskId,
      bookMetadata,
      chapters: chaptersToSave,
      createdAt: now,
    });

    router.push(`/import/preview/${taskId}`);
  };

  // ==========================================
  // 【场景 A】：上传单本小说流程
  // ==========================================
  const handleFile = async (file: File) => {
    if (!file) return;

    setIsProcessing(true);
    try {
      setStatus("读取文件内容...");
      const buffer = await file.arrayBuffer();

      setStatus("启动解析引擎...");
      const type = file.name.toLowerCase().endsWith(".epub") ? "epub" : "txt";
      const fallbackBuffer = buffer.slice(0);

      const worker = new Worker(
        new URL("./parser.worker.ts", import.meta.url)
      );
      workerRef.current = worker;

      worker.postMessage({ filename: file.name, buffer, type }, [buffer]);
      setStatus("引擎解析章节中...");

      let taskId = "";
      let bookId = "";
      const now = new Date().toISOString();
      // 内存累积所有章节分片，FINISHED 时整批落库，消除 requestIdleCallback 竞态
      const accumulatedChapters: { id: string; bookId: string; index: number; title: string; content: string; wordCount: number; createdAt: string; updatedAt: string }[] = [];
      let accumulatedWordCount = 0;
      
      worker.onmessage = async (e) => {
        const { type: msgType, success, error } = e.data;

        if (!success) {
          worker.terminate();
          workerRef.current = null;
          setStatus(`解析失败: ${error}`);
          setIsProcessing(false);
          return;
        }

        if (msgType === "METADATA") {
          const { title, chapterCount } = e.data;
          taskId = createId();
          bookId = createId();
          activeTaskIdRef.current = taskId;

          setStatus("引擎识别成功，正在空降初始化书册骨架...");

          const bookMetadata = {
            id: bookId,
            title,
            sourceType: "upload" as const,
            format: type as "epub" | "txt",
            status: "to_read" as const,
            tags: [],
            chapterCount,
            wordCount: 0,
            createdAt: now,
            updatedAt: now,
          };

          await db.importTasks.add({
            id: taskId,
            bookMetadata,
            chapters: [],
            createdAt: now,
          });

        } else if (msgType === "CHUNK") {
          const { startIndex, chapters: chunkChapters, isFinished } = e.data;
          setStatus(`正在流式载入第 ${startIndex + 1} - ${startIndex + chunkChapters.length} 章...`);

          const formattedChapters = chunkChapters.map((ch: { title: string; content: string }, idx: number) => {
            const globalIndex = startIndex + idx;
            return {
              id: createId(),
              bookId,
              index: globalIndex,
              title: ch.title || `第 ${globalIndex + 1} 章`,
              content: ch.content,
              wordCount: ch.content.length,
              createdAt: now,
              updatedAt: now,
            };
          });

          // 内存累积章节分片，FINISHED 时整批落库，消除 requestIdleCallback 竞态
          accumulatedChapters.push(...formattedChapters);
          if (isFinished) {
            accumulatedWordCount = accumulatedChapters.reduce(
              (sum, ch) => sum + (ch.content ? ch.content.length : 0),
              0,
            );
          }

        } else if (msgType === "FINISHED") {
          worker.terminate();
          workerRef.current = null;

          // 一次性将所有章节写入 DB，确保导航前数据已完整落库
          try {
            await db.transaction("rw", db.importTasks, async () => {
              const task = await db.importTasks.get(taskId);
              if (task) {
                task.chapters = accumulatedChapters;
                task.bookMetadata.wordCount = accumulatedWordCount;
                await db.importTasks.put(task);
              }
            });
          } catch (err) {
            console.error("章节整批入库异常:", err);
            await db.importTasks.delete(taskId);
            activeTaskIdRef.current = null;
            setStatus(`保存解析任务失败: ${describeAppError(err)}`);
            setIsProcessing(false);
            return;
          }

          setStatus("完美解析完成！");
          setIsProcessing(false);
          activeTaskIdRef.current = null;
          router.push(`/import/preview/${taskId}`);
        }
      };

      worker.onerror = async (e) => {
        worker.terminate();
        workerRef.current = null;
        try {
          if (activeTaskIdRef.current) {
            await db.importTasks.delete(activeTaskIdRef.current);
            activeTaskIdRef.current = null;
          }
          setStatus("后台解析不可用，正在使用兼容模式...");
          if (type === "epub") throw new Error(e.message);
          const { parseTxtBook } = await import("@reader/parser-core/txt-parser");
          const parsed = parseTxtBook(file.name, fallbackBuffer);
          await createImportTask(parsed, "upload", { format: type });
          setIsProcessing(false);
        } catch (fallbackError) {
          setStatus(`解析异常: ${describeAppError(fallbackError || e.message)}`);
          setIsProcessing(false);
        }
      };
    } catch (e) {
      setStatus(`解析失败: ${describeAppError(e)}`);
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await handleFile(file);
  };

  // ==========================================
  // 【场景 B】：批量上传多本小说流程（不阻塞 UI）
  // ==========================================
  const handleBatchFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newTasks: BatchTask[] = [];
    const addedFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const format = getFileFormat(f.name);
      if (format === "txt" || format === "epub") {
        const id = createId();
        newTasks.push({
          id,
          name: f.name,
          size: f.size,
          status: "waiting",
          progressText: "排队中...",
        });
        addedFiles.push(f);
      }
    }

    if (newTasks.length > 0) {
      setBatchTasks((prev) => [...prev, ...newTasks]);
      batchQueueRef.current.push(
        ...addedFiles.map((file, index) => ({ id: newTasks[index].id, file })),
      );
      triggerBatchQueue();
    }
  };

  const triggerBatchQueue = () => {
    if (isBatchProcessing || batchQueueRef.current.length === 0) return;
    setIsBatchProcessing(true);
    void processNextBatchItem();
  };

  const processNextBatchItem = async () => {
    const queued = batchQueueRef.current.shift();
    if (!queued) {
      setIsBatchProcessing(false);
      return;
    }
    const { id: batchTaskId, file } = queued;

    // 匹配 task
    setBatchTasks((prev) =>
      prev.map((t) => (t.id === batchTaskId ? { ...t, status: "parsing", progressText: "正在分析章节..." } : t))
    );

    try {
      const type = file.name.toLowerCase().endsWith(".epub") ? "epub" : "txt";
      const buffer = await file.arrayBuffer();

      const worker = new Worker(new URL("./parser.worker.ts", import.meta.url));
      worker.postMessage({ filename: file.name, buffer, type }, [buffer]);

      const bookId = createId();
      const now = new Date().toISOString();
      const collectedChapters: {
        id: string;
        bookId: string;
        index: number;
        title: string;
        content: string;
        wordCount: number;
        createdAt: string;
        updatedAt: string;
      }[] = [];

      worker.onmessage = async (e) => {
        const { type: msgType, success, error } = e.data;

        if (!success) {
          worker.terminate();
          setBatchTasks((prev) =>
            prev.map((t) => (t.id === batchTaskId ? { ...t, status: "failed", progressText: `解析失败: ${error}` } : t))
          );
          void processNextBatchItem();
          return;
        }

        if (msgType === "CHUNK") {
          const { startIndex, chapters: chunkChapters } = e.data;
          const formatted = (chunkChapters as { title?: string; content: string }[]).map((ch, idx: number) => ({
            id: createId(),
            bookId,
            index: startIndex + idx,
            title: ch.title || `第 ${startIndex + idx + 1} 章`,
            content: ch.content,
            wordCount: ch.content.length,
            createdAt: now,
            updatedAt: now,
          }));
          collectedChapters.push(...formatted);

          setBatchTasks((prev) =>
            prev.map((t) =>
              t.id === batchTaskId
                ? { ...t, progressText: `流式载入第 ${startIndex + 1} - ${startIndex + chunkChapters.length} 章...` }
                : t
            )
          );
        } else if (msgType === "FINISHED") {
          worker.terminate();

          if (collectedChapters.length === 0) {
            setBatchTasks((prev) =>
              prev.map((t) =>
                t.id === batchTaskId
                  ? { ...t, status: "failed", progressText: "未解析到章节内容" }
                  : t,
              ),
            );
            void processNextBatchItem();
            return;
          }

          // 批量模式：直接归档加入书架！不弹出预览中断流，极致顺滑
          const bookMetadata = {
            id: bookId,
            title: file.name.replace(/\.[^/.]+$/, ""),
            sourceType: "upload" as const,
            format: type as "epub" | "txt",
            status: "to_read" as const,
            tags: [],
            chapterCount: collectedChapters.length,
            wordCount: collectedChapters.reduce((sum, ch) => sum + ch.content.length, 0),
            createdAt: now,
            updatedAt: now,
          };

          await db.transaction("rw", [db.books, db.chapters], async () => {
            await db.books.add(bookMetadata);
            await db.chapters.bulkPut(collectedChapters);
          });

          setBatchTasks((prev) =>
            prev.map((t) => (t.id === batchTaskId ? { ...t, status: "success", progressText: "已成功加入书架！" } : t))
          );
          void processNextBatchItem();
        }
      };

      worker.onerror = (e) => {
        worker.terminate();
        setBatchTasks((prev) =>
          prev.map((t) => (t.id === batchTaskId ? { ...t, status: "failed", progressText: `异常: ${describeAppError(e.message)}` } : t))
        );
        void processNextBatchItem();
      };

    } catch (err) {
      setBatchTasks((prev) =>
        prev.map((t) => (t.id === batchTaskId ? { ...t, status: "failed", progressText: `读取失败: ${describeAppError(err)}` } : t))
      );
      void processNextBatchItem();
    }
  };

  // ==========================================
  // 【场景 C/D】：选择本地小说文件夹勘测与画卷预览树
  // ==========================================
  const handleFolderSelect = async () => {
    if (typeof window === "undefined" || !("showDirectoryPicker" in window)) {
      setScanStatus("⚠️ 您的浏览器不支持 File System Access API，已为您自动降级至多文件批量上传模式。");
      setActiveMode("batch");
      return;
    }

    try {
      setScanStatus("正在申请本地目录起封授权...");
      const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
      setScanningSourceHandle(handle);

      setScanStatus("授权通过，正在递归探照文件树中 (0% 卡死物理熔断隔离已生效)...");
      const rootNode = await FolderScanService.scanDirectoryToPreviewTree(handle, (p) => {
        setScanStatus(`📁 勘探进度：已扫 ${p.scannedDirectories} 目录，${p.scannedFiles} 小说文件。${p.currentStatus}`);
      });

      setPreviewTree(rootNode);
      setScanStatus("✨ 画卷展开完成！您可以微调类型判定，随后一键确认落墨入库。");
    } catch (err) {
      setScanStatus(`❌ 授权或扫描中断: ${describeAppError(err)}`);
    }
  };

  const handleNodeTypeChange = (nodeId: string, newType: ImportPreviewNode["detectedType"] | "ignore") => {
    setCustomTypes((prev) => {
      const next = new Map(prev);
      next.set(nodeId, newType);
      return next;
    });
    if (newType === "ignore") {
      setIgnoredNodes((prev) => {
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      });
    } else {
      setIgnoredNodes((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  // 执行最终的文件夹预览树快速索引入库
  const commitFolderImport = async () => {
    if (!previewTree || !scanningSourceHandle) return;
    setScanStatus("🍁 正在向本地书阁大量篆刻元数据与逻辑文件夹结构...");
    
    const sourceId = createId();
    const rootName = scanningSourceHandle.name;
    const now = new Date().toISOString();

    // 1. 创建 LibrarySource 记录存入数据库 (含原生 Handle 持久化克隆)
    const sourceRecord = {
      id: sourceId,
      name: rootName,
      type: "browser_directory" as const,
      rootName: rootName,
      permissionState: "granted" as const,
      lastScanAt: now,
      scanMode: "manual" as const,
      createdAt: now,
      updatedAt: now,
      directoryHandle: scanningSourceHandle, // IndexedDB 物理直存
    };

    try {
      await db.transaction(
        "rw",
        [db.librarySources, db.libraryFolders, db.books, db.indexedNovelFiles],
        async () => {
          await db.librarySources.put(sourceRecord);

      // 递归处理树并快速索引
      const importNodeRecursive = async (
        node: ImportPreviewNode,
        parentId?: string,
        depth = 0
      ) => {
        const isNodeIgnored = ignoredNodes.has(node.id) || customTypes.get(node.id) === "ignore";
        if (isNodeIgnored) return;

        const currentType = customTypes.get(node.id) || node.detectedType;

        if (node.kind === "directory") {
          if (currentType === "multi_file_book") {
            // 装配为一书壳
            const sortedChildren = [...(node.children || [])]
              .filter(child => !(ignoredNodes.has(child.id) || customTypes.get(child.id) === "ignore"))
              .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));

            const chapterFiles = sortedChildren.map((child, idx) => ({
              fileId: child.id,
              title: child.name.replace(/\.[^/.]+$/, ""),
              index: idx,
              relativePath: child.relativePath,
              size: child.size || 0,
              lastModified: child.lastModified || 0,
              quickFingerprint: child.size ? `${child.name}:${child.size}:${child.lastModified}` : undefined,
            }));

             const bookShell = {
              id: node.id,
              title: node.name,
              author: "逸名",
              sourceType: "folder_multi_file_book" as const,
              sourceFolderId: parentId,
              format: "txt",
              status: "to_read" as const,
              tags: ["多章节小说"],
              chapterCount: chapterFiles.length,
              wordCount: sortedChildren.reduce((sum, ch) => sum + (ch.size || 0), 0), // 字节大小占位
              createdAt: now,
              updatedAt: now,
              parseStatus: "toc_ready" as const,
              cacheStatus: "metadata_only" as const,
              sourceAvailability: "source_available" as const,
              multiFileBook: {
                id: node.id,
                title: node.name,
                sourceType: "folder_multi_file_book" as const,
                folderFileId: node.id,
                chapterFiles,
                parseStatus: "toc_ready" as const,
                cacheStatus: "metadata_only" as const,
              },
              toc: chapterFiles.map(cf => ({ index: cf.index, title: cf.title })),
              contentLocator: {
                sourceId,
                sourceType: "browser_directory" as const,
                rootName: rootName,
                relativePath: node.relativePath,
              },
            };

            await db.books.add(bookShell as unknown as Book);

            // 注册文件索引
            await db.indexedNovelFiles.add({
              id: node.id,
              sourceId,
              parentFolderId: parentId,
              name: node.name,
              relativePath: node.relativePath,
              kind: "directory",
              status: "indexed",
              bookId: node.id,
              createdAt: now,
              updatedAt: now,
            });

          } else {
            // 普通分类逻辑文件夹
            const folderId = node.id;
            await db.libraryFolders.add({
              id: folderId,
              name: node.name,
              parentId: parentId,
              sourceId: sourceId,
              sourceType: "imported_directory",
              relativePath: node.relativePath,
              depth: depth,
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            });

            // 递归处理子节点
            if (node.children) {
              for (const child of node.children) {
                await importNodeRecursive(child, folderId, depth + 1);
              }
            }
          }
        } else {
          // 单本小说文件外壳快速索引
          const format = node.format || "unknown";
          const bookShell = {
            id: node.id,
            title: node.name.replace(/\.[^/.]+$/, ""),
            author: "逸名",
            sourceType: "folder_index" as const,
            sourceFolderId: parentId,
            sourceFileId: node.id,
            format,
            status: "to_read" as const,
            tags: ["文件夹索引"],
            chapterCount: 0,
            wordCount: node.size || 0,
            createdAt: now,
            updatedAt: now,
            parseStatus: "not_parsed" as const,
            cacheStatus: "metadata_only" as const,
            sourceAvailability: "source_available" as const,
            contentLocator: {
              sourceId,
              sourceType: "browser_directory" as const,
              rootName: rootName,
              relativePath: node.relativePath,
              size: node.size,
              lastModified: node.lastModified,
              quickFingerprint: node.size ? `${node.name}:${node.size}:${node.lastModified}` : undefined,
            },
          };

          await db.books.add(bookShell as unknown as Book);

          // 注册文件索引
          await db.indexedNovelFiles.add({
            id: node.id,
            sourceId,
            parentFolderId: parentId,
            name: node.name,
            relativePath: node.relativePath,
            kind: "file",
            format: node.format as "txt" | "epub" | "html" | "md" | "pdf" | "docx" | "mobi" | "azw3" | "unknown",
            size: node.size,
            lastModified: node.lastModified,
            status: "indexed",
            bookId: node.id,
            createdAt: now,
            updatedAt: now,
          });
        }
      };

      // 🏮 核心结构折叠优化：在真正写入 IndexedDB 前，递归剪枝与折叠单链多余文件夹
      const optimizedTopNodes: ImportPreviewNode[] = [];
      if (previewTree.children) {
        for (const child of previewTree.children) {
          const optimized = optimizeImportTree(child, ignoredNodes, customTypes);
          optimizedTopNodes.push(...optimized);
        }
      }

      // 遍历优化后的高内聚、简练化节点数组，原样递归落库
      for (const node of optimizedTopNodes) {
        await importNodeRecursive(node, undefined, 0);
      }
        },
      );

      setScanStatus("🎉 一键入阁大功告成！已成功将整书库及逻辑结构导入书架！");
      setTimeout(() => {
        router.push("/library");
      }, 1500);

    } catch (err) {
      setScanStatus(`❌ 数据库写入断点: ${describeAppError(err)}`);
    }
  };

  // ==========================================
  // 【场景 E】: URL 解析 (保留原有模式)
  // ==========================================
  const parseUrlWithBackendFallback = async (url: string) => {
    try {
      return await parseUrlBookInBrowser(url, setStatus);
    } catch (frontendError) {
      console.warn("Frontend URL parse failed, falling back to backend", frontendError);
      setStatus("前端直接解析受限，切换后端兜底...");
      const response = await fetch(apiUrl("/imports/url/parse"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getShareHeaders() },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        const detail = await response.text();
        let message = detail;
        try {
          const parsed = JSON.parse(detail) as { message?: string | string[] };
          message = Array.isArray(parsed.message)
            ? parsed.message.join("，")
            : parsed.message || detail;
        } catch {
          message = detail;
        }
        throw new Error(message || `后端解析失败：HTTP ${response.status}`);
      }
      return (await response.json()) as ParsedBook;
    }
  };

  const handleUrlImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!urlInput.trim() || isProcessing) return;

    let url: string;
    try {
      url = new URL(urlInput.trim()).toString();
    } catch {
      setStatus("请输入完整的 http(s) 链接");
      return;
    }

    setIsProcessing(true);
    try {
      setStatus("开始解析 URL...");
      const parsedBook = await parseUrlWithBackendFallback(url);
      setStatus(`解析完成，共发现 ${parsedBook.chapters.length} 章`);
      await createImportTask(parsedBook, "url", {
        format: "html",
        sourceUrl: url,
      });
    } catch (e) {
      const error = e as Error;
      const message = describeAppError(error) || "未知错误";
      if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        setStatus("网络请求失败：目标网站拒绝跨域访问，且后端代理未启动。请确认 API 服务运行于端口 4000。");
      } else if (message.includes("章节内容")) {
        setStatus(message);
      } else {
        setStatus(`URL 解析失败: ${message}`);
      }
      setIsProcessing(false);
    }
  };

  return (
    <AppShell
      title="落墨治书"
      subtitle="多端大本多选、选择小说文件夹勘测与内容治理"
      rightNodes={
        <button
          onClick={() => router.push("/library")}
          className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
        >
          返回书架
        </button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="ui-card rounded-[18px] p-4 md:p-6">
          <div className="mb-6 flex flex-wrap rounded-full border border-[var(--ui-border)] bg-white/64 p-1 text-sm max-w-max">
            <button
              type="button"
              onClick={() => { setActiveMode("single"); setStatus("等待导入"); }}
              className={`rounded-full px-4 py-1.5 font-semibold transition-all duration-300 physics-spring hover:scale-[1.03] active:scale-[0.97] ${
                activeMode === "single"
                  ? "bg-[var(--ui-accent)] text-white shadow-sm"
                  : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              单本导入
            </button>
            <button
              type="button"
              onClick={() => { setActiveMode("batch"); setStatus("等待导入"); }}
              className={`rounded-full px-4 py-1.5 font-semibold transition-all duration-300 physics-spring hover:scale-[1.03] active:scale-[0.97] ${
                activeMode === "batch"
                  ? "bg-[var(--ui-accent)] text-white shadow-sm"
                  : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              批量上传
            </button>
            <button
              type="button"
              onClick={() => { setActiveMode("folder"); setStatus("等待导入"); }}
              className={`rounded-full px-4 py-1.5 font-semibold transition-all duration-300 physics-spring hover:scale-[1.03] active:scale-[0.97] ${
                activeMode === "folder"
                  ? "bg-[var(--ui-accent)] text-white shadow-sm"
                  : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              绑定文件夹
            </button>
            <button
              type="button"
              onClick={() => { setActiveMode("url"); setStatus("等待导入"); }}
              className={`rounded-full px-4 py-1.5 font-semibold transition-all duration-300 physics-spring hover:scale-[1.03] active:scale-[0.97] ${
                activeMode === "url"
                  ? "bg-[var(--ui-accent)] text-white shadow-sm"
                  : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              URL 解析
            </button>
          </div>

          {/* ==================================== */}
          {/* TAB 1: 单本导入                      */}
          {/* ==================================== */}
          {activeMode === "single" && (
            <label
              className="group ui-focus-ring relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[rgba(95,125,82,0.28)] bg-[rgba(255,255,255,0.48)] p-8 text-center transition-all duration-300 hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)]"
            >
              <div className="pointer-events-none flex flex-col items-center justify-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] border border-[rgba(95,125,82,0.18)] bg-white text-[var(--ui-accent)] shadow-sm physics-spring group-hover:scale-[1.1] group-hover:rotate-[-3deg]">
                  📖
                </div>
                <h2 className="text-xl font-bold text-[var(--ui-text)]">
                  拖拽单个小说，或点击选择文件
                </h2>
                <p className="mt-2 text-sm text-[var(--ui-muted)]">
                  支持 TXT、EPUB 格式，解析后进入章节预览页
                </p>
                <div className="mt-6 inline-flex rounded-full bg-[var(--ui-accent)] px-6 py-2 text-sm font-semibold text-white shadow-sm">
                  选择单本文卷
                </div>
                {status !== "等待导入" && (
                  <div className="mt-4 flex items-center justify-center gap-2 font-semibold text-[var(--ui-warm)]">
                    {isProcessing && <span className="h-4 w-4 animate-spin rounded-full border-2 border-t-[var(--ui-warm)]" />}
                    {status}
                  </div>
                )}
              </div>
              <input
                aria-label="选择 TXT 或 EPUB 文件"
                type="file"
                accept=".txt,.epub"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </label>
          )}

          {/* ==================================== */}
          {/* TAB 2: 批量上传                      */}
          {/* ==================================== */}
          {activeMode === "batch" && (
            <div className="flex flex-col gap-5">
              <label
                className="group ui-focus-ring relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[rgba(95,125,82,0.28)] bg-[rgba(255,255,255,0.48)] p-5 text-center transition-all duration-300 hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)]"
              >
                <div className="pointer-events-none flex flex-col items-center justify-center">
                  <div className="mb-3 text-2xl">📚</div>
                  <h2 className="text-base font-bold text-[var(--ui-text)]">
                    多选多本文卷，或批量拖入此区域
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ui-muted)]">
                    TXT/EPUB 在后台全并发流式空降落库，不阻塞阅读
                  </p>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".txt,.epub"
                  onChange={(e) => handleBatchFiles(e.target.files)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>

              {batchTasks.length > 0 && (
                <div className="rounded-[16px] border border-[#E9DCC8]/50 bg-white/40 p-4">
                  <h3 className="mb-3 text-sm font-bold text-[var(--ui-text)]">批量队列任务</h3>
                  <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                    {batchTasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-4 rounded-lg bg-white/60 p-3 text-xs"
                      >
                        <span className="truncate font-semibold text-[var(--ui-text)] flex-1">{t.name}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              t.status === "success"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : t.status === "failed"
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : t.status === "parsing"
                                ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                                : "bg-gray-50 text-[var(--ui-muted)]"
                            }`}
                          >
                            {t.status === "success" && "✓ 成功"}
                            {t.status === "failed" && "❌ 失败"}
                            {t.status === "parsing" && "⚙ 载入中"}
                            {t.status === "waiting" && "排队"}
                          </span>
                          <span className="text-[var(--ui-muted)] font-medium max-w-[120px] truncate">
                            {t.progressText}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================================== */}
          {/* TAB 3: 选择文件夹 (预览与一键入库)     */}
          {/* ==================================== */}
          {activeMode === "folder" && (
            <div className="flex flex-col gap-5">
              {!previewTree ? (
                <div className="flex flex-col items-center justify-center rounded-[16px] border border-[#E9DCC8]/50 bg-[#FFFDFB]/60 p-10 text-center">
                  <div className="mb-4 text-3xl">🧭</div>
                  <h2 className="text-xl font-extrabold text-[var(--ui-text)]">
                    绑定本地小说文件夹
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--ui-muted)]">
                    选择一个包含大量小说、或章节结构的物理目录。系统将以“快速索引模式”瞬间装配藏书骨架，保留完整阅读进度与重扫机制。
                  </p>
                  <button
                    type="button"
                    onClick={handleFolderSelect}
                    className="ui-focus-ring mt-6 rounded-full bg-[var(--ui-accent)] px-8 py-3 text-sm font-bold text-white shadow-sm transition-all hover:scale-[1.03] active:scale-[0.97]"
                  >
                    🧭 选择本地小说文件夹
                  </button>
                  {scanStatus && (
                    <p className="mt-4 text-xs font-semibold text-[var(--ui-accent)] max-w-lg">
                      {scanStatus}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl border border-[#E5C9A6]/50 bg-[#FAF4EB]/60 px-4 py-3 text-xs font-semibold text-[#8C6239]">
                    <div className="flex items-center gap-2">
                      <span>已成功绑定物理根卷: <b>{scanningSourceHandle?.name}</b></span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleFolderSelect}
                        className="rounded-full bg-white px-3 py-1 text-[10px] hover:bg-white/80"
                      >
                        重新绑定目录
                      </button>
                    </div>
                  </div>

                  {/* 画卷预览树渲染 */}
                  <div className="rounded-[16px] border border-[#E9DCC8]/60 bg-white/40 p-3 md:p-5 max-h-[420px] overflow-y-auto">
                    <h3 className="mb-4 text-sm font-bold text-[var(--ui-text)] border-b border-[#E9DCC8]/40 pb-2">📂 勘测与预览</h3>
                    <FolderPreviewTree
                      node={previewTree}
                      ignoredNodes={ignoredNodes}
                      customTypes={customTypes}
                      onNodeTypeChange={handleNodeTypeChange}
                    />
                  </div>

                  {scanStatus && (
                    <p className="text-xs font-semibold text-[var(--ui-accent)]">{scanStatus}</p>
                  )}

                  <div className="flex justify-end gap-3 border-t border-[#E9DCC8]/40 pt-4">
                    <button
                      onClick={() => setPreviewTree(null)}
                      className="rounded-full border border-[var(--ui-border)] bg-white px-5 py-2 text-xs font-bold text-[var(--ui-muted)]"
                    >
                      清空放弃
                    </button>
                    <button
                      onClick={commitFolderImport}
                      className="rounded-full bg-[var(--ui-accent)] px-6 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#527047]"
                    >
                      🖋 一键入阁
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================================== */}
          {/* TAB 4: URL 解析                      */}
          {/* ==================================== */}
          {activeMode === "url" && (
            <form
              onSubmit={handleUrlImport}
              className="flex min-h-[280px] flex-col justify-center rounded-[16px] border border-[rgba(95,125,82,0.18)] bg-[rgba(255,255,255,0.52)] p-5 md:p-8"
            >
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] border border-[rgba(95,125,82,0.18)] bg-white text-[var(--ui-accent)] shadow-sm">
                🪶
              </div>
              <h2 className="text-center text-xl font-bold text-[var(--ui-text)]">
                粘贴小说目录页或章节页链接
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-6 text-[var(--ui-muted)]">
                优先在前端直接解析；遇到 CORS、反爬提示或动态页面时自动切到后端代理。
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.currentTarget.value)}
                  placeholder="https://example.com/book/123/"
                  disabled={isProcessing || !isOnline}
                  className="ui-focus-ring min-h-12 flex-1 rounded-full border border-[var(--ui-border)] bg-white px-5 text-[var(--ui-text)] shadow-sm disabled:opacity-60 physics-spring focus:scale-[1.015] focus:shadow-[0_15px_35px_rgba(95,125,82,0.12)] focus:border-[var(--ui-accent)]"
                />
                <button
                  type="submit"
                  disabled={isProcessing || !urlInput.trim() || !isOnline}
                  className="ui-focus-ring min-h-12 rounded-full bg-[var(--ui-accent)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#527047] disabled:cursor-not-allowed disabled:bg-[rgba(80,65,45,0.2)] physics-spring hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isProcessing ? "解析中" : "解析 URL"}
                </button>
              </div>

              {!isOnline && (
                <p className="mt-4 text-center text-sm font-medium text-[#8C6239] px-4 py-2.5 bg-[#FAF4EB] border border-[#E5C9A6]/40 rounded-xl max-w-xl mx-auto">
                  {strings.network.offlineImportHint}
                </p>
              )}

              {isProcessing && (
                <div className="mt-6 flex items-center justify-center gap-2 font-semibold text-[var(--ui-warm)]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-t-[var(--ui-warm)]" />
                  {status}
                </div>
              )}
            </form>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="ui-card rounded-[16px] p-5">
            <h2 className="text-base font-bold text-[var(--ui-text)]">
              治书章法
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--ui-muted)]">
              <li><b>单本上传</b>：支持极速解析大 TXT 及精致排版 EPUB。</li>
              <li><b>批量上传</b>：队列分析，背景自动归档。</li>
              <li><b>本地小说文件夹</b>：不复制物理原文件，仅在切章阅读时按需解密 slice 截取，零占用手机空间。</li>
              <li><b>多文件小说</b>：自动整合成序，一目录下文件名连续即自成一书。</li>
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
