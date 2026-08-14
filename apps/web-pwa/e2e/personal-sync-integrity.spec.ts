import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const apiBase = "http://127.0.0.1:4100";

test.use({ serviceWorkers: "block" });

function remotePayload(id: string, title: string, chapterCount: number, storedCount: number) {
  const now = "2026-08-15T00:00:00.000Z";
  return {
    metadata: {
      id,
      title,
      sourceType: "upload",
      format: "txt",
      status: "reading",
      tags: [],
      chapterCount,
      createdAt: now,
      updatedAt: now,
    },
    chapters: Array.from({ length: storedCount }, (_, index) => ({
      index,
      title: `第 ${index + 1} 章`,
      content: `${title}的完整正文 ${index + 1}`,
    })),
    replaceExisting: true,
  };
}

async function configurePrivateSync(page: Page, token: string) {
  await page.addInitScript((shareToken) => {
    localStorage.setItem("reader-share-token", shareToken);
    localStorage.setItem("reader-sync-auto-startup", "false");
  }, token);
}

async function readLocalBundle(page: Page, bookId: string) {
  return page.evaluate(
    (targetBookId) =>
      new Promise<{ book: unknown; chapterCount: number }>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(["books", "chapters"], "readonly");
          const bookRequest = transaction.objectStore("books").get(targetBookId);
          const chapterIndex = transaction.objectStore("chapters").index("bookId");
          const chapterRequest = chapterIndex.count(targetBookId);
          transaction.oncomplete = () => {
            database.close();
            resolve({ book: bookRequest.result, chapterCount: chapterRequest.result });
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    bookId,
  );
}

async function seedLocalBundle(page: Page, bookId: string, title: string) {
  await page.evaluate(
    ({ targetBookId, targetTitle }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(["books", "chapters"], "readwrite");
          const now = "2026-08-15T00:00:00.000Z";
          transaction.objectStore("books").put({
            id: targetBookId,
            title: targetTitle,
            sourceType: "upload",
            format: "txt",
            status: "reading",
            tags: [],
            chapterCount: 2,
            cacheStatus: "chapters_full",
            sourceAvailability: "full_cached",
            createdAt: now,
            updatedAt: now,
          });
          for (let index = 0; index < 2; index += 1) {
            transaction.objectStore("chapters").put({
              id: `${targetBookId}-chapter-${index}`,
              bookId: targetBookId,
              index,
              title: `第 ${index + 1} 章`,
              content: `${targetTitle}的本地完整正文 ${index + 1}`,
            });
          }
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    { targetBookId: bookId, targetTitle: title },
  );
}

async function clearRemote(request: APIRequestContext, token: string) {
  await request.delete(`${apiBase}/books`, {
    headers: { "x-share-token": token },
  });
}

async function readRemoteBooksFromBrowser(page: Page, token: string) {
  return page.evaluate(
    async ({ baseUrl, shareToken }) => {
      const response = await fetch(`${baseUrl}/books`, {
        headers: { "x-share-token": shareToken },
      });
      return {
        status: response.status,
        payload: await response.json(),
      };
    },
    { baseUrl: apiBase, shareToken: token },
  );
}

test("validated private sync downloads a complete book before one atomic local commit", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const token = `integrity-ok-${suffix}`;
  const bookId = `complete-${suffix}`;
  const title = `完整同步书-${suffix}`;
  await configurePrivateSync(page, token);
  expect(
    (
      await request.post(`${apiBase}/books/import`, {
        headers: { "x-share-token": token },
        data: remotePayload(bookId, title, 2, 2),
      })
    ).ok(),
  ).toBeTruthy();

  try {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/#\/library$/);
    await expect.poll(() => readRemoteBooksFromBrowser(page, token)).toMatchObject({
      status: 200,
      payload: [{ id: bookId, chapterCount: 2 }],
    });
    const card = page.locator(`[data-book-id="${bookId}"]`);
    await expect(card).toHaveCount(1);
    await card.click();

    await expect
      .poll(() => readLocalBundle(page, bookId))
      .toMatchObject({
        book: {
          id: bookId,
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
        },
        chapterCount: 2,
      });
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("reader-active-sync-tasks")),
      )
      .toBe("{}");
  } finally {
    await clearRemote(request, token);
  }
});

test("partial remote chapters never create a half-book and keep a retry fact", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const token = `integrity-fail-${suffix}`;
  const bookId = `partial-${suffix}`;
  const title = `不完整同步书-${suffix}`;
  await configurePrivateSync(page, token);
  expect(
    (
      await request.post(`${apiBase}/books/import`, {
        headers: { "x-share-token": token },
        data: remotePayload(bookId, title, 2, 1),
      })
    ).ok(),
  ).toBeTruthy();

  try {
    await page.goto("/library");
    const card = page.locator(`[data-book-id="${bookId}"]`);
    await expect(card).toHaveCount(1);
    await card.click();
    await expect(page.getByText("拉取失败，该书籍可能在云端已被清除。")).toBeVisible();

    await expect.poll(() => readLocalBundle(page, bookId)).toEqual({
      book: undefined,
      chapterCount: 0,
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(
            JSON.parse(localStorage.getItem("reader-active-sync-tasks") ?? "{}"),
          ),
        ),
      )
      .toContainEqual({ bookId, action: "download", shareToken: token });
  } finally {
    await clearRemote(request, token);
  }
});

test("cold-start recovery replays multiple retained downloads serially", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const token = `integrity-recovery-${suffix}`;
  const bookIds = [`recovery-a-${suffix}`, `recovery-b-${suffix}`];
  await configurePrivateSync(page, token);
  await page.addInitScript(({ ids, shareToken }) => {
    localStorage.setItem(
      "reader-active-sync-tasks",
      JSON.stringify(
        Object.fromEntries(
          ids.map((id) => [
            `${encodeURIComponent(shareToken)}::${encodeURIComponent(id)}`,
            { bookId: id, action: "download", shareToken },
          ]),
        ),
      ),
    );
  }, { ids: bookIds, shareToken: token });
  for (const [index, bookId] of bookIds.entries()) {
    expect(
      (
        await request.post(`${apiBase}/books/import`, {
          headers: { "x-share-token": token },
          data: remotePayload(bookId, `恢复样本 ${index + 1}`, 2, 2),
        })
      ).ok(),
    ).toBeTruthy();
  }

  try {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/#\/library$/);
    await expect(page.getByRole("button", { name: /私人藏书/ })).toBeVisible();
    for (const bookId of bookIds) {
      await expect
        .poll(() => readLocalBundle(page, bookId))
        .toMatchObject({
          book: { id: bookId, cacheStatus: "chapters_full" },
          chapterCount: 2,
        });
    }
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("reader-active-sync-tasks")))
      .toBe("{}");
  } finally {
    await clearRemote(request, token);
  }
});

test("a retained task never replays under a different private key", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const oldToken = `integrity-old-${suffix}`;
  const currentToken = `integrity-current-${suffix}`;
  const bookId = `same-id-${suffix}`;
  await configurePrivateSync(page, currentToken);
  await page.addInitScript(({ targetBookId, shareToken }) => {
    const key = `${encodeURIComponent(shareToken)}::${encodeURIComponent(targetBookId)}`;
    localStorage.setItem(
      "reader-active-sync-tasks",
      JSON.stringify({
        [key]: { bookId: targetBookId, action: "download", shareToken },
      }),
    );
  }, { targetBookId: bookId, shareToken: oldToken });
  expect(
    (
      await request.post(`${apiBase}/books/import`, {
        headers: { "x-share-token": currentToken },
        data: remotePayload(bookId, "当前密钥同名书", 2, 2),
      })
    ).ok(),
  ).toBeTruthy();

  try {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/#\/library$/);
    await expect(page.getByRole("button", { name: /私人藏书/ })).toBeVisible();
    await expect(page.locator(`[data-book-id="${bookId}"]`)).toHaveCount(1);
    await page.waitForTimeout(600);
    await expect.poll(() => readLocalBundle(page, bookId)).toEqual({
      book: undefined,
      chapterCount: 0,
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(
            JSON.parse(localStorage.getItem("reader-active-sync-tasks") ?? "{}"),
          ),
        ),
      )
      .toContainEqual({ bookId, action: "download", shareToken: oldToken });
  } finally {
    await clearRemote(request, currentToken);
  }
});

test("private upload is read-back verified before local chapters can be offloaded", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const token = `integrity-upload-${suffix}`;
  const bookId = `upload-${suffix}`;
  const title = `原子备份书-${suffix}`;
  await configurePrivateSync(page, token);

  try {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/#\/library$/);
    await expect(page.getByRole("button", { name: /私人藏书/ })).toBeVisible();
    await seedLocalBundle(page, bookId, title);
    await page.reload();

    const card = page.locator(`[data-book-id="${bookId}"]`);
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "备份" }).click();
    await expect(page.getByText(`🍃 「${title}」云端完整副本已读回核验。`)).toBeVisible();

    const remoteChapters = await request.get(
      `${apiBase}/books/${bookId}/chapters?offset=0&limit=80`,
      { headers: { "x-share-token": token } },
    );
    await expect(remoteChapters.json()).resolves.toMatchObject({
      total: 2,
      items: [
        { index: 0, content: `${title}的本地完整正文 1` },
        { index: 1, content: `${title}的本地完整正文 2` },
      ],
    });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("reader-active-sync-tasks")))
      .toBe("{}");

    await card.getByRole("button", { name: "释放" }).click();
    await page.getByRole("button", { name: "善也" }).click();
    await expect
      .poll(() => readLocalBundle(page, bookId))
      .toMatchObject({
        book: {
          id: bookId,
          cacheStatus: "metadata_only",
          sourceAvailability: "cloud_available",
        },
        chapterCount: 0,
      });
  } finally {
    await clearRemote(request, token);
  }
});

test("an in-flight upload keeps its original private key across every readback", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const originalToken = `integrity-snapshot-a-${suffix}`;
  const replacementToken = `integrity-snapshot-b-${suffix}`;
  const bookId = `snapshot-${suffix}`;
  const title = `密钥快照书-${suffix}`;
  await configurePrivateSync(page, originalToken);

  try {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/#\/library$/);
    await expect(page.getByRole("button", { name: /私人藏书/ })).toBeVisible();
    await seedLocalBundle(page, bookId, title);
    await page.reload();

    let importToken: string | undefined;
    await page.route(`${apiBase}/books/import`, async (route) => {
      importToken = route.request().headers()["x-share-token"];
      await page.evaluate((token) => {
        localStorage.setItem("reader-share-token", token);
      }, replacementToken);
      await route.continue();
    });

    const card = page.locator(`[data-book-id="${bookId}"]`);
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "备份" }).click();
    await expect(
      page.getByText(`🍃 「${title}」云端完整副本已读回核验。`),
    ).toBeVisible();

    expect(importToken).toBe(originalToken);
    await expect.poll(() => readRemoteBooksFromBrowser(page, originalToken)).toMatchObject({
      status: 200,
      payload: [{ id: bookId, chapterCount: 2 }],
    });
    await expect.poll(() => readRemoteBooksFromBrowser(page, replacementToken)).toEqual({
      status: 200,
      payload: [],
    });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("reader-active-sync-tasks")))
      .toBe("{}");
  } finally {
    await clearRemote(request, originalToken);
    await clearRemote(request, replacementToken);
  }
});

test("clearing a key during recovery preflight cancels the stale download", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const token = `integrity-recovery-cancel-${suffix}`;
  const bookId = `recovery-cancel-${suffix}`;
  await configurePrivateSync(page, token);
  await page.addInitScript(({ targetBookId, shareToken }) => {
    const key = `${encodeURIComponent(shareToken)}::${encodeURIComponent(targetBookId)}`;
    localStorage.setItem(
      "reader-active-sync-tasks",
      JSON.stringify({
        [key]: { bookId: targetBookId, action: "download", shareToken },
      }),
    );
  }, { targetBookId: bookId, shareToken: token });
  expect(
    (
      await request.post(`${apiBase}/books/import`, {
        headers: { "x-share-token": token },
        data: remotePayload(bookId, "恢复换钥样本", 2, 2),
      })
    ).ok(),
  ).toBeTruthy();

  let listRequestCount = 0;
  let releaseRecovery!: () => void;
  const recoveryGate = new Promise<void>((resolve) => {
    releaseRecovery = resolve;
  });
  let markRecoverySeen!: () => void;
  const recoverySeen = new Promise<void>((resolve) => {
    markRecoverySeen = resolve;
  });
  await page.route("**/books", async (route) => {
    if (route.request().url() !== `${apiBase}/books`) {
      await route.continue();
      return;
    }
    listRequestCount += 1;
    if (listRequestCount === 2) {
      markRecoverySeen();
      await recoveryGate;
    }
    await route.continue();
  });

  try {
    await page.goto("/library");
    await recoverySeen;
    await page.getByRole("button", { name: /同步管理与首选项/ }).click();
    await page.getByRole("button", { name: /断开共享/ }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("reader-share-token")))
      .toBeNull();
    releaseRecovery();

    await page.waitForTimeout(500);
    await expect.poll(() => readLocalBundle(page, bookId)).toEqual({
      book: undefined,
      chapterCount: 0,
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(
            JSON.parse(localStorage.getItem("reader-active-sync-tasks") ?? "{}"),
          ),
        ),
      )
      .toContainEqual({ bookId, action: "download", shareToken: token });
  } finally {
    releaseRecovery();
    await clearRemote(request, token);
  }
});
