import {
  BadRequestException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.module';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { ChapterRepository } from '../chapter/chapter.repository';
import { OpenAIProvider } from '@reader/ai-core';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import * as crypto from 'crypto';
import { toScopedId } from '../../common/request-boundary';
import type { AIReadingIntent } from '@reader/shared-types';

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
    scope: string = 'global',
  ): string {
    const payload = `${scope}:${sourceHash}:${model}:${promptVersion}`;
    return crypto
      .createHmac('sha256', 'read-realm-secret-salt-2026')
      .update(payload)
      .digest('hex');
  }

  /**
   * 解析用户 AI 配置优先级：
   * 1. 请求头中的用户个人配置 (x-ai-* headers)
   * 2. 服务端环境变量 (OPENAI_API_KEY)
   * 3. 均无则抛出友好错误
   */
  private resolveAIProvider(userHeaders?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }): { provider: OpenAIProvider; model: string } {
    const userApiKey = userHeaders?.apiKey;
    const userBaseUrl = userHeaders?.baseUrl;
    const userModel = userHeaders?.model;
    const serverApiKey = process.env.OPENAI_API_KEY;

    // 优先使用用户配置
    if (
      userApiKey &&
      userApiKey.trim().length > 0 &&
      userApiKey !== 'undefined'
    ) {
      console.log('[AI-Service] 🔑 使用用户个人 AI 配置');
      return {
        provider: new OpenAIProvider(userApiKey, userBaseUrl || undefined),
        model: userModel || 'gpt-3.5-turbo',
      };
    }

    // 回退到服务端环境变量
    if (
      serverApiKey &&
      serverApiKey.trim().length > 0 &&
      serverApiKey !== 'dummy-key'
    ) {
      console.log('[AI-Service] 🏭 使用服务端全局 AI 配置');
      return {
        provider: this.openAIProvider,
        model: 'gpt-3.5-turbo',
      };
    }

    // 无可用配置
    throw new BadRequestException('请先在设置中配置 AI Key');
  }

  async summarize(
    bookId: string,
    chapterIndex: number,
    shareToken: string,
    userAIHeaders?: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    },
  ) {
    return this.analyze(
      bookId,
      chapterIndex,
      'summary',
      shareToken,
      userAIHeaders,
    );
  }

  async analyze(
    bookId: string,
    chapterIndex: number,
    intent: AIReadingIntent,
    shareToken: string,
    userAIHeaders?: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    },
  ) {
    const chapter = await this.chapterRepository.findByIndex(
      bookId,
      chapterIndex,
      shareToken,
    );
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    // 解析 AI 配置（用户优先，服务端回退）
    const { provider, model } = this.resolveAIProvider(userAIHeaders);
    const promptVersion = `reader-ai-v3:${intent}`;
    const dbBookId = toScopedId(bookId, shareToken);

    // 1. 计算唯一 AISigKey 签名主键
    const aiSigKey = this.generateAiSigKey(
      chapter.contentHash,
      model,
      promptVersion,
      dbBookId,
    );
    console.log(`[AI-Service] 🛡️ L2 SQLite 缓存拦截. Key: ${aiSigKey}`);

    // 2. L2 缓存拦截
    const cached = await this.db.query.aiViews.findFirst({
      where: eq(schema.aiViews.id, aiSigKey),
    });

    if (cached) {
      console.log(`[AI-Service] 🎉 L2 缓存命中！`);
      return {
        ...cached,
        bookId: cached.bookId.split('#')[0],
      };
    }

    console.log(`[AI-Service] 🚨 L2 未命中，读取原文并穿透生成...`);

    // 3. 读取正文
    const contentBuffer = await this.storage.getObject(chapter.contentHash);
    const content = contentBuffer.toString('utf-8');

    // 4. 生成摘要
    const summary = await provider.analyze(content, intent, model);

    // 5. 原子落库
    const aiView = {
      id: aiSigKey,
      bookId: dbBookId,
      chapterIndex,
      sourceHash: chapter.contentHash,
      summary,
      model,
      promptVersion,
      createdAt: new Date().toISOString(),
    };

    await this.db.insert(schema.aiViews).values(aiView);
    console.log(`[AI-Service] ✨ 摘要生成完毕并落库。`);

    return {
      ...aiView,
      bookId: bookId.split('#')[0],
    };
  }

  /**
   * 检查 AI 服务是否可用（用于前端判断）
   */

  /**
   * AI 问答：针对当前章节回答用户问题
   */
  async chat(
    bookId: string,
    chapterIndex: number,
    question: string,
    shareToken: string,
    userAIHeaders?: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    },
  ) {
    const chapter = await this.chapterRepository.findByIndex(
      bookId,
      chapterIndex,
      shareToken,
    );
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const { provider, model } = this.resolveAIProvider(userAIHeaders);

    // 读取正文
    const contentBuffer = await this.storage.getObject(chapter.contentHash);
    const content = contentBuffer.toString('utf-8');

    console.log(`[AI-Service] 💬 用户提问: "${question.substring(0, 60)}..."`);

    const answer = await provider.chat(content, question, model);
    return { answer, question };
  }

  checkAvailability(): {
    available: boolean;
    source: 'user' | 'server' | 'none';
  } {
    const serverApiKey = process.env.OPENAI_API_KEY;
    if (
      serverApiKey &&
      serverApiKey.trim().length > 0 &&
      serverApiKey !== 'dummy-key'
    ) {
      return { available: true, source: 'server' };
    }
    // 用户配置状态由前端自行判断
    return { available: false, source: 'none' };
  }
}
