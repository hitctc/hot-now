import { describe, expect, it, vi } from "vitest";
import { collectAiTimelineEvents } from "../../src/core/aiTimeline/aiTimelineCollector.js";
import { officialAiTimelineSources } from "../../src/core/aiTimeline/officialAiTimelineSources.js";

describe("collectAiTimelineEvents", () => {
  it("maps official RSS items to timeline events with rule-based event types", async () => {
    const fetchMock = vi.fn(async () => new Response(createFeedXml([
      {
        title: "Introducing GPT-5.5",
        link: "https://openai.com/news/introducing-gpt-5-5/",
        pubDate: "Fri, 24 Apr 2026 10:00:00 GMT",
        description: "Official release notes for GPT-5.5."
      },
      {
        title: "A random mirrored post",
        link: "https://example.com/openai-mirror/",
        pubDate: "Fri, 24 Apr 2026 11:00:00 GMT",
        description: "Not an official OpenAI URL."
      },
      {
        title: "Missing date should be skipped",
        link: "https://openai.com/news/missing-date/",
        description: "Official URL but no publication time."
      }
    ]), {
      status: 200,
      headers: { "content-type": "application/rss+xml" }
    }));

    const result = await collectAiTimelineEvents({
      fetch: fetchMock,
      now: new Date("2026-04-24T12:00:00.000Z"),
      sources: [officialAiTimelineSources[0]]
    });

    expect(result).toMatchObject({
      fetchedItemCount: 3,
      skippedItemCount: 2,
      failures: []
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      companyKey: "openai",
      companyName: "OpenAI",
      eventType: "要闻",
      title: "Introducing GPT-5.5",
      summary: "Official release notes for GPT-5.5.",
      officialUrl: "https://openai.com/news/introducing-gpt-5-5/",
      sourceLabel: "OpenAI News",
      sourceKind: "official_blog",
      publishedAt: "2026-04-24T10:00:00.000Z",
      discoveredAt: "2026-04-24T12:00:00.000Z",
      importance: 95
    });
    expect(result.events[0].rawSourceJson).toMatchObject({
      source: {
        companyKey: "openai",
        feedUrl: "https://openai.com/news/rss.xml"
      }
    });
  });

  it("uses the source default event type when no classifier rule matches", async () => {
    const fetchMock = vi.fn(async () => new Response(createFeedXml([
      {
        title: "Stories from Google AI research",
        link: "https://blog.google/technology/ai/stories-from-google-ai/",
        pubDate: "Fri, 24 Apr 2026 09:00:00 GMT",
        description: "An official Google AI update."
      }
    ]), { status: 200 }));

    const result = await collectAiTimelineEvents({
      fetch: fetchMock,
      now: new Date("2026-04-24T12:00:00.000Z"),
      sources: [officialAiTimelineSources[1]]
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      companyKey: "google_ai",
      eventType: "行业动态"
    });
  });

  it("records source failures without throwing the whole collection", async () => {
    const fetchMock = vi.fn(async () => new Response("Forbidden", { status: 403, statusText: "Forbidden" }));

    const result = await collectAiTimelineEvents({
      fetch: fetchMock,
      sources: [officialAiTimelineSources[0]]
    });

    expect(result.events).toEqual([]);
    expect(result).toMatchObject({
      fetchedItemCount: 0,
      skippedItemCount: 0,
      failures: [
        {
          sourceLabel: "OpenAI News",
          feedUrl: "https://openai.com/news/rss.xml",
          reason: "HTTP 403 Forbidden"
        }
      ]
    });
  });
});

function createFeedXml(items: Array<{ title: string; link: string; pubDate?: string; description?: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Official AI Feed</title>
    <link>https://example.com/</link>
    ${items.map((item) => `
      <item>
        <title><![CDATA[${item.title}]]></title>
        <link>${item.link}</link>
        ${item.pubDate ? `<pubDate>${item.pubDate}</pubDate>` : ""}
        ${item.description ? `<description><![CDATA[${item.description}]]></description>` : ""}
      </item>
    `).join("")}
  </channel>
</rss>`;
}
