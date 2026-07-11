import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { ShareToken } from '../../common/decorators/share-token.decorator';
import { AIAnalyzeBodySchema, parseBody } from '../../common/request-boundary';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  status() {
    return this.aiService.checkAvailability();
  }

  @Post('chat')
  async chat(
    @ShareToken() token: string,
    @Body('bookId') bookId: string,
    @Body('chapterIndex', ParseIntPipe) chapterIndex: number,
    @Body('question') question: string,
    @Headers('x-ai-api-key') apiKey?: string,
    @Headers('x-ai-base-url') baseUrl?: string,
    @Headers('x-ai-model') model?: string,
  ) {
    if (!question || question.trim().length === 0) {
      throw new BadRequestException('问题不能为空');
    }
    return this.aiService.chat(bookId, chapterIndex, question.trim(), token, {
      apiKey,
      baseUrl,
      model,
    });
  }

  @Post('summarize')
  async summarize(
    @ShareToken() token: string,
    @Body('bookId') bookId: string,
    @Body('chapterIndex', ParseIntPipe) chapterIndex: number,
    @Headers('x-ai-api-key') apiKey?: string,
    @Headers('x-ai-base-url') baseUrl?: string,
    @Headers('x-ai-model') model?: string,
  ) {
    return this.aiService.summarize(bookId, chapterIndex, token, {
      apiKey,
      baseUrl,
      model,
    });
  }

  @Post('analyze')
  async analyze(
    @ShareToken() token: string,
    @Body() rawBody: unknown,
    @Headers('x-ai-api-key') apiKey?: string,
    @Headers('x-ai-base-url') baseUrl?: string,
    @Headers('x-ai-model') model?: string,
  ) {
    const body = parseBody(AIAnalyzeBodySchema, rawBody);
    return this.aiService.analyze(
      body.bookId,
      body.chapterIndex,
      body.intent,
      token,
      { apiKey, baseUrl, model },
    );
  }
}
