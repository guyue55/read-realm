import { parseEpubBook } from "@reader/parser-core/epub-parser";

self.onmessage = async (event: MessageEvent) => {
  const { filename, buffer } = event.data as {
    filename: string;
    buffer: ArrayBuffer;
  };
  try {
    const parsedBook = await parseEpubBook(filename, buffer);
    const { title, chapters } = parsedBook;
    if (chapters.length === 0) {
      throw new Error("未解析到章节内容，请检查 EPUB 文件");
    }
    self.postMessage({
      type: "METADATA",
      success: true,
      title,
      chapterCount: chapters.length,
    });
    const chunkSize = 50;
    for (let index = 0; index < chapters.length; index += chunkSize) {
      self.postMessage({
        type: "CHUNK",
        success: true,
        startIndex: index,
        chapters: chapters.slice(index, index + chunkSize),
        isFinished: index + chunkSize >= chapters.length,
      });
    }
    self.postMessage({ type: "FINISHED", success: true });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
