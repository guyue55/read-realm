import { describe, expect, it } from "vitest";
import { isValidShareToken, normalizeShareToken } from "./api";

describe("private share token", () => {
  it("reserves the default namespace and never treats it as a destructive credential", () => {
    expect(isValidShareToken("default")).toBe(false);
    expect(isValidShareToken(" DEFAULT ")).toBe(false);
    expect(normalizeShareToken("default")).toBe("");
  });
});
