import path from "node:path";
import { loadRuntimeConfig } from "../src/core/config/loadRuntimeConfig.js";
import { createRuntimeDatabase } from "../src/core/db/createRuntimeDatabase.js";
import { checkpointWal } from "../src/core/db/sqliteHealth.js";
import { createVerifiedSnapshot } from "../src/core/db/sqliteSnapshots.js";

const config = await loadRuntimeConfig();
const backupRootDir = path.join(path.dirname(config.database.file), "recovery-backups");
const db = createRuntimeDatabase({
  databaseFile: config.database.file,
  recoveryDir: backupRootDir
});

checkpointWal(db);

const manifest = await createVerifiedSnapshot({
  db,
  databaseFile: config.database.file,
  backupRootDir
});

db.close();

console.log(`Snapshot created: ${manifest.snapshotFile}`);
console.log(`Manifest created: ${path.join(path.dirname(manifest.snapshotFile), "manifest.json")}`);
