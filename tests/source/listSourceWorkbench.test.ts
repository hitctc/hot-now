import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { listSourceWorkbench } from "../../src/core/source/listSourceWorkbench.js";

describe("listSourceWorkbench", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T04:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("returns total, published-today, collected-today, and per-view candidate/visible counts", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "Today visible",
          canonicalUrl: "https://example.com/today-visible",
          summary: "Today visible summary",
          bodyMarkdown: "Today visible body",
          publishedAt: "2026-03-31T01:00:00.000Z",
          fetchedAt: "2026-03-31T01:05:00.000Z"
        },
        {
          title: "Today collected only",
          canonicalUrl: "https://example.com/today-collected",
          summary: "Today collected summary",
          bodyMarkdown: "Today collected body",
          publishedAt: "2026-03-30T10:00:00.000Z",
          fetchedAt: "2026-03-31T02:00:00.000Z"
        }
      ]
    });

    const workbench = listSourceWorkbench(db);
    const openaiRow = workbench.find((row) => row.kind === "openai");

    expect(openaiRow).toMatchObject({
      totalCount: 2,
      publishedTodayCount: 1,
      collectedTodayCount: 2
    });
    expect(openaiRow?.viewStats.hot.candidateCount).toBeGreaterThanOrEqual(1);
    expect(openaiRow?.viewStats.hot.visibleCount).toBeGreaterThanOrEqual(1);
  });
});

async function createTestDatabase(databasesToClose: ReturnType<typeof openDatabase>[]) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-source-workbench-"));
  const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
  databasesToClose.push(db);
  runMigrations(db);
  seedInitialData(db, { username: "admin", password: "bootstrap-password" });
  return db;
}
