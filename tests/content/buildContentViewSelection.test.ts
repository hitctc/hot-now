import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  linkTwitterSearchKeywordMatches,
  resolveSourceByKind,
  upsertContentItems
} from "../../src/core/content/contentRepository.js";
import { buildContentViewSelection } from "../../src/core/content/buildContentViewSelection.js";
import { listContentView } from "../../src/core/content/listContentView.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { saveNlEvaluations } from "../../src/core/strategy/nlEvaluationRepository.js";
import { createTwitterAccount } from "../../src/core/twitter/twitterAccountRepository.js";
import { ensureTwitterAccountsContentSource } from "../../src/core/twitter/twitterAccountCollector.js";
import { createTwitterSearchKeyword } from "../../src/core/twitter/twitterSearchKeywordRepository.js";
import { getInternalViewRuleConfig } from "../../src/core/viewRules/viewRuleConfig.js";
import { createWechatRssSources } from "../../src/core/wechatRss/wechatRssSourceRepository.js";

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

    const selection = buildContentViewSelection(db, "articles", { limitOverride: 2 });

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
    expect(selection.visibleCountsBySourceKind).toEqual({
      openai: 1,
      ithome: 1
    });
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
    expect(selection.visibleCountsBySourceKind).toEqual({
      openai: 3,
      ithome: 1
    });
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

  it("keeps AI 新讯 strictly within the last 24 hours using published, fetched, then created timestamps", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        buildItem("Within published", "2026-03-31T03:00:00.000Z"),
        {
          title: "Within fetched fallback",
          canonicalUrl: "https://example.com/within-fetched-fallback",
          summary: "fallback summary",
          bodyMarkdown: "fallback body",
          publishedAt: null,
          fetchedAt: "2026-03-31T02:00:00.000Z"
        },
        {
          title: "Too old for ai-new",
          canonicalUrl: "https://example.com/too-old-for-ai-new",
          summary: "old summary",
          bodyMarkdown: "old body",
          publishedAt: "2026-03-29T00:00:00.000Z",
          fetchedAt: "2026-03-29T00:05:00.000Z"
        }
      ]
    });

    const aiSelection = buildContentViewSelection(db, "ai");
    const hotSelection = buildContentViewSelection(db, "hot");

    expect(aiSelection.visibleCards.map((card) => card.title)).toEqual([
      "Within published",
      "Within fetched fallback"
    ]);
    expect(hotSelection.visibleCards.map((card) => card.title)).toContain("Too old for ai-new");
  });

  it("keeps weibo trending content out of ai and articles while still allowing it in hot", async () => {
    const db = await createTestDatabase(databasesToClose);
    const weiboTrending = resolveSourceByKind(db, "weibo_trending");

    upsertContentItems(db, {
      sourceId: weiboTrending!.id,
      items: [
        {
          title: "OpenAI 登上微博热搜",
          canonicalUrl: "https://s.weibo.com/weibo?q=%23OpenAI%23",
          summary: "summary",
          bodyMarkdown: "body",
          publishedAt: "2026-03-31T03:00:00.000Z",
          fetchedAt: "2026-03-31T03:00:05.000Z"
        }
      ]
    });

    const hotSelection = buildContentViewSelection(db, "hot");
    const aiSelection = buildContentViewSelection(db, "ai", {
      ruleConfig: {
        ...getInternalViewRuleConfig("ai"),
        enableTimeWindow: false
      }
    });
    const articlesSelection = buildContentViewSelection(db, "articles");

    expect(hotSelection.visibleCards.map((card) => card.title)).toContain("OpenAI 登上微博热搜");
    expect(aiSelection.visibleCards.map((card) => card.title)).not.toContain("OpenAI 登上微博热搜");
    expect(articlesSelection.visibleCards.map((card) => card.title)).not.toContain("OpenAI 登上微博热搜");
  });

  it("stops blocking old ai content when enableTimeWindow is false", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        buildItem("Within published", "2026-03-31T03:00:00.000Z"),
        buildItem("Too old but allowed", "2026-03-29T00:00:00.000Z")
      ]
    });

    const selection = buildContentViewSelection(db, "ai", {
      ruleConfig: {
        ...getInternalViewRuleConfig("ai"),
        enableTimeWindow: false
      }
    });

    expect(selection.visibleCards.map((card) => card.title)).toContain("Too old but allowed");
  });

  it("no longer caps hot and ai result sets at the old fixed limit", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: Array.from({ length: 60 }, (_, index) => ({
        title: `Result ${index + 1}`,
        canonicalUrl: `https://example.com/result-${index + 1}`,
        summary: "summary",
        bodyMarkdown: "body",
        publishedAt: new Date(Date.UTC(2026, 2, 31, 3, 59 - index, 0)).toISOString(),
        fetchedAt: new Date(Date.UTC(2026, 2, 31, 3, 59 - index, 5)).toISOString()
      }))
    });

    const hotSelection = buildContentViewSelection(db, "hot");
    const aiSelection = buildContentViewSelection(db, "ai");

    expect(hotSelection.visibleCards).toHaveLength(60);
    expect(aiSelection.visibleCards).toHaveLength(60);
  });

  it("falls back to publish-time ordering when enableScoreRanking is false", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "Older High Score",
          canonicalUrl: "https://example.com/order-older-high-score",
          summary: "launch report analysis agent workflow summary with enough detail to score high",
          bodyMarkdown: "launch report analysis agent workflow ".repeat(24),
          publishedAt: "2026-03-29T02:00:00.000Z",
          fetchedAt: "2026-03-29T02:00:00.000Z"
        },
        {
          title: "Newest Low Score",
          canonicalUrl: "https://example.com/order-newest-low-score",
          summary: "brief",
          bodyMarkdown: "",
          publishedAt: "2026-03-31T03:00:00.000Z",
          fetchedAt: "2026-03-31T03:00:00.000Z"
        }
      ]
    });

    const selection = buildContentViewSelection(db, "hot", {
      ruleConfig: {
        ...getInternalViewRuleConfig("hot"),
        enableScoreRanking: false
      }
    });

    expect(selection.visibleCards.map((card) => card.title)).toEqual(["Newest Low Score", "Older High Score"]);
  });

  it("removes matching source view bonus when enableSourceViewBonus is false", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");
    const kr36 = resolveSourceByKind(db, "kr36");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "OpenAI newer",
          canonicalUrl: "https://example.com/source-bonus-openai",
          summary: "brief",
          bodyMarkdown: "",
          publishedAt: "2026-03-31T03:00:00.000Z",
          fetchedAt: "2026-03-31T03:00:00.000Z"
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: kr36!.id,
      items: [
        {
          title: "36Kr score winner",
          canonicalUrl: "https://example.com/source-bonus-kr36",
          summary: "breaking update launch release announcement report roundup hot trending 发布 上线 更新 快讯 周报 热点 速览 深度 洞察",
          bodyMarkdown: "breaking update launch release announcement report roundup hot trending ".repeat(12),
          publishedAt: "2026-03-31T02:59:00.000Z",
          fetchedAt: "2026-03-31T02:59:00.000Z"
        }
      ]
    });

    const rankedWithBonus = buildContentViewSelection(db, "ai", {
      ruleConfig: {
        ...getInternalViewRuleConfig("ai"),
        enableSourceViewBonus: true
      }
    });
    const rankedWithoutBonus = buildContentViewSelection(db, "ai", {
      ruleConfig: {
        ...getInternalViewRuleConfig("ai"),
        enableSourceViewBonus: false
      }
    });

    expect(rankedWithBonus.visibleCards[0]?.title).toBe("OpenAI newer");
    expect(rankedWithoutBonus.visibleCards[0]?.title).toBe("36Kr score winner");
  });

  it("keeps ranking order from the internal defaults and ignores persisted numeric rule rows", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "Fresh concise note",
          canonicalUrl: "https://example.com/fresh-concise-note",
          summary: "tiny",
          bodyMarkdown: "",
          publishedAt: "2026-03-31T03:00:00.000Z",
          fetchedAt: "2026-03-31T03:00:00.000Z"
        },
        {
          title: "Older complete brief",
          canonicalUrl: "https://example.com/older-complete-brief",
          summary: "This longer summary carries enough context to outrank the fresh note once ranking is applied.",
          bodyMarkdown: "Detailed context paragraph ".repeat(20),
          publishedAt: "2026-03-26T03:00:00.000Z",
          fetchedAt: "2026-03-26T03:00:00.000Z"
        }
      ]
    });
    db.prepare(
      `
        UPDATE view_rule_configs
        SET config_json = ?
        WHERE rule_key = 'hot'
      `
    ).run(
      JSON.stringify({
        limit: 1,
        freshnessWindowDays: 1,
        freshnessWeight: 1,
        sourceWeight: 0,
        completenessWeight: 0,
        aiWeight: 0,
        heatWeight: 0
      })
    );
    const olderId = db
      .prepare("SELECT id FROM content_items WHERE canonical_url = ? LIMIT 1")
      .get("https://example.com/older-complete-brief") as { id: number };

    saveNlEvaluations(db, {
      contentItemId: olderId.id,
      evaluations: [
        {
          scope: "base",
          decision: "boost",
          strengthLevel: "high",
          scoreDelta: 42,
          matchedKeywords: ["完整"],
          reason: "基础入池门强命中",
          providerKind: "deepseek",
          evaluatedAt: "2026-03-31T04:00:00.000Z"
        }
      ]
    });

    const selection = buildContentViewSelection(db, "hot");

    expect(selection.visibleCards[0]?.title).toBe("Older complete brief");
    expect(selection.visibleCards).toHaveLength(2);
  });

  it("returns current-page source metrics for today candidate, today visible, and today visible share", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");
    const kr36 = resolveSourceByKind(db, "kr36");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "OpenAI today visible",
          canonicalUrl: "https://example.com/openai-today-visible",
          summary: "OpenAI today visible summary",
          bodyMarkdown: "OpenAI today visible body",
          publishedAt: "2026-03-31T01:00:00.000Z",
          fetchedAt: "2026-03-31T01:10:00.000Z"
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: kr36!.id,
      items: [
        {
          title: "36Kr today visible",
          canonicalUrl: "https://example.com/kr36-today-visible",
          summary: "36Kr today visible summary",
          bodyMarkdown: "36Kr today visible body",
          publishedAt: "2026-03-31T02:00:00.000Z",
          fetchedAt: "2026-03-31T02:10:00.000Z"
        }
      ]
    });

    const selection = buildContentViewSelection(db, "ai", {
      referenceTime: new Date("2026-03-31T04:00:00.000Z"),
      selectedSourceKinds: ["openai", "kr36"],
      sortMode: "published_at"
    });

    expect(selection.currentPageTodayVisibleCount).toBe(2);
    expect(selection.currentPageMetricsBySourceKind.openai).toMatchObject({
      todayCandidateCount: 1,
      todayVisibleCount: 1,
      todayVisibleShare: 0.5
    });
    expect(selection.currentPageMetricsBySourceKind.kr36).toMatchObject({
      todayCandidateCount: 1,
      todayVisibleCount: 1,
      todayVisibleShare: 0.5
    });
  });

  it("falls back to fetchedAt for today metrics when publishedAt is missing", async () => {
    const db = await createTestDatabase(databasesToClose);
    const openai = resolveSourceByKind(db, "openai");

    upsertContentItems(db, {
      sourceId: openai!.id,
      items: [
        {
          title: "OpenAI today fallback",
          canonicalUrl: "https://example.com/openai-today-fallback",
          summary: "OpenAI today fallback summary",
          bodyMarkdown: "OpenAI today fallback body",
          publishedAt: null,
          fetchedAt: "2026-03-31T03:00:00.000Z"
        }
      ]
    });

    const selection = buildContentViewSelection(db, "ai", {
      referenceTime: new Date("2026-03-31T04:00:00.000Z"),
      selectedSourceKinds: ["openai"],
      sortMode: "published_at"
    });

    expect(selection.currentPageMetricsBySourceKind.openai).toMatchObject({
      todayCandidateCount: 1,
      todayVisibleCount: 1,
      todayVisibleShare: 1
    });
    expect(selection.visibleCards[0]?.publishedAt).toBe("2026-03-31T03:00:00.000Z");
  });

  it("filters twitter keyword content when no visible keyword match remains", async () => {
    const db = await createTestDatabase(databasesToClose);
    const twitterKeywordSource = resolveSourceByKind(db, "twitter_keyword_search");

    expect(twitterKeywordSource).toBeDefined();

    const visibleKeyword = createTwitterSearchKeyword(db, {
      keyword: "OpenAI",
      isVisible: true
    });
    const hiddenKeyword = createTwitterSearchKeyword(db, {
      keyword: "噪音词",
      isVisible: false
    });

    expect(visibleKeyword.ok).toBe(true);
    expect(hiddenKeyword.ok).toBe(true);

    upsertContentItems(db, {
      sourceId: twitterKeywordSource!.id,
      items: [
        buildItem("Visible Twitter keyword item", "2026-03-31T03:00:00.000Z", "https://example.com/twitter-keyword-1", "twitter:kw-1"),
        buildItem("Hidden Twitter keyword item", "2026-03-31T02:00:00.000Z", "https://example.com/twitter-keyword-2", "twitter:kw-2")
      ]
    });

    const visibleItemId = db
      .prepare("SELECT id FROM content_items WHERE external_id = 'twitter:kw-1' LIMIT 1")
      .get() as { id: number };
    const hiddenItemId = db
      .prepare("SELECT id FROM content_items WHERE external_id = 'twitter:kw-2' LIMIT 1")
      .get() as { id: number };

    linkTwitterSearchKeywordMatches(db, [
      {
        keywordId: visibleKeyword.ok ? visibleKeyword.keyword.id : 0,
        tweetExternalId: "twitter:kw-1",
        contentItemId: visibleItemId.id
      },
      {
        keywordId: hiddenKeyword.ok ? hiddenKeyword.keyword.id : 0,
        tweetExternalId: "twitter:kw-2",
        contentItemId: hiddenItemId.id
      }
    ]);

    const selection = buildContentViewSelection(db, "articles");

    expect(selection.candidateCards.map((card) => card.title)).toContain("Visible Twitter keyword item");
    expect(selection.candidateCards.map((card) => card.title)).not.toContain("Hidden Twitter keyword item");
  });

  it("filters twitter account and twitter keyword rows by the selected second-level ids", async () => {
    const db = await createTestDatabase(databasesToClose);
    const twitterAccountSourceId = ensureTwitterAccountsContentSource(db);
    const twitterKeywordSource = resolveSourceByKind(db, "twitter_keyword_search");
    const accountA = createTwitterAccount(db, {
      username: "openai",
      displayName: "OpenAI",
      isEnabled: true
    });
    const accountB = createTwitterAccount(db, {
      username: "sama",
      displayName: "Sam Altman",
      isEnabled: true
    });
    const keywordA = createTwitterSearchKeyword(db, {
      keyword: "Image2",
      isCollectEnabled: true,
      isVisible: true
    });
    const keywordB = createTwitterSearchKeyword(db, {
      keyword: "Noise",
      isCollectEnabled: true,
      isVisible: true
    });

    upsertContentItems(db, {
      sourceId: twitterAccountSourceId,
      items: [
        buildItem(
          "OpenAI account item",
          "2026-03-31T03:00:00.000Z",
          "https://example.com/twitter-account-openai",
          "twitter:account-openai",
          JSON.stringify({ collector: { kind: "twitter_accounts", accountId: accountA.ok ? accountA.account.id : 0 } })
        ),
        buildItem(
          "Sam account item",
          "2026-03-31T02:30:00.000Z",
          "https://example.com/twitter-account-sam",
          "twitter:account-sam",
          JSON.stringify({ collector: { kind: "twitter_accounts", accountId: accountB.ok ? accountB.account.id : 0 } })
        )
      ]
    });
    upsertContentItems(db, {
      sourceId: twitterKeywordSource?.id ?? 0,
      items: [
        buildItem(
          "Image keyword item",
          "2026-03-31T02:00:00.000Z",
          "https://example.com/twitter-keyword-image",
          "twitter:keyword-image"
        ),
        buildItem(
          "Noise keyword item",
          "2026-03-31T01:30:00.000Z",
          "https://example.com/twitter-keyword-noise",
          "twitter:keyword-noise"
        )
      ]
    });

    const persistedTwitterItems = db
      .prepare(
        `
          SELECT id, title
          FROM content_items
          WHERE external_id IN ('twitter:account-openai', 'twitter:account-sam', 'twitter:keyword-image', 'twitter:keyword-noise')
        `
      )
      .all() as Array<{ id: number; title: string }>;
    const contentIdByTitle = Object.fromEntries(persistedTwitterItems.map((row) => [row.title, row.id]));

    linkTwitterSearchKeywordMatches(db, [
      {
        keywordId: keywordA.ok ? keywordA.keyword.id : 0,
        tweetExternalId: "twitter:keyword-image",
        contentItemId: contentIdByTitle["Image keyword item"]
      },
      {
        keywordId: keywordB.ok ? keywordB.keyword.id : 0,
        tweetExternalId: "twitter:keyword-noise",
        contentItemId: contentIdByTitle["Noise keyword item"]
      }
    ]);

    const selection = buildContentViewSelection(db, "ai", {
      selectedSourceKinds: ["twitter_accounts", "twitter_keyword_search"],
      selectedTwitterAccountIds: accountA.ok ? [accountA.account.id] : [],
      selectedTwitterKeywordIds: keywordA.ok ? [keywordA.keyword.id] : []
    });

    expect(selection.visibleCards.map((card) => card.title)).toContain("OpenAI account item");
    expect(selection.visibleCards.map((card) => card.title)).toContain("Image keyword item");
    expect(selection.visibleCards.map((card) => card.title)).not.toContain("Sam account item");
    expect(selection.visibleCards.map((card) => card.title)).not.toContain("Noise keyword item");
  });

  it("filters WeChat RSS aggregate rows by the selected second-level RSS source ids", async () => {
    const db = await createTestDatabase(databasesToClose);
    const wechatRssSource = resolveSourceByKind(db, "wechat_rss");
    const created = createWechatRssSources(db, {
      rssUrls: ["https://rss.example.com/vendor.xml", "https://rss.example.com/media.xml"]
    });
    const sourceIds = created.ok ? created.created.map((source) => source.id) : [];

    expect(wechatRssSource).toBeDefined();
    expect(sourceIds).toHaveLength(2);

    upsertContentItems(db, {
      sourceId: wechatRssSource!.id,
      items: [
        buildItem(
          "Vendor 公众号文章",
          "2026-03-31T03:00:00.000Z",
          "https://mp.weixin.qq.com/s/vendor",
          "wechat-rss:vendor",
          JSON.stringify({ collector: { kind: "wechat_rss", sourceId: sourceIds[0] } })
        ),
        buildItem(
          "Media 公众号文章",
          "2026-03-31T02:30:00.000Z",
          "https://mp.weixin.qq.com/s/media",
          "wechat-rss:media",
          JSON.stringify({ collector: { kind: "wechat_rss", sourceId: sourceIds[1] } })
        )
      ]
    });

    const selection = buildContentViewSelection(db, "ai", {
      selectedSourceKinds: ["wechat_rss"],
      selectedWechatRssSourceIds: [sourceIds[0]]
    });

    expect(selection.visibleCards.map((card) => card.title)).toContain("Vendor 公众号文章");
    expect(selection.visibleCards.map((card) => card.title)).not.toContain("Media 公众号文章");
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

function buildItem(
  title: string,
  publishedAt: string,
  canonicalUrl = `https://example.com/${encodeURIComponent(title)}`,
  externalId?: string,
  metadataJson?: string
) {
  return {
    title,
    canonicalUrl,
    summary: `${title} summary`,
    bodyMarkdown: `${title} body markdown`,
    externalId,
    metadataJson,
    publishedAt,
    fetchedAt: publishedAt
  };
}
