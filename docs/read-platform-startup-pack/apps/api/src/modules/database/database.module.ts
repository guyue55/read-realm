import { Module, Global } from '@nestjs/common';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import * as path from 'path';

export const DRIZZLE = 'DRIZZLE_INSTANCE';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () => {
        const dbPath = path.resolve(process.cwd(), '../../data/app.sqlite');
        const client = createClient({ url: `file:${dbPath}` });
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
