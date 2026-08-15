import { rm } from "node:fs/promises";

export default async function teardown() {
  const root = process.env.READING_WORLD_TAXONOMY_E2E_TEMP_ROOT;
  if (root) await rm(root, { recursive: true, force: true });
}
