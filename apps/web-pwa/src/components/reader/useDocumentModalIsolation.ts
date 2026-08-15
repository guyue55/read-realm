"use client";

import { useLayoutEffect, type RefObject } from "react";

interface ElementState {
  inert: boolean;
  ariaHidden: string | null;
}

const modalStack: HTMLElement[] = [];
const originalStates = new Map<HTMLElement, ElementState>();

function remember(element: HTMLElement) {
  if (originalStates.has(element)) return;
  originalStates.set(element, {
    inert: element.inert,
    ariaHidden: element.getAttribute("aria-hidden"),
  });
}

function restore(element: HTMLElement) {
  const state = originalStates.get(element);
  if (!state) return;
  element.inert = state.inert;
  if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", state.ariaHidden);
}

function applyModalStack() {
  const top = modalStack.at(-1);
  for (const child of Array.from(document.body.children) as HTMLElement[]) {
    remember(child);
    if (child === top) {
      restore(child);
    } else {
      child.inert = true;
      child.setAttribute("aria-hidden", "true");
    }
  }
}

export function registerDocumentModalSurface(surface: HTMLElement) {
  if (surface.parentElement !== document.body) return () => {};
  if (!modalStack.includes(surface)) modalStack.push(surface);
  applyModalStack();

  return () => {
    const index = modalStack.lastIndexOf(surface);
    if (index >= 0) modalStack.splice(index, 1);
    if (modalStack.length > 0) {
      applyModalStack();
      return;
    }
    for (const [element] of originalStates) {
      if (element.isConnected !== false) restore(element);
    }
    originalStates.clear();
  };
}

export function useDocumentModalIsolation(
  open: boolean,
  surfaceRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!open || !surfaceRef.current) return;
    return registerDocumentModalSurface(surfaceRef.current);
  }, [open, surfaceRef]);
}
