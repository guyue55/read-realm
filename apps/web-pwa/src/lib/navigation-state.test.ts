import { describe, expect, it } from "vitest";
import {
  isRouteState,
  normalizeRouteState,
  parseAppLocation,
  serializeAppLocation,
} from "./navigation-state";

describe("navigation-state", () => {
  it("拒绝 Next.js 写入的非路由 history state", () => {
    expect(
      isRouteState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} }),
    ).toBe(false);
    expect(
      isRouteState({
        currentView: "reader",
        activeBookId: "book-1",
        activeChapterIndex: null,
        activePanel: null,
        activeTaskId: null,
      }),
    ).toBe(true);
    expect(isRouteState({ currentView: "reader" })).toBe(false);
  });

  it("往返保留阅读章节与面板", () => {
    const state = parseAppLocation("#/reader/book%201?chapter=3&panel=toc");
    expect(state).toMatchObject({
      currentView: "reader",
      activeBookId: "book 1",
      activeChapterIndex: 3,
      activePanel: "toc",
    });
    expect(serializeAppLocation(state)).toBe(
      "/reader/book%201?chapter=3&panel=toc",
    );
  });

  it("拒绝非法视图与负章节", () => {
    expect(parseAppLocation("#/unknown").currentView).toBe("library");
    expect(
      parseAppLocation("#/reader/book?chapter=-1").activeChapterIndex,
    ).toBeNull();
  });

  it("归一化运行时非法状态", () => {
    expect(
      normalizeRouteState({
        currentView: "reader",
        activeBookId: "book-1",
        activeChapterIndex: -1,
        activePanel: "unknown",
        activeTaskId: null,
      }),
    ).toMatchObject({
      currentView: "reader",
      activeBookId: "book-1",
      activeChapterIndex: null,
      activePanel: null,
    });

    expect(normalizeRouteState({ currentView: "unknown" })).toEqual({
      currentView: "library",
      activeBookId: null,
      activeChapterIndex: null,
      activePanel: null,
      activeTaskId: null,
    });
  });
});
