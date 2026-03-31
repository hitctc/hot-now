# HotNow SQLite Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HotNow 的本地 SQLite 从“容易被错误工作流弄坏的 live 库”升级成“正常退出会 checkpoint、启动会校验、跨设备靠已验证快照流转、坏库后有标准恢复命令”的可靠本地库。

**Architecture:** 保持现有单进程 Fastify + SQLite 架构，不迁移外部数据库，也不把 `.sqlite-wal` / `.sqlite-shm` 纳入版本管理。核心改法是补一层数据库生命周期工具：启动时做 SQLite 健康检查并给出恢复指引，关闭时真实执行 `wal_checkpoint(TRUNCATE)`，再通过 `better-sqlite3` 的 `db.backup()` 生成带 `manifest.json` 的已验证快照，并提供 restore 命令给另一台设备或服务器初始化。

**Tech Stack:** TypeScript, better-sqlite3, Node.js fs/path, Fastify, Vitest, tsx

---

## File Map

- Modify: `.gitignore`
  - 忽略 live `data/hot-now.sqlite` 和恢复流程不应入库的原始损坏副本
- Modify: `package.json`
  - 增加 `db:check`、`db:snapshot`、`db:restore` 命令
- Modify: `src/core/db/openDatabase.ts`
  - 支持只读打开已存在的 SQLite 文件，给快照校验和恢复校验复用
- Create: `src/core/db/sqliteHealth.ts`
  - 负责 `quick_check` / `integrity_check`、WAL checkpoint、损坏错误判定和恢复提示文案
- Create: `src/core/db/createRuntimeDatabase.ts`
  - 负责应用启动时“打开数据库 + 快速健康检查 + 发现坏库时输出恢复指引”
- Create: `src/core/db/sqliteSnapshots.ts`
  - 负责 `db.backup()` 快照、`manifest.json` 写入、快照列表读取、restore 与 sidecar 清理
- Modify: `src/main.ts`
  - 用 `createRuntimeDatabase()` 启动数据库，并在 graceful shutdown 里接入真实 checkpoint
- Create: `scripts/db-check.ts`
  - 命令行完整性检查入口，默认检查 `config.database.file`
- Create: `scripts/db-snapshot.ts`
  - 命令行快照入口，创建 `data/recovery-backups/<timestamp>/hot-now.sqlite + manifest.json`
- Create: `scripts/db-restore.ts`
  - 命令行恢复入口，从指定快照恢复主库
- Create: `tests/db/sqliteHealth.test.ts`
  - 覆盖健康检查、损坏错误识别和只读打开行为
- Create: `tests/db/createRuntimeDatabase.test.ts`
  - 覆盖启动时好库通过、坏库报恢复提示
- Create: `tests/db/sqliteSnapshots.test.ts`
  - 覆盖 verified snapshot、manifest、restore 和 sidecar 清理
- Modify: `tests/runtime/installGracefulShutdown.test.ts`
  - 补一个 checkpoint 失败仍会 close database 且 exitCode=1 的回归测试
- Update Docs: `README.md`, `AGENTS.md`
  - 记录 live 库 / verified snapshot 的职责、跨设备与服务器的使用方式，以及新命令

### Task 1: 建立 SQLite 健康检查与安全启动入口

**Files:**
- Modify: `src/core/db/openDatabase.ts`
- Create: `src/core/db/sqliteHealth.ts`
- Create: `src/core/db/createRuntimeDatabase.ts`
- Modify: `src/main.ts`
- Create: `tests/db/sqliteHealth.test.ts`
- Create: `tests/db/createRuntimeDatabase.test.ts`
- Modify: `tests/runtime/installGracefulShutdown.test.ts`

- [ ] **Step 1: 先写失败测试，锁定好库、坏库和 shutdown checkpoint 的目标行为**

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { createRuntimeDatabase } from "../../src/core/db/createRuntimeDatabase.js";
import { runIntegrityCheck, runQuickCheck } from "../../src/core/db/sqliteHealth.js";

describe("sqliteHealth", () => {
  it("reports ok for a healthy database", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-health-"));
    const file = path.join(tempDir, "hot-now.sqlite");
    const db = openDatabase(file);

    db.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, title TEXT NOT NULL);");
    db.prepare("INSERT INTO demo (title) VALUES (?)").run("healthy");

    expect(runQuickCheck(db)).toEqual({ ok: true });
    expect(runIntegrityCheck(db)).toEqual({ ok: true });

    db.close();
  });

  it("opens snapshot files in readonly mode without rewriting pragmas", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-readonly-"));
    const file = path.join(tempDir, "hot-now.sqlite");
    const writable = openDatabase(file);

    writable.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, title TEXT NOT NULL);");
    writable.close();

    const readonly = openDatabase(file, { readonly: true });

    expect(readonly.prepare("SELECT COUNT(*) AS count FROM demo").get()).toEqual({ count: 0 });
    expect(() => readonly.exec("INSERT INTO demo (title) VALUES ('blocked')")).toThrow();

    readonly.close();
  });
});

describe("createRuntimeDatabase", () => {
  it("throws recovery guidance when the runtime sqlite file is malformed", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-runtime-db-"));
    const databaseFile = path.join(tempDir, "hot-now.sqlite");
    const recoveryDir = path.join(tempDir, "recovery-backups");

    writeFileSync(databaseFile, "not a sqlite database");

    expect(() =>
      createRuntimeDatabase({
        databaseFile,
        recoveryDir,
        listRecoverySnapshots: () => [
          {
            createdAt: "2026-03-31T09:00:00.000Z",
            directory: path.join(recoveryDir, "20260331-170000"),
            snapshotFile: path.join(recoveryDir, "20260331-170000", "hot-now.sqlite")
          }
        ]
      })
    ).toThrow(/npm run db:restore -- .*20260331-170000\/hot-now\.sqlite/);
  });
});
```

```ts
it("returns exit code 1 when checkpointing throws but still closes the database", async () => {
  const signalProcess = new EventEmitter() as FakeSignalProcess;
  const closeDatabase = vi.fn(() => undefined);
  const exit = vi.fn();

  installGracefulShutdown({
    process: signalProcess,
    exit,
    logger: {
      info: vi.fn(),
      error: vi.fn()
    },
    scheduledTasks: [],
    waitForIdle: vi.fn(async () => undefined),
    closeServer: vi.fn(async () => undefined),
    checkpointDatabase: vi.fn(() => {
      throw new Error("checkpoint failed");
    }),
    closeDatabase
  });

  signalProcess.emit("SIGTERM");
  await flushMicrotasks();

  expect(closeDatabase).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledWith(1);
});
```

- [ ] **Step 2: 先跑新测试，确认现状还没有健康检查与恢复提示**

Run: `npx vitest run tests/db/sqliteHealth.test.ts tests/db/createRuntimeDatabase.test.ts tests/runtime/installGracefulShutdown.test.ts`

Expected: FAIL，报错点应集中在 `openDatabase(..., { readonly: true })` 尚不支持、`sqliteHealth` / `createRuntimeDatabase` 尚未实现

- [ ] **Step 3: 实现只读打开、健康检查、恢复提示和 main.ts 启动接线**

```ts
// src/core/db/openDatabase.ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;
type OpenDatabaseOptions = {
  readonly?: boolean;
};

export function openDatabase(file: string, options: OpenDatabaseOptions = {}): SqliteDatabase {
  mkdirSync(path.dirname(file), { recursive: true });

  const db = options.readonly
    ? new Database(file, { readonly: true, fileMustExist: true })
    : new Database(file);

  if (!options.readonly) {
    db.pragma("journal_mode = WAL");
  }

  db.pragma("foreign_keys = ON");
  return db;
}
```

```ts
// src/core/db/sqliteHealth.ts
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
    : ["- 无已验证快照，请先准备一份快照再恢复"];

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
    .filter(Boolean)
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
```

```ts
// src/core/db/createRuntimeDatabase.ts
import { openDatabase, type SqliteDatabase } from "./openDatabase.js";
import {
  buildCorruptDatabaseMessage,
  isCorruptSqliteError,
  runQuickCheck,
  type RecoverySnapshotSummary
} from "./sqliteHealth.js";
import { listRecoverySnapshots } from "./sqliteSnapshots.js";

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
```

```ts
// src/main.ts
import path from "node:path";
import { createRuntimeDatabase } from "./core/db/createRuntimeDatabase.js";
import { checkpointWal } from "./core/db/sqliteHealth.js";

const recoveryDir = path.join(path.dirname(config.database.file), "recovery-backups");
const db = createRuntimeDatabase({
  databaseFile: config.database.file,
  recoveryDir
});

installGracefulShutdown({
  process,
  exit: (code) => process.exit(code),
  logger: app.log,
  scheduledTasks: [collectionScheduler, mailScheduler],
  waitForIdle: async () => {
    await lock.waitForIdle();
  },
  closeServer: async () => {
    await app.close();
  },
  checkpointDatabase: () => {
    checkpointWal(db);
  },
  closeDatabase: () => {
    if (db.open) {
      db.close();
    }
  }
});
```

- [ ] **Step 4: 跑数据库健康检查相关测试，确认启动和关闭链路都收口**

Run: `npx vitest run tests/db/sqliteHealth.test.ts tests/db/createRuntimeDatabase.test.ts tests/runtime/installGracefulShutdown.test.ts`

Expected: PASS

- [ ] **Step 5: 提交 Task 1**

```bash
git add src/core/db/openDatabase.ts src/core/db/sqliteHealth.ts src/core/db/createRuntimeDatabase.ts src/main.ts tests/db/sqliteHealth.test.ts tests/db/createRuntimeDatabase.test.ts tests/runtime/installGracefulShutdown.test.ts
git commit -m "fix: harden sqlite runtime startup and shutdown"
```

### Task 2: 增加 verified snapshot / restore 与数据库命令

**Files:**
- Create: `src/core/db/sqliteSnapshots.ts`
- Create: `scripts/db-check.ts`
- Create: `scripts/db-snapshot.ts`
- Create: `scripts/db-restore.ts`
- Modify: `package.json`
- Create: `tests/db/sqliteSnapshots.test.ts`

- [ ] **Step 1: 先写失败测试，锁定快照 manifest、完整性校验和恢复行为**

```ts
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import {
  createVerifiedSnapshot,
  listRecoverySnapshots,
  restoreSnapshot
} from "../../src/core/db/sqliteSnapshots.js";

describe("sqliteSnapshots", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a verified snapshot with manifest metadata", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-snapshot-"));
    tempDirs.push(tempDir);
    const databaseFile = path.join(tempDir, "hot-now.sqlite");
    const recoveryDir = path.join(tempDir, "recovery-backups");
    const db = openDatabase(databaseFile);

    db.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, title TEXT NOT NULL);");
    db.prepare("INSERT INTO demo (title) VALUES (?)").run("snapshot-ready");

    const manifest = await createVerifiedSnapshot({
      db,
      databaseFile,
      backupRootDir: recoveryDir,
      now: () => new Date(2026, 2, 31, 17, 10, 0)
    });

    expect(manifest.integrityCheck).toBe("ok");
    expect(manifest.tables.demo).toBe(1);
    expect(manifest.snapshotFile).toMatch(/20260331-171000\/hot-now\.sqlite$/);
    expect(listRecoverySnapshots(recoveryDir, 1)[0]?.snapshotFile).toBe(manifest.snapshotFile);

    db.close();
  });

  it("restores the target database from a verified snapshot and clears stale wal sidecars", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-restore-"));
    tempDirs.push(tempDir);
    const databaseFile = path.join(tempDir, "hot-now.sqlite");
    const recoveryDir = path.join(tempDir, "recovery-backups");
    const db = openDatabase(databaseFile);

    db.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, title TEXT NOT NULL);");
    db.prepare("INSERT INTO demo (title) VALUES (?)").run("before-restore");

    const manifest = await createVerifiedSnapshot({
      db,
      databaseFile,
      backupRootDir: recoveryDir,
      now: () => new Date(2026, 2, 31, 17, 15, 0)
    });

    db.prepare("DELETE FROM demo").run();
    db.prepare("INSERT INTO demo (title) VALUES (?)").run("after-snapshot");
    db.close();

    writeFileSync(`${databaseFile}-wal`, "");
    writeFileSync(`${databaseFile}-shm`, "");

    restoreSnapshot({
      snapshotFile: manifest.snapshotFile,
      targetDatabaseFile: databaseFile
    });

    const restored = openDatabase(databaseFile, { readonly: true });

    expect(restored.prepare("SELECT title FROM demo").all()).toEqual([{ title: "before-restore" }]);
    expect(existsSync(`${databaseFile}-wal`)).toBe(false);
    expect(existsSync(`${databaseFile}-shm`)).toBe(false);

    restored.close();
  });
});
```

- [ ] **Step 2: 跑快照测试，确认当前仓库还没有 snapshot / restore 能力**

Run: `npx vitest run tests/db/sqliteSnapshots.test.ts`

Expected: FAIL，报错点应集中在 `sqliteSnapshots` 尚未实现

- [ ] **Step 3: 用 `db.backup()` 实现 verified snapshot、restore 命令和 npm scripts**

```ts
// src/core/db/sqliteSnapshots.ts
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

  rmSync(rollbackFile, { force: true });
}

export function listRecoverySnapshots(directory: string, limit = 3): RecoverySnapshotSummary[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => right.name.localeCompare(left.name))
    .filter((entry) => existsSync(path.join(directory, entry.name, "manifest.json")))
    .slice(0, limit)
    .map((entry) => {
      const manifestPath = path.join(directory, entry.name, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as SnapshotManifest;

      return {
        createdAt: manifest.createdAt,
        directory: path.join(directory, entry.name),
        snapshotFile: manifest.snapshotFile
      };
    });
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
```

```ts
// scripts/db-check.ts
import { loadRuntimeConfig } from "../src/core/config/loadRuntimeConfig.js";
import { openDatabase } from "../src/core/db/openDatabase.js";
import { runIntegrityCheck } from "../src/core/db/sqliteHealth.js";

const config = await loadRuntimeConfig();
const db = openDatabase(config.database.file, { readonly: true });
const result = runIntegrityCheck(db);
db.close();

if (!result.ok) {
  console.error(`Database integrity: ${result.message}`);
  process.exit(1);
}

console.log("Database integrity: ok");
```

```ts
// scripts/db-snapshot.ts
import path from "node:path";
import { loadRuntimeConfig } from "../src/core/config/loadRuntimeConfig.js";
import { openDatabase } from "../src/core/db/openDatabase.js";
import { createVerifiedSnapshot } from "../src/core/db/sqliteSnapshots.js";

const config = await loadRuntimeConfig();
const db = openDatabase(config.database.file);
const backupRootDir = path.join(path.dirname(config.database.file), "recovery-backups");

const manifest = await createVerifiedSnapshot({
  db,
  databaseFile: config.database.file,
  backupRootDir
});

db.close();
console.log(`Snapshot created: ${manifest.snapshotFile}`);
console.log(`Manifest created: ${path.join(path.dirname(manifest.snapshotFile), "manifest.json")}`);
```

```ts
// scripts/db-restore.ts
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
```

```json
// package.json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "dev:local": "zsh ./scripts/dev-local.sh",
    "start": "node dist/main.js",
    "build": "rm -rf dist && tsc -p tsconfig.json",
    "test": "vitest run",
    "db:check": "tsx scripts/db-check.ts",
    "db:snapshot": "tsx scripts/db-snapshot.ts",
    "db:restore": "tsx scripts/db-restore.ts"
  }
}
```

- [ ] **Step 4: 跑快照测试和只读校验命令，确认 verified snapshot 工作流成立**

Run: `npx vitest run tests/db/sqliteSnapshots.test.ts tests/db/sqliteHealth.test.ts`

Expected: PASS

Run: `npm run db:check`

Expected: 输出 `Database integrity: ok`

- [ ] **Step 5: 提交 Task 2**

```bash
git add src/core/db/sqliteSnapshots.ts scripts/db-check.ts scripts/db-snapshot.ts scripts/db-restore.ts package.json tests/db/sqliteSnapshots.test.ts
git commit -m "feat: add verified sqlite snapshot and restore commands"
```

### Task 3: 收紧仓库工作流并同步文档

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新 ignore 规则和协作文档，明确 live 库不能再作为常规版本产物**

```gitignore
node_modules
dist
.env
.env.local
*.sqlite-shm
*.sqlite-wal
data/hot-now.sqlite
data/recovery-backups/*/*.original*

.DS_Store
```

```md
## 本地数据库可靠性

- `data/hot-now.sqlite` 是运行中的 live 库，不再作为常规 git 产物提交
- 跨设备开发、服务器初始化或回滚恢复，只使用 `data/recovery-backups/<timestamp>/hot-now.sqlite`
- 新增命令：
  - `npm run db:check`
  - `npm run db:snapshot`
  - `npm run db:restore -- data/recovery-backups/<timestamp>/hot-now.sqlite`
- 正常退出时应用会执行 SQLite `wal_checkpoint(TRUNCATE)`
- 如果启动时报数据库损坏，请先执行 `npm run db:check`，再从最近一份 verified snapshot 恢复
```

```md
## 5. 运行与验证

- 新增数据库维护命令：
  - `npm run db:check`
  - `npm run db:snapshot`
  - `npm run db:restore -- <snapshot-file>`
- `data/hot-now.sqlite` 现在视为运行时文件，不再作为常规 git 产物
- `data/recovery-backups/<timestamp>/hot-now.sqlite + manifest.json` 才是跨设备和服务器初始化的标准流转物
```

- [ ] **Step 2: 停止追踪 live 库和旧的原始损坏副本，避免后续继续把运行中数据库直接推远端**

Run:

```bash
git rm --cached data/hot-now.sqlite
git rm --cached data/recovery-backups/20260330-192033/hot-now.sqlite.original-corrupt
git rm --cached data/recovery-backups/20260330-192033/hot-now.sqlite-shm.original
git rm --cached data/recovery-backups/20260330-192033/hot-now.sqlite-wal.original
```

Expected: `git status --short` 里出现 `D data/hot-now.sqlite` 和 3 个 `.original*` 删除项，但本地文件仍保留在工作区

- [ ] **Step 3: 跑最相关的全量验证，确认文档、类型和命令链路都可交付**

Run: `npx vitest run tests/db/sqliteHealth.test.ts tests/db/createRuntimeDatabase.test.ts tests/db/sqliteSnapshots.test.ts tests/runtime/installGracefulShutdown.test.ts`

Expected: PASS

Run: `npm run build`

Expected: PASS

Run: `npm run db:snapshot`

Expected: 输出新快照目录和 `manifest.json` 路径，目录形如 `data/recovery-backups/<timestamp>/`

Run: `npm run dev:local`

Expected: 服务正常启动并监听 `http://127.0.0.1:3030`

- [ ] **Step 4: 提交 Task 3**

```bash
git add .gitignore README.md AGENTS.md
git add data/recovery-backups
git commit -m "docs: document reliable sqlite workflow"
```

## Self-Review

- Spec coverage:
  - 启动时坏库指引：Task 1
  - 关闭时真实 checkpoint：Task 1
  - verified snapshot / restore：Task 2
  - 跨设备 / 服务器使用方式：Task 3
  - 停止常规提交 live 库：Task 3
- Placeholder scan:
  - 已检查，无 `TODO`、`TBD`、`implement later` 之类占位语
- Type consistency:
  - `runQuickCheck` / `runIntegrityCheck` / `checkpointWal`
  - `createRuntimeDatabase`
  - `createVerifiedSnapshot` / `restoreSnapshot` / `listRecoverySnapshots`
  - 上述命名在所有任务里保持一致
