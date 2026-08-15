import type { ReactNode } from "react";
import { CircleAlert, Inbox, LoaderCircle } from "lucide-react";

export interface StatePanelProps {
  action?: ReactNode;
  description?: string;
  kind: "loading" | "empty" | "error";
  title: string;
}

export function StatePanel({
  action,
  description,
  kind,
  title,
}: StatePanelProps) {
  const Icon =
    kind === "loading" ? LoaderCircle : kind === "error" ? CircleAlert : Inbox;

  return (
    <div
      className="ui-card flex min-h-40 flex-col items-center justify-center rounded-[var(--radius-card)] px-5 py-10 text-center"
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon
        aria-hidden="true"
        className={`h-6 w-6 text-[var(--color-muted)] ${kind === "loading" ? "animate-spin" : ""}`}
        strokeWidth={1.75}
      />
      <h2 className="mt-3 [font-family:var(--font-display)] text-base font-semibold text-[var(--color-text)]">
        {title}
      </h2>
      {description && (
        <p className="mt-1 max-w-md text-sm leading-6 text-[var(--color-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
