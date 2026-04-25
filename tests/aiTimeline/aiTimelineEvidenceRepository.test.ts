import { afterEach, describe, expect, it } from "vitest";
import {
  listAiTimelineEventEvidence,
  refreshAiTimelineEventEvidenceCount,
  upsertAiTimelineEventEvidence
} from "../../src/core/aiTimeline/aiTimelineEvidenceRepository.js";
import { listAiTimelineAdminEvents, upsertAiTimelineEvents } from "../../src/core/aiTimeline/aiTimelineEventRepository.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("aiTimelineEvidenceRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("upserts official evidence and refreshes event evidence count", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-evidence-");
    handles.push(handle);

    upsertAiTimelineEvents(handle.db, [
      {
        sourceId: "openai-news-rss",
        companyKey: "openai",
        companyName: "OpenAI",
        eventType: "模型发布",
        title: "OpenAI 发布 GPT-5.5",
        summary: "官方模型发布。",
        officialUrl: "https://openai.com/news/gpt-5-5/",
        sourceLabel: "OpenAI News",
        sourceKind: "rss_feed",
        publishedAt: "2026-04-25T08:00:00.000Z",
        discoveredAt: "2026-04-25T08:10:00.000Z",
        importanceLevel: "S"
      }
    ]);
    const event = listAiTimelineAdminEvents(handle.db, { recentDays: null }).events[0];

    upsertAiTimelineEventEvidence(handle.db, {
      eventId: event.id,
      sourceId: "openai-news-rss",
      companyKey: "openai",
      sourceLabel: "OpenAI News",
      sourceKind: "rss_feed",
      officialUrl: "https://openai.com/news/gpt-5-5/",
      title: "OpenAI 发布 GPT-5.5",
      summary: "第一条官方证据。",
      publishedAt: "2026-04-25T08:00:00.000Z",
      discoveredAt: "2026-04-25T08:10:00.000Z",
      rawSourceJson: { source: "rss" }
    });
    upsertAiTimelineEventEvidence(handle.db, {
      eventId: event.id,
      sourceId: "openai-docs-changelog",
      companyKey: "openai",
      sourceLabel: "OpenAI Docs Changelog",
      sourceKind: "html_date_sections",
      officialUrl: "https://platform.openai.com/docs/changelog#gpt-5-5",
      title: "GPT-5.5 API 发布",
      summary: "第二条官方证据。",
      publishedAt: "2026-04-25T08:05:00.000Z",
      discoveredAt: "2026-04-25T08:20:00.000Z",
      rawSourceJson: { source: "docs" }
    });
    upsertAiTimelineEventEvidence(handle.db, {
      eventId: event.id,
      sourceId: "openai-news-rss",
      companyKey: "openai",
      sourceLabel: "OpenAI News",
      sourceKind: "rss_feed",
      officialUrl: "https://openai.com/news/gpt-5-5/",
      title: "OpenAI 正式发布 GPT-5.5",
      summary: "第一条官方证据更新。",
      publishedAt: "2026-04-25T08:00:00.000Z",
      discoveredAt: "2026-04-25T08:30:00.000Z",
      rawSourceJson: { source: "rss", updated: true }
    });

    refreshAiTimelineEventEvidenceCount(handle.db, event.id);
    const evidence = listAiTimelineEventEvidence(handle.db, [event.id]).get(event.id);
    const refreshedEvent = listAiTimelineAdminEvents(handle.db, { recentDays: null }).events[0];

    expect(evidence).toHaveLength(2);
    expect(evidence?.map((item) => item.sourceId)).toEqual(["openai-docs-changelog", "openai-news-rss"]);
    expect(evidence?.find((item) => item.sourceId === "openai-news-rss")).toMatchObject({
      title: "OpenAI 正式发布 GPT-5.5",
      summary: "第一条官方证据更新。"
    });
    expect(refreshedEvent).toMatchObject({
      evidenceCount: 2,
      reliabilityStatus: "multi_source"
    });
  });
});
