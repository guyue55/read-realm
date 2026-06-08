export { default as Dexie } from "dexie";
export { db, ReaderDatabase, backupMetadataToStorage, checkAndRestoreFromBackup, executeStorageGarbageCollection, setTransactionWriting, executeSafeWriteTransaction } from "./db.js";
export type { LocalChapter, ImportTask, MetaShelfBackup } from "./db.js";
