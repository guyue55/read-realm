"use client";

import { useLayoutEffect } from "react";

export function useDocumentModalIsolation(open: boolean, selector: string) {
  useLayoutEffect(() => {
    if (!open) return;
    const surface = document.querySelector<HTMLElement>(selector);
    if (!surface || surface.parentElement !== document.body) return;
    const siblings = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== surface,
    );
    const previous = siblings.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    for (const sibling of siblings) {
      sibling.inert = true;
      sibling.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const state of previous) {
        if (!state.element.isConnected) continue;
        state.element.inert = state.inert;
        if (state.ariaHidden === null)
          state.element.removeAttribute("aria-hidden");
        else state.element.setAttribute("aria-hidden", state.ariaHidden);
      }
    };
  }, [open, selector]);
}
