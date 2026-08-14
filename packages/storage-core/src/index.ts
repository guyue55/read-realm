export { default as Dexie } from "dexie";
export { db, ReaderDatabase, backupMetadataToStorage, checkAndRestoreFromBackup, executeStorageGarbageCollection, setTransactionWriting, executeSafeWriteTransaction } from "./db.js";
export type { ImportTask, LocalMigrationBackup } from "./db.js";
export {
  META_SHELF_BACKUP_KEY,
  META_SHELF_RECOVERY_GAP_KEY,
  buildBrowserMetaShelfBackup,
  getMetaShelfBackupCompleteness,
  parseMetaShelfBackup,
  readMetaShelfRecoveryGap,
  writeBrowserMetaShelfBackup,
} from "./metadata-redundancy.js";
export type {
  MetaShelfBackup,
  MetadataBackupCompleteness,
  MetadataBackupResult,
  MetadataBackupWriteResult,
  MetadataRestoreResult,
} from "./metadata-redundancy.js";
export { shouldSweepLegacyImportTask } from "./import-task-retention.js";
export type { ImportTaskRetentionCandidate } from "./import-task-retention.js";
export {
  createImportTaskDraft,
  transitionImportTask,
} from "./import-task-lifecycle.js";
export type {
  CreateImportTaskDraftOptions,
  DurableImportTask,
  ImportFormat,
  ImportSourceKind,
  ImportTaskLifecycle,
  ImportTaskState,
  ImportTaskTransition,
} from "./import-task-lifecycle.js";
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
export {
  buildPreUpgradeSnapshot,
  describeLocalDataMigrationError,
} from "./dexie-migration-backup.js";
export type { PreUpgradeSnapshotInput } from "./dexie-migration-backup.js";
export {
  createLocalDataBackup,
  restoreLocalDataBackupToEmptyTarget,
} from "./local-backup-service.js";
export type {
  CreateLocalDataBackupOptions,
  LocalDataSnapshotRestoreTarget,
  RestoreLocalDataBackupOptions,
} from "./local-backup-service.js";
export {
  createPortableBackupPackage,
  inspectPortableBackupPackage,
} from "./portable-backup-package.js";
export type {
  PortableBackupManifestEntry,
  PortableBackupPackageV1,
  PortableBackupPreview,
} from "./portable-backup-package.js";
export {
  buildLocalDataMergePlan,
  localDataValueFingerprint,
} from "./local-merge-restore.js";
export type {
  BuildLocalDataMergePlanOptions,
  LocalDataMergeConflict,
  LocalDataMergePlan,
  LocalDataMergeResolution,
} from "./local-merge-restore.js";
export { executeLocalDataMergeRestore } from "./local-merge-restore-service.js";
export type {
  ExecuteLocalDataMergeRestoreOptions,
  LocalDataMergeRestoreTarget,
} from "./local-merge-restore-service.js";
export {
  createHumanNotesJsonExport,
  createHumanNotesMarkdownExport,
} from "./human-notes-export.js";
export type { CreateHumanNotesExportOptions } from "./human-notes-export.js";
export type {
  LocalDataMigrationResult,
  LocalDataMigrationStep,
  LocalDataMigrationStore,
  RecoverableLocalDataMigrationOptions,
} from "./local-data-migration.js";
