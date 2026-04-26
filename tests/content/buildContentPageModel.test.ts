import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBilibiliQuery } from "../../src/core/bilibili/bilibiliQueryRepository.js";
import { buildContentPageModel } from "../../src/core/content/buildContentPageModel.js";
import { linkTwitterSearchKeywordMatches, resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { createHackerNewsQuery } from "../../src/core/hackernews/hackerNewsQueryRepository.js";
import { ensureTwitterAccountsContentSource } from "../../src/core/twitter/twitterAccountCollector.js";
import { createTwitterAccount } from "../../src/core/twitter/twitterAccountRepository.js";
import { createTwitterSearchKeyword } from "../../src/core/twitter/twitterSearchKeywordRepository.js";
import { createWechatRssSources } from "../../src/core/wechatRss/wechatRssSourceRepository.js";
import { createTestDatabase } from "../helpers/testDatabase.js";

describe("buildContentPageModel", () => {
  const handles: Array<Awaited<ReturnType<typeof createTestDatabase>>> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T04:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();

    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("slices ai-new cards into 50-item pages and falls back overflow pages to the last page", async () => {
    const handle = await createTestDatabase("hot-now-content-page-model-");
    handles.push(handle);

    for (let index = 0; index < 120; index += 1) {
      const minuteOffset = index % 60;
      const hourOffset = Math.floor(index / 60);
      const publishedAt = new Date(Date.UTC(2026, 2, 31, 3 - hourOffset, 59 - minuteOffset, 0)).toISOString();
      const fetchedAt = new Date(Date.UTC(2026, 2, 31, 3 - hourOffset, 59 - minuteOffset, 5)).toISOString();

      insertPagedAiNewItem(handle.db, index + 1, publishedAt, fetchedAt);
    }

    const pageTwo = buildContentPageModel(handle.db, "ai-new", { page: 2 });
    const overflowPage = buildContentPageModel(handle.db, "ai-new", { page: 9 });

    expect(pageTwo.pagination).toEqual({
      page: 2,
      pageSize: 50,
      totalResults: 120,
      totalPages: 3
    });
    expect(pageTwo.cards).toHaveLength(50);
    expect(pageTwo.cards[0]?.title).toBe("Paged 51");
    expect(overflowPage.pagination).toEqual({
      page: 3,
      pageSize: 50,
      totalResults: 120,
      totalPages: 3
    });
    expect(overflowPage.cards).toHaveLength(20);
    expect(overflowPage.cards[0]?.title).toBe("Paged 101");
  });

  it("uses the 24-hour ai-new window before pagination and keeps hot pages unbounded by that window", async () => {
    const handle = await createTestDatabase("hot-now-content-page-window-");
    handles.push(handle);

    insertPagedAiNewItem(handle.db, 1, "2026-03-31T03:00:00.000Z", "2026-03-31T03:00:05.000Z");
    insertPagedAiNewItem(handle.db, 2, "2026-03-29T00:00:00.000Z", "2026-03-29T00:00:05.000Z");

    const aiNewPage = buildContentPageModel(handle.db, "ai-new", { page: 1 });
    const aiHotPage = buildContentPageModel(handle.db, "ai-hot", { page: 1 });

    expect(aiNewPage.pagination?.totalResults).toBe(1);
    expect(aiNewPage.cards.map((card) => card.title)).toEqual(["Paged 1"]);
    expect(aiHotPage.cards.map((card) => card.title)).toContain("Paged 2");
  });

  it("filters the full ai-new result set by title keyword before pagination", async () => {
    const handle = await createTestDatabase("hot-now-content-page-search-");
    handles.push(handle);

    for (let index = 0; index < 55; index += 1) {
      const publishedAt = new Date(Date.UTC(2026, 2, 31, 3, 59 - index, 0)).toISOString();
      const fetchedAt = new Date(Date.UTC(2026, 2, 31, 3, 59 - index, 5)).toISOString();
      const title = index < 50 ? `Model refresh bulletin ${index + 1}` : `Agent benchmark roundup ${index - 49}`;

      insertAiNewItem(handle.db, title, publishedAt, fetchedAt);
    }

    const model = buildContentPageModel(handle.db, "ai-new", {
      page: 1,
      searchKeyword: "agent"
    });

    expect(model.cards.map((card) => card.title)).toEqual([
      "Agent benchmark roundup 1",
      "Agent benchmark roundup 2",
      "Agent benchmark roundup 3",
      "Agent benchmark roundup 4",
      "Agent benchmark roundup 5"
    ]);
    expect(model.pagination).toEqual({
      page: 1,
      pageSize: 50,
      totalResults: 5,
      totalPages: 1
    });
  });

  it("deduplicates identical content before content page pagination", async () => {
    const handle = await createTestDatabase("hot-now-content-page-dedupe-");
    handles.push(handle);

    insertRawAiNewItem(
      handle.db,
      "OpenCode GO 已上线 deepseek v4",
      "https://www.v2ex.com/t/1208454#reply1",
      "5 小时限额 pro 1300 次, flash 7450 次 理论上可以用于其他工具比如 claude code ，opencode 说 go 可以用于第三方。",
      "2026-03-31T03:00:00.000Z",
      "2026-03-31T03:00:05.000Z"
    );
    insertRawAiNewItem(
      handle.db,
      "OpenCode GO 已上线 deepseek v4",
      "https://www.v2ex.com/t/1208454#reply14",
      "5 小时限额 pro 1300 次, flash 7450 次 理论上可以用于其他工具比如 claude code ，opencode 说 go 可以用于第三方。",
      "2026-03-31T03:00:00.000Z",
      "2026-03-31T03:01:05.000Z"
    );

    const model = buildContentPageModel(handle.db, "ai-new", {
      searchKeyword: "deepseek"
    });

    expect(model.pagination).toEqual({
      page: 1,
      pageSize: 50,
      totalResults: 1,
      totalPages: 1
    });
    expect(model.cards.map((card) => card.title)).toEqual(["OpenCode GO 已上线 deepseek v4"]);
  });

  it("returns a search-specific empty state when no title matches", async () => {
    const handle = await createTestDatabase("hot-now-content-page-search-empty-");
    handles.push(handle);

    insertAiNewItem(handle.db, "Model refresh bulletin", "2026-03-31T03:00:00.000Z", "2026-03-31T03:00:05.000Z");

    const model = buildContentPageModel(handle.db, "ai-new", {
      searchKeyword: "agent"
    });

    expect(model.cards).toEqual([]);
    expect(model.emptyState).toEqual({
      title: "没有找到匹配的内容",
      description: "可以换个关键词，或清空搜索后查看全部结果。",
      tone: "filtered"
    });
  });

  it("adds twitter source groups and defaults second-level filters to all options", async () => {
    const handle = await createTestDatabase("hot-now-content-page-twitter-filters-");
    handles.push(handle);
    const twitterAccountSourceId = ensureTwitterAccountsContentSource(handle.db);
    const twitterKeywordSource = resolveSourceByKind(handle.db, "twitter_keyword_search");
    const account = createTwitterAccount(handle.db, {
      username: "openai",
      displayName: "OpenAI",
      isEnabled: true
    });
    const keyword = createTwitterSearchKeyword(handle.db, {
      keyword: "Image2",
      isCollectEnabled: true,
      isVisible: true
    });

    upsertContentItems(handle.db, {
      sourceId: twitterAccountSourceId,
      items: [
        {
          title: "Twitter account result",
          canonicalUrl: "https://example.com/twitter-account-result",
          summary: "Twitter account result summary",
          bodyMarkdown: "Twitter account result body",
          externalId: "twitter:account-result",
          metadataJson: JSON.stringify({
            collector: {
              kind: "twitter_accounts",
              accountId: account.ok ? account.account.id : 0
            }
          }),
          publishedAt: "2026-03-31T03:00:00.000Z",
          fetchedAt: "2026-03-31T03:00:05.000Z"
        }
      ]
    });
    upsertContentItems(handle.db, {
      sourceId: twitterKeywordSource?.id ?? 0,
      items: [
        {
          title: "Twitter keyword result",
          canonicalUrl: "https://example.com/twitter-keyword-result",
          summary: "Twitter keyword result summary",
          bodyMarkdown: "Twitter keyword result body",
          externalId: "twitter:keyword-result",
          publishedAt: "2026-03-31T02:00:00.000Z",
          fetchedAt: "2026-03-31T02:00:05.000Z"
        }
      ]
    });

    const keywordContentItem = handle.db
      .prepare("SELECT id FROM content_items WHERE external_id = 'twitter:keyword-result' LIMIT 1")
      .get() as { id: number } | undefined;

    linkTwitterSearchKeywordMatches(handle.db, [
      {
        keywordId: keyword.ok ? keyword.keyword.id : 0,
        tweetExternalId: "twitter:keyword-result",
        contentItemId: keywordContentItem?.id ?? 0
      }
    ]);

    const model = buildContentPageModel(handle.db, "ai-new");

    expect(model.sourceFilter?.options.map((option) => option.kind)).toEqual(
      expect.arrayContaining(["twitter_accounts", "twitter_keyword_search"])
    );
    expect(model.sourceFilter?.selectedSourceKinds).toEqual(
      expect.arrayContaining(["twitter_accounts", "twitter_keyword_search"])
    );
    expect(model.twitterAccountFilter?.selectedAccountIds).toEqual(account.ok ? [account.account.id] : []);
    expect(model.twitterKeywordFilter?.selectedKeywordIds).toEqual(keyword.ok ? [keyword.keyword.id] : []);
  });

  it("exposes hidden search aggregate sources on content pages and defaults them selected", async () => {
    const handle = await createTestDatabase("hot-now-content-page-search-sources-");
    handles.push(handle);
    const bilibiliQuery = createBilibiliQuery(handle.db, {
      query: "OpenAI",
      priority: 90,
      isEnabled: true
    });
    const hackerNewsQuery = createHackerNewsQuery(handle.db, {
      query: "Codex",
      priority: 90,
      isEnabled: true
    });
    const bilibiliSource = resolveSourceByKind(handle.db, "bilibili_search");

    expect(bilibiliQuery.ok).toBe(true);
    expect(hackerNewsQuery.ok).toBe(true);
    expect(bilibiliSource).toBeDefined();

    upsertContentItems(handle.db, {
      sourceId: bilibiliSource!.id,
      items: [
        {
          title: "OpenAI Codex B 站视频",
          canonicalUrl: "https://www.bilibili.com/video/BV-content-page",
          summary: "OpenAI Codex 的 B 站视频内容",
          bodyMarkdown: "OpenAI Codex 的 B 站视频正文",
          externalId: "bilibili:BV-content-page",
          publishedAt: "2026-03-31T03:00:00.000Z",
          fetchedAt: "2026-03-31T03:00:05.000Z"
        }
      ]
    });

    const aiNewModel = buildContentPageModel(handle.db, "ai-new");
    const aiHotModel = buildContentPageModel(handle.db, "ai-hot");

    expect(aiNewModel.sourceFilter?.options.map((option) => option.kind)).toEqual(
      expect.arrayContaining(["hackernews_search", "bilibili_search"])
    );
    expect(aiNewModel.sourceFilter?.selectedSourceKinds).toEqual(
      expect.arrayContaining(["hackernews_search", "bilibili_search"])
    );
    expect(aiNewModel.cards.map((card) => card.title)).toContain("OpenAI Codex B 站视频");
    expect(aiHotModel.sourceFilter?.options.map((option) => option.kind)).not.toContain("weibo_trending");
  });

  it("exposes WeChat RSS as a parent source and defaults child RSS filters to all options", async () => {
    const handle = await createTestDatabase("hot-now-content-page-wechat-rss-");
    handles.push(handle);
    const wechatRssSource = resolveSourceByKind(handle.db, "wechat_rss");
    const created = createWechatRssSources(handle.db, {
      rssUrls: ["https://rss.example.com/vendor.xml", "https://rss.example.com/media.xml"]
    });
    const sourceIds = created.ok ? created.created.map((source) => source.id) : [];

    expect(wechatRssSource).toBeDefined();
    expect(sourceIds).toHaveLength(2);

    upsertContentItems(handle.db, {
      sourceId: wechatRssSource!.id,
      items: [
        {
          title: "Vendor 公众号 RSS 内容",
          canonicalUrl: "https://mp.weixin.qq.com/s/vendor-content",
          summary: "Vendor 公众号 RSS 内容摘要",
          bodyMarkdown: "Vendor 公众号 RSS 内容正文",
          externalId: "wechat-rss:vendor-content",
          metadataJson: JSON.stringify({ collector: { kind: "wechat_rss", sourceId: sourceIds[0] } }),
          publishedAt: "2026-03-31T03:00:00.000Z",
          fetchedAt: "2026-03-31T03:00:05.000Z"
        },
        {
          title: "Media 公众号 RSS 内容",
          canonicalUrl: "https://mp.weixin.qq.com/s/media-content",
          summary: "Media 公众号 RSS 内容摘要",
          bodyMarkdown: "Media 公众号 RSS 内容正文",
          externalId: "wechat-rss:media-content",
          metadataJson: JSON.stringify({ collector: { kind: "wechat_rss", sourceId: sourceIds[1] } }),
          publishedAt: "2026-03-31T02:30:00.000Z",
          fetchedAt: "2026-03-31T02:30:05.000Z"
        }
      ]
    });

    const defaultModel = buildContentPageModel(handle.db, "ai-new");
    const filteredModel = buildContentPageModel(handle.db, "ai-new", {
      selectedSourceKinds: ["wechat_rss"],
      selectedWechatRssSourceIds: [sourceIds[0]]
    });

    expect(defaultModel.sourceFilter?.options.map((option) => option.kind)).toContain("wechat_rss");
    expect(defaultModel.sourceFilter?.selectedSourceKinds).toContain("wechat_rss");
    expect(defaultModel.wechatRssFilter?.options.map((option) => option.id)).toEqual(sourceIds);
    expect(defaultModel.wechatRssFilter?.selectedSourceIds).toEqual(sourceIds);
    expect(defaultModel.cards.map((card) => card.title)).toContain("Vendor 公众号 RSS 内容");
    expect(defaultModel.cards.map((card) => card.title)).toContain("Media 公众号 RSS 内容");
    expect(filteredModel.cards.map((card) => card.title)).toContain("Vendor 公众号 RSS 内容");
    expect(filteredModel.cards.map((card) => card.title)).not.toContain("Media 公众号 RSS 内容");
  });
});

function insertPagedAiNewItem(
  db: Awaited<ReturnType<typeof createTestDatabase>>["db"],
  index: number,
  publishedAt: string,
  fetchedAt: string
) {
  db.prepare(
    `
      INSERT INTO content_items (
        source_id,
        title,
        canonical_url,
        summary,
        body_markdown,
        published_at,
        fetched_at
      )
      SELECT
        id,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      FROM content_sources
      WHERE kind = 'openai'
    `
  ).run(
    `Paged ${index}`,
    `https://example.com/paged-${index}`,
    `Summary ${index}`,
    `Body ${index}`,
    publishedAt,
    fetchedAt
  );
}

function insertRawAiNewItem(
  db: Awaited<ReturnType<typeof createTestDatabase>>["db"],
  title: string,
  canonicalUrl: string,
  summary: string,
  publishedAt: string,
  fetchedAt: string
) {
  db.prepare(
    `
      INSERT INTO content_items (
        source_id,
        title,
        canonical_url,
        summary,
        body_markdown,
        published_at,
        fetched_at
      )
      SELECT
        id,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      FROM content_sources
      WHERE kind = 'openai'
    `
  ).run(
    title,
    canonicalUrl,
    summary,
    `${title} body`,
    publishedAt,
    fetchedAt
  );
}

// 这个 helper 专门给搜索语义测试造标题数据，避免耦合分页编号命名。
function insertAiNewItem(
  db: Awaited<ReturnType<typeof createTestDatabase>>["db"],
  title: string,
  publishedAt: string,
  fetchedAt: string
) {
  const slug = title.toLowerCase().replace(/\s+/g, "-");

  db.prepare(
    `
      INSERT INTO content_items (
        source_id,
        title,
        canonical_url,
        summary,
        body_markdown,
        published_at,
        fetched_at
      )
      SELECT
        id,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      FROM content_sources
      WHERE kind = 'openai'
    `
  ).run(
    title,
    `https://example.com/${slug}`,
    `${title} summary`,
    `${title} body`,
    publishedAt,
    fetchedAt
  );
}
