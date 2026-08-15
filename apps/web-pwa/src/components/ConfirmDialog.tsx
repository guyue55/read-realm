import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ReaderDialogSurface } from "@/components/reader/ReaderDialogSurface";

export interface ConfirmDialogProps {
  /** 弹窗是否开启 */
  isOpen: boolean;
  /** 弹窗标题 */
  title: string;
  /** 弹窗说明内容，支持 \n 换行 */
  message: string;
  /** 确认按钮的文案 */
  confirmText?: string;
  /** 取消按钮的文案 */
  cancelText?: string;
  /** 是否为危险操作（朱砂红警告系 vs 儒雅松绿常规系） */
  isDanger?: boolean;
  /** 是否仅为 Alert 警告形态（单按钮“知晓/谢过”模式） */
  isAlert?: boolean;
  /** 确认回调，支持异步函数以开启防抖 loading */
  onConfirm: () => void | Promise<void>;
  /** 取消/作罢回调 */
  onCancel?: () => void;
  /** 关闭弹窗的物理动作 */
  onClose: () => void;
  /** 触发控件消失时的安全焦点落点 */
  fallbackFocus?: () => HTMLElement | null;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  isDanger = false,
  isAlert = false,
  onConfirm,
  onCancel,
  onClose,
  fallbackFocus,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (isOpen) setErrorMessage("");
  }, [isOpen]);

  const handleConfirm = async () => {
    if (loading) return;
    try {
      setErrorMessage("");
      setLoading(true);
      await onConfirm();
      onClose();
    } catch (err) {
      console.error("弹窗确认操作执行异常:", err);
      setErrorMessage("操作未完成，请检查当前状态后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    if (onCancel) onCancel();
    onClose();
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <ReaderDialogSurface
      open={isOpen}
      label={title}
      onClose={handleCancel}
      fallbackFocus={
        fallbackFocus ??
        (() => document.querySelector<HTMLElement>("main, [data-app-main]"))
      }
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#25231f]/40 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      data-ui-confirm-dialog="true"
      onClick={handleCancel}
    >
      <div
        className="flex max-h-[min(78vh,560px)] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-[var(--radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 text-left shadow-[var(--shadow-raised)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="[font-family:var(--font-display)] text-lg font-semibold text-[var(--ui-text)]">
          {title}
        </h2>
        <p className="whitespace-pre-line text-sm leading-6 text-[var(--ui-muted)]">
          {message}
        </p>
        {errorMessage && (
          <p className="rounded-[var(--radius-control)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-3">
          {!isAlert && (
            <button
              onClick={handleCancel}
              disabled={loading}
              data-reader-control
              className="ui-focus-ring min-h-11 min-w-11 rounded-[var(--radius-control)] border border-[var(--ui-border)] bg-white/70 px-5 text-sm font-semibold text-[var(--ui-muted)] disabled:opacity-50"
              type="button"
            >
              {cancelText || "取消"}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            data-reader-control
            className={`ui-focus-ring inline-flex min-h-11 min-w-20 items-center justify-center rounded-[var(--radius-control)] px-5 text-sm font-semibold text-white disabled:opacity-50 ${
              isDanger
                ? "bg-[var(--color-danger)]"
                : "bg-[var(--ui-accent)]"
            }`}
            type="button"
          >
            {loading ? "处理中…" : (confirmText || (isAlert ? "知道了" : "确认"))}
          </button>
        </div>
      </div>
    </ReaderDialogSurface>,
    document.body,
  );
}
