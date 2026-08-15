"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";

export type AppToastTone = "neutral" | "success" | "warning" | "danger";

export interface AppToastProps {
  message: string;
  onDismiss?: () => void;
  tone?: AppToastTone;
}

interface AppToastState {
  id: number;
  message: string;
  tone: AppToastTone;
}

interface AppToastContextValue {
  dismissToast: () => void;
  showToast: (
    message: string,
    tone?: AppToastTone,
    durationMs?: number | null,
  ) => void;
}

const AppToastContext = createContext<AppToastContextValue | null>(null);

const TOAST_TONE = {
  neutral: "border-[var(--color-border)] text-[var(--color-text)]",
  success: "border-[var(--color-primary)]/30 text-[var(--color-primary)]",
  warning: "border-[var(--color-warning)]/30 text-[var(--color-warning)]",
  danger: "border-[var(--color-danger)]/30 text-[var(--color-danger)]",
} satisfies Record<AppToastTone, string>;

const TOAST_ICON = {
  neutral: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} satisfies Record<AppToastTone, typeof Info>;

export function AppToast({
  message,
  onDismiss,
  tone = "neutral",
}: AppToastProps) {
  if (!message) return null;
  const Icon = TOAST_ICON[tone];

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[70] flex justify-center md:bottom-6 md:left-auto md:right-6">
      <div
        aria-atomic="true"
        aria-live={tone === "danger" ? "assertive" : "polite"}
        className={`pointer-events-none flex max-w-xl items-center gap-3 rounded-[var(--radius-card)] border bg-[var(--color-surface)] px-4 py-2 text-sm shadow-[var(--shadow-raised)] ${TOAST_TONE[tone]}`}
        role={tone === "danger" ? "alert" : "status"}
      >
        <Icon
          aria-hidden="true"
          className="h-[18px] w-[18px] shrink-0"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 leading-6">{message}</span>
        {onDismiss && (
          <button
            aria-label="关闭提示"
            className="ui-focus-ring pointer-events-auto -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
            onClick={onDismiss}
            type="button"
          >
            <X
              aria-hidden="true"
              className="h-[18px] w-[18px]"
              strokeWidth={1.75}
            />
          </button>
        )}
      </div>
    </div>
  );
}

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<AppToastState | null>(null);
  const timerRef = useRef<number | null>(null);
  const toastIdRef = useRef(0);

  const dismissToast = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (
      message: string,
      tone: AppToastTone = "neutral",
      durationMs: number | null = tone === "danger" || tone === "warning"
        ? null
        : 4000,
    ) => {
      if (!message) {
        dismissToast();
        return;
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      const id = ++toastIdRef.current;
      setToast({ id, message, tone });
      timerRef.current =
        durationMs === null
          ? null
          : window.setTimeout(() => {
              setToast((current) => (current?.id === id ? null : current));
              timerRef.current = null;
            }, durationMs);
    },
    [dismissToast],
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <AppToastContext.Provider value={{ dismissToast, showToast }}>
      {children}
      {toast && (
        <AppToast
          message={toast.message}
          onDismiss={dismissToast}
          tone={toast.tone}
        />
      )}
    </AppToastContext.Provider>
  );
}

export function useAppToast(): AppToastContextValue {
  const context = useContext(AppToastContext);
  if (!context) {
    throw new Error("useAppToast must be used within AppToastProvider");
  }
  return context;
}
