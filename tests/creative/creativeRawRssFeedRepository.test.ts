import { afterEach, describe, expect, it } from "vitest";

import { insertCreativeSourceItem } from "../../src/core/creative/creativeSourceItemRepository.js";
import { listCreativeRawRssItems } from "../../src/core/creative/creativeRawRssFeedRepository.js";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
});

describe("listCreativeRawRssItems", () => {
  it("keeps RSS available independently to long and short writing and exposes an incremental cursor", async () => {
    const handle = await createTestDatabase("hot-now-rss-directions-");
    handles.push(handle);
    const source = resolveSourceByKind(handle.db, "juya")!;
    const now = new Date().toISOString();
    upsertContentItems(handle.db, { sourceId: source.id, items: [{
      externalId: "shared-rss", title: "AI 产品上线", canonicalUrl: "https://example.com/shared-rss",
      publishedAt: now, fetchedAt: now
    }] });
    insertCreativeSourceItem(handle.db, { externalId: "long-rss", collectorAgent: "hotnow-feed",
      title: "AI 产品上线", url: "https://example.com/shared-rss#rd", direction: "article" });
    const short = listCreativeRawRssItems(handle.db, { direction: "short_content", afterId: 0 });
    expect(short.items).toHaveLength(1);
    expect(short.latestId).toBe(short.items[0].id);
    expect(listCreativeRawRssItems(handle.db, { direction: "short_content", afterId: short.latestId }).items).toEqual([]);
    insertCreativeSourceItem(handle.db, { externalId: "short-rss", collectorAgent: "short-rss-juya",
      title: "AI 产品上线", url: "https://example.com/shared-rss", direction: "short_content" });
    expect(listCreativeRawRssItems(handle.db, { direction: "short_content", afterId: 0 }).items).toEqual([]);

    upsertContentItems(handle.db, { sourceId: source.id, items: [{
      externalId: "short-only-rss", title: "手机新品", canonicalUrl: "https://example.com/short-only",
      publishedAt: now, fetchedAt: now
    }] });
    insertCreativeSourceItem(handle.db, { externalId: "short-only", collectorAgent: "short-rss-juya",
      title: "手机新品", url: "https://example.com/short-only", direction: "short_content" });
    expect(listCreativeRawRssItems(handle.db).items.map((item) => item.externalId)).toEqual(["short-only-rss"]);
  });

  it("reads incremental pages in ID order using collection time for short writing", async () => {
    const handle = await createTestDatabase("hot-now-rss-increment-");
    handles.push(handle);
    const source = resolveSourceByKind(handle.db, "juya")!;
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 10 * 86400_000).toISOString();
    upsertContentItems(handle.db, { sourceId: source.id, items: [
      { externalId: "old-publication", title: "新采集的旧发布日期稿件", canonicalUrl: "https://example.com/old-publication", publishedAt: old, fetchedAt: now },
      { externalId: "new-publication", title: "新稿", canonicalUrl: "https://example.com/new-publication", publishedAt: now, fetchedAt: now }
    ] });
    const first = listCreativeRawRssItems(handle.db, { direction: "short_content", afterId: 0, limit: 1 });
    expect(first.items[0].externalId).toBe("old-publication");
    const second = listCreativeRawRssItems(handle.db, { direction: "short_content", afterId: first.items[0].id, limit: 1 });
    expect(second.items[0].externalId).toBe("new-publication");
    expect(first.latestId).toBe(second.items[0].id);
    expect(listCreativeRawRssItems(handle.db).items.map((item) => item.externalId)).toEqual(["new-publication"]);
  });

  it("returns RSS content that is not in the creative library", async () => {
    const handle = await createTestDatabase("hot-now-creative-raw-rss-");
    handles.push(handle);
    const source = resolveSourceByKind(handle.db, "juya");
    if (!source) throw new Error("juya source missing in test database");
    const publishedAt = new Date().toISOString();

    upsertContentItems(handle.db, {
      sourceId: source.id,
      items: [{
        externalId: "juya-content-1",
        title: "普通内容池中的 RSS 素材",
        canonicalUrl: "https://example.com/rss-item",
        summary: "RSS 摘要",
        bodyMarkdown: "RSS 正文",
        publishedAt,
        fetchedAt: publishedAt
      }]
    });

    const result = listCreativeRawRssItems(handle.db, {
      sourceFeed: "juya-ai-daily",
      windowHours: 48
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      externalId: "juya-content-1",
      title: "普通内容池中的 RSS 素材",
      url: "https://example.com/rss-item",
      fullContent: "RSS 正文",
      sourceFeed: "juya-ai-daily"
    });
  });

  it("treats URL fragments as the same article when checking the creative library", async () => {
    const handle = await createTestDatabase("hot-now-creative-raw-rss-dedupe-");
    handles.push(handle);
    const source = resolveSourceByKind(handle.db, "juya");
    if (!source) throw new Error("juya source missing in test database");
    const publishedAt = new Date().toISOString();
    const contentUrl = "https://example.com/rss-item/#rd";
    const creativeUrl = "https://example.com/rss-item";

    upsertContentItems(handle.db, {
      sourceId: source.id,
      items: [{
        externalId: "juya-content-2",
        title: "已经入素材库的 RSS 素材",
        canonicalUrl: contentUrl,
        publishedAt,
        fetchedAt: publishedAt
      }]
    });
    insertCreativeSourceItem(handle.db, {
      externalId: "creative-2",
      collectorAgent: "hotnow-feed",
      title: "已经入素材库的 RSS 素材",
      url: creativeUrl,
    });

    const result = listCreativeRawRssItems(handle.db, {
      sourceFeed: "juya-ai-daily",
      windowHours: 48
    });

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
