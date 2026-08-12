import {
  LocalDataSnapshotEnvelopeSchema,
  type LocalDataSnapshotEnvelope,
} from "@reader/shared-types";
import {
  parseLocalDataSnapshot,
  serializeLocalDataSnapshot,
} from "./local-snapshot.js";

export interface LocalDataMigrationStore {
  readCurrent(): Promise<LocalDataSnapshotEnvelope>;
  replaceCurrent(snapshot: LocalDataSnapshotEnvelope): Promise<void>;
  saveBackup(serializedSnapshot: string): Promise<void>;
  readBackup(): Promise<string | null>;
}

export interface LocalDataMigrationStep {
  fromVersion: number;
  toVersion: number;
  migrate(
    snapshot: LocalDataSnapshotEnvelope,
  ): LocalDataSnapshotEnvelope | Promise<LocalDataSnapshotEnvelope>;
}

export type LocalDataMigrationResult =
  | {
      status: "already_current";
      fromVersion: number;
      toVersion: number;
      backupVerified: false;
    }
  | {
      status: "migrated";
      fromVersion: number;
      toVersion: number;
      backupVerified: true;
    };

export interface RecoverableLocalDataMigrationOptions {
  store: LocalDataMigrationStore;
  targetDatabaseVersion: number;
  migrations: readonly LocalDataMigrationStep[];
  verifyMigrated?: (
    snapshot: LocalDataSnapshotEnvelope,
  ) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertSameSnapshot(
  actual: LocalDataSnapshotEnvelope,
  expected: LocalDataSnapshotEnvelope,
  errorCode: string,
) {
  if (
    serializeLocalDataSnapshot(actual) !== serializeLocalDataSnapshot(expected)
  ) {
    throw new Error(errorCode);
  }
}

function resolveMigrationPath(
  fromVersion: number,
  toVersion: number,
  migrations: readonly LocalDataMigrationStep[],
): LocalDataMigrationStep[] {
  const path: LocalDataMigrationStep[] = [];
  let version = fromVersion;
  const seen = new Set<number>();

  while (version < toVersion) {
    if (seen.has(version)) {
      throw new Error(`LOCAL_DATA_MIGRATION_CYCLE:${version}`);
    }
    seen.add(version);
    const step = migrations.find(
      (candidate) => candidate.fromVersion === version,
    );
    if (!step || step.toVersion <= version || step.toVersion > toVersion) {
      throw new Error(
        `LOCAL_DATA_MIGRATION_PATH_MISSING:${version}:${toVersion}`,
      );
    }
    path.push(step);
    version = step.toVersion;
  }

  return path;
}

export function createDefaultLocalDataMigrations(): LocalDataMigrationStep[] {
  return [
    {
      fromVersion: 8,
      toVersion: 9,
      migrate(snapshot) {
        return LocalDataSnapshotEnvelopeSchema.parse({
          ...snapshot,
          source: {
            ...snapshot.source,
            databaseVersion: 9,
          },
        });
      },
    },
  ];
}

export async function runRecoverableLocalDataMigration({
  store,
  targetDatabaseVersion,
  migrations,
  verifyMigrated,
}: RecoverableLocalDataMigrationOptions): Promise<LocalDataMigrationResult> {
  const original = LocalDataSnapshotEnvelopeSchema.parse(
    await store.readCurrent(),
  );
  const fromVersion = original.source.databaseVersion;

  if (fromVersion === targetDatabaseVersion) {
    return {
      status: "already_current",
      fromVersion,
      toVersion: targetDatabaseVersion,
      backupVerified: false,
    };
  }
  if (fromVersion > targetDatabaseVersion) {
    throw new Error(
      `LOCAL_DATA_MIGRATION_DOWNGRADE_FORBIDDEN:${fromVersion}:${targetDatabaseVersion}`,
    );
  }

  const path = resolveMigrationPath(
    fromVersion,
    targetDatabaseVersion,
    migrations,
  );
  const serializedBackup = serializeLocalDataSnapshot(original);
  await store.saveBackup(serializedBackup);
  const backupReadback = await store.readBackup();

  let replacementAttempted = false;
  try {
    if (backupReadback !== serializedBackup) {
      throw new Error("LOCAL_DATA_MIGRATION_BACKUP_VERIFICATION_FAILED");
    }
    assertSameSnapshot(
      parseLocalDataSnapshot(backupReadback),
      original,
      "LOCAL_DATA_MIGRATION_BACKUP_VERIFICATION_FAILED",
    );
  } catch {
    throw new Error("LOCAL_DATA_MIGRATION_BACKUP_VERIFICATION_FAILED");
  }

  try {
    let migrated = original;
    for (const step of path) {
      migrated = LocalDataSnapshotEnvelopeSchema.parse(
        await step.migrate(migrated),
      );
      if (migrated.source.databaseVersion !== step.toVersion) {
        throw new Error(
          `LOCAL_DATA_MIGRATION_STEP_VERSION_INVALID:${step.fromVersion}:${step.toVersion}`,
        );
      }
    }

    replacementAttempted = true;
    await store.replaceCurrent(migrated);
    if (verifyMigrated) {
      await verifyMigrated(migrated);
    } else {
      assertSameSnapshot(
        LocalDataSnapshotEnvelopeSchema.parse(await store.readCurrent()),
        migrated,
        "LOCAL_DATA_MIGRATION_POST_WRITE_VERIFICATION_FAILED",
      );
    }

    return {
      status: "migrated",
      fromVersion,
      toVersion: targetDatabaseVersion,
      backupVerified: true,
    };
  } catch (migrationError) {
    if (!replacementAttempted) {
      throw new Error(
        `LOCAL_DATA_MIGRATION_FAILED_BEFORE_WRITE:${errorMessage(migrationError)}`,
      );
    }
    try {
      const rollbackSerialized = await store.readBackup();
      if (rollbackSerialized !== serializedBackup) {
        throw new Error("LOCAL_DATA_MIGRATION_ROLLBACK_BACKUP_CHANGED");
      }
      const rollbackSnapshot = parseLocalDataSnapshot(rollbackSerialized);
      await store.replaceCurrent(rollbackSnapshot);
      assertSameSnapshot(
        LocalDataSnapshotEnvelopeSchema.parse(await store.readCurrent()),
        original,
        "LOCAL_DATA_MIGRATION_ROLLBACK_VERIFICATION_FAILED",
      );
    } catch (rollbackError) {
      throw new Error(
        `LOCAL_DATA_MIGRATION_FAILED_ROLLBACK_FAILED:${errorMessage(migrationError)}:${errorMessage(rollbackError)}`,
      );
    }
    throw new Error(
      `LOCAL_DATA_MIGRATION_FAILED_ROLLED_BACK:${errorMessage(migrationError)}`,
    );
  }
}
