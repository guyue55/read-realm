import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./LibraryDefault.tsx", import.meta.url),
  "utf8",
);

describe("library visual language contract", () => {
  it("uses shared feedback and Lucide for structural controls", () => {
    expect(source).toContain('from "@/components/ui/AppToast"');
    expect(source).toContain("useAppToast");
    expect(source).not.toContain("<AppToast");
    expect(source).not.toContain("getLibraryToastTone");
    expect(source).not.toMatch(/[☁️🌧️🌀⚙️🍃📖🏯📋🖌️🧼🤝📁📤📦]/u);
  });

  it("keeps visible copy plain and removes legacy visual jargon", () => {
    for (const phrase of [
      "极奢",
      "落砚",
      "治理阁",
      "一键物理缓存全卷",
      "松墨离线阁",
      "感念天机",
      "物理清空云端备份",
    ]) {
      expect(source).not.toContain(phrase);
    }
  });

  it("uses registered font roles and semantic radii in the shelf tree", () => {
    expect(source).not.toContain("font-reading-title");
    expect(source).not.toMatch(/rounded-\[(18|20|24|28)px\]/u);
    expect(source).not.toMatch(/text-\[(9|10|11)px\]/u);
  });
});
