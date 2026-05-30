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
    self.postMessage({ success: true, parsedBook });
  } catch (err) {
    self.postMessage({ success: false, error: (err as Error).message });
  }
};
