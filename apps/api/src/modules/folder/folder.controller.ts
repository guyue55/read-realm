import { Controller, Post, Body, Delete, Param, Get } from '@nestjs/common';
import { FolderRepository } from './folder.repository';
import { ShareToken } from '../../common/decorators/share-token.decorator';
import {
  SyncFoldersBodySchema,
  parseBody,
} from '../../common/request-boundary';

@Controller('folders')
export class FolderController {
  constructor(private readonly folderRepository: FolderRepository) {}

  @Get()
  async getFolders(@ShareToken() token: string) {
    return this.folderRepository.getAllFolders(token);
  }

  @Post()
  async syncFolders(@ShareToken() token: string, @Body() body: unknown) {
    const payload = parseBody(SyncFoldersBodySchema, body);
    const folders = payload.folders.map((folder) => ({
      ...folder,
      depth: folder.depth ?? 0,
      sortOrder: folder.sortOrder ?? 0,
    }));
    await this.folderRepository.syncFolders(folders, token);
    return { success: true };
  }

  @Delete(':id')
  async deleteFolder(@ShareToken() token: string, @Param('id') id: string) {
    await this.folderRepository.deleteFolder(id, token);
    return { success: true };
  }
}
