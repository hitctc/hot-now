import { openDatabase, type SqliteDatabase } from "./openDatabase.js";
import { listRecoverySnapshots } from "./sqliteSnapshots.js";
import {
  buildCorruptDatabaseMessage,
  isCorruptSqliteError,
  runQuickCheck,
  type RecoverySnapshotSummary
} from "./sqliteHealth.js";

type CreateRuntimeDatabaseInput = {
  databaseFile: string;
  recoveryDir: string;
  listRecoverySnapshots?: (directory: string, limit?: number) => RecoverySnapshotSummary[];
};

export function createRuntimeDatabase(input: CreateRuntimeDatabaseInput): SqliteDatabase {
  const readSnapshots = input.listRecoverySnapshots ?? listRecoverySnapshots;
  let db: SqliteDatabase | null = null;

  try {
    db = openDatabase(input.databaseFile);
    const quickCheck = runQuickCheck(db);

    if (!quickCheck.ok) {
      db.close();
      throw new Error(
        buildCorruptDatabaseMessage(
          input.databaseFile,
          input.recoveryDir,
          readSnapshots(input.recoveryDir, 3),
          quickCheck.message
        )
      );
    }

    return db;
  } catch (error) {
    if (db?.open) {
      db.close();
    }

    if (!isCorruptSqliteError(error)) {
      throw error;
    }

    throw new Error(
      buildCorruptDatabaseMessage(
        input.databaseFile,
        input.recoveryDir,
        readSnapshots(input.recoveryDir, 3),
        error instanceof Error ? error.message : "unknown sqlite corruption"
      )
    );
  }
}
