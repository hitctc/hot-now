import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import {
  listAiTimelineEvents,
  listAiTimelineFilterOptions,
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
        rawSourceJson: { id: "gpt-5-5", updated: true }
      }
    ]);

    const page = listAiTimelineEvents(handle.db, {});

    expect(first).toEqual({ insertedCount: 1, updatedCount: 0 });
    expect(second).toEqual({ insertedCount: 0, updatedCount: 1 });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({
      companyKey: "openai",
      eventType: "要闻",
      title: "OpenAI 正式发布 GPT-5.5",
      importance: 100
    });
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

    expect(listAiTimelineEvents(handle.db, {}).events).toEqual([]);
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
        discoveredAt: "2026-04-24T09:00:00.000Z"
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
        discoveredAt: "2026-04-24T09:00:00.000Z"
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
        discoveredAt: "2026-04-24T09:00:00.000Z"
      }
    ]);

    const fullPage = listAiTimelineEvents(handle.db, {});
    const openAiPage = listAiTimelineEvents(handle.db, { companyKey: "openai" });
    const developerPage = listAiTimelineEvents(handle.db, { eventType: "开发生态" });
    const searchedPage = listAiTimelineEvents(handle.db, { searchKeyword: "图片" });
    const paged = listAiTimelineEvents(handle.db, { page: 2, pageSize: 1 });

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
