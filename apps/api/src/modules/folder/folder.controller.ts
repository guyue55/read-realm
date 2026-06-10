import { Controller, Post, Body, Delete, Param, Get } from '@nestjs/common';
import { FolderRepository } from './folder.repository';
import { LibraryFolder } from '@reader/shared-types';
import { ShareToken } from '../../common/decorators/share-token.decorator';

@Controller('folders')
export class FolderController {
  constructor(private readonly folderRepository: FolderRepository) {}

  @Get()
  async getFolders(@ShareToken() token: string) {
    return this.folderRepository.getAllFolders(token);
  }

  @Post()
  async syncFolders(
    @ShareToken() token: string,
    @Body() body: { folders: LibraryFolder[] },
  ) {
    await this.folderRepository.syncFolders(body.folders, token);
    return { success: true };
  }

  @Delete(':id')
  async deleteFolder(@ShareToken() token: string, @Param('id') id: string) {
    await this.folderRepository.deleteFolder(id, token);
    return { success: true };
  }
}
