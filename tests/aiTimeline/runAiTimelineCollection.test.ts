import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { runAiTimelineCollection } from "../../src/core/aiTimeline/runAiTimelineCollection.js";
import { officialAiTimelineSources } from "../../src/core/aiTimeline/officialAiTimelineSources.js";

describe("runAiTimelineCollection", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns a readable reason when the official source catalog is empty", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-run-empty-");
    handles.push(handle);

    await expect(runAiTimelineCollection(handle.db, { sources: [] })).resolves.toEqual({
      accepted: false,
      reason: "no-ai-timeline-sources"
    });
  });

  it("persists official timeline events and reports inserted and updated counts", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-run-collect-");
    handles.push(handle);

    const fetchMock = vi.fn(async () => new Response(createFeedXml("Official GPT model release"), { status: 200 }));
    const firstResult = await runAiTimelineCollection(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-24T12:00:00.000Z"),
      sources: [officialAiTimelineSources[0]]
    });

    expect(firstResult).toEqual({
      accepted: true,
      action: "collect-ai-timeline",
      sourceCount: 1,
      fetchedItemCount: 1,
      persistedEventCount: 1,
      insertedEventCount: 1,
      updatedEventCount: 0,
      skippedItemCount: 0,
      failureCount: 0
    });

    const secondResult = await runAiTimelineCollection(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-24T13:00:00.000Z"),
      sources: [officialAiTimelineSources[0]]
    });

    expect(secondResult).toEqual({
      accepted: true,
      action: "collect-ai-timeline",
      sourceCount: 1,
      fetchedItemCount: 1,
      persistedEventCount: 1,
      insertedEventCount: 0,
      updatedEventCount: 1,
      skippedItemCount: 0,
      failureCount: 0
    });

    const rows = handle.db
      .prepare("SELECT company_key, event_type, title, official_url FROM ai_timeline_events")
      .all() as Array<{ company_key: string; event_type: string; title: string; official_url: string }>;

    expect(rows).toEqual([
      {
        company_key: "openai",
        event_type: "模型发布",
        title: "Official GPT model release",
        official_url: "https://openai.com/news/official-gpt-model-release/"
      }
    ]);
  });
});

function createFeedXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>OpenAI News</title>
    <item>
      <title><![CDATA[${title}]]></title>
      <link>https://openai.com/news/official-gpt-model-release/</link>
      <pubDate>Fri, 24 Apr 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[Official model release notes.]]></description>
    </item>
  </channel>
</rss>`;
}
