import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectIndependentTodayStatsBySourceForView } from "../../src/core/content/buildContentViewSelection.js";
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

  it("computes independent today stats for one view in a single grouped pass", async () => {
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

    const stats = collectIndependentTodayStatsBySourceForView(db, "hot", ["openai", "kr36"], {
      referenceTime: new Date("2026-03-31T04:00:00.000Z")
    });

    expect(stats.get("openai")).toEqual({
      todayCandidateCount: 2,
      todayVisibleCount: 2,
      todayVisibleShare: 2 / 3
    });
    expect(stats.get("kr36")).toEqual({
      todayCandidateCount: 1,
      todayVisibleCount: 1,
      todayVisibleShare: 1 / 3
    });
  });

  it("returns independent today metrics for each enabled source without depending on page source filters", async () => {
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

    const workbench = listSourceWorkbench(db);
    const openaiRow = workbench.find((row) => row.kind === "openai");
    const kr36Row = workbench.find((row) => row.kind === "kr36");

    expect(openaiRow).toMatchObject({
      totalCount: 3,
      publishedTodayCount: 1,
      collectedTodayCount: 3
    });
    expect(openaiRow?.viewStats.hot).toEqual({
      candidateCount: 3,
      visibleCount: 3,
      visibleShare: 3 / 4
    });
    expect(openaiRow?.viewStats.ai).toEqual({
      candidateCount: 3,
      visibleCount: 3,
      visibleShare: 3 / 4
    });
    expect(kr36Row?.viewStats.hot).toEqual({
      candidateCount: 1,
      visibleCount: 1,
      visibleShare: 1 / 4
    });
    expect(kr36Row?.viewStats.ai).toEqual({
      candidateCount: 1,
      visibleCount: 1,
      visibleShare: 1 / 4
    });
  });

  it("counts full-display sources with their own independent today contribution", async () => {
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

    const workbench = listSourceWorkbench(db);
    const juyaRow = workbench.find((row) => row.kind === "juya");

    expect(juyaRow).toMatchObject({
      totalCount: 1,
      publishedTodayCount: 1,
      collectedTodayCount: 1
    });
    expect(juyaRow?.viewStats.hot).toEqual({
      candidateCount: 1,
      visibleCount: 1,
      visibleShare: 1
    });
    expect(juyaRow?.viewStats.ai).toEqual({
      candidateCount: 1,
      visibleCount: 1,
      visibleShare: 1
    });
  });

  it("zeros independent metrics for disabled sources because they no longer participate in display totals", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "Disabled source item",
          canonicalUrl: "https://example.com/disabled-source-item",
          summary: "Disabled source summary",
          bodyMarkdown: "Disabled source body",
          publishedAt: "2026-03-31T01:00:00.000Z",
          fetchedAt: "2026-03-31T01:05:00.000Z"
        }
      ]
    });
    db.prepare(
      `
        UPDATE content_sources
        SET is_enabled = 0
        WHERE kind = 'openai'
      `
    ).run();

    const workbench = listSourceWorkbench(db);
    const openaiRow = workbench.find((row) => row.kind === "openai");

    expect(openaiRow?.viewStats.hot).toEqual({
      candidateCount: 0,
      visibleCount: 0,
      visibleShare: 0
    });
    expect(openaiRow?.viewStats.ai).toEqual({
      candidateCount: 0,
      visibleCount: 0,
      visibleShare: 0
    });
  });

  it("keeps hot and ai source display stats aligned with the full result set instead of the old 20-item cap", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: Array.from({ length: 25 }, (_, index) => ({
        title: `Today source item ${index + 1}`,
        canonicalUrl: `https://example.com/today-source-item-${index + 1}`,
        summary: "Today source summary",
        bodyMarkdown: "Today source body",
        publishedAt: new Date(Date.UTC(2026, 2, 31, 3, 59 - index, 0)).toISOString(),
        fetchedAt: new Date(Date.UTC(2026, 2, 31, 3, 59 - index, 5)).toISOString()
      }))
    });

    const workbench = listSourceWorkbench(db);
    const openaiRow = workbench.find((row) => row.kind === "openai");

    expect(openaiRow?.viewStats.hot).toEqual({
      candidateCount: 25,
      visibleCount: 25,
      visibleShare: 1
    });
    expect(openaiRow?.viewStats.ai).toEqual({
      candidateCount: 25,
      visibleCount: 25,
      visibleShare: 1
    });
  });

  it("counts hot workbench stats from the full hot pool instead of only today's content", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");
    const kr36 = resolveSourceByKind(db, "kr36");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "OpenAI old hot item",
          canonicalUrl: "https://example.com/openai-old-hot-item",
          summary: "OpenAI old hot summary",
          bodyMarkdown: "OpenAI old hot body",
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T08:05:00.000Z"
        },
        {
          title: "OpenAI today hot item",
          canonicalUrl: "https://example.com/openai-today-hot-item",
          summary: "OpenAI today hot summary",
          bodyMarkdown: "OpenAI today hot body",
          publishedAt: "2026-03-31T01:00:00.000Z",
          fetchedAt: "2026-03-31T01:05:00.000Z"
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: kr36!.id,
      items: [
        {
          title: "36Kr today hot item",
          canonicalUrl: "https://example.com/36kr-today-hot-item",
          summary: "36Kr today hot summary",
          bodyMarkdown: "36Kr today hot body",
          publishedAt: "2026-03-31T02:00:00.000Z",
          fetchedAt: "2026-03-31T02:05:00.000Z"
        }
      ]
    });

    const workbench = listSourceWorkbench(db);
    const openaiRow = workbench.find((row) => row.kind === "openai");
    const kr36Row = workbench.find((row) => row.kind === "kr36");

    expect(openaiRow?.viewStats.hot).toEqual({
      candidateCount: 2,
      visibleCount: 2,
      visibleShare: 2 / 3
    });
    expect(openaiRow?.viewStats.ai).toEqual({
      candidateCount: 1,
      visibleCount: 1,
      visibleShare: 1 / 2
    });
    expect(kr36Row?.viewStats.hot).toEqual({
      candidateCount: 1,
      visibleCount: 1,
      visibleShare: 1 / 3
    });
    expect(kr36Row?.viewStats.ai).toEqual({
      candidateCount: 1,
      visibleCount: 1,
      visibleShare: 1 / 2
    });
  });

  it("aligns ai workbench stats with the rolling 24-hour window used by the ai-new page", async () => {
    const db = await createTestDatabase(databasesToClose);
    const ithome = resolveSourceByKind(db, "ithome");

    upsertContentItems(db, {
      sourceId: ithome!.id,
      items: [
        {
          title: "Within last 24 hours but before Shanghai day start",
          canonicalUrl: "https://example.com/within-last-24-hours",
          summary: "Within last 24 hours summary",
          bodyMarkdown: "Within last 24 hours body",
          publishedAt: "2026-03-30T15:30:00.000Z",
          fetchedAt: "2026-03-30T15:35:00.000Z"
        },
        {
          title: "Within Shanghai day",
          canonicalUrl: "https://example.com/within-shanghai-day",
          summary: "Within Shanghai day summary",
          bodyMarkdown: "Within Shanghai day body",
          publishedAt: "2026-03-31T01:30:00.000Z",
          fetchedAt: "2026-03-31T01:35:00.000Z"
        }
      ]
    });

    const workbench = listSourceWorkbench(db);
    const ithomeRow = workbench.find((row) => row.kind === "ithome");

    expect(ithomeRow?.viewStats.ai).toEqual({
      candidateCount: 2,
      visibleCount: 2,
      visibleShare: 1
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
