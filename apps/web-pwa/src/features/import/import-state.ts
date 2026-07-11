export type ImportPhase = "idle" | "reading" | "parsing" | "preview" | "saving" | "failed";

export interface ImportState {
  phase: ImportPhase;
  taskId: string | null;
  message: string;
  canRetry: boolean;
}

export type ImportAction =
  | { type: "start" }
  | { type: "parsing"; taskId?: string }
  | { type: "preview"; taskId: string }
  | { type: "saving" }
  | { type: "failed"; error: unknown }
  | { type: "reset" };

export const INITIAL_IMPORT_STATE: ImportState = {
  phase: "idle",
  taskId: null,
  message: "等待导入",
  canRetry: false,
};

export function toImportFailure(error: unknown): {
  title: string;
  detail: string;
  canRetry: boolean;
} {
  const detail = error instanceof Error ? error.message : String(error || "未知错误");
  const cancelled = /cancel|abort|取消/i.test(detail);
  return { title: cancelled ? "导入已取消" : "导入失败", detail, canRetry: !cancelled };
}

export function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case "start":
      return { ...state, phase: "reading", message: "正在读取文件", canRetry: false };
    case "parsing":
      return { ...state, phase: "parsing", taskId: action.taskId ?? state.taskId, message: "正在解析章节", canRetry: false };
    case "preview":
      return { phase: "preview", taskId: action.taskId, message: "解析完成", canRetry: false };
    case "saving":
      return { ...state, phase: "saving", message: "正在保存", canRetry: false };
    case "failed": {
      const failure = toImportFailure(action.error);
      return { ...state, phase: "failed", message: failure.detail, canRetry: failure.canRetry };
    }
    case "reset":
      return INITIAL_IMPORT_STATE;
  }
}
