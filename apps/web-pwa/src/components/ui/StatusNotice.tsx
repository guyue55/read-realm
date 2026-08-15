import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusNoticeProps {
  children: ReactNode;
  className?: string;
  title?: string;
  tone?: StatusTone;
}

const TONE_STYLES: Record<StatusTone, string> = {
  neutral:
    "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text)]",
  info: "border-[var(--color-info)]/30 bg-[var(--color-info-soft)] text-[var(--color-info)]",
  success:
    "border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
  warning:
    "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  danger:
    "border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
};

const TONE_ICONS = {
  neutral: CircleCheck,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} satisfies Record<StatusTone, typeof Info>;

export function StatusNotice({
  children,
  className = "",
  title,
  tone = "neutral",
}: StatusNoticeProps) {
  const Icon = TONE_ICONS[tone];
  const urgent = tone === "warning" || tone === "danger";

  return (
    <div
      aria-live={urgent ? "assertive" : "polite"}
      className={`flex items-start gap-3 rounded-[var(--radius-card)] border px-3 py-2.5 text-sm ${TONE_STYLES[tone]} ${className}`}
      role={urgent ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 leading-6">
        {title && (
          <p className="font-semibold text-[var(--color-text)]">{title}</p>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}
