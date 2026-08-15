import { Module } from '@nestjs/common';
import { createClient } from '@libsql/client';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  assertResolvedPublicLibraryStorageIsolation,
  resolveBlobStoragePath,
  resolvePublicLibraryBlobStoragePath,
  resolvePublicLibrarySqliteDbPath,
  resolveSqliteDbPath,
} from '../../common/blob-storage-path';
import { PublicLibraryController } from './public-library.controller';
import { PublicLibraryMaintenanceRootRegistry } from './public-library-maintenance-root-registry';
import { resolvePublicLibraryMaintenanceRoots } from './public-library-maintenance-roots';
import { PublicLibraryMaintenanceGuard } from './public-library-maintenance.guard';
import {
  preparePublicLibraryDatabase,
  PublicLibraryRepository,
} from './public-library.repository';
import { PublicLibraryService } from './public-library.service';
import { PublicLibraryScanController } from './public-library-scan.controller';
import { PublicLibraryScanRepository } from './public-library-scan.repository';
import {
  PublicLibraryScanner,
  resolvePublicLibraryScanLimits,
} from './public-library-scanner';

export const PUBLIC_LIBRARY_DB = Symbol('PUBLIC_LIBRARY_DB');
export const PUBLIC_LIBRARY_BLOB_STORAGE = Symbol(
  'PUBLIC_LIBRARY_BLOB_STORAGE',
);

@Module({
  controllers: [PublicLibraryController, PublicLibraryScanController],
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
    {
      provide: PublicLibraryMaintenanceRootRegistry,
      useFactory: async () => {
        const resolveRoots = async () =>
          resolvePublicLibraryMaintenanceRoots(
            process.env.READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS,
            {
              personalDatabasePath: resolveSqliteDbPath(),
              publicDatabasePath: resolvePublicLibrarySqliteDbPath(),
              personalBlobPath: resolveBlobStoragePath(),
              publicBlobPath: resolvePublicLibraryBlobStoragePath(),
            },
          );
        try {
          const resolved = await resolveRoots();
          return new PublicLibraryMaintenanceRootRegistry(
            resolved.roots,
            undefined,
            async () => (await resolveRoots()).roots,
          );
        } catch (error) {
          return new PublicLibraryMaintenanceRootRegistry(
            [],
            error instanceof Error ? error.message : 'ROOT_CONFIG_INVALID',
          );
        }
      },
    },
    {
      provide: PublicLibraryScanRepository,
      inject: [PUBLIC_LIBRARY_DB],
      useFactory: (client: ReturnType<typeof createClient>) =>
        new PublicLibraryScanRepository(client),
    },
    {
      provide: PublicLibraryScanner,
      inject: [
        PublicLibraryMaintenanceRootRegistry,
        PublicLibraryScanRepository,
        PublicLibraryRepository,
      ],
      useFactory: (
        roots: PublicLibraryMaintenanceRootRegistry,
        scans: PublicLibraryScanRepository,
        publisher: PublicLibraryRepository,
      ) =>
        new PublicLibraryScanner(
          roots,
          scans,
          publisher,
          resolvePublicLibraryScanLimits(),
        ),
    },
  ],
})
export class PublicLibraryModule {}
