import { describe, expect, it, vi } from "vitest";
import { collectAiTimelineEvents } from "../../src/core/aiTimeline/aiTimelineCollector.js";
import {
  officialAiTimelineSources,
  type OfficialAiTimelineHtmlDateSectionsSource,
  type OfficialAiTimelineHtmlUpdateCardsSource,
  type OfficialAiTimelineHuggingFaceModelsSource
} from "../../src/core/aiTimeline/officialAiTimelineSources.js";

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
      sourceKind: "rss_feed",
      publishedAt: "2026-04-24T10:00:00.000Z",
      discoveredAt: "2026-04-24T12:00:00.000Z",
      importance: 95
    });
    expect(result.events[0].rawSourceJson).toMatchObject({
      source: {
        companyKey: "openai",
        sourceUrl: "https://openai.com/news/rss.xml"
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
          sourceUrl: "https://openai.com/news/rss.xml",
          feedUrl: "https://openai.com/news/rss.xml",
          reason: "HTTP 403 Forbidden"
        }
      ]
    });
  });

  it("maps official HTML update cards with explicit dates to timeline events", async () => {
    const source: OfficialAiTimelineHtmlUpdateCardsSource = {
      id: "test-claude-code",
      companyKey: "anthropic",
      companyName: "Anthropic",
      sourceLabel: "Claude Code Changelog",
      sourceKind: "html_update_cards",
      pageUrl: "https://code.claude.com/docs/en/changelog",
      itemSelector: ".update-container",
      titleSelector: "[data-component-part='update-label']",
      dateSelector: "[data-component-part='update-description']",
      summarySelector: "[data-component-part='update-content']",
      linkSelector: "a[href^='#']",
      titlePrefix: "Claude Code ",
      allowedUrlPrefixes: ["https://code.claude.com/docs/en/changelog"],
      defaultEventType: "开发生态",
      publicDescription: "Test source"
    };
    const fetchMock = vi.fn(async () => new Response(`
      <div class="update-container" id="2-1-105">
        <a href="#2-1-105">link</a>
        <div data-component-part="update-label">2.1.105</div>
        <div data-component-part="update-description">April 13, 2026</div>
        <div data-component-part="update-content"><ul><li>Added /team-onboarding command.</li></ul></div>
      </div>
      <div class="update-container" id="missing-date">
        <div data-component-part="update-label">2.1.104</div>
      </div>
    `, { status: 200 }));

    const result = await collectAiTimelineEvents({
      fetch: fetchMock,
      now: new Date("2026-04-24T12:00:00.000Z"),
      sources: [source]
    });

    expect(result).toMatchObject({
      fetchedItemCount: 2,
      skippedItemCount: 1,
      failures: []
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      companyKey: "anthropic",
      eventType: "开发生态",
      title: "Claude Code 2.1.105",
      summary: "Added /team-onboarding command.",
      officialUrl: "https://code.claude.com/docs/en/changelog#2-1-105",
      publishedAt: "2026-04-13T00:00:00.000Z"
    });
  });

  it("maps official HTML date sections to release-note events", async () => {
    const source: OfficialAiTimelineHtmlDateSectionsSource = {
      id: "test-gemini-release-notes",
      companyKey: "google_ai",
      companyName: "Google AI",
      sourceLabel: "Gemini API Release Notes",
      sourceKind: "html_date_sections",
      pageUrl: "https://ai.google.dev/gemini-api/docs/changelog",
      dateHeadingSelector: ".devsite-article-body h2",
      sectionItemSelector: "li",
      allowedUrlPrefixes: ["https://ai.google.dev/gemini-api/docs/changelog"],
      defaultEventType: "模型发布",
      publicDescription: "Test source"
    };
    const fetchMock = vi.fn(async () => new Response(`
      <div class="devsite-article-body">
        <h2 id="04-22-2026" data-text="April 22, 2026">April 22, 2026</h2>
        <ul>
          <li>Launched Gemini 3.1 Flash TTS Preview for Gemini API developers.</li>
          <li>Updated SDK documentation.</li>
        </ul>
        <h2 id="missing-date">Not a date</h2>
        <ul><li>This should be skipped.</li></ul>
      </div>
    `, { status: 200 }));

    const result = await collectAiTimelineEvents({
      fetch: fetchMock,
      now: new Date("2026-04-24T12:00:00.000Z"),
      sources: [source]
    });

    expect(result).toMatchObject({
      fetchedItemCount: 3,
      skippedItemCount: 1,
      failures: []
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      companyKey: "google_ai",
      eventType: "要闻",
      title: "Launched Gemini 3.1 Flash TTS Preview for Gemini API developers.",
      officialUrl: "https://ai.google.dev/gemini-api/docs/changelog#04-22-2026-item-1",
      publishedAt: "2026-04-22T00:00:00.000Z"
    });
  });

  it("maps official Hugging Face organization models to model release events", async () => {
    const source: OfficialAiTimelineHuggingFaceModelsSource = {
      id: "test-qwen-hf",
      companyKey: "qwen",
      companyName: "Qwen",
      sourceLabel: "Hugging Face Qwen",
      sourceKind: "huggingface_models",
      apiUrl: "https://huggingface.co/api/models?author=Qwen&sort=createdAt&direction=-1&limit=2",
      orgUrl: "https://huggingface.co/Qwen",
      orgName: "Qwen",
      allowedUrlPrefixes: ["https://huggingface.co/Qwen/"],
      defaultEventType: "模型发布",
      publicDescription: "Test source"
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        id: "Qwen/Qwen3.6-27B",
        modelId: "Qwen/Qwen3.6-27B",
        createdAt: "2026-04-21T07:50:43.000Z",
        pipeline_tag: "image-text-to-text"
      },
      {
        id: "example/not-official",
        modelId: "example/not-official",
        createdAt: "2026-04-21T07:50:43.000Z"
      },
      {
        id: "Qwen/no-date"
      }
    ]), { status: 200 }));

    const result = await collectAiTimelineEvents({
      fetch: fetchMock,
      now: new Date("2026-04-24T12:00:00.000Z"),
      sources: [source]
    });

    expect(result).toMatchObject({
      fetchedItemCount: 3,
      skippedItemCount: 2,
      failures: []
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      companyKey: "qwen",
      eventType: "要闻",
      title: "发布模型 Qwen/Qwen3.6-27B",
      officialUrl: "https://huggingface.co/Qwen/Qwen3.6-27B",
      publishedAt: "2026-04-21T07:50:43.000Z"
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
