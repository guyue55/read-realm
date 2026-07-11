import { describe, expect, it } from "vitest";
import { INITIAL_IMPORT_STATE, importReducer, toImportFailure } from "./import-state";

describe("importReducer", () => {
  it("keeps the task and allows retry after a parsing failure", () => {
    const parsing = importReducer(INITIAL_IMPORT_STATE, { type: "parsing", taskId: "task-1" });
    const failed = importReducer(parsing, { type: "failed", error: new Error("编码无法识别") });
    expect(failed).toMatchObject({ phase: "failed", taskId: "task-1", canRetry: true });
  });

  it("does not offer retry after explicit cancellation", () => {
    expect(toImportFailure(new Error("用户取消操作"))).toMatchObject({ title: "导入已取消", canRetry: false });
  });
});
