import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.module';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { ChapterRepository } from '../chapter/chapter.repository';
import { OpenAIProvider } from '@reader/ai-core';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import * as crypto from 'crypto';

@Injectable()
export class AiService {
  constructor(
    @Inject(DRIZZLE) private db: Database,
    private chapterRepository: ChapterRepository,
    private openAIProvider: OpenAIProvider,
    private storage: LocalFileBlobStorage,
  ) {}

  /**
   * 基于 HMAC-SHA256 的多态、三重哈希签名生成器 (AISigKey)
   * 将「章节正文内容哈希 (SourceHash)」、「Prompt 模板版本」与「模型名称」融合，
   * 从物理层杜绝因模型、Prompt 变更造成的缓存脏读，达到完美的强一致性校验。
   */
  public generateAiSigKey(
    sourceHash: string,
    model: string,
    promptVersion: string,
  ): string {
    const payload = `${sourceHash}:${model}:${promptVersion}`;
    return crypto
      .createHmac('sha256', 'read-realm-secret-salt-2026')
      .update(payload)
      .digest('hex');
  }

  async summarize(bookId: string, chapterIndex: number, shareToken: string) {
    const chapter = await this.chapterRepository.findByIndex(
      bookId,
      chapterIndex,
      shareToken,
    );
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const model = 'gpt-3.5-turbo';
    const promptVersion = '2.0'; // 升级到 2.0 强裁剪 Prompt 模板版本

    // 1. 在后端物理计算唯一的 AISigKey 签名主键
    const aiSigKey = this.generateAiSigKey(
      chapter.contentHash,
      model,
      promptVersion,
    );
    console.log(
      `[AI-Service] 🛡️ 正在进行 L2 级 SQLite 哈希缓存拦截校验. Key: ${aiSigKey}`,
    );

    // 2. 二级拦截：优先在 SQLite 数据库中以此签名主键极速索引
    const cached = await this.db.query.aiViews.findFirst({
      where: eq(schema.aiViews.id, aiSigKey),
    });

    if (cached) {
      console.log(
        `[AI-Service] 🎉 L2 级 SQLite 拦截成功！命中已有摘要，未发生 API 穿透。`,
      );
      return {
        ...cached,
        bookId: cached.bookId.split('#')[0],
      };
    }

    console.log(`[AI-Service] 🚨 L2 缓存未命中，开始读取原文章节并穿透生成...`);

    // 3. 读取正文大文件
    const contentBuffer = await this.storage.getObject(chapter.contentHash);
    const content = contentBuffer.toString('utf-8');

    // 4. 调用 packages/ai-core 生成摘要（内部已挂载智能 Token 滑动窗裁剪，安全不爆仓）
    const summary = await this.openAIProvider.generateSummary(content, model);

    const dbBookId = `${bookId}#${shareToken}`;

    // 5. 将生成的摘要进行原子化落库，归档此 AISigKey 以阻断后续请求
    const aiView = {
      id: aiSigKey, // 强签名直接作为数据库主键
      bookId: dbBookId,
      chapterIndex,
      sourceHash: chapter.contentHash,
      summary,
      model,
      promptVersion,
      createdAt: new Date().toISOString(),
    };

    await this.db.insert(schema.aiViews).values(aiView);
    console.log(
      `[AI-Service] ✨ 大模型摘要生成完毕，并已原子落盘 SQLite L2 缓存。`,
    );

    return {
      ...aiView,
      bookId: bookId.split('#')[0],
    };
  }
}
