import { describe, expect, it } from "vitest";
import { describeAppError } from "./i18n";

describe("import error guidance", () => {
  it("turns browser quota failures into an actionable local recovery step", () => {
    expect(describeAppError(new DOMException("quota", "QuotaExceededError"))).toBe(
      "本地存储空间不足。请释放浏览器空间或删除不需要的本地缓存，然后使用原草稿重试。",
    );
  });

  it("turns directory permission loss into a reauthorization step", () => {
    expect(describeAppError(new DOMException("denied", "NotAllowedError"))).toBe(
      "本地目录权限已拒绝或失效。请重新选择并授权原目录，任务草稿会继续保留。",
    );
  });

  it("turns worker termination into retry-or-reselect guidance", () => {
    expect(describeAppError("FORCED_WORKER_TERMINATION")).toBe(
      "后台解析引擎已中断。请先点击“立即重试”；若再次失败，请重新选择原文件。",
    );
  });
});
