import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { buildContentViewSelection } from "../../src/core/content/buildContentViewSelection.js";
import { listContentView } from "../../src/core/content/listContentView.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";

describe("buildContentViewSelection", () => {
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

  it("returns candidate cards before limit trimming and visible cards after trimming", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        buildItem("Candidate A", "2026-03-31T02:00:00.000Z"),
        buildItem("Candidate B", "2026-03-31T01:00:00.000Z"),
        buildItem("Candidate C", "2026-03-31T00:00:00.000Z")
      ]
    });

    const selection = buildContentViewSelection(db, "hot", { limitOverride: 2 });

    expect(selection.candidateCards).toHaveLength(3);
    expect(selection.visibleCards).toHaveLength(2);
    expect(selection.visibleCards.map((card) => card.title)).toEqual(["Candidate A", "Candidate B"]);
  });

  it("filters candidate and visible cards by selected source kinds", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");
    const ithome = resolveSourceByKind(db, "ithome");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [buildItem("OpenAI only", "2026-03-31T02:00:00.000Z")]
    });
    upsertContentItems(db, {
      sourceId: ithome!.id,
      items: [buildItem("IT之家 only", "2026-03-31T01:00:00.000Z")]
    });

    const selection = buildContentViewSelection(db, "articles", {
      selectedSourceKinds: ["ithome"]
    });

    expect(selection.candidateCards.map((card) => card.sourceKind)).toEqual(["ithome"]);
    expect(selection.visibleCards.map((card) => card.title)).toEqual(["IT之家 only"]);
    expect(listContentView(db, "articles", { selectedSourceKinds: ["ithome"] })).toHaveLength(1);
  });

  it("keeps full-display sources untrimmed while limiting normal sources", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");
    const ithome = resolveSourceByKind(db, "ithome");

    db.prepare(
      `
        UPDATE content_sources
        SET show_all_when_selected = 1
        WHERE kind = 'openai'
      `
    ).run();

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        buildItem("OpenAI Full A", "2026-03-31T03:00:00.000Z"),
        buildItem("OpenAI Full B", "2026-03-31T02:00:00.000Z"),
        buildItem("OpenAI Full C", "2026-03-31T01:00:00.000Z")
      ]
    });
    upsertContentItems(db, {
      sourceId: ithome!.id,
      items: [
        buildItem("ITHome Limited", "2026-03-30T01:00:00.000Z"),
        buildItem("ITHome Trimmed", "2026-03-30T00:00:00.000Z")
      ]
    });

    const selection = buildContentViewSelection(db, "articles", {
      selectedSourceKinds: ["openai", "ithome"],
      limitOverride: 1
    });

    expect(selection.candidateCards).toHaveLength(5);
    expect(selection.visibleCards.map((card) => card.title)).toEqual([
      "OpenAI Full A",
      "OpenAI Full B",
      "OpenAI Full C",
      "ITHome Limited"
    ]);
  });

  it("supports published-at and content-score sorts on the final visible set", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");
    const ithome = resolveSourceByKind(db, "ithome");

    db.prepare(
      `
        UPDATE content_sources
        SET show_all_when_selected = 1
        WHERE kind IN ('openai', 'ithome')
      `
    ).run();

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "Older High Score",
          canonicalUrl: "https://example.com/older-high-score",
          summary: "launch report analysis agent workflow summary with enough detail to score high",
          bodyMarkdown: "launch report analysis agent workflow ".repeat(24),
          publishedAt: "2026-03-28T02:00:00.000Z",
          fetchedAt: "2026-03-28T02:00:00.000Z"
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: ithome!.id,
      items: [
        {
          title: "Newer Low Score",
          canonicalUrl: "https://example.com/newer-low-score",
          summary: "brief",
          bodyMarkdown: "",
          publishedAt: "2026-03-31T03:00:00.000Z",
          fetchedAt: "2026-03-31T03:00:00.000Z"
        }
      ]
    });

    const publishedSelection = buildContentViewSelection(db, "articles", {
      selectedSourceKinds: ["openai", "ithome"],
      limitOverride: 1,
      sortMode: "published_at"
    });
    const scoreSelection = buildContentViewSelection(db, "articles", {
      selectedSourceKinds: ["openai", "ithome"],
      limitOverride: 1,
      sortMode: "content_score"
    });

    expect(publishedSelection.visibleCards.map((card) => card.title)).toEqual([
      "Newer Low Score",
      "Older High Score"
    ]);
    expect(scoreSelection.visibleCards.map((card) => card.title)).toEqual([
      "Older High Score",
      "Newer Low Score"
    ]);
  });
});

async function createTestDatabase(databasesToClose: ReturnType<typeof openDatabase>[]) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-content-selection-"));
  const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
  databasesToClose.push(db);
  runMigrations(db);
  seedInitialData(db, { username: "admin", password: "bootstrap-password" });
  return db;
}

function buildItem(title: string, publishedAt: string) {
  return {
    title,
    canonicalUrl: `https://example.com/${encodeURIComponent(title)}`,
    summary: `${title} summary`,
    bodyMarkdown: `${title} body markdown`,
    publishedAt,
    fetchedAt: publishedAt
  };
}
