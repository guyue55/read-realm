import { parseTxtBook, parseEpubBook } from "@reader/parser-core";

self.onmessage = async (e: MessageEvent) => {
  const { filename, buffer, type } = e.data;
  try {
    let parsedBook;
    if (type === "epub") {
      parsedBook = await parseEpubBook(filename, buffer);
    } else {
      parsedBook = parseTxtBook(filename, buffer);
    }

    const { title, chapters } = parsedBook;
    const totalChapters = chapters.length;

    // 1. 发送初步元数据，让主线程能够闪电空降初始化任务骨架
    self.postMessage({
      type: "METADATA",
      success: true,
      title,
      chapterCount: totalChapters,
    });

    // 2. 切片增量流式发送章节正文（每包限制最大 50 章，保障几微秒的无感反序列化）
    const CHUNK_SIZE = 50;
    for (let i = 0; i < totalChapters; i += CHUNK_SIZE) {
      const chunk = chapters.slice(i, i + CHUNK_SIZE);
      self.postMessage({
        type: "CHUNK",
        success: true,
        startIndex: i,
        chapters: chunk,
        isFinished: i + CHUNK_SIZE >= totalChapters,
      });
    }

    // 3. 广播完美终结状态
    self.postMessage({ type: "FINISHED", success: true });
  } catch (err) {
    self.postMessage({ success: false, error: (err as Error).message });
  }
};

