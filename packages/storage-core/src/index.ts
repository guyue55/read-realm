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
