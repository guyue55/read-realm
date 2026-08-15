import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  accessibleLabel?: string;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string> {
  className?: string;
  label: string;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  value: T;
}

export function SegmentedControl<T extends string>({
  className = "",
  label,
  onChange,
  options,
  value,
}: SegmentedControlProps<T>) {
  return (
    <div
      aria-label={label}
      className={`grid min-h-11 gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1 ${className}`}
      role="group"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const accessibleLabel = option.accessibleLabel ?? option.label;

        return (
          <button
            aria-label={accessibleLabel}
            aria-pressed={selected}
            className={`ui-focus-ring flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={accessibleLabel !== option.label ? accessibleLabel : undefined}
            type="button"
          >
            {option.icon && (
              <span aria-hidden="true" className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">
                {option.icon}
              </span>
            )}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
