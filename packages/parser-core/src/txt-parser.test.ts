import { describe, it, expect } from "vitest";
import { parseTxtBook } from "./txt-parser";

describe("txt-parser", () => {
  it("应解析 GB18030 中文文本", () => {
    const bytes = new Uint8Array([
      0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x0a, 0xd5, 0xfd, 0xce, 0xc4,
    ]);
    const result = parseTxtBook("gb-book.txt", bytes.buffer);

    expect(result.chapters[0]?.title).toBe("第一章");
    expect(result.chapters[0]?.content).toBe("正文");
  });

  it("应根据 BOM 解析 UTF-16LE 文本", () => {
    const bytes = new Uint8Array([
      0xff, 0xfe, 0x2c, 0x7b, 0x00, 0x4e, 0xe0, 0x7a, 0x0a, 0x00, 0x63, 0x6b,
      0x87, 0x65,
    ]);
    const result = parseTxtBook("utf16-book.txt", bytes.buffer);

    expect(result.chapters[0]?.title).toBe("第一章");
    expect(result.chapters[0]?.content).toBe("正文");
  });

  it("should parse standard chapters", () => {
    const text = `第一章 启程\n这是第一章内容。\n\n第二章 遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.title).toBe("test");
    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("第一章 启程");
    expect(result.chapters[0]?.content).toBe("这是第一章内容。");
    expect(result.chapters[1]?.title).toBe("第二章 遇险");
    expect(result.chapters[1]?.content).toBe("这是第二章内容。");
  });

  it("preserves an explicit empty first chapter for boundary validation", () => {
    const text = `第一章\n第二章\n正文`;
    const buffer = new TextEncoder().encode(text).buffer;
    const result = parseTxtBook("empty-first.txt", buffer);

    expect(result.chapters).toEqual([
      { index: 0, title: "第一章", content: "" },
      { index: 1, title: "第二章", content: "正文" },
    ]);
  });

  it("should parse chapters with bracket wraps", () => {
    const text = `【第一章】 启程\n这是第一章内容。\n\n【第二章】 遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("【第一章】 启程");
    expect(result.chapters[1]?.title).toBe("【第二章】 遇险");
  });

  it("should parse chapters starting with numbers and dots", () => {
    const text = `01. 启程\n这是第一章内容。\n\n02. 遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("01. 启程");
    expect(result.chapters[1]?.title).toBe("02. 遇险");
  });

  it("should parse chapters starting with Chinese numerals and symbols", () => {
    const text = `一、启程\n这是第一章内容。\n\n二、遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("一、启程");
    expect(result.chapters[1]?.title).toBe("二、遇险");
  });

  it("should parse English chapters", () => {
    const text = `Chapter 1: The Beginning\nContent of chapter 1.\n\nChapter 2: The Journey\nContent of chapter 2.`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("Chapter 1: The Beginning");
    expect(result.chapters[1]?.title).toBe("Chapter 2: The Journey");
  });

  it("should clean zero-width, full-width spaces, and BOM noise in chapter titles", () => {
    const text =
      "\uFEFF第一章\u200B 启程\u00A0\n这是第一章内容。\n\n第二章 遇险\n这是第二章内容。";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters[0]?.title).toBe("第一章 启程");
    expect(result.chapters[0]?.content).toBe("这是第一章内容。");
    expect(result.chapters[1]?.title).toBe("第二章 遇险");
  });

  it("should normalize repeated chapter prefix noise in titles", () => {
    const text = `第一章 第一章 启程\n这是第一章内容。\n\n第二章 第二章 遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("第一章 启程");
    expect(result.chapters[1]?.title).toBe("第二章 遇险");
  });

  it("should recognize divider-line chapter titles (------ style)", () => {
    const text = `------\n第一章 启程\n------\n这是第一章内容。\n\n------\n第二章 遇险\n------\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("第一章 启程");
    expect(result.chapters[1]?.title).toBe("第二章 遇险");
  });

  it("should split a chapter into sub-sections when it is extremely long", () => {
    const longBody = "段落一：这是第一段内容。\n\n段落二：这是第二段内容。\n\n段落三：这是第三段内容。";
    const repeat = 2000;
    const text = `第一章 启程\n${Array.from({ length: repeat }, () => longBody).join("\n\n")}`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBeGreaterThan(1);
    expect(result.chapters[0]?.title).toBe("第一章 启程");
    expect(result.chapters[0]?.content.length).toBeLessThanOrEqual(20000);
  });

  it("should fall back to paragraph-based splitting when no chapter titles exist", () => {
    // 无章节标题 + 超长正文 → 按段落兜底分段为「正文」「正文（续）」…
    const longParagraph = "这是没有章节标题的正文段落，用于触发兜底分段。";
    const repeat = 700;
    const text = Array.from({ length: repeat }, () => longParagraph).join(
      "\n\n",
    );
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBeGreaterThan(1);
    expect(result.chapters[0]?.title).toBe("正文");
    expect(result.chapters[0]?.content).toBeTruthy();
  });

  it("should strip front-matter noise (目录 lines) before the first real chapter", () => {
    const text = `第一章 启程\n这是第一章内容。\n\n目录\n第一章 启程\n第二章 遇险\n\n第二章 遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters[0]?.title).toBe("第一章 启程");
    expect(result.chapters[1]?.title).toBe("第二章 遇险");
  });

  it("should strip chapter markers from EPUB-style titles with trailing punctuation", () => {
    const text = `第1章 启程。\n这是第一章内容。\n\n第2章 遇险！\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("第1章 启程");
    expect(result.chapters[1]?.title).toBe("第2章 遇险");
  });

  it("should handle full-width bracket decoration in titles", () => {
    const text = `【第一章：启程】\n这是第一章内容。\n\n【第二章：遇险】\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("【第一章：启程】");
    expect(result.chapters[1]?.title).toBe("【第二章：遇险】");
  });

  it("should recognize Chinese large-number chapter titles (第一百〇二章, 第一千章)", () => {
    const text = `第一百〇二章 风起\n这是第一章内容。\n\n第一千章 云涌\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("第一百〇二章 风起");
    expect(result.chapters[1]?.title).toBe("第一千章 云涌");
  });

  it("should recognize English prologue/epilogue/preface as chapter titles", () => {
    const text = `Prologue\nThe beginning.\n\nChapter 1: The Start\nContent here.\n\nEpilogue\nThe end.`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(3);
    expect(result.chapters[0]?.title).toBe("Prologue");
    expect(result.chapters[1]?.title).toBe("Chapter 1: The Start");
    expect(result.chapters[2]?.title).toBe("Epilogue");
  });

  it("should recognize 卷/回/节/话 variants of chapter markers", () => {
    const text = `第一卷 初入江湖\n这是第一卷内容。\n\n第二回 风云际会\n这是第二回内容。\n\n第三话 江湖再见\n这是第三话内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(3);
    expect(result.chapters[0]?.title).toBe("第一卷 初入江湖");
    expect(result.chapters[1]?.title).toBe("第二回 风云际会");
    expect(result.chapters[2]?.title).toBe("第三话 江湖再见");
  });

  it("should reset toc mode when a 目录 anchor is a false positive (正文 follows directly)", () => {
    const text = `目录\n第一章 启程\n这是第一章内容。\n\n第二章 遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    // 「目录」后第一条标题「第一章 启程」后面紧跟正文 → 视为真实章节，
    // 且目录态复位，后续「第二章 遇险」正常识别。
    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("第一章 启程");
    expect(result.chapters[1]?.title).toBe("第二章 遇险");
  });

  it("should not emit 前言-prefixed sub-sections for untitled long books (no chapter titles at all)", () => {
    // 无任何章节标题 + 超长文本：统一为「正文」「正文（续）」…，不出现「前言」
    const longParagraph = "这是没有章节标题的正文段落，用于验证兜底分段。";
    const repeat = 900;
    const text = Array.from({ length: repeat }, () => longParagraph).join(
      "\n\n",
    );
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBeGreaterThan(1);
    for (const chapter of result.chapters) {
      expect(chapter.title.startsWith("前言")).toBe(false);
    }
    // 标题应统一为「正文」「正文（续）」…，不允许出现「前言」系标题
    expect(result.chapters[0]?.title).toBe("正文");
    expect(
      result.chapters.every(
        (c) => c.title === "正文" || c.title.startsWith("正文（续）"),
      ),
    ).toBe(true);
  });

  it("should not lose content when TOC titles differ from body titles", () => {
    // TOC 列表（第一章 风起 / 第二章 云涌）与正文标题不重复：
    // 目录表后紧跟正文（非标题行）→ 目录表被丢弃，正文归属无标题开头段，
    // 内容不丢失；后续「第三章 雨落」正常识别。
    const text = `目录\n第一章 风起\n第二章 云涌\n\n风起了，正文开始。\n\n第三章 雨落\n这是第三章正文。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    // 无标题开头段保留「风起了，正文开始。」
    expect(result.chapters[0]?.content).toContain("风起了，正文开始。");
    // 章节不丢失：最后一条为「第三章 雨落」
    expect(result.chapters[result.chapters.length - 1]?.title).toBe(
      "第三章 雨落",
    );
    expect(result.chapters[result.chapters.length - 1]?.content).toContain(
      "这是第三章正文。",
    );
  });

  it("should strip book-title header lines at book start (《书名》 style)", () => {
    const text = `《斗破苍穹》\n第一章 启程\n这是第一章内容。\n\n第二章 遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.title).toBe("第一章 启程");
    // 书名行不应成为独立章节
    expect(result.chapters.some((c) => c.title.includes("斗破苍穹"))).toBe(
      false,
    );
  });

  it("should not treat 第X章里/中/时 as a chapter title (inline mention)", () => {
    const text = `第一章 启程\n第3章里提到的那个角色出场了。\n第二章 遇险\n这是第二章内容。`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    // 「第3章里提到的…」应作为第一章的正文内容保留
    expect(result.chapters[0]?.content).toContain("第3章里提到的那个角色出场了");
    expect(result.chapters[1]?.title).toBe("第二章 遇险");
  });

  it("should not treat English words like Prefaces/Epilogues as chapter titles (word boundary)", () => {
    const text = `第一章 启程\nPrefaces of the book discussed here.\n第二章 遇险\nEpilogues are common in novels.`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const result = parseTxtBook("test.txt", buffer);

    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0]?.content).toContain(
      "Prefaces of the book discussed here.",
    );
    expect(result.chapters[1]?.content).toContain(
      "Epilogues are common in novels.",
    );
  });
});
