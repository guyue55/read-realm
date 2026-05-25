import { Controller, Get, Query } from '@nestjs/common';
import { SearchRepository } from './search.repository';

@Controller('search')
export class SearchController {
  constructor(private readonly searchRepository: SearchRepository) {}

  @Get()
  async search(@Query('q') q: string) {
    return this.searchRepository.searchBooks(q);
  }
}
