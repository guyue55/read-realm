import type { Book } from "@reader/shared-types";

export type RemoteSearchResult = {
  status: "idle" | "loading" | "ready" | "failed";
  items: Book[];
};

export function mergeSearchResults(local: Book[], remote: RemoteSearchResult) {
  return { local, remote: remote.items, remoteStatus: remote.status };
}
