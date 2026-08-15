import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

type IconButtonTone = "default" | "primary" | "danger";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  icon: ReactNode;
  label: string;
  loading?: boolean;
  tone?: IconButtonTone;
  tooltip?: string;
}

const TONE_CLASSES: Record<IconButtonTone, string> = {
  default:
    "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
  primary:
    "border-[var(--color-primary)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)]",
  danger:
    "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white",
};

export function IconButton({
  className = "",
  disabled,
  icon,
  label,
  loading = false,
  tone = "default",
  tooltip = label,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      aria-busy={loading || undefined}
      aria-label={label}
      className={`ui-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:stroke-[1.75] ${TONE_CLASSES[tone]} ${className}`}
      disabled={disabled || loading}
      title={tooltip}
      type={type}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : icon}
    </button>
  );
}
