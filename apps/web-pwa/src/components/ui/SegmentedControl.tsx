import { useRef, type KeyboardEvent, type ReactNode } from "react";

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
  panelId?: string;
  semantics?: "group" | "tabs";
  value: T;
}

export function SegmentedControl<T extends string>({
  className = "",
  label,
  onChange,
  options,
  panelId,
  semantics = "group",
  value,
}: SegmentedControlProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const columns =
    options.length === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : options.length === 3
        ? "grid-cols-3"
        : "grid-cols-2";

  const selectTab = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    buttonRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (semantics !== "tabs") return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const enabledIndices = options.flatMap((option, index) =>
      option.disabled ? [] : [index],
    );
    if (enabledIndices.length === 0) return;
    event.preventDefault();
    const currentIndex = options.findIndex((option) => option.value === value);
    const currentEnabledIndex = Math.max(
      0,
      enabledIndices.indexOf(currentIndex),
    );
    const nextIndex =
      event.key === "Home"
        ? enabledIndices[0]
        : event.key === "End"
          ? enabledIndices.at(-1)
          : event.key === "ArrowRight"
            ? enabledIndices[(currentEnabledIndex + 1) % enabledIndices.length]
            : enabledIndices[
                (currentEnabledIndex - 1 + enabledIndices.length) %
                  enabledIndices.length
              ];
    if (nextIndex !== undefined) selectTab(nextIndex);
  };

  return (
    <div
      aria-label={label}
      className={`grid min-h-11 gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1 ${columns} ${className}`}
      role={semantics === "tabs" ? "tablist" : "group"}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const accessibleLabel = option.accessibleLabel ?? option.label;

        return (
          <button
            aria-label={accessibleLabel}
            aria-controls={semantics === "tabs" ? panelId : undefined}
            aria-pressed={semantics === "group" ? selected : undefined}
            aria-selected={semantics === "tabs" ? selected : undefined}
            className={`ui-focus-ring flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={handleTabKeyDown}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            role={semantics === "tabs" ? "tab" : undefined}
            tabIndex={semantics === "tabs" ? (selected ? 0 : -1) : undefined}
            title={
              accessibleLabel !== option.label ? accessibleLabel : undefined
            }
            type="button"
          >
            {option.icon && (
              <span
                aria-hidden="true"
                className="shrink-0 [&>svg]:h-4 [&>svg]:w-4"
              >
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
