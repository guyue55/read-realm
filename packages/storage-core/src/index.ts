export { default as Dexie } from "dexie";
export { db, ReaderDatabase, backupMetadataToStorage, checkAndRestoreFromBackup, executeStorageGarbageCollection, setTransactionWriting, executeSafeWriteTransaction } from "./db.js";
export type { ImportTask, MetaShelfBackup } from "./db.js";
export type { LocalChapter } from "@reader/shared-types";
export {
  parseLocalDataSnapshot,
  serializeLocalDataSnapshot,
} from "./local-snapshot.js";
export type {
  LocalDataSnapshotReader,
  LocalDataSnapshotWriter,
} from "./local-snapshot.js";
export { createProgressSaveCoordinator } from "./progress-save-coordinator.js";
export type {
  ProgressSaveCoordinator,
  ProgressSaveCoordinatorOptions,
  ProgressSaveStatus,
} from "./progress-save-coordinator.js";
export {
  createDefaultLocalDataMigrations,
  runRecoverableLocalDataMigration,
} from "./local-data-migration.js";
export type {
  LocalDataMigrationResult,
  LocalDataMigrationStep,
  LocalDataMigrationStore,
  RecoverableLocalDataMigrationOptions,
} from "./local-data-migration.js";
