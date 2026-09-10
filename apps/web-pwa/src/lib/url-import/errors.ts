/**
 * @file errors.ts
 * @description URL 导入模块统一错误类型。
 *
 * 独立成文件：避免 index（编排层）与抓取器/手动协助之间的循环依赖。
 * UrlImportError 带稳定错误码，供导入任务状态机、手动协助判定与用户提示映射。
 */

/** URL 导入错误（带稳定错误码，供导入任务状态机与用户提示映射） */
export class UrlImportError extends Error {
  constructor(
    message: string,
    readonly code: string = "URL_PARSE_FAILED",
  ) {
    super(message);
    this.name = "UrlImportError";
  }
}
