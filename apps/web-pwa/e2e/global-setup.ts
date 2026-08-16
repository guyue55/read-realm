import { DatabaseSync } from "node:sqlite";
import path from "node:path";

/**
 * 在每次 e2e 套件运行前，清空共享的公共藏经阁 SQLite 数据表（保留 schema）。
 *
 * 公共藏经阁测试（EXP-14、server-scan、taxonomy 等）会在共享库中累积固定内容，
 * 二次运行时会产生 `public_editions.edition_hash` 唯一约束冲突或「新入阁 0 / 已存在 N」
 * 之类的状态漂移。这里仅 DELETE 表数据（不删除库文件），保证 schema 仍由 API 正常识别，
 * 避免历史上「删除库文件后 API 建不出 schema」的 0 字节库问题。
 */
export default function globalSetup() {
  const dbPath = path.resolve(__dirname, "../../../.tmp/e2e/public-library.sqlite");
  const database = new DatabaseSync(dbPath);

  try {
    database.exec("PRAGMA foreign_keys = OFF;");
    // 清理策略：
    // 1. FTS5 虚拟表（public_books_search_v3*）不可直接 DELETE，
    //    会破坏 fts5 影子表结构导致 API 启动时 vtable constructor failed；FTS 内容在
    //    每次入阁/重建时由应用自动重建，故不清理。
    // 2. 基础字典表（maintainers/categories/tags/taxonomy_state/catalog_state）由 API 启动时
    //    bootstrap 注册（固定 key/固定分类），并非测试累积数据；若删除会导致
    //    PUBLIC_LIBRARY_MAINTAINER_ID_MISSING 等 500。globalSetup 在 webServer 启动之后运行，
    //    无法重建这些字典，因此保留。
    // 3. 只清理测试累积的内容数据表。
    const tables = [
      "public_book_search_terms",
      "public_book_tags",
      "public_ingest_receipts",
      "public_scan_items",
      "public_scan_root_state",
      "public_scan_source_state",
      "public_scan_generations",
      "public_sources",
      "public_editions",
      "public_books",
    ];
    for (const table of tables) {
      try {
        database.exec(`DELETE FROM ${table};`);
      } catch (error) {
        // FTS5 影子表无法直接 DELETE（历史 0 字节/格式差异时），由 API 重建。
        console.warn(`[global-setup] skip cleaning ${table}: ${String(error).slice(0, 80)}`);
      }
    }
    database.exec("PRAGMA foreign_keys = ON;");
  } finally {
    database.close();
  }
}
