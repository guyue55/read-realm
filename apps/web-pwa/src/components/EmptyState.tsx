import React from "react";
import { BookPlus } from "lucide-react";

export interface EmptyStateAction {
  label: string;
  accessibleLabel?: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  const primary = primaryAction ??
    (actionLabel && onAction ? { label: actionLabel, onClick: onAction } : undefined);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-[var(--radius-card)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 text-center text-[var(--ui-text)] shadow-[var(--ui-shadow-sm)] sm:p-10">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]">
        <BookPlus aria-hidden="true" size={22} />
      </div>
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <p className="text-[#6F665B] mb-6 text-sm text-center max-w-sm">
        {description}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {primary && (
          <button aria-label={primary.accessibleLabel} onClick={primary.onClick} className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] bg-[var(--ui-accent)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)]">
            {primary.label}
          </button>
        )}
        {secondaryAction && (
          <button aria-label={secondaryAction.accessibleLabel} onClick={secondaryAction.onClick} className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] border border-[var(--ui-border)] bg-white/70 px-5 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white">
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
