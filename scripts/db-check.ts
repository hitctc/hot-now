import { loadRuntimeConfig } from "../src/core/config/loadRuntimeConfig.js";
import { openDatabase } from "../src/core/db/openDatabase.js";
import { isCorruptSqliteError, runIntegrityCheck } from "../src/core/db/sqliteHealth.js";

const config = await loadRuntimeConfig();

try {
  const db = openDatabase(config.database.file, { readonly: true });
  const result = runIntegrityCheck(db);
  db.close();

  if (!result.ok) {
    console.error(`Database integrity: ${result.message}`);
    process.exit(1);
  }

  console.log("Database integrity: ok");
} catch (error) {
  if (isCorruptSqliteError(error)) {
    console.error(error instanceof Error ? error.message : "database integrity check failed");
    process.exit(1);
  }

  throw error;
}
