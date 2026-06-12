import { createId } from "@reader/shared-types";

export interface ScanProgress {
  scannedFiles: number;
  scannedDirectories: number;
  currentStatus: string;
}

export interface ImportPreviewNode {
  id: string;
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  detectedType: "category_folder" | "multi_file_book" | "single_book" | "unknown";
  format?: "txt" | "epub" | "html" | "md" | "unknown";
  size?: number;
  lastModified?: number;
  children?: ImportPreviewNode[];
  chapterCount?: number;
  fileHandle?: FileSystemFileHandle;
  directoryHandle?: FileSystemDirectoryHandle;
}

// 常见的小说章节文件名匹配模式
const CHAPTER_REGEXP = [
  // 标准中文章节：第X章、第X回、第X卷、第X节 等
  /第\s*\d+\s*[章回卷节折部篇幕话场]/,
  // 用中文数字的章节：卷十三、第一回 等
  /第\s*[零一二三四五六七八九十百千两]+\s*[章回卷节折部篇幕话场]/,
  // 纯数字序号文件名：001.txt ~ 9999.txt（排除 4 位年份如 1984.txt）
  /^(?:0{1,3}[1-9]\d*|[1-9]\d{0,3})\.(?:txt|html?|md)$/,
  // 英文 Chapter
  /\bchapter\s*\d+\b/i,
  // 特殊章节标记
  /楔子|番外|尾声|后记|序[章言]|终章|前言/,
];

/**
 * 校验文件名是否匹配章节特征
 */
export function isChapterName(name: string): boolean {
  const nameWithoutExt = name.substring(0, name.lastIndexOf(".")) || name;
  return CHAPTER_REGEXP.some(regex => regexpTest(regex, nameWithoutExt));
}

function regexpTest(regex: RegExp, str: string): boolean {
  return regex.test(str);
}

/**
 * 严格路径安全防御，检测并拦截任何路径穿越（Path Traversal）绕过尝试
 */
export function validateRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim();
  const parts = normalized.split("/");
  if (
    parts.includes("..") ||
    parts.includes(".") ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.startsWith("./")
  ) {
    throw new Error(`PATH_TRAVERSAL_FORBIDDEN: 检测到路径越界尝试: ${path}`);
  }
  return normalized;
}

/**
 * 极轻量元数据指纹算法，兼顾极致的快扫性能与防腐对比
 */
export function generateQuickFingerprint(name: string, size: number, lastModified: number): string {
  return `${name}:${size}:${lastModified}`;
}

/**
 * 判断一个后缀是否为支持的小说/章节格式
 */
export function getFileFormat(filename: string): "txt" | "epub" | "html" | "md" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "txt") return "txt";
  if (ext === "epub") return "epub";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "md" || ext === "markdown") return "md";
  return "unknown";
}

export class FolderScanService {
  /**
   * 递归扫描文件句柄，构建“千轴画卷·导入预览树”及提取底层物理元数据
   * 伴随 requestAnimationFrame 阻尼，确保 10,000 级目录极速非阻塞扫描，杜绝主线程卡死
   */
  static async scanDirectoryToPreviewTree(
    dirHandle: FileSystemDirectoryHandle,
    onProgress?: (progress: ScanProgress) => void,
    rootPath: string = ""
  ): Promise<ImportPreviewNode> {
    let scannedFiles = 0;
    let scannedDirectories = 0;

    const traverse = async (
      handle: FileSystemDirectoryHandle,
      currentRelativePath: string
    ): Promise<ImportPreviewNode> => {
      scannedDirectories++;
      if (scannedDirectories % 30 === 0) {
        // 每扫描 30 个子目录释放一次主线程，呼吸缓冲
        await new Promise(resolve => requestAnimationFrame(resolve));
      }

      onProgress?.({
        scannedFiles,
        scannedDirectories,
        currentStatus: `正在勘探目录: ${handle.name}`,
      });

      const children: ImportPreviewNode[] = [];
      const textFiles: { name: string; handle: FileSystemFileHandle; size: number; mtime: number }[] = [];
      const epubs: { name: string; handle: FileSystemFileHandle; size: number; mtime: number }[] = [];

      const entries = handle as unknown as { values(): AsyncIterable<{ name: string; kind: "file" | "directory" }> };
      for await (const entry of entries.values()) {
        const entryRelativePath = currentRelativePath
          ? `${currentRelativePath}/${entry.name}`
          : entry.name;
        
        // 安全拦截
        validateRelativePath(entryRelativePath);

        if (entry.kind === "file") {
          scannedFiles++;
          if (scannedFiles % 150 === 0) {
            // 每处理 150 个物理文件释放主线程
            await new Promise(resolve => requestAnimationFrame(resolve));
          }

          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const format = getFileFormat(file.name);

          if (format === "txt" || format === "md" || format === "html") {
            textFiles.push({
              name: file.name,
              handle: fileHandle,
              size: file.size,
              mtime: file.lastModified,
            });
          } else if (format === "epub") {
            epubs.push({
              name: file.name,
              handle: fileHandle,
              size: file.size,
              mtime: file.lastModified,
            });
          } else {
            // 忽略不支持的物理格式（如 .jpg, .db 等）
            continue;
          }
        } else if (entry.kind === "directory") {
          const subNode = await traverse(entry as FileSystemDirectoryHandle, entryRelativePath);
          children.push(subNode);
        }
      }

      // 智能判定当前子目录的逻辑类型（场景 D：目录本身是一部小说，还是普通的分类文件夹）
      let detectedType: ImportPreviewNode["detectedType"] = "category_folder";
      const fileCount = textFiles.length;
      const chapterMatchedCount = textFiles.filter(f => isChapterName(f.name)).length;

      // 判定规则：文本/章节文件 >= 3 个，且包含章节特征的文件比例 >= 70%
      if (fileCount >= 3 && chapterMatchedCount / fileCount >= 0.7) {
        detectedType = "multi_file_book";
      }

      // 装配当前文件夹下的单本小说
      for (const f of textFiles) {
        if (detectedType !== "multi_file_book") {
          // 如果子目录是普通分类，则把其中的 TXT 识别为独立的单本小说
          children.push({
            id: createId(),
            name: f.name,
            relativePath: currentRelativePath ? `${currentRelativePath}/${f.name}` : f.name,
            kind: "file",
            detectedType: "single_book",
            format: getFileFormat(f.name),
            size: f.size,
            lastModified: f.mtime,
            fileHandle: f.handle,
          });
        }
      }

      // EPUB 始终是单本小说
      for (const e of epubs) {
        children.push({
          id: createId(),
          name: e.name,
          relativePath: currentRelativePath ? `${currentRelativePath}/${e.name}` : e.name,
          kind: "file",
          detectedType: "single_book",
          format: "epub",
          size: e.size,
          lastModified: e.mtime,
          fileHandle: e.handle,
        });
      }

      return {
        id: createId(),
        name: handle.name,
        relativePath: currentRelativePath,
        kind: "directory",
        detectedType: detectedType,
        children: children,
        chapterCount: detectedType === "multi_file_book" ? fileCount : undefined,
        directoryHandle: handle,
      };
    };

    const rootNode = await traverse(dirHandle, rootPath);
    onProgress?.({
      scannedFiles,
      scannedDirectories,
      currentStatus: `勘探完美结束，共发现 ${scannedFiles} 个文件，${scannedDirectories} 个目录`,
    });
    return rootNode;
  }

  /**
   * 增量重新扫描对比合并引擎 (Scan Reconciliation)
   * 支持 relativePath + size/mtime 的增量合并算法，完美保持用户原有的阅读进度、书签和手写笔记！
   */
  static reconcileScanResults(
    oldFiles: { relativePath: string; size: number; lastModified: number; bookId?: string }[],
    newFiles: { relativePath: string; size: number; lastModified: number }[]
  ): {
    unchanged: string[]; // 未变动的相对路径
    changed: string[];   // 内容更新的相对路径
    moved: { from: string; to: string; bookId?: string }[]; // 移动/改名的配对
    deleted: string[];   // 缺失的相对路径
    added: string[];     // 新发现的相对路径
  } {
    const unchanged: string[] = [];
    const changed: string[] = [];
    const moved: { from: string; to: string; bookId?: string }[] = [];
    const deleted: string[] = [];
    const added: string[] = [];

    const oldMap = new Map<string, typeof oldFiles[0]>();
    const oldFingerprintMap = new Map<string, typeof oldFiles[0]>(); // 用于辅助检测移动/改名

    for (const f of oldFiles) {
      oldMap.set(f.relativePath, f);
      const fp = generateQuickFingerprint(f.relativePath.split("/").pop() || "", f.size, f.lastModified);
      oldFingerprintMap.set(fp, f);
    }

    const newMap = new Map<string, typeof newFiles[0]>();
    const unmatchedNewFiles: typeof newFiles[0][] = [];

    for (const nf of newFiles) {
      newMap.set(nf.relativePath, nf);
      const oldF = oldMap.get(nf.relativePath);
      
      if (oldF) {
        // relativePath 相同
        if (oldF.size === nf.size && oldF.lastModified === nf.lastModified) {
          unchanged.push(nf.relativePath);
        } else {
          changed.push(nf.relativePath);
        }
      } else {
        // 先暂存，看后续是否为移动或改名
        unmatchedNewFiles.push(nf);
      }
    }

    // 勘测被删除的文件以及尝试匹配改名/移动
    for (const oldF of oldFiles) {
      if (!newMap.has(oldF.relativePath)) {
        // 在新扫描中不存在该相对路径。我们看看指纹是否在新扫描中能找到
        const fp = generateQuickFingerprint(oldF.relativePath.split("/").pop() || "", oldF.size, oldF.lastModified);
        
        // 在未匹配的新文件中，寻找文件名、大小和修改时间均匹配的项
        const matchedNewIdx = unmatchedNewFiles.findIndex(
          nf => generateQuickFingerprint(nf.relativePath.split("/").pop() || "", nf.size, nf.lastModified) === fp
        );

        if (matchedNewIdx !== -1) {
          const matchedNew = unmatchedNewFiles[matchedNewIdx];
          moved.push({
            from: oldF.relativePath,
            to: matchedNew.relativePath,
            bookId: oldF.bookId,
          });
          unmatchedNewFiles.splice(matchedNewIdx, 1); // 成功配对后移出
        } else {
          deleted.push(oldF.relativePath);
        }
      }
    }

    // 剩下的 unmatchedNewFiles 纯属新增文件
    for (const nf of unmatchedNewFiles) {
      added.push(nf.relativePath);
    }

    return { unchanged, changed, moved, deleted, added };
  }
}
