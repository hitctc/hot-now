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
    const url = "https://example.com/rss-item#rd";

    upsertContentItems(handle.db, {
      sourceId: source.id,
      items: [{
        externalId: "juya-content-2",
        title: "已经入素材库的 RSS 素材",
        canonicalUrl: url,
        publishedAt,
        fetchedAt: publishedAt
      }]
    });
    insertCreativeSourceItem(handle.db, {
      externalId: "creative-2",
      collectorAgent: "hotnow-feed",
      title: "已经入素材库的 RSS 素材",
      url,
    });

    const result = listCreativeRawRssItems(handle.db, {
      sourceFeed: "juya-ai-daily",
      windowHours: 48
    });

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
