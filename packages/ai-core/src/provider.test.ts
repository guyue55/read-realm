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
});
