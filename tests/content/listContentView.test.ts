import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { listContentView } from "../../src/core/content/listContentView.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { saveFeedbackPoolEntry } from "../../src/core/feedback/feedbackPoolRepository.js";
import { saveNlEvaluations } from "../../src/core/strategy/nlEvaluationRepository.js";
import { ensureTwitterAccountsContentSource } from "../../src/core/twitter/twitterAccountCollector.js";

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
    saveFeedbackPoolEntry(db, {
      contentItemId: itemId,
      freeText: "保留 agent workflow 内容",
      suggestedEffect: "boost",
      strengthLevel: "high",
      positiveKeywords: ["agent", "workflow"],
      negativeKeywords: ["融资"]
    });

    const cards = listContentView(db, "hot");
    const card = cards.find((entry) => entry.id === itemId);

    expect(card).toMatchObject({
      id: itemId,
      title: "Breaking quick blurb",
      sourceName: "OpenAI",
      sourceKind: "openai",
      canonicalUrl: "https://example.com/breaking",
      feedbackEntry: {
        freeText: "保留 agent workflow 内容",
        suggestedEffect: "boost",
        strengthLevel: "high",
        positiveKeywords: ["agent", "workflow"],
        negativeKeywords: ["融资"]
      }
    });
    expect(card?.contentScore).toBeGreaterThan(0);
    expect(card?.contentScore).toBeLessThanOrEqual(100);
    expect(card?.scoreBadges).toEqual(expect.arrayContaining(["24h 内", "官方源", "正文完整"]));
    expect(card).not.toHaveProperty("isFavorited");
    expect(card).not.toHaveProperty("reaction");
    expect(card).not.toHaveProperty("averageRating");
    expect(card).not.toHaveProperty("rankingScore");
  });

  it("exposes collector source details for RSS and API search content", async () => {
    const db = await createTestDatabase();
    const wechatSource = resolveSourceByKind(db, "wechat_rss");
    const twitterSourceId = ensureTwitterAccountsContentSource(db);
    const bilibiliSource = resolveSourceByKind(db, "bilibili_search");

    expect(wechatSource).toBeDefined();
    expect(bilibiliSource).toBeDefined();

    upsertContentItems(db, {
      sourceId: wechatSource!.id,
      items: [
        {
          title: "同名公众号文章",
          canonicalUrl: "https://mp.weixin.qq.com/s/vendor",
          summary: "同名公众号文章摘要",
          bodyMarkdown: "同名公众号文章正文",
          metadataJson: JSON.stringify({ collector: { kind: "wechat_rss", displayName: "机器之心 - 今天看啥" } }),
          publishedAt: "2026-03-29T11:00:00.000Z",
          fetchedAt: "2026-03-29T11:05:00.000Z"
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: twitterSourceId,
      items: [
        {
          title: "Twitter API result",
          canonicalUrl: "https://x.com/openai/status/1",
          summary: "Twitter API result summary",
          bodyMarkdown: "Twitter API result body",
          metadataJson: JSON.stringify({ author: { name: "OpenAI", username: "openai" } }),
          publishedAt: "2026-03-29T10:30:00.000Z",
          fetchedAt: "2026-03-29T10:35:00.000Z"
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: bilibiliSource!.id,
      items: [
        {
          title: "B 站视频",
          canonicalUrl: "https://www.bilibili.com/video/BV1",
          summary: "B 站视频摘要",
          bodyMarkdown: "B 站视频正文",
          metadataJson: JSON.stringify({ author: "机器之心" }),
          publishedAt: "2026-03-29T10:00:00.000Z",
          fetchedAt: "2026-03-29T10:05:00.000Z"
        }
      ]
    });

    const cards = listContentView(db, "hot");

    expect(cards.find((card) => card.title === "同名公众号文章")?.sourceDetail).toEqual({
      label: "来源标题",
      value: "机器之心 - 今天看啥"
    });
    expect(cards.find((card) => card.title === "Twitter API result")?.sourceDetail).toEqual({
      label: "作者",
      value: "OpenAI @openai"
    });
    expect(cards.find((card) => card.title === "B 站视频")?.sourceDetail).toEqual({
      label: "UP主",
      value: "机器之心"
    });
  });

  it("keeps hot and articles on the same pool while ai-new now has its own 24-hour window", async () => {
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
          publishedAt: "2026-03-29T09:00:00.000Z",
          fetchedAt: "2026-03-29T09:05:00.000Z"
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
    expect(extractSortedIds(aiCards)).toEqual([2]);
    expect(hotCards[0]?.title).toBe("Breaking quick blurb");
    expect(articleCards[0]?.title).toBe("AI agent system roundup");
    expect(aiCards[0]?.title).toBe("Breaking quick blurb");
  });

  it("keeps old but highly complete articles in the articles view when the pool exceeds the configured limit", async () => {
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

    expect(articleCards).toHaveLength(20);
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

  it("no longer caps the hot view at the old fixed limit even if a stale numeric row says otherwise", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: Array.from({ length: 30 }, (_, index) => ({
        title: `Limit item ${index + 1}`,
        canonicalUrl: `https://example.com/limit-item-${index + 1}`,
        summary: "Short neutral summary.",
        bodyMarkdown: "Compact neutral body text.",
        publishedAt: `2026-03-29T${String(23 - (index % 24)).padStart(2, "0")}:00:00.000Z`,
        fetchedAt: `2026-03-29T${String(23 - (index % 24)).padStart(2, "0")}:05:00.000Z`
      }))
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

    expect(listContentView(db, "hot")).toHaveLength(30);
  });

  it("keeps ai-new results inside the last 24 hours while hot can keep older hotspot candidates", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          title: "Within AI window",
          canonicalUrl: "https://example.com/within-ai-window",
          summary: "Short neutral summary.",
          bodyMarkdown: "Compact neutral body text.",
          publishedAt: "2026-03-29T10:30:00.000Z",
          fetchedAt: "2026-03-29T10:35:00.000Z"
        },
        {
          title: "Fetched fallback within AI window",
          canonicalUrl: "https://example.com/fetched-fallback-within-ai-window",
          summary: "Short neutral summary.",
          bodyMarkdown: "Compact neutral body text.",
          publishedAt: null,
          fetchedAt: "2026-03-29T09:30:00.000Z"
        },
        {
          title: "Older hotspot candidate",
          canonicalUrl: "https://example.com/older-hotspot-candidate",
          summary: "Short neutral summary.",
          bodyMarkdown: "Compact neutral body text.",
          publishedAt: "2026-03-28T08:00:00.000Z",
          fetchedAt: "2026-03-28T08:05:00.000Z"
        }
      ]
    });

    const aiCards = listContentView(db, "ai");
    const hotCards = listContentView(db, "hot");

    expect(aiCards.map((card) => card.title)).toEqual([
      "Within AI window",
      "Fetched fallback within AI window"
    ]);
    expect(hotCards.map((card) => card.title)).toContain("Older hotspot candidate");
  });

  it("keeps the fixed hot ranking even if a stale numeric config row prefers completeness", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          title: "Fresh quick blurb",
          canonicalUrl: "https://example.com/fresh-quick-blurb",
          summary: "Short neutral summary.",
          bodyMarkdown: "Compact neutral body text.",
          publishedAt: "2026-03-29T11:00:00.000Z",
          fetchedAt: "2026-03-29T11:05:00.000Z"
        },
        {
          title: "Complete deep analysis",
          canonicalUrl: "https://example.com/complete-deep-analysis",
          summary:
            "This deep analysis explains architecture decisions in detail with enough context for downstream readers.",
          bodyMarkdown:
            "Long-form content with background, evidence, and implementation details that make this entry article-heavy.",
          publishedAt: "2026-03-24T10:00:00.000Z",
          fetchedAt: "2026-03-24T10:05:00.000Z"
        }
      ]
    });

    const defaultHotCards = listContentView(db, "hot");
    expect(defaultHotCards[0]?.title).toBe("Fresh quick blurb");

    db.prepare(
      `
        UPDATE view_rule_configs
        SET config_json = ?
        WHERE rule_key = 'hot'
      `
    ).run(
      JSON.stringify({
        limit: 20,
        freshnessWindowDays: 30,
        freshnessWeight: 0.05,
        sourceWeight: 0.05,
        completenessWeight: 0.7,
        aiWeight: 0.05,
        heatWeight: 0.15
      })
    );

    const weightedHotCards = listContentView(db, "hot");
    expect(weightedHotCards[0]?.title).toBe("Fresh quick blurb");
  });

  it("prioritizes the newly added domestic sources in their matching navigation views", async () => {
    const db = await createTestDatabase();
    const kr36 = resolveSourceByKind(db, "kr36");
    const kr36Newsflash = resolveSourceByKind(db, "kr36_newsflash");
    const aifanr = resolveSourceByKind(db, "aifanr");
    const ithome = resolveSourceByKind(db, "ithome");

    expect(kr36).toBeDefined();
    expect(kr36Newsflash).toBeDefined();
    expect(aifanr).toBeDefined();
    expect(ithome).toBeDefined();

    const sharedItem = {
      summary: "统一测试摘要。",
      bodyMarkdown: "统一测试正文，长度刚好足够避免完整度差异干扰排序。",
      publishedAt: "2026-03-29T10:00:00.000Z",
      fetchedAt: "2026-03-29T10:05:00.000Z"
    };

    upsertContentItems(db, {
      sourceId: kr36!.id,
      items: [
        {
          title: "36氪 热点资讯",
          canonicalUrl: "https://example.com/kr36-1",
          ...sharedItem
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: kr36Newsflash!.id,
      items: [
        {
          title: "36氪快讯 热点新闻",
          canonicalUrl: "https://example.com/kr36-newsflash-1",
          ...sharedItem
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: aifanr!.id,
      items: [
        {
          title: "爱范儿 AI 科技",
          canonicalUrl: "https://example.com/aifanr-1",
          ...sharedItem
        }
      ]
    });
    upsertContentItems(db, {
      sourceId: ithome!.id,
      items: [
        {
          title: "IT之家 科技热点",
          canonicalUrl: "https://example.com/ithome-1",
          ...sharedItem
        }
      ]
    });

    const hotCards = listContentView(db, "hot");
    const articleCards = listContentView(db, "articles");
    const aiCards = listContentView(db, "ai");

    expect(hotCards.slice(0, 2).map((card) => card.sourceName)).toEqual(
      expect.arrayContaining(["36氪", "36氪快讯"])
    );
    expect(articleCards.slice(0, 3).map((card) => card.sourceName)).toEqual(
      expect.arrayContaining(["36氪", "爱范儿", "IT之家"])
    );
    expect(aiCards[0]?.sourceName).toBe("爱范儿");
  });

  it("filters blocked content from the global scope and the matching navigation scope", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          title: "Globally blocked content",
          canonicalUrl: "https://example.com/globally-blocked",
          summary: "Short summary",
          bodyMarkdown: "Compact body text.",
          publishedAt: "2026-03-29T11:00:00.000Z",
          fetchedAt: "2026-03-29T11:05:00.000Z"
        },
        {
          title: "AI blocked content",
          canonicalUrl: "https://example.com/ai-blocked",
          summary: "Short summary",
          bodyMarkdown: "Compact body text about AI.",
          publishedAt: "2026-03-29T10:00:00.000Z",
          fetchedAt: "2026-03-29T10:05:00.000Z"
        },
        {
          title: "Visible content",
          canonicalUrl: "https://example.com/visible",
          summary: "Short summary",
          bodyMarkdown: "Compact body text about AI.",
          publishedAt: "2026-03-29T09:00:00.000Z",
          fetchedAt: "2026-03-29T09:05:00.000Z"
        }
      ]
    });

    const globalBlockedId = findContentIdByTitle(db, "Globally blocked content");
    const aiBlockedId = findContentIdByTitle(db, "AI blocked content");
    const visibleId = findContentIdByTitle(db, "Visible content");

    saveNlEvaluations(db, {
      contentItemId: globalBlockedId,
      evaluations: [
        {
          scope: "base",
          decision: "block",
          strengthLevel: "medium",
          scoreDelta: 0,
          matchedKeywords: ["融资"],
          reason: "全局屏蔽",
          providerKind: "deepseek",
          evaluatedAt: "2026-03-29T12:00:00.000Z"
        }
      ]
    });
    saveNlEvaluations(db, {
      contentItemId: aiBlockedId,
      evaluations: [
        {
          scope: "ai_new",
          decision: "block",
          strengthLevel: "medium",
          scoreDelta: 0,
          matchedKeywords: ["AI"],
          reason: "AI 页屏蔽",
          providerKind: "deepseek",
          evaluatedAt: "2026-03-29T12:00:00.000Z"
        }
      ]
    });

    expect(listContentView(db, "hot").map((card) => card.id)).toEqual(expect.arrayContaining([aiBlockedId, visibleId]));
    expect(listContentView(db, "hot").map((card) => card.id)).not.toContain(globalBlockedId);
    expect(listContentView(db, "ai").map((card) => card.id)).toEqual([visibleId]);
  });

  it("adds natural language score deltas on top of the saved numeric ranking", async () => {
    const db = await createTestDatabase();
    const source = resolveSourceByKind(db, "openai");

    expect(source).toBeDefined();

    upsertContentItems(db, {
      sourceId: source!.id,
      items: [
        {
          title: "Fresh neutral content",
          canonicalUrl: "https://example.com/fresh-neutral-content",
          summary: "Short summary.",
          bodyMarkdown: "Compact body text.",
          publishedAt: "2026-03-29T11:00:00.000Z",
          fetchedAt: "2026-03-29T11:05:00.000Z"
        },
        {
          title: "Older boosted content",
          canonicalUrl: "https://example.com/older-boosted-content",
          summary: "Longer summary with AI context.",
          bodyMarkdown: "Longer body text with agent workflow and model engineering context.",
          publishedAt: "2026-03-25T11:00:00.000Z",
          fetchedAt: "2026-03-25T11:05:00.000Z"
        }
      ]
    });

    const freshId = findContentIdByTitle(db, "Fresh neutral content");
    const boostedId = findContentIdByTitle(db, "Older boosted content");
    const defaultHotCards = listContentView(db, "hot");

    expect(defaultHotCards[0]?.id).toBe(freshId);

    saveNlEvaluations(db, {
      contentItemId: boostedId,
      evaluations: [
        {
          scope: "base",
          decision: "boost",
          strengthLevel: "high",
          scoreDelta: 42,
          matchedKeywords: ["agent", "workflow"],
          reason: "强命中",
          providerKind: "deepseek",
          evaluatedAt: "2026-03-29T12:00:00.000Z"
        }
      ]
    });

    const boostedHotCards = listContentView(db, "hot");

    expect(boostedHotCards[0]?.id).toBe(boostedId);
    expect(boostedHotCards[1]?.id).toBe(freshId);
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
