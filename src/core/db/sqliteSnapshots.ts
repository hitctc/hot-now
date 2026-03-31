import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openDatabase, type SqliteDatabase } from "./openDatabase.js";
import { runIntegrityCheck, type RecoverySnapshotSummary } from "./sqliteHealth.js";

export type SnapshotManifest = {
  createdAt: string;
  databaseFile: string;
  snapshotFile: string;
  integrityCheck: "ok";
  tables: Record<string, number>;
};

type CreateVerifiedSnapshotInput = {
  db: SqliteDatabase;
  databaseFile: string;
  backupRootDir: string;
  keep?: number;
  now?: () => Date;
};

type RestoreSnapshotInput = {
  snapshotFile: string;
  targetDatabaseFile: string;
};

export async function createVerifiedSnapshot(input: CreateVerifiedSnapshotInput): Promise<SnapshotManifest> {
  const now = input.now ?? (() => new Date());
  const stamp = formatSnapshotStamp(now());
  const snapshotDir = path.join(input.backupRootDir, stamp);
  const snapshotFile = path.join(snapshotDir, path.basename(input.databaseFile));

  mkdirSync(snapshotDir, { recursive: true });
  await input.db.backup(snapshotFile);

  const snapshotDb = openDatabase(snapshotFile, { readonly: true });
  const integrity = runIntegrityCheck(snapshotDb);

  if (!integrity.ok) {
    snapshotDb.close();
    rmSync(snapshotDir, { recursive: true, force: true });
    throw new Error(`Snapshot integrity check failed: ${integrity.message}`);
  }

  const manifest: SnapshotManifest = {
    createdAt: now().toISOString(),
    databaseFile: input.databaseFile,
    snapshotFile,
    integrityCheck: "ok",
    tables: collectTableCounts(snapshotDb)
  };

  writeFileSync(path.join(snapshotDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  snapshotDb.close();
  pruneSnapshots(input.backupRootDir, input.keep ?? 10);
  return manifest;
}

export function restoreSnapshot(input: RestoreSnapshotInput) {
  const snapshotDb = openDatabase(input.snapshotFile, { readonly: true });
  const snapshotIntegrity = runIntegrityCheck(snapshotDb);
  snapshotDb.close();

  if (!snapshotIntegrity.ok) {
    throw new Error(`Snapshot integrity check failed: ${snapshotIntegrity.message}`);
  }

  const rollbackFile = `${input.targetDatabaseFile}.pre-restore`;
  const stagingFile = `${input.targetDatabaseFile}.restore-staging`;

  rmSync(stagingFile, { force: true });
  removeSidecars(input.targetDatabaseFile);
  copyFileSync(input.snapshotFile, stagingFile);

  if (existsSync(input.targetDatabaseFile)) {
    rmSync(rollbackFile, { force: true });
    renameSync(input.targetDatabaseFile, rollbackFile);
  }

  renameSync(stagingFile, input.targetDatabaseFile);

  const restored = openDatabase(input.targetDatabaseFile, { readonly: true });
  const restoredIntegrity = runIntegrityCheck(restored);
  restored.close();

  if (!restoredIntegrity.ok) {
    rmSync(input.targetDatabaseFile, { force: true });

    if (existsSync(rollbackFile)) {
      renameSync(rollbackFile, input.targetDatabaseFile);
    }

    throw new Error(`Restored database failed integrity check: ${restoredIntegrity.message}`);
  }

  // Restore verification may recreate WAL sidecars for a WAL-mode database, so clear them again
  // before handing the restored file back to the caller.
  removeSidecars(input.targetDatabaseFile);
  rmSync(rollbackFile, { force: true });
}

export function listRecoverySnapshots(directory: string, limit = 3): RecoverySnapshotSummary[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => right.name.localeCompare(left.name))
    .map((entry) => readSnapshotSummary(directory, entry.name))
    .filter((snapshot): snapshot is RecoverySnapshotSummary => snapshot !== null)
    .slice(0, limit);
}

function readSnapshotSummary(directory: string, entryName: string): RecoverySnapshotSummary | null {
  const manifestPath = path.join(directory, entryName, "manifest.json");

  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<SnapshotManifest>;

    if (typeof manifest.createdAt !== "string" || typeof manifest.snapshotFile !== "string") {
      return null;
    }

    return {
      createdAt: manifest.createdAt,
      directory: path.join(directory, entryName),
      snapshotFile: manifest.snapshotFile
    };
  } catch {
    return null;
  }
}

function collectTableCounts(db: SqliteDatabase) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];

  return Object.fromEntries(
    tables.map(({ name }) => {
      const escapedName = `"${name.replaceAll('"', '""')}"`;
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${escapedName}`).get() as { count: number };
      return [name, row.count];
    })
  );
}

function pruneSnapshots(directory: string, keep: number) {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => right.name.localeCompare(left.name));

  for (const entry of entries.slice(keep)) {
    rmSync(path.join(directory, entry.name), { recursive: true, force: true });
  }
}

function removeSidecars(databaseFile: string) {
  rmSync(`${databaseFile}-wal`, { force: true });
  rmSync(`${databaseFile}-shm`, { force: true });
}

function formatSnapshotStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
