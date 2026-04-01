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

  it("returns total counts plus current-page today metrics for each source", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");
    const kr36 = resolveSourceByKind(db, "kr36");

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
        },
        {
          title: "Today fallback visible",
          canonicalUrl: "https://example.com/today-fallback-visible",
          summary: "Today fallback summary",
          bodyMarkdown: "Today fallback body",
          publishedAt: null,
          fetchedAt: "2026-03-31T03:00:00.000Z"
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: kr36!.id,
      items: [
        {
          title: "36Kr today visible",
          canonicalUrl: "https://example.com/36kr-today-visible",
          summary: "36Kr today visible summary",
          bodyMarkdown: "36Kr today visible body",
          publishedAt: "2026-03-31T02:00:00.000Z",
          fetchedAt: "2026-03-31T02:10:00.000Z"
        }
      ]
    });

    const workbench = listSourceWorkbench(db, {
      selectedSourceKinds: ["openai", "kr36"]
    });
    const openaiRow = workbench.find((row) => row.kind === "openai");
    const kr36Row = workbench.find((row) => row.kind === "kr36");

    expect(openaiRow).toMatchObject({
      totalCount: 3,
      publishedTodayCount: 1,
      collectedTodayCount: 3
    });
    expect(openaiRow?.viewStats.hot).toEqual({
      todayCandidateCount: 2,
      todayVisibleCount: 2,
      todayVisibleShare: 2 / 3
    });
    expect(openaiRow?.viewStats.ai).toEqual({
      todayCandidateCount: 2,
      todayVisibleCount: 2,
      todayVisibleShare: 2 / 3
    });
    expect(kr36Row?.viewStats.hot).toEqual({
      todayCandidateCount: 1,
      todayVisibleCount: 1,
      todayVisibleShare: 1 / 3
    });
  });

  it("keeps full-display sources out of the default workbench context until they are explicitly selected", async () => {
    const db = await createTestDatabase(databasesToClose);
    const juya = resolveSourceByKind(db, "juya");

    db.prepare(
      `
        UPDATE content_sources
        SET show_all_when_selected = 1
        WHERE kind = 'juya'
      `
    ).run();

    upsertContentItems(db, {
      sourceId: juya!.id,
      items: [
        {
          title: "Juya default hidden",
          canonicalUrl: "https://example.com/juya-default-hidden",
          summary: "Juya default hidden summary",
          bodyMarkdown: "Juya default hidden body",
          publishedAt: "2026-03-31T01:00:00.000Z",
          fetchedAt: "2026-03-31T01:05:00.000Z"
        }
      ]
    });

    const defaultWorkbench = listSourceWorkbench(db);
    const selectedWorkbench = listSourceWorkbench(db, {
      selectedSourceKinds: ["juya"]
    });
    const defaultJuyaRow = defaultWorkbench.find((row) => row.kind === "juya");
    const selectedJuyaRow = selectedWorkbench.find((row) => row.kind === "juya");

    expect(defaultJuyaRow).toMatchObject({
      totalCount: 1,
      publishedTodayCount: 1,
      collectedTodayCount: 1
    });
    expect(defaultJuyaRow?.viewStats.hot).toEqual({
      todayCandidateCount: 0,
      todayVisibleCount: 0,
      todayVisibleShare: 0
    });
    expect(selectedJuyaRow?.viewStats.hot).toEqual({
      todayCandidateCount: 1,
      todayVisibleCount: 1,
      todayVisibleShare: 1
    });
    expect(selectedJuyaRow?.viewStats.ai).toEqual({
      todayCandidateCount: 1,
      todayVisibleCount: 1,
      todayVisibleShare: 1
    });
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
