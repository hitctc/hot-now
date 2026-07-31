import { describe, it, expect, afterEach } from "vitest";
import {
  insertCreativeSourceItem,
  findCreativeSourceItemById,
  findCreativeSourceItemByExternalId,
  listCreativeSourceItems,
  updateCreativeSourceItemWritingStatus,
  updateCreativeSourceItemLinkedArticle,
  updateCreativeSourceItemTrendScore,
  updateCreativeSourceItemAccountFit
} from "../../src/core/creative/creativeSourceItemRepository.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.close();
  }
});

function makeHandle() {
  return createTestDatabase("hot-now-creative-src-");
}

const baseInput = {
  externalId: "ext-001",
  collectorAgent: "agent-a",
  title: "Test Article",
  url: "https://example.com/article-1"
};

describe("insertCreativeSourceItem", () => {
  it("returns id and created=true for new record", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const result = insertCreativeSourceItem(handle.db, baseInput);

    expect(result.created).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  it("returns same id and created=false on duplicate externalId+collectorAgent", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const first = insertCreativeSourceItem(handle.db, baseInput);
    const second = insertCreativeSourceItem(handle.db, baseInput);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("creates separate records when same externalId comes from different agents", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const a = insertCreativeSourceItem(handle.db, { ...baseInput, collectorAgent: "agent-a" });
    const b = insertCreativeSourceItem(handle.db, { ...baseInput, collectorAgent: "agent-b" });

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.id).not.toBe(b.id);
  });

  it("stores all optional fields and rawPayloadJson contains the full input", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const fullInput = {
      externalId: "ext-full",
      collectorAgent: "agent-full",
      title: "Full Article",
      url: "https://example.com/full",
      sourceName: "TechCrunch",
      summary: "A summary",
      fullContent: "Long content here",
      author: "Alice",
      coverImageUrl: "https://img.example.com/cover.jpg",
      tags: "ai, llm",
      language: "en",
      wordCount: 1200,
      contentType: "article",
      score: 85.5,
      publishedAt: "2026-05-01T10:00:00.000Z",
      collectorTimestamp: "2026-05-02T08:00:00.000Z"
    };

    const result = insertCreativeSourceItem(handle.db, fullInput);
    const record = findCreativeSourceItemById(handle.db, result.id);

    expect(record).not.toBeNull();
    expect(record!.sourceName).toBe("TechCrunch");
    expect(record!.summary).toBe("A summary");
    expect(record!.fullContent).toBe("Long content here");
    expect(record!.author).toBe("Alice");
    expect(record!.coverImageUrl).toBe("https://img.example.com/cover.jpg");
    expect(record!.tags).toBe("ai, llm");
    expect(record!.language).toBe("en");
    expect(record!.wordCount).toBe(1200);
    expect(record!.contentType).toBe("article");
    expect(record!.score).toBe(85.5);
    expect(record!.publishedAt).toBe("2026-05-01T10:00:00.000Z");
    expect(record!.collectorTimestamp).toBe("2026-05-02T08:00:00.000Z");
    expect(record!.rawPayloadJson).toBe(JSON.stringify(fullInput));
  });

  it("defaults language to zh when not provided", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const result = insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "ext-no-lang" });
    const record = findCreativeSourceItemById(handle.db, result.id);

    expect(record!.language).toBe("zh");
  });
});

describe("listCreativeSourceItems", () => {
  it("paginates results with correct total", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p1", title: "Page 1" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p2", title: "Page 2" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p3", title: "Page 3" });

    const result = listCreativeSourceItems(handle.db, { page: 1, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
  });

  it("returns second page correctly", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p1", title: "Page 1" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p2", title: "Page 2" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p3", title: "Page 3" });

    const result = listCreativeSourceItems(handle.db, { page: 2, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(2);
  });

  it("omits detail-only payloads from summary lists", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const inserted = insertCreativeSourceItem(handle.db, {
      ...baseInput,
      fullContent: "完整正文".repeat(100)
    });

    const summary = listCreativeSourceItems(handle.db, { summaryOnly: true }).items[0];
    const detail = findCreativeSourceItemById(handle.db, inserted.id);

    expect(summary.fullContent).toBeNull();
    expect(summary.rawPayloadJson).toBe("");
    expect(detail?.fullContent).toContain("完整正文");
    expect(detail?.rawPayloadJson).not.toBe("");
  });

  it("filters by writingStatus", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const a = insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "q1" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "q2" });

    updateCreativeSourceItemWritingStatus(handle.db, a.id, "done");

    const result = listCreativeSourceItems(handle.db, { writingStatus: "done" });

    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(a.id);
  });

  it("filters by search term matching title or summary", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "s1",
      title: "GPT-5 发布"
    });
    insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "s2",
      title: "其他新闻",
      summary: "Claude 更新了模型"
    });
    insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "s3",
      title: "不相关的文章"
    });

    const gptResult = listCreativeSourceItems(handle.db, { search: "GPT" });
    expect(gptResult.total).toBe(1);
    expect(gptResult.items[0].externalId).toBe("s1");

    const claudeResult = listCreativeSourceItems(handle.db, { search: "Claude" });
    expect(claudeResult.total).toBe(1);
    expect(claudeResult.items[0].externalId).toBe("s2");
  });
});

describe("updateCreativeSourceItemWritingStatus", () => {
  it("updates status and returns true for existing record", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const inserted = insertCreativeSourceItem(handle.db, baseInput);
    const updated = updateCreativeSourceItemWritingStatus(handle.db, inserted.id, "done");

    expect(updated).toBe(true);

    const record = findCreativeSourceItemById(handle.db, inserted.id);
    expect(record!.writingStatus).toBe("done");
  });

  it("returns false for non-existent id", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const updated = updateCreativeSourceItemWritingStatus(handle.db, 99999, "skipped");
    expect(updated).toBe(false);
  });

  it("persists stop details and clears them when writing restarts", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const inserted = insertCreativeSourceItem(handle.db, baseInput);
    updateCreativeSourceItemWritingStatus(handle.db, inserted.id, "skipped", {
      step: 2,
      stepName: "普通人相关性判断",
      reason: "与普通人的现实工作和消费没有直接关联"
    });

    const stopped = findCreativeSourceItemById(handle.db, inserted.id);
    expect(stopped).toMatchObject({
      writingStatus: "skipped",
      writingStopStep: 2,
      writingStopStepName: "普通人相关性判断",
      writingStopReason: "与普通人的现实工作和消费没有直接关联"
    });
    expect(stopped!.writingStoppedAt).toBeTruthy();

    updateCreativeSourceItemWritingStatus(handle.db, inserted.id, "writing");
    const restarted = findCreativeSourceItemById(handle.db, inserted.id);
    expect(restarted).toMatchObject({
      writingStatus: "writing",
      writingStopStep: null,
      writingStopStepName: null,
      writingStopReason: null,
      writingStoppedAt: null
    });
  });

  it("persists retryable technical failure details", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const item = insertCreativeSourceItem(handle.db, {
      externalId: "failed-status-item",
      collectorAgent: "test",
      title: "技术失败素材",
      url: "https://example.com/failed-status-item"
    });

    updateCreativeSourceItemWritingStatus(handle.db, item.id, "failed", {
      step: 4,
      stepName: "口述底稿生成",
      reason: "模型超时"
    });

    const stored = findCreativeSourceItemById(handle.db, item.id);
    expect(stored?.writingStatus).toBe("failed");
    expect(stored?.writingStopStep).toBe(4);
    expect(stored?.writingStopStepName).toBe("口述底稿生成");
    expect(stored?.writingStopReason).toBe("模型超时");
  });
});

describe("updateCreativeSourceItemLinkedArticle", () => {
  it("sets linked_article_id", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const inserted = insertCreativeSourceItem(handle.db, baseInput);

    // Insert a finished article row first so the FK constraint on linked_article_id is satisfied.
    handle.db
      .prepare(
        `INSERT INTO creative_finished_articles (source_item_id, content_markdown) VALUES (?, ?)`
      )
      .run(inserted.id, "test markdown content");

    const articleRow = handle.db
      .prepare("SELECT id FROM creative_finished_articles WHERE source_item_id = ?")
      .get(inserted.id) as { id: number };

    const updated = updateCreativeSourceItemLinkedArticle(handle.db, inserted.id, articleRow.id);

    expect(updated).toBe(true);

    const record = findCreativeSourceItemById(handle.db, inserted.id);
    expect(record!.linkedArticleId).toBe(articleRow.id);
  });
});

describe("findCreativeSourceItemByExternalId", () => {
  it("finds record by composite key", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "ext-composite", collectorAgent: "agent-x" });

    const found = findCreativeSourceItemByExternalId(handle.db, "ext-composite", "agent-x");
    expect(found).not.toBeNull();
    expect(found!.externalId).toBe("ext-composite");
    expect(found!.collectorAgent).toBe("agent-x");
  });

  it("returns null when no match", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const found = findCreativeSourceItemByExternalId(handle.db, "no-such-id", "no-agent");
    expect(found).toBeNull();
  });
});

describe("trendScore", () => {
  it("insert with trendScore and trendBreakdown", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const breakdown = { topicPower: 15, emotionResonance: 20, infoGap: 12, socialCurrency: 18, timingWindow: 10, audienceBreadth: 15 };
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "trend-1",
      collectorAgent: "scorer",
      title: "Trend test",
      url: "https://example.com/trend-1",
      trendScore: 90,
      trendBreakdown: breakdown
    });

    const found = findCreativeSourceItemById(handle.db, item.id)!;
    expect(found.trendScore).toBe(90);
    expect(found.trendBreakdown).toEqual(breakdown);
  });

  it("updateCreativeSourceItemTrendScore writes score", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const item = insertCreativeSourceItem(handle.db, {
      externalId: "trend-2",
      collectorAgent: "scorer",
      title: "Update trend",
      url: "https://example.com/trend-2"
    });

    expect(findCreativeSourceItemById(handle.db, item.id)!.trendScore).toBeNull();

    const breakdown = { topicPower: 10, emotionResonance: 15, infoGap: 10, socialCurrency: 10, timingWindow: 10, audienceBreadth: 15 };
    const updated = updateCreativeSourceItemTrendScore(handle.db, item.id, 70, breakdown);
    expect(updated).toBe(true);

    const found = findCreativeSourceItemById(handle.db, item.id)!;
    expect(found.trendScore).toBe(70);
    expect(found.trendBreakdown).toEqual(breakdown);
  });

  it("listCreativeSourceItems filters by trendScoreMin", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const a = insertCreativeSourceItem(handle.db, {
      externalId: "high",
      collectorAgent: "scorer",
      title: "High",
      url: "https://example.com/high",
      trendScore: 80
    });
    insertCreativeSourceItem(handle.db, {
      externalId: "low",
      collectorAgent: "scorer",
      title: "Low",
      url: "https://example.com/low",
      trendScore: 30
    });

    const result = listCreativeSourceItems(handle.db, { trendScoreMin: 60 });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(a.id);
  });

  it("updateCreativeSourceItemTrendScore returns false for non-existent", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const breakdown = { topicPower: 10, emotionResonance: 10, infoGap: 10, socialCurrency: 10, timingWindow: 10, audienceBreadth: 10 };
    expect(updateCreativeSourceItemTrendScore(handle.db, 99999, 60, breakdown)).toBe(false);
  });
});

describe("accountFit", () => {
  it("persists fit details without changing writing status in shadow mode", async () => {
    const handle = await makeHandle();
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "fit-shadow" });

    updateCreativeSourceItemAccountFit(handle.db, item.id, {
      level: "high",
      reason: "直接影响轻度用户的订阅选择",
      details: {
        targetReader: "偶尔使用豆包的普通职场人",
        readerScenario: "正在判断是否订阅",
        ordinaryImpact: "需要承担新增订阅成本",
        articleValue: "判断是否值得付费",
        evidenceBasis: ["素材包含订阅价格"],
        supplemented: false
      },
      ruleVersion: "v1"
    });

    expect(findCreativeSourceItemById(handle.db, item.id)).toMatchObject({
      writingStatus: "ready",
      accountFitLevel: "high",
      accountFitReason: "直接影响轻度用户的订阅选择",
      accountFitRuleVersion: "v1",
      accountFitDetails: {
        targetReader: "偶尔使用豆包的普通职场人",
        supplemented: false
      }
    });
  });

  it("updates writing status only when enforcement is enabled", async () => {
    const handle = await makeHandle();
    handles.push(handle);
    const high = insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "fit-high",
      url: "https://example.com/fit-high",
      writingStatus: "pending"
    });
    const low = insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "fit-low",
      url: "https://example.com/fit-low",
      writingStatus: "ready"
    });

    updateCreativeSourceItemAccountFit(handle.db, high.id, {
      level: "high",
      reason: "四项条件完整",
      details: {},
      ruleVersion: "v1",
      updateWritingStatus: true
    });
    updateCreativeSourceItemAccountFit(handle.db, low.id, {
      level: "low",
      reason: "纯开发者工具",
      details: {},
      ruleVersion: "v1",
      updateWritingStatus: true
    });

    expect(findCreativeSourceItemById(handle.db, high.id)!.writingStatus).toBe("ready");
    expect(findCreativeSourceItemById(handle.db, low.id)!.writingStatus).toBe("excluded");
  });

  it("filters evaluated and unassessed materials", async () => {
    const handle = await makeHandle();
    handles.push(handle);
    const evaluated = insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "fit-filtered",
      url: "https://example.com/fit-filtered"
    });
    insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "fit-unassessed",
      url: "https://example.com/fit-unassessed"
    });
    updateCreativeSourceItemAccountFit(handle.db, evaluated.id, {
      level: "medium",
      reason: "影响存在但行动不具体",
      details: {},
      ruleVersion: "v1"
    });

    expect(listCreativeSourceItems(handle.db, { accountFitLevel: "medium" }).items.map((item) => item.id)).toEqual([evaluated.id]);
    expect(listCreativeSourceItems(handle.db, { accountFitLevel: "unassessed" }).total).toBe(1);
  });
});
