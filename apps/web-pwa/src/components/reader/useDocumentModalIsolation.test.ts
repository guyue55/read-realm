import { afterEach, describe, expect, it } from "vitest";

import { registerDocumentModalSurface } from "./useDocumentModalIsolation";

class FakeElement {
  inert = false;
  isConnected = true;
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  private attributes = new Map<string, string>();

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

const originalDocument = globalThis.document;

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("document modal isolation stack", () => {
  it("keeps only the top portal interactive and restores the app after nested close", () => {
    const body = new FakeElement();
    const app = new FakeElement();
    const first = new FakeElement();
    const second = new FakeElement();
    body.children = [app, first, second];
    for (const child of body.children) child.parentElement = body;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { body },
    });

    const closeFirst = registerDocumentModalSurface(
      first as unknown as HTMLElement,
    );
    expect(app.inert).toBe(true);
    expect(first.inert).toBe(false);

    const closeSecond = registerDocumentModalSurface(
      second as unknown as HTMLElement,
    );
    expect(first.inert).toBe(true);
    expect(second.inert).toBe(false);

    closeSecond();
    expect(first.inert).toBe(false);
    expect(app.inert).toBe(true);

    closeFirst();
    expect(app.inert).toBe(false);
    expect(app.getAttribute("aria-hidden")).toBeNull();
  });
});
