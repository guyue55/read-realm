import type { ReactNode } from "react";

export interface SettingsCardProps {
  /** 卡片内容 */
  children: ReactNode;
  /** 是否带悬浮抬升效果（默认 true，与设置页原有交互一致） */
  hoverable?: boolean;
  /** 附加类名（透传到 section 外壳） */
  className?: string;
}

/**
 * 设置页统一卡片外壳：收敛 7 处重复的 ui-card + 圆角 + 阴影 + 悬浮效果。
 * 纯结构抽取，视觉输出与原内联写法一致（圆角取自 --radius-card 令牌；
 * 柔和暖色投影为刻意保留的专属设计签名，暂无对应令牌）。
 */
export function SettingsCard({
  children,
  hoverable = true,
  className = "",
}: SettingsCardProps) {
  const baseClasses =
    "ui-card rounded-[var(--radius-card)] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)]";
  const hoverableClasses = hoverable
    ? "hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring"
    : "";
  return (
    <section className={`${baseClasses} ${hoverableClasses} ${className}`}>
      {children}
    </section>
  );
}
