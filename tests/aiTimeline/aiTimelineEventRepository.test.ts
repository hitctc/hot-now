import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import {
  listAiTimelineEvents,
  listAiTimelineAdminEvents,
  listAiTimelineFilterOptions,
  updateAiTimelineEventManualFields,
  upsertAiTimelineEvents
} from "../../src/core/aiTimeline/aiTimelineEventRepository.js";

describe("aiTimelineEventRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("upserts official events and updates existing rows by official URL", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-upsert-");
    handles.push(handle);

    const first = upsertAiTimelineEvents(handle.db, [
      {
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "模型发布",
        title: "OpenAI 发布 GPT-5.5",
        summary: "OpenAI 官方发布 GPT-5.5。",
        officialUrl: "https://openai.com/news/gpt-5-5/",
        sourceLabel: "OpenAI News",
        sourceKind: "official_blog",
        publishedAt: "2026-04-24T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importance: 95,
        importanceLevel: "S",
        releaseStatus: "released",
        importanceSummaryZh: "这是 OpenAI 的一次重要模型发布。为什么重要：模型能力升级会影响产品和开发者选型。",
        detectedEntities: ["GPT-5.5"],
        rawSourceJson: { id: "gpt-5-5" }
      }
    ]);
    const second = upsertAiTimelineEvents(handle.db, [
      {
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "要闻",
        title: "OpenAI 正式发布 GPT-5.5",
        summary: "官方说明更新后的 GPT-5.5 发布信息。",
        officialUrl: "https://openai.com/news/gpt-5-5/",
        sourceLabel: "OpenAI News",
        sourceKind: "official_blog",
        publishedAt: "2026-04-24T08:00:00.000Z",
        discoveredAt: "2026-04-24T10:00:00.000Z",
        importance: 100,
        importanceLevel: "S",
        releaseStatus: "released",
        importanceSummaryZh: "这是 OpenAI 的一次重要模型发布。为什么重要：它更新了旗舰模型。",
        detectedEntities: ["GPT-5.5"],
        rawSourceJson: { id: "gpt-5-5", updated: true }
      }
    ]);

    const page = listAiTimelineEvents(handle.db, { referenceTime: new Date("2026-04-25T00:00:00.000Z") });

    expect(first).toEqual({ insertedCount: 1, updatedCount: 0 });
    expect(second).toEqual({ insertedCount: 0, updatedCount: 1 });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({
      companyKey: "openai",
      eventType: "要闻",
      title: "OpenAI 正式发布 GPT-5.5",
      importance: 100,
      importanceLevel: "S",
      releaseStatus: "released",
      importanceSummaryZh: "这是 OpenAI 的一次重要模型发布。为什么重要：它更新了旗舰模型。",
      visibilityStatus: "auto_visible",
      detectedEntities: ["GPT-5.5"],
      displayTitle: "OpenAI 正式发布 GPT-5.5"
    });
  });

  it("merges different official URLs into one event when the stable event key matches", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-event-key-merge-");
    handles.push(handle);

    const first = upsertAiTimelineEvents(handle.db, [
      {
        sourceId: "openai-news-rss",
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "模型发布",
        title: "OpenAI 发布 GPT-5.5",
        summary: "OpenAI 官方发布 GPT-5.5。",
        officialUrl: "https://openai.com/news/gpt-5-5/",
        sourceLabel: "OpenAI News",
        sourceKind: "rss_feed",
        publishedAt: "2026-04-24T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "S",
        detectedEntities: ["GPT-5.5"],
        eventKey: "openai:gpt-5-5:2026-04-24"
      }
    ]);
    const second = upsertAiTimelineEvents(handle.db, [
      {
        sourceId: "openai-api-changelog",
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "开发生态",
        title: "GPT-5.5 API release notes",
        summary: "OpenAI API changelog 同步 GPT-5.5。",
        officialUrl: "https://platform.openai.com/docs/changelog/gpt-5-5",
        sourceLabel: "OpenAI API Changelog",
        sourceKind: "release_notes",
        publishedAt: "2026-04-24T08:30:00.000Z",
        discoveredAt: "2026-04-24T10:00:00.000Z",
        importanceLevel: "S",
        detectedEntities: ["GPT-5.5"],
        eventKey: "openai:gpt-5-5:2026-04-24"
      }
    ]);

    const page = listAiTimelineAdminEvents(handle.db, { referenceTime: new Date("2026-04-25T00:00:00.000Z") });

    expect(first).toEqual({ insertedCount: 1, updatedCount: 0 });
    expect(second).toEqual({ insertedCount: 0, updatedCount: 1 });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({
      eventKey: "openai:gpt-5-5:2026-04-24",
      reliabilityStatus: "multi_source",
      evidenceCount: 2
    });
    expect(page.events[0].evidenceLinks.map((evidence) => evidence.sourceId).sort()).toEqual([
      "openai-api-changelog",
      "openai-news-rss"
    ]);
  });

  it("rejects invalid event types before writing data", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-invalid-type-");
    handles.push(handle);

    expect(() =>
      upsertAiTimelineEvents(handle.db, [
        {
          companyKey: "openai",
          companyName: "OpenAI",
          eventType: "传闻" as never,
          title: "非官方传闻",
          summary: null,
          officialUrl: "https://openai.com/news/rumor/",
          sourceLabel: "OpenAI News",
          sourceKind: "official_blog",
          publishedAt: "2026-04-24T08:00:00.000Z",
          discoveredAt: "2026-04-24T09:00:00.000Z"
        }
      ])
    ).toThrow("Invalid AI timeline event type");

    expect(listAiTimelineEvents(handle.db, { referenceTime: new Date("2026-04-25T00:00:00.000Z") }).events).toEqual([]);
  });

  it("lists events by date desc and supports filters, search and pagination", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-list-");
    handles.push(handle);

    upsertAiTimelineEvents(handle.db, [
      {
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "要闻",
        title: "OpenAI 发布 GPT-5.5",
        summary: "旗舰模型更新。",
        officialUrl: "https://openai.com/news/gpt-5-5/",
        sourceLabel: "OpenAI News",
        sourceKind: "official_blog",
        publishedAt: "2026-04-24T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "S"
      },
      {
        companyKey: "google_ai",
        companyName: "Google AI",
        eventType: "开发生态",
        title: "Google 发布 Gemini API 工具更新",
        summary: "开发者工具链更新。",
        officialUrl: "https://blog.google/technology/ai/gemini-api-tools/",
        sourceLabel: "Google AI Blog",
        sourceKind: "official_blog",
        publishedAt: "2026-04-23T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "A"
      },
      {
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "产品应用",
        title: "ChatGPT 图片生成能力更新",
        summary: "官方产品能力更新。",
        officialUrl: "https://openai.com/news/image-generation-update/",
        sourceLabel: "OpenAI News",
        sourceKind: "official_blog",
        publishedAt: "2026-04-22T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "A"
      }
    ]);

    const referenceTime = new Date("2026-04-25T00:00:00.000Z");
    const fullPage = listAiTimelineEvents(handle.db, { referenceTime });
    const openAiPage = listAiTimelineEvents(handle.db, { companyKey: "openai", referenceTime });
    const developerPage = listAiTimelineEvents(handle.db, { eventType: "开发生态", referenceTime });
    const searchedPage = listAiTimelineEvents(handle.db, { searchKeyword: "图片", referenceTime });
    const paged = listAiTimelineEvents(handle.db, { page: 2, pageSize: 1, referenceTime });

    expect(fullPage.events.map((event) => event.title)).toEqual([
      "OpenAI 发布 GPT-5.5",
      "Google 发布 Gemini API 工具更新",
      "ChatGPT 图片生成能力更新"
    ]);
    expect(openAiPage.events.map((event) => event.companyKey)).toEqual(["openai", "openai"]);
    expect(developerPage.events.map((event) => event.title)).toEqual(["Google 发布 Gemini API 工具更新"]);
    expect(searchedPage.events.map((event) => event.title)).toEqual(["ChatGPT 图片生成能力更新"]);
    expect(paged.pagination).toMatchObject({ page: 2, pageSize: 1, totalResults: 3, totalPages: 3 });
    expect(paged.events.map((event) => event.title)).toEqual(["Google 发布 Gemini API 工具更新"]);
  });

  it("defaults the public timeline to recent visible S and A events", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-public-defaults-");
    handles.push(handle);

    upsertAiTimelineEvents(handle.db, [
      {
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "要闻",
        title: "OpenAI 发布 GPT-5.5",
        summary: "旗舰模型更新。",
        officialUrl: "https://openai.com/news/gpt-5-5/",
        sourceLabel: "OpenAI News",
        sourceKind: "official_blog",
        publishedAt: "2026-04-24T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "S"
      },
      {
        companyKey: "mistral",
        companyName: "Mistral AI",
        eventType: "开发生态",
        title: "Mistral 修复文档错别字",
        summary: "小型文档更新。",
        officialUrl: "https://docs.mistral.ai/changelog/typo",
        sourceLabel: "Mistral Docs",
        sourceKind: "release_notes",
        publishedAt: "2026-04-24T07:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "C"
      },
      {
        companyKey: "google_ai",
        companyName: "Google AI",
        eventType: "模型发布",
        title: "Google 发布过期旧模型",
        summary: "旧事件。",
        officialUrl: "https://ai.google.dev/old-model",
        sourceLabel: "Google AI Blog",
        sourceKind: "official_blog",
        publishedAt: "2026-04-10T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "S"
      },
      {
        companyKey: "qwen",
        companyName: "Qwen",
        eventType: "模型发布",
        title: "Qwen 发布隐藏候选",
        summary: "已经被人工隐藏。",
        officialUrl: "https://qwenlm.github.io/blog/hidden/",
        sourceLabel: "Qwen Blog",
        sourceKind: "official_blog",
        publishedAt: "2026-04-24T06:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "A",
        visibilityStatus: "hidden"
      }
    ]);

    const publicPage = listAiTimelineEvents(handle.db, { referenceTime: new Date("2026-04-25T00:00:00.000Z") });
    const adminPage = listAiTimelineAdminEvents(handle.db, { referenceTime: new Date("2026-04-25T00:00:00.000Z") });

    expect(publicPage.events.map((event) => event.title)).toEqual(["OpenAI 发布 GPT-5.5"]);
    expect(publicPage.pagination.totalResults).toBe(1);
    expect(adminPage.events.map((event) => event.title)).toEqual([
      "OpenAI 发布 GPT-5.5",
      "Mistral 修复文档错别字",
      "Qwen 发布隐藏候选",
      "Google 发布过期旧模型"
    ]);
  });

  it("updates manual fields and preserves hidden visibility on future upserts", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-manual-update-");
    handles.push(handle);

    upsertAiTimelineEvents(handle.db, [
      {
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "模型发布",
        title: "OpenAI 发布 GPT-5.5",
        summary: "旗舰模型更新。",
        officialUrl: "https://openai.com/news/gpt-5-5/",
        sourceLabel: "OpenAI News",
        sourceKind: "official_blog",
        publishedAt: "2026-04-24T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z",
        importanceLevel: "S",
        importanceSummaryZh: "自动摘要"
      }
    ]);

    const existing = listAiTimelineAdminEvents(handle.db, {}).events[0];
    const updated = updateAiTimelineEventManualFields(handle.db, existing.id, {
      visibilityStatus: "hidden",
      manualTitle: "人工修正后的标题",
      manualSummaryZh: "人工修正后的中文摘要",
      manualImportanceLevel: "A"
    });

    upsertAiTimelineEvents(handle.db, [
      {
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "要闻",
        title: "OpenAI 再次采集到 GPT-5.5",
        summary: "再次采集到的自动摘要。",
        officialUrl: "https://openai.com/news/gpt-5-5/",
        sourceLabel: "OpenAI News",
        sourceKind: "official_blog",
        publishedAt: "2026-04-24T08:00:00.000Z",
        discoveredAt: "2026-04-24T10:00:00.000Z",
        importanceLevel: "S",
        visibilityStatus: "auto_visible"
      }
    ]);

    const row = listAiTimelineAdminEvents(handle.db, {}).events[0];

    expect(updated).toMatchObject({
      visibilityStatus: "hidden",
      displayTitle: "人工修正后的标题",
      displaySummaryZh: "人工修正后的中文摘要",
      importanceLevel: "A"
    });
    expect(row).toMatchObject({
      title: "OpenAI 再次采集到 GPT-5.5",
      visibilityStatus: "hidden",
      displayTitle: "人工修正后的标题",
      displaySummaryZh: "人工修正后的中文摘要",
      importanceLevel: "A"
    });
  });

  it("lists filter options from persisted events", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-filters-");
    handles.push(handle);

    upsertAiTimelineEvents(handle.db, [
      {
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "模型发布",
        title: "OpenAI 发布新模型",
        summary: null,
        officialUrl: "https://openai.com/news/model/",
        sourceLabel: "OpenAI News",
        sourceKind: "official_blog",
        publishedAt: "2026-04-24T08:00:00.000Z",
        discoveredAt: "2026-04-24T09:00:00.000Z"
      }
    ]);

    expect(listAiTimelineFilterOptions(handle.db)).toEqual({
      eventTypes: ["要闻", "模型发布", "开发生态", "产品应用", "行业动态", "官方前瞻"],
      companies: [{ key: "openai", name: "OpenAI", eventCount: 1 }]
    });
  });
});
