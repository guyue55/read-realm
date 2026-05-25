import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './modules/database/database.module';
import { BookModule } from './modules/book/book.module';
import { ChapterModule } from './modules/chapter/chapter.module';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [DatabaseModule, BookModule, ChapterModule, SearchModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
