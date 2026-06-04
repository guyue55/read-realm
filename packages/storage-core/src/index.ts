export { default as Dexie } from "dexie";
export { db, ReaderDatabase, backupMetadataToStorage, checkAndRestoreFromBackup, executeStorageGarbageCollection } from "./db.js";
export type { LocalChapter, ImportTask, MetaShelfBackup } from "./db.js";
