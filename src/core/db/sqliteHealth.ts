import type { SqliteDatabase } from "./openDatabase.js";

export type SqliteCheckResult = { ok: true } | { ok: false; message: string };
export type RecoverySnapshotSummary = {
  createdAt: string;
  directory: string;
  snapshotFile: string;
};

export function runQuickCheck(db: SqliteDatabase): SqliteCheckResult {
  return runCheck(db, "quick_check");
}

export function runIntegrityCheck(db: SqliteDatabase): SqliteCheckResult {
  return runCheck(db, "integrity_check");
}

export function checkpointWal(db: SqliteDatabase) {
  // Truncate keeps the main db current and drops stale WAL sidecars before shutdown completes.
  db.pragma("wal_checkpoint(TRUNCATE)");
}

export function isCorruptSqliteError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    code === "SQLITE_CORRUPT" ||
    code === "SQLITE_NOTADB" ||
    /database disk image is malformed/i.test(message) ||
    /file is not a database/i.test(message)
  );
}

export function buildCorruptDatabaseMessage(
  databaseFile: string,
  recoveryDir: string,
  recentSnapshots: RecoverySnapshotSummary[],
  reason?: string
) {
  const lines = recentSnapshots.length
    ? recentSnapshots.map((snapshot) => `- ${snapshot.snapshotFile} (${snapshot.createdAt})`)
    : ["- 无已验证快照，请先准备一份 verified snapshot 再恢复"];

  return [
    `SQLite database is corrupt: ${databaseFile}`,
    reason ? `Reason: ${reason}` : null,
    `Recovery snapshots directory: ${recoveryDir}`,
    "Run `npm run db:check` to confirm the current file state.",
    "Restore a verified snapshot before restarting HotNow:",
    recentSnapshots[0] ? `npm run db:restore -- ${recentSnapshots[0].snapshotFile}` : null,
    "Recent snapshots:",
    ...lines
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function runCheck(db: SqliteDatabase, pragma: "quick_check" | "integrity_check"): SqliteCheckResult {
  const row = db.pragma(pragma, { simple: true });

  if (row === "ok") {
    return { ok: true };
  }

  return {
    ok: false,
    message: typeof row === "string" && row.length > 0 ? row : `${pragma} did not return ok`
  };
}
