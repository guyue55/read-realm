import { Module } from '@nestjs/common';
import { createClient } from '@libsql/client';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  assertResolvedPublicLibraryStorageIsolation,
  resolvePublicLibraryBlobStoragePath,
  resolvePublicLibrarySqliteDbPath,
} from '../../common/blob-storage-path';
import { PublicLibraryController } from './public-library.controller';
import { PublicLibraryMaintenanceGuard } from './public-library-maintenance.guard';
import {
  preparePublicLibraryDatabase,
  PublicLibraryRepository,
} from './public-library.repository';
import { PublicLibraryService } from './public-library.service';

export const PUBLIC_LIBRARY_DB = Symbol('PUBLIC_LIBRARY_DB');
export const PUBLIC_LIBRARY_BLOB_STORAGE = Symbol(
  'PUBLIC_LIBRARY_BLOB_STORAGE',
);

@Module({
  controllers: [PublicLibraryController],
  providers: [
    PublicLibraryMaintenanceGuard,
    {
      provide: PUBLIC_LIBRARY_DB,
      useFactory: async () => {
        assertResolvedPublicLibraryStorageIsolation();
        const databasePath = resolvePublicLibrarySqliteDbPath();
        mkdirSync(dirname(databasePath), { recursive: true });
        const client = createClient({ url: `file:${databasePath}` });
        await preparePublicLibraryDatabase(client);
        return client;
      },
    },
    {
      provide: PUBLIC_LIBRARY_BLOB_STORAGE,
      useFactory: () => {
        assertResolvedPublicLibraryStorageIsolation();
        return new LocalFileBlobStorage(resolvePublicLibraryBlobStoragePath());
      },
    },
    {
      provide: PublicLibraryRepository,
      inject: [PUBLIC_LIBRARY_DB, PUBLIC_LIBRARY_BLOB_STORAGE],
      useFactory: (
        client: ReturnType<typeof createClient>,
        blobs: LocalFileBlobStorage,
      ) => new PublicLibraryRepository(client, blobs),
    },
    {
      provide: PublicLibraryService,
      inject: [PublicLibraryRepository],
      useFactory: (repository: PublicLibraryRepository) =>
        new PublicLibraryService(
          repository,
          process.env.READER_PUBLIC_LIBRARY_MAINTENANCE_KEY ?? '',
        ),
    },
  ],
})
export class PublicLibraryModule {}
