import OpenAI from "openai";

export class OpenAIProvider {
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  /**
   * 智能 Token 估计与启发式起承转折滑动窗口裁剪算法
   * 1. 在 maxChars 预算内（默认 6000 字符 ≈ 8K Tokens 上下，主流 16K 模型安全余量），直接全量投递；
   * 2. 超出时按 head 30% / tail 30% / 中段 40% 切预算，开头与结尾保留人物登场与悬念；
   * 3. 中段按全段落均匀步进采样，确保覆盖整本章节而不是只在头几屏抽样，
   *    并优先保留长段（信息密度高）而非短对白；
   * 4. 拼装为一轴紧凑、故事线完整的黄金切片（Gold Segment），保证不爆上下文窗口。
   */
  public trimChapterText(text: string, maxChars: number = 6000): string {
    if (!text || text.length <= maxChars) {
      return text;
    }

    const totalLen = text.length;
    console.log(`[AI-Core] 💡 检测到超长章节 (${totalLen} 字)，启动智能滑动窗口裁剪 (目标限制: ${maxChars} 字)...`);

    const headLen = Math.floor(maxChars * 0.3);
    const tailLen = Math.floor(maxChars * 0.3);
    const midTargetLen = maxChars - headLen - tailLen;

    const head = text.substring(0, headLen);
    const tail = text.substring(totalLen - tailLen);

    // 中段按段落均匀步进采样，覆盖整章而非只取前几段。
    const middlePart = text.substring(headLen, totalLen - tailLen);
    const paragraphs = middlePart
      .split("\n")
      .map(p => p.trim())
      .filter(p => p.length >= 20); // 过滤无意义的超短噪段

    let middleSample = "";
    if (paragraphs.length > 0) {
      // 以平均段长估算预期抽样数，再按这个数算出跨度，保证「最后一抽」落在中段末尾附近。
      const avgParaLen = Math.max(20, Math.floor(
        paragraphs.reduce((acc, p) => acc + p.length, 0) / paragraphs.length,
      ));
      const desiredCount = Math.max(5, Math.floor(midTargetLen / avgParaLen));
      const step = Math.max(1, Math.floor(paragraphs.length / desiredCount));

      const picked = new Set<number>();
      const sampledParas: string[] = [];
      let currentLen = 0;

      for (let i = 0; i < paragraphs.length && currentLen < midTargetLen; i += step) {
        const para = paragraphs[i];
        if (!para || picked.has(i)) continue;
        picked.add(i);
        sampledParas.push(para);
        currentLen += para.length;
      }

      // 若预算还剩余，按段长降序回补几段长段，避免只抓到一连串短对白。
      if (currentLen < midTargetLen * 0.8) {
        const lengthRanked = paragraphs
          .map((p, idx) => ({ p, idx }))
          .filter(({ idx }) => !picked.has(idx))
          .sort((a, b) => b.p.length - a.p.length);
        for (const { p, idx } of lengthRanked) {
          if (currentLen >= midTargetLen) break;
          picked.add(idx);
          sampledParas.push(p);
          currentLen += p.length;
        }
        sampledParas.sort((a, b) => paragraphs.indexOf(a) - paragraphs.indexOf(b));
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


  /**
   * 针对章节内容回答用户问题
   */
  async chat(
    content: string,
    question: string,
    model: string = "gpt-3.5-turbo",
  ): Promise<string> {
    const trimmedText = this.trimChapterText(content);

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是一位博学的阅读伴读助手。请根据以下章节内容，用中文回答读者的问题。回答应简洁、准确、有启发性。",
        },
        {
          role: "user",
          content: `以下是一本书的章节内容：

${trimmedText}

读者的问题是：${question}`,
        },
      ],
    });

    return response.choices[0]?.message?.content || "未能生成回答。";
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
            "你是一位资深的中文小说阅读伴读。请用中文为下文章节生成一段简明扼要的内容总结，依次涵盖：主要人物、关键剧情走向、本章结尾的悬念与情绪铺垫。语言务求自然、易读，避免堆砌套话与英文术语。",
        },
        { role: "user", content: trimmedText },
      ],
    });

    return response.choices[0]?.message?.content || "未能生成本章总结。";
  }
}
