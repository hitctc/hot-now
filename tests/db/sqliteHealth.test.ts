import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type SqliteDatabase } from "../../src/core/db/openDatabase.js";
import { runIntegrityCheck, runQuickCheck } from "../../src/core/db/sqliteHealth.js";

describe("sqliteHealth", () => {
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

  it("reports ok for a healthy database", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-health-"));
    const file = path.join(tempDir, "hot-now.sqlite");
    const db = openDatabase(file);
    tempDirs.push(tempDir);
    databasesToClose.push(db);

    db.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, title TEXT NOT NULL);");
    db.prepare("INSERT INTO demo (title) VALUES (?)").run("healthy");

    expect(runQuickCheck(db)).toEqual({ ok: true });
    expect(runIntegrityCheck(db)).toEqual({ ok: true });
  });

  it("opens existing databases in readonly mode without allowing writes", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-readonly-"));
    const file = path.join(tempDir, "hot-now.sqlite");
    const writable = openDatabase(file);
    tempDirs.push(tempDir);
    databasesToClose.push(writable);

    writable.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, title TEXT NOT NULL);");

    const readonly = openDatabase(file, { readonly: true });
    databasesToClose.push(readonly);

    expect(readonly.prepare("SELECT COUNT(*) AS count FROM demo").get()).toEqual({ count: 0 });
    expect(() => readonly.exec("INSERT INTO demo (title) VALUES ('blocked')")).toThrow();
  });
});
