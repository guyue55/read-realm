"use client";

import {
  useLayoutEffect,
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

function focusIfAvailable(element: HTMLElement | null): boolean {
  if (
    !element?.isConnected ||
    element.getClientRects().length === 0 ||
    element.closest('[inert], [aria-hidden="true"]')
  ) {
    return false;
  }
  element.focus({ preventScroll: true });
  return document.activeElement === element;
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

  useLayoutEffect(() => {
    if (!open) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    triggerRef.current = document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => {
      const firstFocusable = getFocusableElements(surface)[0];
      (firstFocusable ?? surface).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const openDialogs = document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      );
      if (openDialogs.item(openDialogs.length - 1) !== surface) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      event.stopPropagation();

      const focusable = getFocusableElements(surface);
      if (focusable.length === 0) {
        event.preventDefault();
        surface.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!surface.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      const trigger = triggerRef.current;
      requestAnimationFrame(() => {
        if (focusIfAvailable(trigger)) return;
        focusIfAvailable(fallbackFocusRef.current());
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
