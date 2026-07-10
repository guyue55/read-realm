import { Global, Module } from '@nestjs/common';
import { createClient, type ResultSet } from '@libsql/client';
import type { SQL } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { resolveSqliteDbPath } from '../../common/blob-storage-path';
import { prepareDatabase } from './database-bootstrap';

export const DRIZZLE = 'DRIZZLE_INSTANCE';
export type Database = LibSQLDatabase<typeof schema> & {
  execute: (query: SQL | string) => Promise<ResultSet>;
};

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: async () => {
        const dbPath = resolveSqliteDbPath();
        const client = createClient({ url: `file:${dbPath}` });

        try {
          const preparation = await prepareDatabase(client);
          console.info('[SQLite DB] preparation complete', preparation);
          return drizzle(client, { schema });
        } catch (error) {
          client.close();
          throw error;
        }
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
