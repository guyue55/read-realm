#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "apps/web-pwa/e2e/backup-restore.spec.ts",
  "docs/goals/reading-world-v1/reports/backup-format-v1.md",
  "docs/goals/reading-world-v1/reviews/phase-03-data-portability.md",
];
const missing = required.filter((path) => !existsSync(resolve(path)));
if (missing.length > 0) {
  process.stderr.write(`PHASE_03_PORTABILITY_MISSING=${JSON.stringify(missing)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PHASE_03_PORTABILITY_FILES=${required.length}\n`);
}
