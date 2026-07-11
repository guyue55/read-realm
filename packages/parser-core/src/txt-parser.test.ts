import { describe, it, expect } from "vitest";
import { parseTxtBook } from "./txt-parser";

describe("txt-parser", () => {
  it("应解析 GB18030 中文文本", () => {
    const bytes = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x0a, 0xd5, 0xfd, 0xce, 0xc4]);
    const result = parseTxtBook("gb-book.txt", bytes.buffer);

    expect(result.chapters[0]?.title).toBe("第一章");
    expect(result.chapters[0]?.content).toBe("正文");
  });

  it("应根据 BOM 解析 UTF-16LE 文本", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x2c, 0x7b, 0x00, 0x4e, 0xe0, 0x7a, 0x0a, 0x00, 0x63, 0x6b, 0x87, 0x65]);
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
});
