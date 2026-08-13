import { describe, expect, it } from "vitest";
import {
  createReaderSettingsWriteQueue,
  DEFAULT_READER_SETTINGS,
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
