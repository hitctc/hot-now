import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type SqliteDatabase } from "../../src/core/db/openDatabase.js";
import {
  createVerifiedSnapshot,
  listRecoverySnapshots,
  restoreSnapshot
} from "../../src/core/db/sqliteSnapshots.js";

describe("sqliteSnapshots", () => {
  const tempDirs: string[] = [];
  const databasesToClose: SqliteDatabase[] = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      const db = databasesToClose.pop();

      if (db?.open) {
        db.close();
      }
    }

    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
    }
  });

  it("creates a verified snapshot with manifest metadata", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-snapshot-"));
    tempDirs.push(tempDir);
    const databaseFile = path.join(tempDir, "hot-now.sqlite");
    const recoveryDir = path.join(tempDir, "recovery-backups");
    const db = openDatabase(databaseFile);
    databasesToClose.push(db);

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
  });

  it("restores the target database from a verified snapshot and clears stale wal sidecars", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-restore-"));
    tempDirs.push(tempDir);
    const databaseFile = path.join(tempDir, "hot-now.sqlite");
    const recoveryDir = path.join(tempDir, "recovery-backups");
    const db = openDatabase(databaseFile);
    databasesToClose.push(db);

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

    expect(existsSync(`${databaseFile}-wal`)).toBe(false);
    expect(existsSync(`${databaseFile}-shm`)).toBe(false);

    const restored = openDatabase(databaseFile, { readonly: true });
    databasesToClose.push(restored);

    expect(restored.prepare("SELECT title FROM demo").all()).toEqual([{ title: "before-restore" }]);
  });
});
