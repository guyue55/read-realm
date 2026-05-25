import { Controller, Post, Body, ParseIntPipe } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('summarize')
  async summarize(
    @Body('bookId') bookId: string,
    @Body('chapterIndex', ParseIntPipe) chapterIndex: number,
  ) {
    return this.aiService.summarize(bookId, chapterIndex);
  }
}
