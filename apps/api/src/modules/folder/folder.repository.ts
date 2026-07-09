import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { LibraryFolder } from '@reader/shared-types';
import { eq, like, or, not } from 'drizzle-orm';
import {
  DEFAULT_SHARE_TOKEN,
  isScopedToShare,
  stripScopedId,
  toScopedId,
} from '../../common/request-boundary';

@Injectable()
export class FolderRepository {
  constructor(@Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>) {}

  async getAllFolders(
    shareToken: string = DEFAULT_SHARE_TOKEN,
  ): Promise<LibraryFolder[]> {
    const isDefault = shareToken === DEFAULT_SHARE_TOKEN;

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
      const allFolders = await this.db.select().from(schema.libraryFolders);
      dbFolders = allFolders.filter((folder) =>
        isScopedToShare(folder.id, shareToken),
      );
    }

    // Strip out shareToken suffix from IDs
    return dbFolders.map(
      (folder) =>
        ({
          ...folder,
          id: stripScopedId(folder.id),
          parentId: folder.parentId
            ? stripScopedId(folder.parentId)
            : undefined,
        }) as unknown as LibraryFolder,
    );
  }

  async syncFolders(
    folders: LibraryFolder[],
    shareToken: string = DEFAULT_SHARE_TOKEN,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const folder of folders) {
        const dbFolderId = toScopedId(folder.id, shareToken);
        const dbParentId = folder.parentId
          ? toScopedId(folder.parentId, shareToken)
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

  async deleteFolder(
    folderId: string,
    shareToken: string = DEFAULT_SHARE_TOKEN,
  ): Promise<void> {
    const dbFolderId = toScopedId(folderId, shareToken);

    await this.db
      .delete(schema.libraryFolders)
      .where(eq(schema.libraryFolders.id, dbFolderId));
  }
}
