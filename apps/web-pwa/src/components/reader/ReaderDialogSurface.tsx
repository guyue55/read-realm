"use client";

import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => (
      element.getClientRects().length > 0 &&
      element.getAttribute("aria-hidden") !== "true"
    ));
}

export interface ReaderDialogSurfaceProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  fallbackFocus: () => HTMLElement | null;
  label: string;
  onClose: () => void;
  open: boolean;
}

export function ReaderDialogSurface({
  children,
  fallbackFocus,
  label,
  onClose,
  open,
  ...surfaceProps
}: ReaderDialogSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const fallbackFocusRef = useRef(fallbackFocus);

  onCloseRef.current = onClose;
  fallbackFocusRef.current = fallbackFocus;

  useEffect(() => {
    if (!open) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => {
      const firstFocusable = getFocusableElements(surface)[0];
      (firstFocusable ?? surface).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(surface);
      if (focusable.length === 0) {
        event.preventDefault();
        surface.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    surface.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      surface.removeEventListener("keydown", handleKeyDown);
      const trigger = triggerRef.current;
      requestAnimationFrame(() => {
        if (trigger?.isConnected) {
          trigger.focus();
          return;
        }
        fallbackFocusRef.current()?.focus();
      });
    };
  }, [open]);

  return (
    <div
      {...surfaceProps}
      ref={surfaceRef}
      aria-hidden={!open}
      aria-label={open ? label : undefined}
      aria-modal={open || undefined}
      inert={!open ? true : undefined}
      role={open ? "dialog" : undefined}
      tabIndex={open ? -1 : undefined}
    >
      {children}
    </div>
  );
}
