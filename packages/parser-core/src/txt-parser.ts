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

/**
 * 单章内容字符上限：超过后按段落拆分为多个分章（标题追加「（续）」），
 * 避免超长章节在阅读与落盘时出现卡顿。常规网络小说一章约 3k~12k 字，
 * 2 万字符阈值足以容纳常规大章，同时保证翻页流畅。
 *
 * 注意：该阈值作用于「有显式章节标题」的书。无标题书走 FALLBACK_SECTION_CHARS
 * 兜底分段（阈值更低，因为无标题书的章节是人为划分，粒度应更细）。
 */
export const MAX_CHAPTER_CONTENT_CHARS = 20000;

/**
 * 无章节标题时的兜底分段字符上限：整本无显式章节时按段落聚合成若干分章，
 * 避免整本书退化为单个巨型章节。
 *
 * 有意低于 MAX_CHAPTER_CONTENT_CHARS：无标题书的章节是兜底划分，
 * 需要更细的粒度保证可导航性；有标题书则尊重作者章节边界，仅对超长章拆分。
 */
export const FALLBACK_SECTION_CHARS = 12000;

// 🏮 高可用多规制章节识别匹配器
// 规则 1: 标准中文章节 — "第X章"、"第X回"、"第X卷"、"第X节"、"第X话" 等
//         数字支持 〇/零一二三四五六七八九十百千万亿；后接「里/中/内/时」等
//         方位/时间词时不视为标题（如「第3章里提到…」是正文）。
// 规则 2: 特殊章节 — 序章、终章、前言、楔子、番外、尾声、后记、引子、开篇
// 规则 3: 英文章节 — "Chapter X"、"CHAPTER X"（支持罗马数字 IV, XII 等）、
//         prologue / epilogue / preface（单词边界，避免误伤 Prologue… 正文行）
// 规则 4: 编号引导 — "1. "、"一、"、"001 " 等（仅当后面紧跟非空文本，避免匹配纯数字行）
const chapterRegex =
  /^\s*[【\[(（《"'']?\s*(?:第\s*[零〇一二三四五六七八九十百千万亿两0-9]+\s*[章节回卷集部篇折幕话场](?![里中内时])|序章|终章|前言|楔子|番外|尾声|后记|引子|开篇|(?:chapter|CHAPTER)\s*[0-9IVXLCDMivxlcdm]+|\bprologue\b|\bepilogue\b|\bpreface\b|(?:\d{1,4}|[零一二三四五六七八九十百千两]+)\s*[.、:：\-–—]+\s*\S)/i;

/**
 * 分隔线正则：独立成行的连续破折号 / 等号 / 星号 / 波浪线。
 * 在常见的「------\n第一章 风起\n------」排版中作为章节标题的装饰边界。
 * 解析器对分隔线行采取跳过处理（不进入章节内容），标题行本身仍由
 * chapterRegex 识别，分隔线不参与标题判定。
 */
const dividerLineRegex = /^\s*[-—=*~_·•]{3,}\s*$/;

function isChapterLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return false;
  return chapterRegex.test(trimmed);
}

function isDividerLine(line: string): boolean {
  return dividerLineRegex.test(line);
}

/**
 * 从标题中剥离装饰噪声：
 * - 零宽字符、BOM、全角空格、连续空格 → 统一为单个半角空格
 * - 行尾标点（。！？；，）→ 去除（保留书名号、括号等结构符号）
 * - 重复的章节前缀（"第一章 第一章 启程" → "第一章 启程"）
 * - 保留【】《》等包裹装饰
 */
export function normalizeChapterTitle(raw: string): string {
  let title = String(raw || "").trim();
  // 零宽字符 / BOM → 直接删除（不产生空格）
  title = title.replace(/[\uFEFF\u200B-\u200D\u2060]/g, "");
  // 全角空格 / 不间断空格 / 连续空白 → 统一为单个半角空格
  title = title.replace(/[\u00A0\u3000\s]+/g, " ");
  title = title.trim();
  // 行尾标点剥离（不剥离括号/引号等包裹符）
  title = title.replace(/[。！？；，,]+$/u, "").trim();
  // 章节前缀重复去重："第一章 第一章 启程" → "第一章 启程"
  const prefixMatch = title.match(
    /^(第[零〇一二三四五六七八九十百千万亿两0-9]+[章节回卷集部篇折幕话场])\s*\1\s*/u,
  );
  if (prefixMatch) {
    title = title.replace(prefixMatch[0], prefixMatch[1] + " ");
  }
  return title.trim();
}

/**
 * 判断一行是否为页眉/页脚噪声行：
 * - 全角/半角书名号包裹的短书名行（如《斗破苍穹》）
 * - 与书名一致的重复行
 * - 网址 / 作者信息 / 更新提醒 / 本章完 等页脚标记
 *
 * @param isBookStart 是否处于书首（首个正文出现前）——书首剥离范围更宽，
 *                    正文中仅剥离明确的页脚标记，避免误删正文。
 */
function isNoiseLine(
  line: string,
  title: string,
  isBookStart: boolean,
): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // 页脚标记：任意位置剥离
  if (
    /^(本章完|全文完|未完待续|（本章完）|\(本章完\))/.test(trimmed)
  ) {
    return true;
  }
  if (!isBookStart) return false;
  // 书首：书名号短行 / 与书名重复 / 网址 / 作者信息
  const bookTitle = title.trim();
  if (/^《.+》$/.test(trimmed) && trimmed.length <= 40) return true;
  if (
    bookTitle &&
    trimmed.replace(/[《》「」『』"“”]/g, "") ===
      bookTitle.replace(/[《》「」『』"“”]/g, "") &&
    trimmed.length <= 40
  ) {
    return true;
  }
  if (
    /^(https?:\/\/|www\.|作者[:：]|更新[:：]|请记住本书首发域名)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * 将一行正文拆分为段落（保留空行语义）。
 */
function splitToParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      current.push(line);
    } else if (current.length > 0) {
      paragraphs.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length > 0) paragraphs.push(current.join("\n"));
  return paragraphs;
}

/**
 * 将段落列表按字符上限聚合为多个分章。
 */
function groupParagraphs(
  paragraphs: string[],
  maxChars: number,
  baseTitle: string,
): ParsedChapter[] {
  const result: ParsedChapter[] = [];
  let currentGroup: string[] = [];
  let currentLen = 0;
  let groupIndex = 0;

  const flushGroup = () => {
    if (currentGroup.length === 0) return;
    const joined = currentGroup.join("\n\n");
    const title = groupIndex === 0 ? baseTitle : `${baseTitle}（续）`;
    result.push({ index: result.length, title, content: joined });
    groupIndex += 1;
    currentGroup = [];
    currentLen = 0;
  };

  for (const paragraph of paragraphs) {
    const nextLen =
      currentLen + paragraph.length + (currentGroup.length > 0 ? 2 : 0);
    if (currentGroup.length > 0 && nextLen > maxChars) {
      flushGroup();
    }
    currentGroup.push(paragraph);
    currentLen += paragraph.length + (currentGroup.length > 1 ? 2 : 0);
  }
  flushGroup();
  return result;
}

/**
 * 超长章内容拆分：单章超过 MAX_CHAPTER_CONTENT_CHARS 时，
 * 按段落聚合成「原标题」「原标题（续）」「原标题（续）」。
 */
function splitLongChapter(title: string, content: string): ParsedChapter[] {
  if (content.length <= MAX_CHAPTER_CONTENT_CHARS) {
    return [{ index: 0, title, content }];
  }
  const paragraphs = splitToParagraphs(content.split(/\r?\n/));
  if (paragraphs.length === 0) {
    return [{ index: 0, title, content }];
  }
  return groupParagraphs(paragraphs, MAX_CHAPTER_CONTENT_CHARS, title);
}

/**
 * 无章节标题时整本书的兜底分段：按段落聚合为多个分章，
 * 每章上限 FALLBACK_SECTION_CHARS，标题为「正文」「正文（续）」。
 */
function fallbackSplitWithoutChapters(text: string): ParsedChapter[] {
  const paragraphs = splitToParagraphs(text.split(/\r?\n/));
  if (paragraphs.length === 0) {
    return [{ index: 0, title: "正文", content: text.trim() }];
  }
  return groupParagraphs(paragraphs, FALLBACK_SECTION_CHARS, "正文");
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
  let pendingBlankLines = 0;

  // 目录剥离：仅当出现独立「目录」锚点行后，将其后**连续出现的章节标题行**
  // 缓冲为候选目录条目。目录表（缓冲）的处置取决于其后首个非空行：
  // - 若后跟标题行 → 目录表是噪声，丢弃；该标题行是真实的第一个正文章节标题。
  // - 若后跟正文行 → 目录表同样是噪声，丢弃；正文归属无标题开头段（「前言」）。
  // 该策略避免把「第一章\n第二章\n正文」这类空章占位误判为目录。
  let tocAnchorSeen = false;
  let tocPendingTitles: string[] = [];

  // 书名（用于书首页眉/页脚书名行剥离）
  const cleanTitle = filename.replace(/\.txt$/i, "");

  const hasAnyContent = () =>
    chapters.length > 0 ||
    hasExplicitChapterTitle ||
    currentChapterLines.length > 0;

  const flushChapter = () => {
    const joined = currentChapterLines.join("\n").trim();
    if (joined.length > 0 || hasExplicitChapterTitle || chapters.length === 0) {
      const split = splitLongChapter(currentChapterTitle.trim(), joined);
      chapters.push(
        ...split.map((ch) => ({ ...ch, index: chapterIndex++ })),
      );
    }
  };

  const isChapterTitle = (value: string): boolean =>
    value.trim().length > 0 &&
    value.trim().length <= 100 &&
    isChapterLine(value);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const trimmed = line.trim();

    // 分隔线：章节标题的装饰边界，不进入内容
    if (isDividerLine(line)) {
      continue;
    }

    // 目录锚点：独立「目录」/「目 录」/「Contents」行
    if (
      !tocAnchorSeen &&
      /^(目\s*录|contents?|toc)$/i.test(trimmed) &&
      trimmed.length <= 20
    ) {
      tocAnchorSeen = true;
      tocPendingTitles = [];
      continue;
    }

    // 空行：累计段落间距
    if (trimmed.length === 0) {
      pendingBlankLines++;
      continue;
    }

    // 页眉/页脚噪声行剥离（书首宽范围，正文后仅页脚标记）
    if (isNoiseLine(trimmed, cleanTitle, !hasAnyContent())) {
      continue;
    }

    // 章节标题检测
    if (isChapterTitle(trimmed)) {
      if (tocAnchorSeen) {
        // 目录锚点后：
        // - 标题行 == 缓冲最后一条 → 这是正文中重复出现的第一个真实章节标题，
        //   丢弃目录表，把它作为真实章节标题处理。
        // - 否则 → 仍是目录表条目，缓冲，继续。
        const lastTocTitle =
          tocPendingTitles[tocPendingTitles.length - 1] ?? "";
        if (tocPendingTitles.length > 0 && trimmed === lastTocTitle) {
          tocAnchorSeen = false;
          tocPendingTitles = [];
        } else {
          tocPendingTitles.push(trimmed);
          continue;
        }
      }
      if (currentChapterLines.length > 0) {
        flushChapter();
      } else if (hasExplicitChapterTitle) {
        // 上一章仅有标题无正文（如作者占位的空章），仍保留
        chapters.push({
          index: chapterIndex++,
          title: currentChapterTitle.trim(),
          content: "",
        });
      }
      currentChapterTitle = normalizeChapterTitle(trimmed);
      hasExplicitChapterTitle = true;
      currentChapterLines = [];
      pendingBlankLines = 0;
      continue;
    }

    // 非标题行：若在目录锚点后，目录表到此结束。
    // - 缓冲只有 1 条 → 该标题极可能是真实章节（「目录」二字是正文误报），
    //   把它作为真实章节标题，当前正文行归属该章。
    // - 缓冲 ≥2 条 → 明确是目录表，丢弃；当前行按普通内容处理。
    if (tocAnchorSeen) {
      if (tocPendingTitles.length === 1) {
        // 「目录」锚点误报：唯一标题是真实章节
        const onlyTitle = tocPendingTitles[0] ?? "";
        tocAnchorSeen = false;
        tocPendingTitles = [];
        if (currentChapterLines.length > 0) {
          flushChapter();
        }
        currentChapterTitle = normalizeChapterTitle(onlyTitle);
        hasExplicitChapterTitle = true;
        currentChapterLines = [];
        pendingBlankLines = 0;
        // 当前行作为该章第一行正文（不 continue，落到下面正文追加）
      } else {
        tocAnchorSeen = false;
        tocPendingTitles = [];
      }
    }
    if (currentChapterLines.length > 0 && pendingBlankLines > 0) {
      currentChapterLines.push(""); // 保留一个空行代表段落分隔
    }
    pendingBlankLines = 0;
    currentChapterLines.push(line);
  }

  // Push final chapter
  if (
    currentChapterLines.length > 0 ||
    hasExplicitChapterTitle ||
    chapters.length === 0
  ) {
    flushChapter();
  }

  // 整本书完全没有任何显式章节标题：统一按「正文」处理。
  // - 短文本：单个「正文」章；
  // - 超长文本：按段落兜底分段为「正文」「正文（续）」…
  // 与「有章节标题但开头有前言」的书（保留「前言」章）语义区分。
  if (!hasExplicitChapterTitle) {
    const totalContent = text.trim();
    if (totalContent.length > FALLBACK_SECTION_CHARS) {
      const fallbackChapters = fallbackSplitWithoutChapters(text);
      return {
        title: cleanTitle,
        chapters: fallbackChapters.map((ch) => ({
          ...ch,
          index: ch.index,
        })),
      };
    }
    return {
      title: cleanTitle,
      chapters: [{ index: 0, title: "正文", content: totalContent }],
    };
  }

  return {
    title: cleanTitle,
    chapters,
  };
}
