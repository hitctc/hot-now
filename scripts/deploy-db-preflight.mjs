import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const PRE_DEPLOY_SNAPSHOT_PATTERN =
  /^pre-deploy-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

/**
 * 清理部署前快照：最近几份完整保留，其余只保留保留窗口内每天最后一份。
 * 专项备份和未知命名文件不会进入候选集合。
 */
function prunePreDeploySnapshots({ backupDir, now = new Date(), keepLatest = 5, keepDailyDays = 14 }) {
  const snapshots = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && PRE_DEPLOY_SNAPSHOT_PATTERN.test(entry.name))
    .map((entry) => {
      const filePath = path.join(backupDir, entry.name);
      return { filePath, name: entry.name, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const keep = new Set(snapshots.slice(0, keepLatest).map((snapshot) => snapshot.filePath));
  const newestByDay = new Map();
  const cutoffMs = now.getTime() - keepDailyDays * DAY_IN_MS;

  for (const snapshot of snapshots) {
    if (snapshot.mtimeMs < cutoffMs) continue;
    const day = formatLocalDay(new Date(snapshot.mtimeMs));
    if (!newestByDay.has(day)) {
      newestByDay.set(day, snapshot.filePath);
      keep.add(snapshot.filePath);
    }
  }

  const deleted = [];
  for (const snapshot of snapshots) {
    if (keep.has(snapshot.filePath)) continue;
    removeSnapshotWithSidecars(snapshot.filePath);
    deleted.push(snapshot.name);
  }

  return { deleted, kept: snapshots.length - deleted.length };
}

/** 删除已选中的部署快照及其 SQLite sidecar，不扩大到其他文件。 */
function removeSnapshotWithSidecars(snapshotFile) {
  const snapshotStat = fs.lstatSync(snapshotFile);
  if (!snapshotStat.isFile() || snapshotStat.isSymbolicLink()) {
    throw new Error(`Refusing to remove unsafe pre-deploy snapshot: ${snapshotFile}`);
  }
  fs.rmSync(snapshotFile);
  fs.rmSync(`${snapshotFile}-wal`, { force: true });
  fs.rmSync(`${snapshotFile}-shm`, { force: true });
}

/** 使用服务器本地时区生成自然日键，与生产运维看到的日期保持一致。 */
function formatLocalDay(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const appDir = process.cwd();
const configPath = path.join(appDir, "config", "hot-now.config.json");
const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const envFile = process.env.HOT_NOW_ENV_FILE || path.join(appDir, ".env");
const configuredDatabase = process.env.HOT_NOW_DATABASE_FILE
  || readEnvValue(envFile, "HOT_NOW_DATABASE_FILE");
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

// 只有新快照通过完整性检查后才清理旧部署快照，专项备份不受影响。
const retention = prunePreDeploySnapshots({ backupDir });

console.log(`Production database healthy: ${databaseFile}`);
console.log(`Verified pre-deploy snapshot: ${backupFile}`);
console.log(`Pre-deploy snapshot retention: kept ${retention.kept}, deleted ${retention.deleted.length}`);
