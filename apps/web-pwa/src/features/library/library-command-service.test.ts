import { describe, expect, it } from "vitest";
import type { LibraryFolder } from "@reader/shared-types";
import {
  LibraryCommandService,
  type LibraryCommandPort,
  type LibraryCommandResult,
} from "./library-command-service";

class RecordingPort implements LibraryCommandPort {
  calls: Array<{ operation: string; input: unknown }> = [];
  nextResult: LibraryCommandResult = { status: "applied" };

  private record(operation: string, input: unknown) {
    this.calls.push({ operation, input });
    return Promise.resolve(this.nextResult);
  }

  moveBookAtomic(input: { bookId: string; folderId?: string; updatedAt: string }) {
    return this.record("move", input);
  }

  createFolderAndMoveAtomic(input: {
    bookId: string;
    folder: LibraryFolder;
    updatedAt: string;
  }) {
    return this.record("create-and-move", input);
  }

  dissolveFolderAtomic(input: { folderId: string; updatedAt: string }) {
    return this.record("dissolve", input);
  }

  removeBookAtomic(input: { bookId: string; updatedAt: string }) {
    return this.record("remove", input);
  }

  offloadBookAtomic(input: { bookId: string; updatedAt: string }) {
    return this.record("offload", input);
  }
}

function createService(port: RecordingPort) {
  return new LibraryCommandService(port, {
    createId: () => "folder-created",
    now: () => "2026-08-15T00:00:00.000Z",
  });
}

describe("LibraryCommandService", () => {
  it("normalizes the root destination before one atomic move", async () => {
    const port = new RecordingPort();
    const service = createService(port);

    await expect(service.moveBook("book-1", "root")).resolves.toEqual({
      status: "applied",
    });
    expect(port.calls).toEqual([
      {
        operation: "move",
        input: {
          bookId: "book-1",
          folderId: undefined,
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      },
    ]);
  });

  it("creates a trimmed virtual folder and moves the book in one command", async () => {
    const port = new RecordingPort();
    const service = createService(port);

    await expect(
      service.createFolderAndMove("book-1", "  科幻  "),
    ).resolves.toEqual({ status: "applied" });
    expect(port.calls[0]).toEqual({
      operation: "create-and-move",
      input: {
        bookId: "book-1",
        folder: {
          id: "folder-created",
          name: "科幻",
          sourceType: "virtual",
          depth: 0,
          sortOrder: 0,
          createdAt: "2026-08-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
    });
  });

  it("rejects an empty or overlong folder name without touching storage", async () => {
    const port = new RecordingPort();
    const service = createService(port);

    await expect(service.createFolderAndMove("book-1", "   ")).resolves.toEqual({
      status: "invalid_folder_name",
    });
    await expect(
      service.createFolderAndMove("book-1", "x".repeat(81)),
    ).resolves.toEqual({ status: "invalid_folder_name" });
    expect(port.calls).toEqual([]);
  });

  it("preserves precise not-found outcomes from the atomic port", async () => {
    const port = new RecordingPort();
    port.nextResult = { status: "folder_not_found" };
    const service = createService(port);

    await expect(service.moveBook("book-1", "missing")).resolves.toEqual({
      status: "folder_not_found",
    });
  });

  it("routes dissolve, removal, and offload through explicit commands", async () => {
    const port = new RecordingPort();
    const service = createService(port);

    await service.dissolveFolder("folder-1");
    await service.removeBook("book-1");
    await service.offloadBook("book-2");

    expect(port.calls).toEqual([
      {
        operation: "dissolve",
        input: {
          folderId: "folder-1",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      },
      {
        operation: "remove",
        input: {
          bookId: "book-1",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      },
      {
        operation: "offload",
        input: {
          bookId: "book-2",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      },
    ]);
  });
});
