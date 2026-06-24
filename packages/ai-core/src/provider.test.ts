import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "./provider";
import OpenAI from "openai";

vi.mock("openai", () => {
  const OpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "This is a summary." } }],
        }),
      },
    },
  }));
  return { default: OpenAI };
});

describe("OpenAIProvider", () => {
  it("should generate a summary", async () => {
    const provider = new OpenAIProvider("fake-key");
    const summary = await provider.generateSummary("Some text to summarize");
    expect(summary).toBe("This is a summary.");
  });

  it("trimChapterText 短文不裁剪，按原文返回", () => {
    const provider = new OpenAIProvider("fake-key");
    const text = "短章节正文，远低于预算。";
    expect(provider.trimChapterText(text, 6000)).toBe(text);
  });

  it("trimChapterText 超长章节按预算切片且覆盖结尾段", () => {
    const provider = new OpenAIProvider("fake-key");
    const paragraphs: string[] = [];
    for (let i = 0; i < 400; i += 1) {
      paragraphs.push(
        `第 ${i} 段：` +
          "他从林间穿过，雨声落进檐角，故事在这里推进。".repeat(2),
      );
    }
    const text = paragraphs.join("\n");
    const trimmed = provider.trimChapterText(text, 2000);
    expect(trimmed.length).toBeLessThanOrEqual(text.length);
    expect(trimmed.length).toBeLessThan(text.length);
    // 头部包含第 0 段，尾部包含最后一段，证明 head/tail 都被保留。
    expect(trimmed).toContain("第 0 段");
    expect(trimmed).toContain("第 399 段");
    // 中段抽样应至少覆盖到中间附近的段落。
    expect(trimmed).toMatch(/第 (1\d{2}|2\d{2}|3\d{2}) 段/);
  });
});
