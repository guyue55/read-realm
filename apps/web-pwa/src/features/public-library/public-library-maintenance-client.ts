import { apiUrl } from "@/lib/api";
import { normalizeShareToken } from "@/lib/api";
import {
  parsePublicLibraryBook,
  type PublicLibraryBook,
} from "./public-library-client";

export type PublicLibraryCategory = "文学" | "经典" | "思想" | "技术" | "其他";

export interface PublicLibraryFileFields {
  category: PublicLibraryCategory;
  relativePath?: string;
  rightsConfirmed: true;
}

export interface PublicLibraryFilePublication {
  outcome: "created" | "unchanged";
  book: PublicLibraryBook;
}

export class PublicLibraryMaintenanceError extends Error {
  constructor(
    readonly code:
      | "credential_rejected"
      | "duplicate_metadata_conflict"
      | "file_rejected"
      | "service_unavailable",
    readonly existingBookId?: string,
  ) {
    super(code);
    this.name = "PublicLibraryMaintenanceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class PublicLibraryMaintenanceClient {
  private readonly credentialSnapshot: string;

  constructor(maintenanceKey: string) {
    this.credentialSnapshot = normalizeShareToken(maintenanceKey);
    if (!this.credentialSnapshot) {
      throw new PublicLibraryMaintenanceError("credential_rejected");
    }
  }

  async publishFile(
    file: File,
    fields: PublicLibraryFileFields,
  ): Promise<PublicLibraryFilePublication> {
    const body = new FormData();
    body.set("category", fields.category);
    body.set("rightsConfirmed", String(fields.rightsConfirmed));
    if (fields.relativePath) body.set("relativePath", fields.relativePath);
    body.set("file", file, file.name);
    const response = await fetch(apiUrl("/public-library/maintenance/files"), {
      method: "POST",
      headers: {
        "x-public-library-maintenance-key": this.credentialSnapshot,
      },
      body,
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (response.status === 401 || response.status === 403) {
      throw new PublicLibraryMaintenanceError("credential_rejected");
    }
    if (
      response.status === 409 &&
      isRecord(payload) &&
      payload.code === "duplicate_metadata_conflict"
    ) {
      throw new PublicLibraryMaintenanceError(
        "duplicate_metadata_conflict",
        typeof payload.existingBookId === "string"
          ? payload.existingBookId
          : undefined,
      );
    }
    if (response.status === 400 || response.status === 413) {
      throw new PublicLibraryMaintenanceError("file_rejected");
    }
    if (!response.ok || !isRecord(payload)) {
      throw new PublicLibraryMaintenanceError("service_unavailable");
    }
    if (payload.outcome !== "created" && payload.outcome !== "unchanged") {
      throw new PublicLibraryMaintenanceError("service_unavailable");
    }
    return {
      outcome: payload.outcome,
      book: parsePublicLibraryBook(payload.book),
    };
  }
}
