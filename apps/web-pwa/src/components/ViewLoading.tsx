import { LoaderCircle } from "lucide-react";

interface ViewLoadingProps {
  /** 加载提示文案 */
  label: string;
  /**
   * 静默占位模式：不渲染文字/旋转动画/无障碍广播。
   * 用于 next/dynamic 已预载分块的场景——组件解析仅差一帧，
   * 静默占位让切换瞬间内容直接就位，避免"正在打开…"闪烁（视觉刷新感）。
   * 真正的全量加载（如首冷启动、分块缺失）仍走有声模式提示用户。
   */
  silent?: boolean;
}

export function ViewLoading({ label, silent = false }: ViewLoadingProps) {
  if (silent) {
    return (
      <div
        aria-hidden="true"
        className="h-full w-full bg-[var(--color-background)]"
      />
    );
  }
  return (
    <div
      aria-live="polite"
      className="flex h-full min-h-64 w-full items-center justify-center bg-[var(--color-background)] px-6 text-[var(--color-muted)]"
      role="status"
    >
      <div className="flex items-center gap-3 text-sm">
        <LoaderCircle
          aria-hidden="true"
          className="h-5 w-5 animate-spin text-[var(--color-primary)]"
        />
        <span>{label}</span>
      </div>
    </div>
  );
}
