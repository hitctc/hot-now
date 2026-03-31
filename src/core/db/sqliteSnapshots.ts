import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RecoverySnapshotSummary } from "./sqliteHealth.js";

type SnapshotManifest = {
  createdAt: string;
  snapshotFile: string;
};

export function listRecoverySnapshots(directory: string, limit = 3): RecoverySnapshotSummary[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => right.name.localeCompare(left.name))
    .map((entry) => {
      const manifestPath = path.join(directory, entry.name, "manifest.json");

      if (!existsSync(manifestPath)) {
        return null;
      }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as SnapshotManifest;

      return {
        createdAt: manifest.createdAt,
        directory: path.join(directory, entry.name),
        snapshotFile: manifest.snapshotFile
      } satisfies RecoverySnapshotSummary;
    })
    .filter((snapshot): snapshot is RecoverySnapshotSummary => snapshot !== null)
    .slice(0, limit);
}
