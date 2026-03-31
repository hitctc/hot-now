import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeDatabase } from "../../src/core/db/createRuntimeDatabase.js";

describe("createRuntimeDatabase", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop() ?? "", { recursive: true, force: true });
    }
  });

  it("throws recovery guidance when the runtime sqlite file is malformed", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "hot-now-runtime-db-"));
    const databaseFile = path.join(tempDir, "hot-now.sqlite");
    const recoveryDir = path.join(tempDir, "recovery-backups");
    tempDirs.push(tempDir);

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
