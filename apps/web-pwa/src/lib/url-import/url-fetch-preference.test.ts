import { describe, expect, it } from "vitest";
import {
  loadUrlFetchPreferenceFromStorage,
  saveUrlFetchPreferenceToStorage,
} from "./url-fetch-preference";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("url-fetch-preference 抓取档位存储", () => {
  it("无存储时回退默认标准档", () => {
    const pref = loadUrlFetchPreferenceFromStorage(createMemoryStorage());
    expect(pref).toEqual({
      tier: "standard",
      thirdPartyEnabled: false,
      concurrency: 5,
    });
  });

  it("保存后读取一致（激进档）", () => {
    const storage = createMemoryStorage();
    saveUrlFetchPreferenceToStorage(storage, {
      tier: "aggressive",
      thirdPartyEnabled: true,
      concurrency: 10,
    });
    const loaded = loadUrlFetchPreferenceFromStorage(storage);
    expect(loaded.tier).toBe("aggressive");
    expect(loaded.thirdPartyEnabled).toBe(true);
    expect(loaded.concurrency).toBe(10);
  });

  it("损坏数据回退默认而不崩溃", () => {
    const storage = createMemoryStorage({
      "url-fetch-preference": "{broken json",
    });
    expect(loadUrlFetchPreferenceFromStorage(storage)).toEqual({
      tier: "standard",
      thirdPartyEnabled: false,
      concurrency: 5,
    });
  });

  it("非法档位值回退默认", () => {
    const storage = createMemoryStorage({
      "url-fetch-preference": JSON.stringify({ tier: "extreme" }),
    });
    expect(loadUrlFetchPreferenceFromStorage(storage).tier).toBe("standard");
  });
});
