import { expect, test } from "@playwright/test";

const apiBase = "http://127.0.0.1:4100";

function payload(id: string, title: string) {
  const now = new Date().toISOString();
  return {
    metadata: { id, title, sourceType: "upload", format: "txt", status: "to_read", tags: [], chapterCount: 1, createdAt: now, updatedAt: now },
    chapters: [{ index: 0, title: "第一章", content: `${title}的隔离正文` }],
    replaceExisting: true,
  };
}

test("两个分享口令的书籍、章节与搜索结果相互隔离", async ({ request }) => {
  const suffix = Date.now().toString(36);
  const tokenA = `scope-a-${suffix}`;
  const tokenB = `scope-b-${suffix}`;
  const headersA = { "x-share-token": tokenA };
  const headersB = { "x-share-token": tokenB };

  expect((await request.post(`${apiBase}/books/import`, { headers: headersA, data: payload("book-a", `甲书-${suffix}`) })).ok()).toBeTruthy();
  expect((await request.post(`${apiBase}/books/import`, { headers: headersB, data: payload("book-b", `乙书-${suffix}`) })).ok()).toBeTruthy();

  const booksA = await (await request.get(`${apiBase}/books`, { headers: headersA })).json();
  const booksB = await (await request.get(`${apiBase}/books`, { headers: headersB })).json();
  expect(booksA.map((book: { title: string }) => book.title)).toContain(`甲书-${suffix}`);
  expect(booksA.map((book: { title: string }) => book.title)).not.toContain(`乙书-${suffix}`);
  expect(booksB.map((book: { title: string }) => book.title)).toContain(`乙书-${suffix}`);

  expect((await request.get(`${apiBase}/books/book-b/chapters/0`, { headers: headersA })).status()).toBe(404);
  const searchAcrossScope = await (await request.get(`${apiBase}/search?q=${encodeURIComponent(`乙书-${suffix}`)}`, { headers: headersA })).json();
  expect(searchAcrossScope).toEqual([]);
});
