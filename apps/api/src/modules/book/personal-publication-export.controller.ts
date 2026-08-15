import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Query,
} from '@nestjs/common';
import { ShareToken } from '../../common/decorators/share-token.decorator';
import { PersonalPublicationExportService } from './personal-publication-export.service';

@Controller('books/:bookId/publication-export')
export class PersonalPublicationExportController {
  constructor(private readonly service: PersonalPublicationExportService) {}

  @Get()
  readPage(
    @ShareToken() token: string,
    @Param('bookId') bookId: string,
    @Query('offset') rawOffset = '0',
    @Query('limit') rawLimit = '200',
    @Query('includeContent') rawIncludeContent = 'false',
    @Headers('if-match') expectedSnapshotHash?: string,
  ) {
    if (!/^(?:true|false)$/u.test(rawIncludeContent)) {
      throw new BadRequestException('includeContent 必须为 true 或 false');
    }
    const offset = Number(rawOffset);
    const limit = Number(rawLimit);
    return this.service.readPage({
      token,
      bookId,
      offset,
      limit,
      includeContent: rawIncludeContent === 'true',
      expectedSnapshotHash: expectedSnapshotHash?.trim() || undefined,
    });
  }
}
