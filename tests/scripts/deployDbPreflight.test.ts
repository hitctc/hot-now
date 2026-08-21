import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";

describe("deploy database preflight", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
    }
  });

  it("creates a verified snapshot and applies the bounded retention policy", () => {
    const appDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-deploy-preflight-"));
    tempDirs.push(appDir);
    const dataDir = path.join(appDir, "data");
    const backupDir = path.join(dataDir, "recovery-backups");
    const databaseFile = path.join(dataDir, "hot-now.sqlite");
    mkdirSync(backupDir, { recursive: true });

    const db = openDatabase(databaseFile);
    db.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, title TEXT NOT NULL);");
    db.prepare("INSERT INTO demo (title) VALUES (?)").run("snapshot-ready");
    db.close();

    const now = new Date();
    const recentAt = new Date(now.getTime() - 60_000);
    const recentNames = Array.from({ length: 7 }, (_, index) =>
      createSnapshot(backupDir, formatPreDeployName(new Date(recentAt.getTime() - index)), recentAt)
    );
    const priorDailyDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const priorDaily = createSnapshot(
      backupDir,
      formatPreDeployName(priorDailyDate),
      priorDailyDate
    );
    const oldDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    const oldSnapshot = createSnapshot(
      backupDir,
      formatPreDeployName(oldDate),
      oldDate
    );
    writeFileSync(`${oldSnapshot}-wal`, "wal");
    writeFileSync(`${oldSnapshot}-shm`, "shm");
    const special = createSnapshot(
      backupDir,
      "pre-creative-automation-stop-test.sqlite",
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    );
    const unknown = createSnapshot(
      backupDir,
      "manual-backup.sqlite",
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    );
    const invalidPreDeployName = createSnapshot(
      backupDir,
      "pre-deploy-manual-note.sqlite",
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    );

    const scriptPath = path.resolve("scripts/deploy-db-preflight.mjs");
    const result = spawnSync(process.execPath, ["--input-type=module"], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: { ...process.env, HOT_NOW_DATABASE_FILE: databaseFile },
      input: readFileSync(scriptPath, "utf8")
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Production database healthy");
    expect(result.stdout).toContain("Pre-deploy snapshot retention: kept 6, deleted 4");
    expect(readdirSync(backupDir).filter((name) =>
      /^pre-deploy-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite$/.test(name)
    )).toHaveLength(6);
    expect(existsSync(priorDaily)).toBe(true);
    expect(recentNames.filter((name) => existsSync(name))).toHaveLength(4);
    expect(existsSync(oldSnapshot)).toBe(false);
    expect(existsSync(`${oldSnapshot}-wal`)).toBe(false);
    expect(existsSync(`${oldSnapshot}-shm`)).toBe(false);
    expect(existsSync(special)).toBe(true);
    expect(existsSync(unknown)).toBe(true);
    expect(existsSync(invalidPreDeployName)).toBe(true);
  });
});

/** 创建带指定修改时间的测试快照，模拟生产目录中的历史文件。 */
function createSnapshot(directory: string, name: string, modifiedAt: Date) {
  const filePath = path.join(directory, name);
  writeFileSync(filePath, name);
  utimesSync(filePath, modifiedAt, modifiedAt);
  return filePath;
}

/** 按生产脚本格式生成部署前快照文件名。 */
function formatPreDeployName(date: Date) {
  return `pre-deploy-${date.toISOString().replace(/[:.]/g, "-")}.sqlite`;
}
