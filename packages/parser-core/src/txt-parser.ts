import { detectAndDecode } from "@reader/content-utils";

export interface ParsedChapter {
  index: number;
  title: string;
  content: string;
}

export interface ParsedBook {
  title: string;
  chapters: ParsedChapter[];
}

export function parseTxtBook(
  filename: string,
  buffer: ArrayBuffer,
): ParsedBook {
  const text = detectAndDecode(buffer);
  const lines = text.split(/\r?\n/);

  const chapters: ParsedChapter[] = [];
  let currentChapterTitle = "前言";
  let currentChapterLines: string[] = [];
  let chapterIndex = 0;
  let hasExplicitChapterTitle = false;
  // 跟踪段落间的空行数量，保留原始排版呼吸感
  let pendingBlankLines = 0;

  // 🏮 高可用多规制章节识别匹配器
  // 规则 1: 标准中文章节 — "第X章"、"第X回"、"第X卷" 等（含【】《》等括号装饰）
  // 规则 2: 特殊章节 — 序章、终章、前言、楔子、番外、尾声、后记
  // 规则 3: 英文章节 — "Chapter X"、"CHAPTER X"（支持罗马数字 IV, XII 等）
  // 规则 4: 编号引导 — "1. "、"一、"、"001 " 等（仅当后面紧跟非空文本，避免匹配纯数字行）
  const chapterRegex =
    /^\s*[【\[(（《"'']?\s*(?:第\s*[零一二三四五六七八九十百千两0-9]+\s*[章节回卷集部篇折幕话场]|序章|终章|前言|楔子|番外|尾声|后记|Chapter\s*[0-9IVXLCDMivxlcdm]+|CHAPTER\s*[0-9IVXLCDMivxlcdm]+|(?:\d{1,4}|[零一二三四五六七八九十百千两]+)\s*[.、:：\-–—]+\s*\S)/i;

  for (const line of lines) {
    const trimmed = line.trim();

    // 章节标题检测：trimmed 长度 ≤ 100 且匹配章节正则
    if (
      trimmed.length > 0 &&
      trimmed.length <= 100 &&
      chapterRegex.test(trimmed)
    ) {
      // 保存上一章（如有内容或非首章）
      if (currentChapterLines.length > 0) {
        chapters.push({
          index: chapterIndex++,
          title: currentChapterTitle.trim(),
          content: currentChapterLines.join("\n").trim(),
        });
      } else if (hasExplicitChapterTitle) {
        // 上一章仅有标题无正文（如作者占位的空章），仍保留
        chapters.push({
          index: chapterIndex++,
          title: currentChapterTitle.trim(),
          content: "",
        });
      }
      currentChapterTitle = trimmed;
      hasExplicitChapterTitle = true;
      currentChapterLines = [];
      pendingBlankLines = 0;
    } else {
      // 保留空行用于段落间距
      if (trimmed.length === 0) {
        pendingBlankLines++;
      } else {
        // 在正文行之前追加积压的空行（但正文开头不额外加空行）
        if (currentChapterLines.length > 0 && pendingBlankLines > 0) {
          currentChapterLines.push(""); // 加入一个空行代表段落分隔
        }
        pendingBlankLines = 0;
        currentChapterLines.push(line);
      }
    }
  }

  // Push final chapter
  if (
    currentChapterLines.length > 0 ||
    hasExplicitChapterTitle ||
    chapters.length === 0
  ) {
    chapters.push({
      index: chapterIndex,
      title: currentChapterTitle.trim(),
      content: currentChapterLines.join("\n").trim(),
    });
  }

  // Fallback if no chapters found: entire book is one chapter
  if (chapters.length === 0) {
    chapters.push({
      index: 0,
      title: "正文",
      content: text.trim(),
    });
  }

  const cleanTitle = filename.replace(/\.txt$/i, "");

  return {
    title: cleanTitle,
    chapters,
  };
}
