import { describe, expect, it } from "vitest";
import {
  createReaderSettingsWriteQueue,
  DEFAULT_READER_SETTINGS,
  loadReaderSettingsFromStorage,
  saveReaderSettingsToStorage,
} from "./reader-settings";

describe("reader settings write queue", () => {
  it("preserves invocation order across delayed writes", async () => {
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const persisted: number[] = [];
    let writes = 0;
    const queue = createReaderSettingsWriteQueue(async (settings) => {
      writes += 1;
      if (writes === 1) await firstWrite;
      persisted.push(settings.fontSize);
    });

    const first = queue({ ...DEFAULT_READER_SETTINGS, fontSize: 20 });
    const second = queue({ ...DEFAULT_READER_SETTINGS, fontSize: 22 });

    expect(persisted).toEqual([]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(persisted).toEqual([20, 22]);
  });
});

describe("reader settings persistence", () => {
  it("surfaces a blocked write instead of claiming settings were saved", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    expect(() =>
      saveReaderSettingsToStorage(
        storage,
        { ...DEFAULT_READER_SETTINGS, fontSize: 22 },
      ),
    ).toThrow("READER_SETTINGS_WRITE_FAILED");
  });

  it("rejects a write whose readback does not match", () => {
    const storage = {
      getItem: () => JSON.stringify(DEFAULT_READER_SETTINGS),
      setItem: () => undefined,
    };

    expect(() =>
      saveReaderSettingsToStorage(
        storage,
        { ...DEFAULT_READER_SETTINGS, fontSize: 22 },
      ),
    ).toThrow("READER_SETTINGS_READBACK_FAILED");
  });

  it("falls back safely when storage reads are blocked", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => undefined,
    };

    expect(loadReaderSettingsFromStorage(storage)).toEqual(
      DEFAULT_READER_SETTINGS,
    );
  });
});
