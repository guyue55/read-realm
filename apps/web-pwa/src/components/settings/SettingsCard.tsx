import type { ReactNode } from "react";

export interface SettingsCardProps {
  /** 卡片内容 */
  children: ReactNode;
  /** 是否带悬浮抬升效果（默认 true，与设置页原有交互一致） */
  interactive?: boolean;
  /** 附加类名（透传到 section 外壳） */
  className?: string;
}

/**
 * 设置页统一卡片外壳：收敛 7 处重复的 ui-card + 圆角 + 阴影 + 悬浮效果。
 * 纯结构抽取，视觉输出与原内联写法一致。
 */
export function SettingsCard({
  children,
  interactive = true,
  className = "",
}: SettingsCardProps) {
  const baseClasses =
    "ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)]";
  const interactiveClasses = interactive
    ? "hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring"
    : "";
  return (
    <section className={`${baseClasses} ${interactiveClasses} ${className}`}>
      {children}
    </section>
  );
}
