import { apiUrl } from "@/lib/api";
import { normalizeShareToken } from "@/lib/api";
import type { VerifiedPersonalPublicationSnapshot } from "@reader/shared-types";
import type {
  PublicLibraryCategoryId,
  PublicLibraryTagId,
} from "@reader/shared-types";
import {
  parsePublicLibraryBook,
  type PublicLibraryBook,
} from "./public-library-client";

export type PublicLibraryCategory = "文学" | "经典" | "思想" | "技术" | "其他";

export interface PublicLibraryFileFields {
  category: PublicLibraryCategory;
  tagIds?: PublicLibraryTagId[];
  relativePath?: string;
  rightsConfirmed: true;
}

export interface PublicLibraryFilePublication {
  outcome: "created" | "unchanged";
  book: PublicLibraryBook;
}

export interface PublicLibraryScanRoot {
  rootId: string;
  label: string;
}

export type PublicLibraryScanStatus =
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "interrupted";

export interface PublicLibraryScanJob {
  scanId: string;
  rootId: string;
  rootLabel: string;
  status: PublicLibraryScanStatus;
  discoveredCount: number;
  processedCount: number;
  createdCount: number;
  unchangedCount: number;
  duplicateCount: number;
  failedCount: number;
  skippedCount: number;
  totalBytes: number;
  errorCode?: string;
  items: Array<{
    relativePath: string;
    outcome: "created" | "unchanged" | "duplicate" | "failed" | "skipped";
    errorCode?: string;
  }>;
}

export class PublicLibraryMaintenanceError extends Error {
  constructor(
    readonly code:
      | "credential_rejected"
      | "duplicate_metadata_conflict"
      | "file_rejected"
      | "scan_already_running"
      | "catalog_metadata_stale"
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

function readNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new PublicLibraryMaintenanceError("service_unavailable");
  }
  return value;
}

function parseScanJob(value: unknown): PublicLibraryScanJob {
  if (
    !isRecord(value) ||
    typeof value.scanId !== "string" ||
    typeof value.rootId !== "string" ||
    typeof value.rootLabel !== "string" ||
    ![
      "running",
      "completed",
      "completed_with_errors",
      "failed",
      "interrupted",
    ].includes(String(value.status))
  ) {
    throw new PublicLibraryMaintenanceError("service_unavailable");
  }
  const items = Array.isArray(value.items)
    ? value.items.slice(0, 50).map((item) => {
        if (
          !isRecord(item) ||
          typeof item.relativePath !== "string" ||
          !["created", "unchanged", "duplicate", "failed", "skipped"].includes(
            String(item.outcome),
          )
        ) {
          throw new PublicLibraryMaintenanceError("service_unavailable");
        }
        return {
          relativePath: item.relativePath,
          outcome:
            item.outcome as PublicLibraryScanJob["items"][number]["outcome"],
          errorCode:
            typeof item.errorCode === "string" ? item.errorCode : undefined,
        };
      })
    : [];
  return {
    scanId: value.scanId,
    rootId: value.rootId,
    rootLabel: value.rootLabel,
    status: value.status as PublicLibraryScanStatus,
    discoveredCount: readNumber(value.discoveredCount),
    processedCount: readNumber(value.processedCount),
    createdCount: readNumber(value.createdCount),
    unchangedCount: readNumber(value.unchangedCount),
    duplicateCount: readNumber(value.duplicateCount),
    failedCount: readNumber(value.failedCount),
    skippedCount: readNumber(value.skippedCount),
    totalBytes: readNumber(value.totalBytes),
    errorCode:
      typeof value.errorCode === "string" ? value.errorCode : undefined,
    items,
  };
}

export class PublicLibraryMaintenanceClient {
  private readonly credentialSnapshot: string;

  constructor(maintenanceKey: string) {
    this.credentialSnapshot = normalizeShareToken(maintenanceKey);
    if (!this.credentialSnapshot) {
      throw new PublicLibraryMaintenanceError("credential_rejected");
    }
  }

  private headers() {
    return {
      "x-public-library-maintenance-key": this.credentialSnapshot,
    };
  }

  private async parseMaintenanceResponse(response: Response) {
    const payload: unknown = await response.json().catch(() => undefined);
    if (response.status === 401 || response.status === 403) {
      throw new PublicLibraryMaintenanceError("credential_rejected");
    }
    if (
      response.status === 409 &&
      isRecord(payload) &&
      payload.code === "PUBLIC_LIBRARY_SCAN_ALREADY_RUNNING"
    ) {
      throw new PublicLibraryMaintenanceError("scan_already_running");
    }
    if (
      response.status === 409 &&
      isRecord(payload) &&
      payload.code === "CATALOG_METADATA_VERSION_STALE"
    ) {
      throw new PublicLibraryMaintenanceError("catalog_metadata_stale");
    }
    if (!response.ok) {
      throw new PublicLibraryMaintenanceError("service_unavailable");
    }
    return payload;
  }

  async listScanRoots(): Promise<PublicLibraryScanRoot[]> {
    const response = await fetch(
      apiUrl("/public-library/maintenance/scan-roots"),
      { headers: this.headers() },
    );
    const payload = await this.parseMaintenanceResponse(response);
    if (!isRecord(payload) || !Array.isArray(payload.items)) {
      throw new PublicLibraryMaintenanceError("service_unavailable");
    }
    return payload.items.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.rootId !== "string" ||
        typeof item.label !== "string"
      ) {
        throw new PublicLibraryMaintenanceError("service_unavailable");
      }
      return { rootId: item.rootId, label: item.label };
    });
  }

  async startScan(rootId: string) {
    const response = await fetch(apiUrl("/public-library/maintenance/scans"), {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify({ rootId, rightsConfirmed: true }),
    });
    return parseScanJob(await this.parseMaintenanceResponse(response));
  }

  async getScan(scanId: string) {
    const response = await fetch(
      apiUrl(`/public-library/maintenance/scans/${encodeURIComponent(scanId)}`),
      { headers: this.headers() },
    );
    return parseScanJob(await this.parseMaintenanceResponse(response));
  }

  async publishFile(
    file: File,
    fields: PublicLibraryFileFields,
  ): Promise<PublicLibraryFilePublication> {
    const body = new FormData();
    body.set("category", fields.category);
    body.set("rightsConfirmed", String(fields.rightsConfirmed));
    body.set("tagIds", JSON.stringify(fields.tagIds ?? []));
    if (fields.relativePath) body.set("relativePath", fields.relativePath);
    body.set("file", file, file.name);
    const response = await fetch(apiUrl("/public-library/maintenance/files"), {
      method: "POST",
      headers: {
        ...this.headers(),
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

  async publishPersonalSnapshot(
    snapshot: VerifiedPersonalPublicationSnapshot,
    fields: { category: PublicLibraryCategory; rightsConfirmed: true },
  ): Promise<PublicLibraryFilePublication> {
    const body = new FormData();
    body.set("category", fields.category);
    body.set("rightsConfirmed", String(fields.rightsConfirmed));
    body.set("tagIds", "[]");
    body.set(
      "snapshot",
      new File([JSON.stringify(snapshot)], "verified-personal-snapshot.json", {
        type: "application/json",
      }),
    );
    const response = await fetch(
      apiUrl("/public-library/maintenance/personal-snapshots"),
      { method: "POST", headers: this.headers(), body },
    );
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

  async updateCatalog(
    bookId: string,
    patch: {
      metadataVersion: number;
      categoryId: PublicLibraryCategoryId;
      tagIds: PublicLibraryTagId[];
      collectionPath: string;
    },
  ) {
    const response = await fetch(
      apiUrl(`/public-library/books/${encodeURIComponent(bookId)}/catalog`),
      {
        method: "PATCH",
        headers: { ...this.headers(), "content-type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    const payload = await this.parseMaintenanceResponse(response);
    return parsePublicLibraryBook(payload);
  }
}
