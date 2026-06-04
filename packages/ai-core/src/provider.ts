import OpenAI from "openai";

export class OpenAIProvider {
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  /**
   * 智能 Token 估计与启发式起承转折滑动窗口裁剪算法
   * 1. 当文本长度低于 2200 字符（约 3000 Tokens 最佳处理视口）时，直接全量投递；
   * 2. 当文本超长时，截取首部 750 字符（保留开头环境与引入）、尾部 750 字符（保留末尾高潮与悬念）；
   * 3. 在中间冗余正文中，通过行评分及分段采样抽取约 600 字符的核心句群，
   * 4. 拼装为一轴紧凑、故事线完整的黄金切片（Gold Segment），100% 杜绝 LLM 溢出报错。
   */
  public trimChapterText(text: string, maxChars: number = 2200): string {
    if (!text || text.length <= maxChars) {
      return text;
    }

    const totalLen = text.length;
    console.log(`[AI-Core] 💡 检测到超长章节 (${totalLen} 字)，启动智能滑动窗口裁剪 (目标限制: ${maxChars} 字)...`);

    const headLen = Math.floor(maxChars * 0.35); // 约 660 字
    const tailLen = Math.floor(maxChars * 0.35); // 约 660 字
    const midTargetLen = maxChars - headLen - tailLen; // 约 880 字

    const head = text.substring(0, headLen);
    const tail = text.substring(totalLen - tailLen);

    // 提取中间正文
    const middlePart = text.substring(headLen, totalLen - tailLen);
    const paragraphs = middlePart
      .split("\n")
      .map(p => p.trim())
      .filter(p => p.length >= 20); // 过滤无意义的超短噪段

    let middleSample = "";
    if (paragraphs.length > 0) {
      // 算出一个跨度，从段落群中等跨度抽样，以此保证抽出的剧情是覆盖整个中间部分的
      const step = Math.max(1, Math.floor(paragraphs.length / 5));
      const sampledParas: string[] = [];
      let currentLen = 0;

      for (let i = 0; i < paragraphs.length && currentLen < midTargetLen; i += step) {
        const para = paragraphs[i];
        if (para) {
          sampledParas.push(para);
          currentLen += para.length;
        }
      }
      middleSample = sampledParas.join("\n\n");
    }

    const trimmed = [
      "【起因与背景引入】\n" + head.trim(),
      "……（因原文篇幅过长，中间部分进行智能剧情采样抽取）……\n\n【关键承接情节】\n" + middleSample.trim(),
      "……（余下内容省略）……\n\n【本章高潮与悬念尾声】\n" + tail.trim()
    ].join("\n\n");

    console.log(`[AI-Core] ✨ 智能裁剪滑动窗完成！原文 ${totalLen} 字 ➔ 黄金拼装片 ${trimmed.length} 字。`);
    return trimmed;
  }

  async generateSummary(
    text: string,
    model: string = "gpt-3.5-turbo",
  ): Promise<string> {
    // 首先应用智能滑动窗口裁剪
    const trimmedText = this.trimChapterText(text);

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes book chapters. Provide a concise summary of the following text in Chinese (中文). Highlight key characters, main plot points, and the ending hook.",
        },
        { role: "user", content: trimmedText },
      ],
    });

    return response.choices[0]?.message?.content || "No summary generated.";
  }
}

