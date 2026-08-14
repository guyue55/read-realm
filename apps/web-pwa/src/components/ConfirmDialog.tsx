import React, { useState } from "react";
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
}

/**
 * ConfirmDialog - 极奢雅致国风拟物多端定制弹窗
 * 四周环绕古典双线折页边框，背景高斯模糊与暖米宣纸。
 * 针对 PC 宽屏及 PWA 移动端视口进行了 100% 物理自适应避让，支持触屏边缘安全距离。
 */
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
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // 物理执行确认，捕获异步状态，引入防抖
  const handleConfirm = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await onConfirm();
    } catch (err) {
      console.error("弹窗确认操作执行异常:", err);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  const handleCancel = () => {
    if (loading) return;
    if (onCancel) onCancel();
    onClose();
  };

  // 根据设计系统和操作危险等级，调配中式典雅配色
  const themeStyles = isDanger
    ? {
        accentColor: "bg-[#B86B5C] hover:bg-[#A64B3B] text-white shadow-[0_4px_12px_rgba(184,107,92,0.2)]",
        badgeBg: "bg-[#FFF0EC] text-[#B86B5C] border-[#FCE0DA]",
        badgeIcon: "印",
        defaultConfirmText: "决定",
        defaultCancelText: "作罢",
      }
    : {
        accentColor: "bg-[#5F7D52] hover:bg-[#4A6B40] text-white shadow-[0_4px_12px_rgba(95,125,82,0.2)]",
        badgeBg: "bg-[#EEF2E9] text-[#5F7D52] border-[#CDD8C5]",
        badgeIcon: "卷",
        defaultConfirmText: "善也",
        defaultCancelText: "免去",
      };

  return (
    <ReaderDialogSurface
      open={isOpen}
      label={title}
      onClose={handleCancel}
      fallbackFocus={() => null}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C2621]/45 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={handleCancel}
    >
      <div
        className="relative max-w-md w-full bg-[#FAF6EE] dark:bg-[#1E1B18] rounded-[24px] border border-[#DFD1BF] dark:border-[#3E352E] shadow-2xl p-6 md:p-8 animate-in zoom-in-95 duration-300 flex flex-col gap-5 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🏮 古典双线细描折页边框 */}
        <div className="absolute inset-3 rounded-[18px] border border-[#E9DCC8]/60 dark:border-[#2D2620]/60 pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          {/* 中式典雅印章 */}
          <div className={`w-11 h-11 rounded-full border flex items-center justify-center font-serif text-sm font-bold shadow-inner shrink-0 ${themeStyles.badgeBg}`}>
            <span>{themeStyles.badgeIcon}</span>
          </div>
          <div>
            <h3 className="text-lg font-bold font-serif text-[#2F2A24] dark:text-[#E8DFD8]">
              {title}
            </h3>
          </div>
        </div>

        {/* 弹窗核心说明正文 */}
        <p className="text-sm font-serif text-[#5C5446] dark:text-[#C5B9AD] leading-relaxed pl-1 whitespace-pre-line relative z-10">
          {message}
        </p>

        {/* 底部按钮栏 */}
        <div className="flex gap-3 justify-end mt-2 relative z-10">
          {!isAlert && (
            <button
              onClick={handleCancel}
              disabled={loading}
              data-reader-control
              className="reader-focus-ring min-h-11 px-5 py-2 bg-[rgba(80,65,45,0.04)] hover:bg-[rgba(80,65,45,0.08)] border border-[rgba(80,65,45,0.08)] text-[#6F665B] dark:text-[#A89F95] text-sm font-semibold rounded-full transition-all font-serif active:scale-95 disabled:opacity-50"
            >
              {cancelText || themeStyles.defaultCancelText}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            data-reader-control
            className={`reader-focus-ring min-h-11 px-6 py-2.5 text-sm font-semibold rounded-full transition-all font-serif active:scale-95 flex items-center justify-center min-w-[72px] disabled:opacity-50 ${themeStyles.accentColor}`}
          >
            {loading ? "雕印中..." : (confirmText || (isAlert ? "知晓" : themeStyles.defaultConfirmText))}
          </button>
        </div>
      </div>
    </ReaderDialogSurface>
  );
}
