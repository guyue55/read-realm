import { describe, expect, it, vi } from "vitest";
import type { Book, LocalChapter } from "@reader/shared-types";
import {
  PersonalSyncService,
  type PersonalSyncDownloadApi,
  type PersonalSyncDownloadLocalStore,
  type PersonalSyncUploadApi,
  type PersonalSyncUploadLocalStore,
} from "./personal-sync-service";

const book: Book = {
  id: "book-1",
  title: "下载编排样本",
  sourceType: "cloud_cache",
  format: "epub",
  status: "reading",
  tags: [],
  chapterCount: 1,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const chapters: LocalChapter[] = [
  { id: "chapter-0", bookId: book.id, index: 0, title: "一", content: "正文" },
];

function setup() {
  const api: PersonalSyncDownloadApi & PersonalSyncUploadApi = {
    downloadChapters: vi.fn(async () => chapters),
    uploadAndVerifyBook: vi.fn(async ({ book: candidate }) => candidate),
    verifyRemoteCopy: vi.fn(async () => undefined),
  };
  const local: PersonalSyncDownloadLocalStore & PersonalSyncUploadLocalStore = {
    applyDownloadedBook: vi.fn(async () => "applied" as const),
    readUploadBundle: vi.fn(async () => ({ book, chapters })),
    offloadIfSnapshotMatches: vi.fn(async () => undefined),
  };
  return { api, local, service: new PersonalSyncService(api, local) };
}

describe("PersonalSyncService.downloadBook", () => {
  it("writes locally only after the complete remote bundle succeeds", async () => {
    const { api, local, service } = setup();

    await expect(service.downloadBook(book)).resolves.toEqual({
      status: "succeeded",
      bookId: book.id,
      chapterCount: 1,
    });
    expect(api.downloadChapters).toHaveBeenCalledWith(book.id, 1, {
      onPage: undefined,
    });
    expect(local.applyDownloadedBook).toHaveBeenCalledWith({
      book,
      chapters,
      progress: undefined,
    });
  });

  it("returns failed and performs zero local writes when page N fails", async () => {
    const { api, local, service } = setup();
    vi.mocked(api.downloadChapters).mockRejectedValueOnce(
      Object.assign(new Error("page 2 failed"), { code: "remote_unavailable" }),
    );

    await expect(service.downloadBook(book)).resolves.toEqual({
      status: "failed",
      bookId: book.id,
      code: "remote_unavailable",
    });
    expect(local.applyDownloadedBook).not.toHaveBeenCalled();
  });

  it("reports a local atomic commit failure without claiming success", async () => {
    const { local, service } = setup();
    vi.mocked(local.applyDownloadedBook).mockRejectedValueOnce(
      Object.assign(new Error("quota"), { code: "local_write_failed" }),
    );

    await expect(service.downloadBook(book)).resolves.toEqual({
      status: "failed",
      bookId: book.id,
      code: "local_write_failed",
    });
  });

  it("does not commit a downloaded private book after its credential generation changes", async () => {
    const { local, service } = setup();

    await expect(
      service.downloadBook(book, { shouldCommit: () => false }),
    ).resolves.toEqual({
      status: "failed",
      bookId: book.id,
      code: "sync_generation_changed",
    });
    expect(local.applyDownloadedBook).not.toHaveBeenCalled();
  });

  it("reports an existing local copy without claiming a remote overwrite", async () => {
    const { local, service } = setup();
    vi.mocked(local.applyDownloadedBook).mockResolvedValueOnce("already_local");

    await expect(service.downloadBook(book)).resolves.toEqual({
      status: "already_local",
      bookId: book.id,
      chapterCount: 1,
    });
  });
});

describe("PersonalSyncService.uploadBook", () => {
  it("claims success only after a complete local bundle is atomically uploaded and read back", async () => {
    const { api, service } = setup();

    await expect(service.uploadBook(book.id)).resolves.toEqual({
      status: "succeeded",
      bookId: book.id,
      chapterCount: 1,
    });
    expect(api.uploadAndVerifyBook).toHaveBeenCalledWith({
      book,
      chapters,
      progress: undefined,
      onUploaded: undefined,
    });
  });

  it("reports readback mismatch without claiming upload success", async () => {
    const { api, service } = setup();
    vi.mocked(api.uploadAndVerifyBook).mockRejectedValueOnce(
      Object.assign(new Error("mismatch"), { code: "remote_verification_failed" }),
    );

    await expect(service.uploadBook(book.id)).resolves.toEqual({
      status: "failed",
      bookId: book.id,
      code: "remote_verification_failed",
    });
  });

  it("verifies the exact remote text before allowing local offload", async () => {
    const { api, local, service } = setup();

    await expect(service.offloadVerifiedBook(book.id)).resolves.toMatchObject({
      status: "succeeded",
      chapterCount: 1,
    });
    expect(api.verifyRemoteCopy).toHaveBeenCalledWith(book, chapters);
    expect(local.offloadIfSnapshotMatches).toHaveBeenCalledWith({ book, chapters });
  });

  it("does not offload when the local copy changes after remote verification", async () => {
    const { local, service } = setup();
    vi.mocked(local.offloadIfSnapshotMatches).mockRejectedValueOnce(
      Object.assign(new Error("changed"), {
        code: "local_copy_changed_after_verification",
      }),
    );

    await expect(service.offloadVerifiedBook(book.id)).resolves.toEqual({
      status: "failed",
      bookId: book.id,
      code: "local_copy_changed_after_verification",
    });
  });
});
