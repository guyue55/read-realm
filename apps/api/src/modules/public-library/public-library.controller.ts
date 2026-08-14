import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { parseBody } from '../../common/request-boundary';
import {
  PublicLibraryListQuerySchema,
  PublicLibraryUploadSchema,
} from './public-library.contract';
import { PublicLibraryService } from './public-library.service';

@Controller('public-library/books')
export class PublicLibraryController {
  constructor(private readonly service: PublicLibraryService) {}

  @Post()
  publish(
    @Headers('x-public-library-maintenance-key')
    maintenanceKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.publish(
      maintenanceKey,
      parseBody(PublicLibraryUploadSchema, body),
    );
  }

  @Get()
  list(@Query() query: unknown) {
    const parsed = PublicLibraryListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.service.list(parsed.data);
  }

  @Get(':id/package')
  getPackage(@Param('id') id: string) {
    return this.service.getPackage(id);
  }
}
