import { Module } from '@nestjs/common';
import { FolderController } from './folder.controller';
import { FolderRepository } from './folder.repository';

@Module({
  controllers: [FolderController],
  providers: [FolderRepository],
  exports: [FolderRepository],
})
export class FolderModule {}
