import { loadRuntimeConfig } from "../src/core/config/loadRuntimeConfig.js";
import { restoreSnapshot } from "../src/core/db/sqliteSnapshots.js";

const snapshotFile = process.argv[2];

if (!snapshotFile) {
  console.error("Usage: npm run db:restore -- <snapshot-file>");
  process.exit(1);
}

const config = await loadRuntimeConfig();

restoreSnapshot({
  snapshotFile,
  targetDatabaseFile: config.database.file
});

console.log(`Database restored from: ${snapshotFile}`);
