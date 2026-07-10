import { describe, expect, it } from "vitest";
import { PRODUCT_LANGUAGE } from "./product-language";

describe("PRODUCT_LANGUAGE", () => {
  it("诗意操作同时提供白话含义", () => {
    expect(PRODUCT_LANGUAGE.actions.importBook).toEqual({
      label: "纳书入阁",
      plain: "导入书籍",
    });
    expect(PRODUCT_LANGUAGE.actions.continueReading).toEqual({
      label: "继续展卷",
      plain: "继续阅读",
    });
    expect(PRODUCT_LANGUAGE.actions.writeNote).toEqual({
      label: "落墨",
      plain: "写笔记",
    });
  });

  it("危险操作使用明确中文", () => {
    expect(PRODUCT_LANGUAGE.actions.deleteBook).toEqual({
      label: "删除书籍",
      plain: "删除书籍及本地章节",
    });
  });
});
