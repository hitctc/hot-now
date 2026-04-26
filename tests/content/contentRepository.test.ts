import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCollectionRun,
  finishCollectionRun,
  hasContentItemsForSourceKind,
  linkTwitterSearchKeywordMatches,
  listVisibleTwitterKeywordMatchContentItemIds,
  mergeContentMatchedQueries,
  resolveSourceByKind,
  upsertContentItems
} from "../../src/core/content/contentRepository.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { createTwitterSearchKeyword } from "../../src/core/twitter/twitterSearchKeywordRepository.js";

describe("contentRepository", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("deduplicates content items by canonical_url within the same source", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "juya");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "item-1",
          title: "First title",
          canonicalUrl: "https://example.com/article-1",
          summary: "first summary",
          bodyMarkdown: "first body",
          metadataJson: '{"source":"initial"}',
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T08:05:00.000Z"
        }
      ]
    });

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "item-1-updated",
          title: "Updated title",
          canonicalUrl: "https://example.com/article-1",
          summary: "updated summary",
          bodyMarkdown: "updated body",
          metadataJson: '{"source":"updated"}',
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T09:00:00.000Z"
        }
      ]
    });

    const rows = db
      .prepare(
        `
          SELECT external_id, title, canonical_url, summary, body_markdown, metadata_json, fetched_at
          FROM content_items
          WHERE source_id = ?
        `
      )
      .all(source!.id) as Array<{
      external_id: string;
      title: string;
      canonical_url: string;
      summary: string;
      body_markdown: string;
      metadata_json: string;
      fetched_at: string;
    }>;

    expect(rows).toEqual([
      {
        external_id: "item-1-updated",
        title: "Updated title",
        canonical_url: "https://example.com/article-1",
        summary: "updated summary",
        body_markdown: "updated body",
        metadata_json: '{"source":"updated"}',
        fetched_at: "2026-03-28T09:00:00.000Z"
      }
    ]);
  });

  it("normalizes URL hash fragments before canonical_url deduplication", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "v2ex");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "v2ex:reply-1",
          title: "OpenCode GO 已上线 deepseek v4",
          canonicalUrl: "https://www.v2ex.com/t/1208454#reply1",
          summary: "同一主题的回复锚点不应该生成多条内容。",
          publishedAt: "2026-04-25T04:21:21.000Z",
          fetchedAt: "2026-04-25T04:22:00.000Z"
        },
        {
          externalId: "v2ex:reply-14",
          title: "OpenCode GO 已上线 deepseek v4",
          canonicalUrl: "https://www.v2ex.com/t/1208454#reply14",
          summary: "同一主题的回复锚点不应该生成多条内容。",
          publishedAt: "2026-04-25T04:21:21.000Z",
          fetchedAt: "2026-04-25T04:23:00.000Z"
        }
      ]
    });

    const rows = db
      .prepare(
        `
          SELECT external_id, canonical_url
          FROM content_items
          WHERE source_id = ?
        `
      )
      .all(source!.id) as Array<{ external_id: string; canonical_url: string }>;

    expect(rows).toEqual([
      {
        external_id: "v2ex:reply-14",
        canonical_url: "https://www.v2ex.com/t/1208454"
      }
    ]);
  });

  it("creates and finishes a collection run with the final status fields", async () => {
    const db = await createTestDatabase();

    const runId = createCollectionRun(db, {
      runDate: "2026-03-28",
      triggerKind: "manual",
      status: "running",
      startedAt: "2026-03-28T08:00:00.000Z",
      notes: '{"phase":"collecting"}'
    });

    finishCollectionRun(db, {
      id: runId,
      status: "completed",
      finishedAt: "2026-03-28T08:03:00.000Z",
      notes: '{"phase":"complete"}'
    });

    const row = db
      .prepare(
        `
          SELECT run_date, trigger_kind, status, started_at, finished_at, notes
          FROM collection_runs
          WHERE id = ?
        `
      )
      .get(runId) as {
      run_date: string;
      trigger_kind: string;
      status: string;
      started_at: string;
      finished_at: string;
      notes: string;
    };

    expect(row).toEqual({
      run_date: "2026-03-28",
      trigger_kind: "manual",
      status: "completed",
      started_at: "2026-03-28T08:00:00.000Z",
      finished_at: "2026-03-28T08:03:00.000Z",
      notes: '{"phase":"complete"}'
    });
  });

  it("keeps an existing non-empty body when a later degraded update has an empty body", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "juya");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "item-1",
          title: "Initial title",
          canonicalUrl: "https://example.com/article-1",
          summary: "initial summary",
          bodyMarkdown: "preserved body",
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T08:05:00.000Z"
        }
      ]
    });

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "item-1-retry",
          title: "Retry title",
          canonicalUrl: "https://example.com/article-1",
          summary: "retry summary",
          bodyMarkdown: "",
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T09:00:00.000Z"
        }
      ]
    });

    const row = db
      .prepare(
        `
          SELECT external_id, title, summary, body_markdown, fetched_at
          FROM content_items
          WHERE source_id = ?
            AND canonical_url = ?
        `
      )
      .get(source!.id, "https://example.com/article-1") as {
      external_id: string;
      title: string;
      summary: string;
      body_markdown: string;
      fetched_at: string;
    };

    expect(row).toEqual({
      external_id: "item-1-retry",
      title: "Retry title",
      summary: "retry summary",
      body_markdown: "preserved body",
      fetched_at: "2026-03-28T09:00:00.000Z"
    });
  });

  it("detects content attached to hidden aggregate source kinds", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "bilibili_search");

    expect(source).toBeDefined();
    expect(hasContentItemsForSourceKind(db, "bilibili_search")).toBe(false);

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: "bilibili:BV-source-check",
          title: "OpenAI Codex B 站视频",
          canonicalUrl: "https://www.bilibili.com/video/BV-source-check",
          summary: "B 站聚合来源内容检测",
          bodyMarkdown: "B 站聚合来源内容检测正文",
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T08:01:00.000Z"
        }
      ]
    });

    expect(hasContentItemsForSourceKind(db, "bilibili_search")).toBe(true);
    expect(hasContentItemsForSourceKind(db, "hackernews_search")).toBe(false);
  });

  it("returns only content items that still have at least one visible twitter keyword match", async () => {
    const db = await createTestDatabase();
    const visibleKeyword = createTwitterSearchKeyword(db, {
      keyword: "OpenAI",
      category: "official_vendor"
    });
    const hiddenKeyword = createTwitterSearchKeyword(db, {
      keyword: "内部噪音词",
      category: "topic",
      isVisible: false
    });

    expect(visibleKeyword.ok).toBe(true);
    expect(hiddenKeyword.ok).toBe(true);

    const visibleOnlyItemId = insertContentItem(db, "https://example.com/twitter-1");
    const hiddenOnlyItemId = insertContentItem(db, "https://example.com/twitter-2");
    const sharedItemId = insertContentItem(db, "https://example.com/twitter-3");

    linkTwitterSearchKeywordMatches(db, [
      {
        keywordId: visibleKeyword.ok ? visibleKeyword.keyword.id : 0,
        tweetExternalId: "twitter:1",
        contentItemId: visibleOnlyItemId
      },
      {
        keywordId: hiddenKeyword.ok ? hiddenKeyword.keyword.id : 0,
        tweetExternalId: "twitter:2",
        contentItemId: hiddenOnlyItemId
      },
      {
        keywordId: hiddenKeyword.ok ? hiddenKeyword.keyword.id : 0,
        tweetExternalId: "twitter:3",
        contentItemId: sharedItemId
      },
      {
        keywordId: visibleKeyword.ok ? visibleKeyword.keyword.id : 0,
        tweetExternalId: "twitter:3",
        contentItemId: sharedItemId
      },
      {
        keywordId: visibleKeyword.ok ? visibleKeyword.keyword.id : 0,
        tweetExternalId: "twitter:1",
        contentItemId: visibleOnlyItemId
      }
    ]);

    expect(listVisibleTwitterKeywordMatchContentItemIds(db, [visibleOnlyItemId, hiddenOnlyItemId, sharedItemId])).toEqual([
      visibleOnlyItemId,
      sharedItemId
    ]);
  });

  it("merges matchedQueries into metadata_json without dropping existing metadata fields", async () => {
    const db = await createTestDatabase();
    const contentItemId = insertContentItem(db, "https://example.com/hn-1");

    db.prepare("UPDATE content_items SET metadata_json = ? WHERE id = ?").run(
      JSON.stringify({
        collector: { kind: "hackernews_search", query: "OpenAI" },
        matchedQueries: ["OpenAI"],
        author: "pg"
      }),
      contentItemId
    );

    mergeContentMatchedQueries(db, [
      {
        contentItemId,
        matchedQueries: ["Agents", "OpenAI"]
      }
    ]);

    const row = db.prepare("SELECT metadata_json FROM content_items WHERE id = ?").get(contentItemId) as {
      metadata_json: string | null;
    };

    expect(JSON.parse(row.metadata_json ?? "{}")).toEqual({
      collector: { kind: "hackernews_search", query: "OpenAI" },
      matchedQueries: ["OpenAI", "Agents"],
      author: "pg"
    });
  });

  async function createTestDatabase() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-content-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, {
      username: "admin",
      password: "bootstrap-password"
    });
    return db;
  }

  function insertContentItem(db: ReturnType<typeof openDatabase>, canonicalUrl: string): number {
    const source = resolveSourceByKind(db, "twitter_keyword_search");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          externalId: canonicalUrl.replace("https://example.com/", "twitter:"),
          title: "A tweet title",
          canonicalUrl,
          summary: "tweet summary",
          bodyMarkdown: "tweet body",
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T08:01:00.000Z"
        }
      ]
    });

    const row = db.prepare("SELECT id FROM content_items WHERE canonical_url = ? LIMIT 1").get(canonicalUrl) as
      | { id: number }
      | undefined;

    if (!row) {
      throw new Error("content item insert failed");
    }

    return row.id;
  }
});
