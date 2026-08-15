import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readViewScrollPosition,
  readViewSourceFocus,
  rememberViewScrollPosition,
  rememberViewSourceFocus,
  viewScrollMemory,
} from "./route-store";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

describe("route return memory", () => {
  beforeEach(() => {
    delete viewScrollMemory.library;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: new MemoryStorage() },
    });
  });

  afterEach(() => {
    delete viewScrollMemory.library;
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("survives an in-memory reset within the same browser session", () => {
    rememberViewScrollPosition("library", 520);
    rememberViewSourceFocus("library", "book-336");
    delete viewScrollMemory.library;

    expect(readViewScrollPosition("library")).toBe(520);
    expect(readViewSourceFocus("library")).toBe("book-336");
  });

  it("fails closed for an invalid scroll position", () => {
    rememberViewScrollPosition("library", Number.NaN);
    delete viewScrollMemory.library;
    expect(readViewScrollPosition("library")).toBe(0);
  });
});
