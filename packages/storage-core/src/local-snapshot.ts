import {
  LocalDataSnapshotEnvelopeSchema,
  type LocalDataSnapshotData,
  type LocalDataSnapshotEnvelope,
} from "@reader/shared-types";

export interface LocalDataSnapshotReader {
  readSnapshotData(): Promise<LocalDataSnapshotData>;
}

export interface LocalDataSnapshotWriter {
  writeValidatedSnapshotData(data: LocalDataSnapshotData): Promise<void>;
}

export function serializeLocalDataSnapshot(
  value: LocalDataSnapshotEnvelope,
): string {
  const snapshot = LocalDataSnapshotEnvelopeSchema.parse(value);
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function parseLocalDataSnapshot(
  value: string,
): LocalDataSnapshotEnvelope {
  const decoded: unknown = JSON.parse(value);
  if (
    decoded !== null &&
    typeof decoded === "object" &&
    "schemaVersion" in decoded &&
    decoded.schemaVersion !== 1
  ) {
    throw new Error(
      `UNSUPPORTED_LOCAL_DATA_SCHEMA_VERSION:${String(decoded.schemaVersion)}`,
    );
  }
  return LocalDataSnapshotEnvelopeSchema.parse(decoded);
}
