import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/** 只读取部署所需的单个环境变量，避免把生产密钥注入检查进程。 */
function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return undefined;
  const line = fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}=`));
  if (!line) return undefined;
  return line.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
}

/** quick_check 必须只返回 ok，否则立即终止部署。 */
function assertHealthy(db, label) {
  const rows = db.pragma("quick_check");
  const messages = rows.flatMap((row) => Object.values(row).map(String));
  if (messages.length !== 1 || messages[0].toLowerCase() !== "ok") {
    throw new Error(`${label} database quick_check failed: ${messages.join("; ")}`);
  }
}

const appDir = process.cwd();
const configPath = path.join(appDir, "config", "hot-now.config.json");
const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const configuredDatabase = process.env.HOT_NOW_DATABASE_FILE
  || readEnvValue(path.join(appDir, ".env"), "HOT_NOW_DATABASE_FILE");
const databaseFile = configuredDatabase
  ? path.resolve(configuredDatabase)
  : path.resolve(path.dirname(configPath), fileConfig.database.file);
const backupDir = path.join(path.dirname(databaseFile), "recovery-backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = path.join(backupDir, `pre-deploy-${timestamp}.sqlite`);

fs.mkdirSync(backupDir, { recursive: true });
const source = new Database(databaseFile, { readonly: true, fileMustExist: true });
try {
  assertHealthy(source, "production");
  await source.backup(backupFile);
} finally {
  source.close();
}

const snapshot = new Database(backupFile, { readonly: true, fileMustExist: true });
try {
  assertHealthy(snapshot, "snapshot");
} finally {
  snapshot.close();
}

console.log(`Production database healthy: ${databaseFile}`);
console.log(`Verified pre-deploy snapshot: ${backupFile}`);
