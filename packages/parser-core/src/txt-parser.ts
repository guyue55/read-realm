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

  // 🏮 高可用多规制章节识别匹配器：支持【】等括号包裹、第X章节回卷、Chapter英语、阿拉伯/中文数字序号列表引导
  const chapterRegex =
    /^\s*[【\[(（“‘]?\s*(?:第\s*[零一二三四五六七八九十百千两0-9]+\s*[章节回卷集部篇折幕]|序章|终章|前言|楔子|番外|Chapter\s*[零一二三四五六七八九十百千0-9IVXLCDMivxlcdm]+|CHAPTER\s*[零一二三四五六七八九十百千0-9IVXLCDMivxlcdm]+|(?:\d+|[零一二三四五六七八九十百千两]+)[\s.、:：-]+)/i;

  for (const line of lines) {
    if (line.length < 80 && chapterRegex.test(line)) {
      // Save previous chapter if it has content
      if (currentChapterLines.length > 0) {
        chapters.push({
          index: chapterIndex++,
          title: currentChapterTitle.trim(),
          content: currentChapterLines.join("\n").trim(),
        });
      }
      currentChapterTitle = line;
      currentChapterLines = [];
    } else {
      if (line.trim().length > 0) {
        currentChapterLines.push(line);
      }
    }
  }

  // Push final chapter
  if (currentChapterLines.length > 0) {
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
