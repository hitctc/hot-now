import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { listContentView } from "../../src/core/content/listContentView.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { saveFavorite, saveReaction } from "../../src/core/feedback/feedbackRepository.js";

describe("listContentView", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("returns unified content cards with feedback and system score merged in", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          title: "Breaking quick blurb",
          canonicalUrl: "https://example.com/breaking",
          summary: "short",
          bodyMarkdown:
            "This quick blurb still carries enough background, evidence, and context to count as a complete item for the system score.",
          publishedAt: "2026-03-29T09:00:00.000Z",
          fetchedAt: "2026-03-29T09:05:00.000Z"
        }
      ]
    });

    const itemId = findContentIdByTitle(db, "Breaking quick blurb");
    saveFavorite(db, itemId, true);
    saveReaction(db, itemId, "dislike");

    const cards = listContentView(db, "hot");
    const card = cards.find((entry) => entry.id === itemId);

    expect(card).toMatchObject({
      id: itemId,
      title: "Breaking quick blurb",
      sourceName: "OpenAI",
      canonicalUrl: "https://example.com/breaking",
      isFavorited: true,
      reaction: "dislike"
    });
    expect(card?.contentScore).toBeGreaterThan(0);
    expect(card?.contentScore).toBeLessThanOrEqual(100);
    expect(card?.scoreBadges).toEqual(expect.arrayContaining(["24h 内", "官方源", "正文完整"]));
    expect(card).not.toHaveProperty("averageRating");
  });

  it("keeps one content pool but orders at least one view differently", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          title: "Deep infrastructure analysis",
          canonicalUrl: "https://example.com/deep-analysis",
          summary:
            "This deep analysis explains architecture decisions in detail with enough context for downstream readers.",
          bodyMarkdown:
            "Long-form content with background, evidence, and implementation details that make this entry article-heavy.",
          publishedAt: "2026-03-20T10:00:00.000Z",
          fetchedAt: "2026-03-20T10:05:00.000Z"
        },
        {
          title: "Breaking quick blurb",
          canonicalUrl: "https://example.com/breaking",
          summary: "short",
          bodyMarkdown: "",
          publishedAt: "2026-03-28T09:00:00.000Z",
          fetchedAt: "2026-03-28T09:05:00.000Z"
        },
        {
          title: "AI agent system roundup",
          canonicalUrl: "https://example.com/ai-roundup",
          summary: "Covers AI agents and LLM model progress across products.",
          bodyMarkdown: "This article compares GPT-style model updates and agent workflows.",
          publishedAt: "2026-03-26T11:00:00.000Z",
          fetchedAt: "2026-03-26T11:05:00.000Z"
        }
      ]
    });

    const hotCards = listContentView(db, "hot");
    const articleCards = listContentView(db, "articles");
    const aiCards = listContentView(db, "ai");

    expect(extractSortedIds(hotCards)).toEqual(extractSortedIds(articleCards));
    expect(extractSortedIds(hotCards)).toEqual(extractSortedIds(aiCards));
    expect(hotCards[0]?.title).toBe("Breaking quick blurb");
    expect(articleCards[0]?.title).toBe("Deep infrastructure analysis");
    expect(aiCards[0]?.title).toBe("AI agent system roundup");
  });

  it("keeps old but highly complete articles in the articles view when the pool exceeds 80 items", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          title: "Deep archive analysis",
          canonicalUrl: "https://example.com/deep-archive-analysis",
          summary:
            "This deep archive analysis explains architecture decisions in detail with enough context for downstream readers.",
          bodyMarkdown:
            "Long-form content with background, evidence, implementation details, and follow-up context that make this entry highly complete for the article view.",
          publishedAt: "2026-02-01T10:00:00.000Z",
          fetchedAt: "2026-02-01T10:05:00.000Z"
        },
        ...buildRecentJunkItems(80)
      ]
    });

    const articleCards = listContentView(db, "articles");
    const deepArchiveCard = articleCards.find((card) => card.title === "Deep archive analysis");

    expect(articleCards).toHaveLength(80);
    expect(deepArchiveCard).toBeDefined();
    expect(articleCards[0]?.title).toBe("Deep archive analysis");
  });

  it("keeps newer content ahead when two hot items score the same", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          title: "Newer hot item",
          canonicalUrl: "https://example.com/newer-hot-item",
          summary: "Short neutral summary.",
          bodyMarkdown: "Compact neutral body text.",
          publishedAt: "2026-03-29T11:00:00.000Z",
          fetchedAt: "2026-03-29T11:05:00.000Z"
        },
        {
          title: "Older hot item",
          canonicalUrl: "https://example.com/older-hot-item",
          summary: "Short neutral summary.",
          bodyMarkdown: "Compact neutral body text.",
          publishedAt: "2026-03-29T10:00:00.000Z",
          fetchedAt: "2026-03-29T10:05:00.000Z"
        }
      ]
    });

    const hotCards = listContentView(db, "hot");

    expect(hotCards[0]?.title).toBe("Newer hot item");
    expect(hotCards[1]?.title).toBe("Older hot item");
  });

  async function createTestDatabase() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-content-view-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });
    return db;
  }
});

function findContentIdByTitle(db: ReturnType<typeof openDatabase>, title: string): number {
  // Tests resolve content ids by title so assertions stay readable and avoid coupling to insert order.
  const row = db.prepare("SELECT id FROM content_items WHERE title = ? LIMIT 1").get(title) as { id: number } | undefined;

  if (!row) {
    throw new Error(`Content item not found for title: ${title}`);
  }

  return row.id;
}

function extractSortedIds(cards: Array<{ id: number }>) {
  // Comparing sorted ids makes it explicit that all views reuse the same underlying content pool.
  return cards.map((card) => card.id).sort((left, right) => left - right);
}

function buildRecentJunkItems(count: number) {
  const items = [];

  for (let index = 0; index < count; index += 1) {
    const publishedHour = String(index % 24).padStart(2, "0");
    items.push({
      title: `Recent filler item ${index + 1}`,
      canonicalUrl: `https://example.com/recent-filler-${index + 1}`,
      summary: "Short neutral summary.",
      bodyMarkdown: "",
      publishedAt: `2026-03-29T${publishedHour}:00:00.000Z`,
      fetchedAt: `2026-03-29T${publishedHour}:05:00.000Z`
    });
  }

  return items;
}
