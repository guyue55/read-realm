import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';

@Module({
  controllers: [SearchController],
  providers: [SearchRepository],
})
export class SearchModule {}
