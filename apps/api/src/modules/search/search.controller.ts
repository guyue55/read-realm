import { Controller, Get, Query } from '@nestjs/common';
import { SearchRepository } from './search.repository';
import { ShareToken } from '../../common/decorators/share-token.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly searchRepository: SearchRepository) {}

  @Get()
  async search(@ShareToken() token: string, @Query('q') q: string) {
    return this.searchRepository.searchBooks(q, token);
  }
}
