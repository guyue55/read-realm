import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { LibraryFolder } from '@reader/shared-types';
import { eq, like, or, not } from 'drizzle-orm';

@Injectable()
export class FolderRepository {
  constructor(
    @Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>,
  ) {}

  async getAllFolders(shareToken: string = 'default'): Promise<LibraryFolder[]> {
    const isDefault = shareToken === 'default';

    let dbFolders;
    if (isDefault) {
      dbFolders = await this.db
        .select()
        .from(schema.libraryFolders)
        .where(
          or(
            like(schema.libraryFolders.id, '%#default'),
            not(like(schema.libraryFolders.id, '%#%')),
          ),
        );
    } else {
      dbFolders = await this.db
        .select()
        .from(schema.libraryFolders)
        .where(like(schema.libraryFolders.id, `%#${shareToken}`));
    }

    // Strip out shareToken suffix from IDs
    return dbFolders.map((folder) => ({
      ...folder,
      id: folder.id.split('#')[0],
      parentId: folder.parentId ? folder.parentId.split('#')[0] : undefined,
    } as unknown as LibraryFolder));
  }

  async syncFolders(
    folders: LibraryFolder[],
    shareToken: string = 'default',
  ): Promise<void> {
    const isDefault = shareToken === 'default';

    await this.db.transaction(async (tx) => {
      for (const folder of folders) {
        const dbFolderId = isDefault ? folder.id : `${folder.id}#${shareToken}`;
        const dbParentId = folder.parentId
          ? (isDefault ? folder.parentId : `${folder.parentId}#${shareToken}`)
          : null;

        // 1. Delete if already exists to overwrite and guarantee idempotency
        await tx
          .delete(schema.libraryFolders)
          .where(eq(schema.libraryFolders.id, dbFolderId));

        // 2. Insert the fresh folder metadata
        await tx.insert(schema.libraryFolders).values({
          id: dbFolderId,
          name: folder.name,
          parentId: dbParentId,
          sourceId: folder.sourceId || null,
          sourceType: folder.sourceType,
          relativePath: folder.relativePath || null,
          depth: folder.depth ?? 0,
          sortOrder: folder.sortOrder ?? 0,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        });
      }
    });
  }

  async deleteFolder(folderId: string, shareToken: string = 'default'): Promise<void> {
    const isDefault = shareToken === 'default';
    const dbFolderId = isDefault ? folderId : `${folderId}#${shareToken}`;

    await this.db
      .delete(schema.libraryFolders)
      .where(eq(schema.libraryFolders.id, dbFolderId));
  }
}
