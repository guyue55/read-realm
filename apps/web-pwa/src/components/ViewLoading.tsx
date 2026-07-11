import { LoaderCircle } from "lucide-react";

export function ViewLoading({ label }: { label: string }) {
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
