import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildAiTimelinePageModelFromMarkdown,
  readAiTimelineFeedFile
} from "../../src/core/aiTimeline/aiTimelineFeedFile.js";

function validFeed(title = "ok") {
  return `---
feed_version: "ai-timeline-feed/v1"
---

# AI 官方发布时间线

\`\`\`json ai-timeline-feed
{"schemaVersion":"1.0","events":[],"title":"${title}"}
\`\`\`
`;
}

describe("readAiTimelineFeedFile", () => {
  it("serves the latest feed when it is valid", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-feed-"));
    const feedFile = path.join(tempDir, "ai-timeline-feed.md");
    const manifestFile = path.join(tempDir, "ai-timeline-feed-manifest.json");

    await writeFile(feedFile, validFeed("latest"));

    const result = await readAiTimelineFeedFile({ file: feedFile, manifestFile, maxFallbackVersions: 5 });

    expect(result.content).toContain('"title":"latest"');
    expect(result.sourcePath).toBe(feedFile);
    expect(result.isFallback).toBe(false);
  });

  it("falls back to manifest versions when the latest feed is invalid", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-feed-"));
    const feedFile = path.join(tempDir, "ai-timeline-feed.md");
    const manifestFile = path.join(tempDir, "ai-timeline-feed-manifest.json");
    const versionFile = path.join(tempDir, "ai-timeline-feed-20260425T120000Z.md");

    await mkdir(tempDir, { recursive: true });
    await writeFile(feedFile, "# broken");
    await writeFile(versionFile, validFeed("fallback"));
    await writeFile(
      manifestFile,
      JSON.stringify({
        latest: "ai-timeline-feed.md",
        versions: [{ fileName: "ai-timeline-feed-20260425T120000Z.md" }]
      })
    );

    const result = await readAiTimelineFeedFile({ file: feedFile, manifestFile, maxFallbackVersions: 5 });

    expect(result.content).toContain('"title":"fallback"');
    expect(result.sourcePath).toBe(versionFile);
    expect(result.isFallback).toBe(true);
  });

  it("scans versioned files when the manifest is unavailable", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-feed-"));
    const feedFile = path.join(tempDir, "ai-timeline-feed.md");
    const manifestFile = path.join(tempDir, "ai-timeline-feed-manifest.json");
    const oldVersionFile = path.join(tempDir, "ai-timeline-feed-20260424T120000Z.md");
    const newVersionFile = path.join(tempDir, "ai-timeline-feed-20260425T120000Z.md");

    await writeFile(feedFile, "# broken");
    await writeFile(oldVersionFile, validFeed("old"));
    await writeFile(newVersionFile, validFeed("new"));

    const result = await readAiTimelineFeedFile({ file: feedFile, manifestFile, maxFallbackVersions: 5 });

    expect(result.content).toContain('"title":"new"');
    expect(result.sourcePath).toBe(newVersionFile);
    expect(result.isFallback).toBe(true);
  });
});

describe("buildAiTimelinePageModelFromMarkdown", () => {
  function feedWithEvents() {
    return `# AI 官方发布时间线

\`\`\`json ai-timeline-feed
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-04-26T09:00:00+08:00",
  "events": [
    {
      "id": "2026-04-25-openai-gpt-55-release",
      "eventKey": "openai:gpt-55:model_release:2026-04-25",
      "title": "Introducing GPT-5.5",
      "titleZh": "OpenAI 发布 GPT-5.5",
      "company": "OpenAI",
      "companyKey": "openai",
      "product": "GPT-5.5",
      "eventType": "模型发布",
      "actionType": "model_release",
      "releaseStatus": "released",
      "importance": "S",
      "eventTime": "2026-04-25T10:00:00+08:00",
      "summaryZh": "OpenAI 发布 GPT-5.5，作为新一代主模型进入 ChatGPT 和 API 体系。",
      "whyItMattersZh": "这会影响开发者选型和产品能力边界。",
      "officialUrl": "https://openai.com/news/introducing-gpt-55",
      "officialSources": [
        {
          "type": "official_blog",
          "title": "Introducing GPT-5.5",
          "url": "https://openai.com/news/introducing-gpt-55",
          "publishedAt": "2026-04-25T10:00:00+08:00"
        }
      ],
      "confidence": "high",
      "visibility": "show",
      "tags": ["OpenAI", "GPT"]
    },
    {
      "id": "2026-04-24-google-ai-tool-update",
      "eventKey": "google:tool_update:2026-04-24",
      "title": "Google ships a Gemini tool update",
      "titleZh": "Google 更新 Gemini 开发工具",
      "company": "Google AI",
      "companyKey": "google-ai",
      "product": "Gemini",
      "eventType": "开发生态",
      "actionType": "tool_update",
      "releaseStatus": "updated",
      "importance": "A",
      "eventTime": "2026-04-24T09:00:00+08:00",
      "summaryZh": "Google 更新 Gemini 开发工具。",
      "whyItMattersZh": "这会影响 Gemini 生态开发体验。",
      "officialUrl": "https://blog.google/technology/ai/gemini-tool/",
      "officialSources": [
        {
          "type": "official_blog",
          "title": "Google ships a Gemini tool update",
          "url": "https://blog.google/technology/ai/gemini-tool/",
          "publishedAt": "2026-04-24T09:00:00+08:00"
        }
      ],
      "confidence": "high",
      "visibility": "show",
      "tags": ["Gemini"]
    }
  ]
}
\`\`\`
`;
  }

  it("maps feed JSON events into the public timeline page model", () => {
    const model = buildAiTimelinePageModelFromMarkdown(feedWithEvents(), {
      referenceTime: new Date("2026-04-26T00:00:00.000Z")
    });

    expect(model.pagination.totalResults).toBe(2);
    expect(model.filters.companies).toEqual([
      { key: "google-ai", name: "Google AI", eventCount: 1 },
      { key: "openai", name: "OpenAI", eventCount: 1 }
    ]);
    expect(model.events[0]).toMatchObject({
      companyKey: "openai",
      eventType: "模型发布",
      importanceLevel: "S",
      releaseStatus: "released",
      displayTitle: "OpenAI 发布 GPT-5.5",
      displaySummaryZh: expect.stringContaining("开发者选型"),
      evidenceCount: 1
    });
  });

  it("applies event type, company and search filters from the feed model", () => {
    const model = buildAiTimelinePageModelFromMarkdown(feedWithEvents(), {
      eventType: "开发生态",
      companyKey: "google-ai",
      searchKeyword: "Gemini",
      referenceTime: new Date("2026-04-26T00:00:00.000Z")
    });

    expect(model.pagination.totalResults).toBe(1);
    expect(model.events[0].companyName).toBe("Google AI");
    expect(model.events[0].releaseStatus).toBe("updated");
  });

  it("keeps B level events from the source feed", () => {
    const model = buildAiTimelinePageModelFromMarkdown(`# AI 官方发布时间线

\`\`\`json ai-timeline-feed
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-04-26T09:00:00+08:00",
  "events": [
    {
      "id": "2026-04-24-qwen-doc-update",
      "eventKey": "qwen:docs:product_update:2026-04-24",
      "title": "Qwen updates model documentation",
      "titleZh": "通义千问更新模型文档",
      "company": "Qwen",
      "companyKey": "qwen",
      "product": "Qwen",
      "eventType": "开发生态",
      "actionType": "product_update",
      "releaseStatus": "updated",
      "importance": "B",
      "eventTime": "2026-04-24T09:00:00+08:00",
      "summaryZh": "通义千问发布一项开发生态更新。",
      "whyItMattersZh": "这会影响开发者查看和接入模型能力。",
      "officialUrl": "https://qwen.ai/blog/update",
      "officialSources": [
        {
          "type": "official_blog",
          "title": "Qwen update",
          "url": "https://qwen.ai/blog/update",
          "publishedAt": "2026-04-24T09:00:00+08:00"
        }
      ],
      "confidence": "high",
      "visibility": "show",
      "tags": ["Qwen"]
    }
  ]
}
\`\`\`
`);

    expect(model.pagination.totalResults).toBe(1);
    expect(model.events[0]).toMatchObject({
      companyKey: "qwen",
      importance: 60,
      importanceLevel: "B"
    });
  });

  it("drops feed events that have no usable official evidence", () => {
    const model = buildAiTimelinePageModelFromMarkdown(`# AI 官方发布时间线

\`\`\`json ai-timeline-feed
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-04-26T09:00:00+08:00",
  "events": [
    {
      "id": "2026-04-25-openai-no-source",
      "eventKey": "openai:gpt-55:model_release:2026-04-25",
      "title": "Introducing GPT-5.5",
      "titleZh": "OpenAI 发布 GPT-5.5",
      "company": "OpenAI",
      "companyKey": "openai",
      "product": "GPT-5.5",
      "eventType": "模型发布",
      "actionType": "model_release",
      "releaseStatus": "released",
      "importance": "S",
      "eventTime": "2026-04-25T10:00:00+08:00",
      "summaryZh": "OpenAI 发布 GPT-5.5。",
      "whyItMattersZh": "这会影响开发者选型。",
      "officialUrl": "",
      "officialSources": [],
      "confidence": "high",
      "visibility": "show",
      "tags": ["OpenAI", "GPT"]
    }
  ]
}
\`\`\`
`);

    expect(model.pagination.totalResults).toBe(0);
  });
});
