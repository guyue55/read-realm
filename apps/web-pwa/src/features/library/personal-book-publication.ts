import type { VerifiedPersonalPublicationSnapshot } from "@reader/shared-types";
import {
  PublicLibraryMaintenanceClient,
  type PublicLibraryFilePublication,
} from "@/features/public-library/public-library-maintenance-client";
import { dexiePersonalBookExportLocalPort } from "./dexie-personal-book-export";
import {
  PersonalBookExportService,
  PersonalPublicationApiClient,
} from "./personal-book-export";

export interface PersonalBookExportPort {
  export(bookId: string): Promise<VerifiedPersonalPublicationSnapshot>;
}

export interface PublicLibraryMaintenancePort {
  publishPersonalSnapshot(
    snapshot: VerifiedPersonalPublicationSnapshot,
    fields: { category: "其他"; rightsConfirmed: true },
  ): Promise<PublicLibraryFilePublication>;
}

export class PersonalBookPublicationService {
  constructor(
    private readonly exportPort: PersonalBookExportPort,
    private readonly maintenancePort: PublicLibraryMaintenancePort,
  ) {}

  async publish(bookId: string) {
    const snapshot = await this.exportPort.export(bookId);
    return this.maintenancePort.publishPersonalSnapshot(snapshot, {
      category: "其他",
      rightsConfirmed: true,
    });
  }
}

export function createPersonalBookPublicationService(credential: string) {
  const exportPort = new PersonalBookExportService(
    new PersonalPublicationApiClient(credential),
    dexiePersonalBookExportLocalPort,
  );
  return new PersonalBookPublicationService(
    exportPort,
    new PublicLibraryMaintenanceClient(credential),
  );
}
