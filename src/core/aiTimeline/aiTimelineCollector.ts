import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { AiTimelineEventInput, AiTimelineEventType } from "./aiTimelineTypes.js";
import {
  officialAiTimelineSources,
  type OfficialAiTimelineSource
} from "./officialAiTimelineSources.js";

const parser = new Parser();

export type AiTimelineFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type AiTimelineCollectionFailure = {
  sourceLabel: string;
  feedUrl: string;
  reason: string;
};

export type CollectAiTimelineEventsOptions = {
  fetch?: AiTimelineFetch;
  now?: Date;
  sources?: readonly OfficialAiTimelineSource[];
};

export type CollectAiTimelineEventsResult = {
  events: AiTimelineEventInput[];
  fetchedItemCount: number;
  skippedItemCount: number;
  failures: AiTimelineCollectionFailure[];
};

type AiTimelineClassifierRule = {
  eventType: AiTimelineEventType;
  keywords: readonly string[];
  importance: number;
};

const classifierRules: readonly AiTimelineClassifierRule[] = [
  { eventType: "要闻", keywords: ["GPT-5", "GPT-5.5", "Gemini 3", "Claude 4", "DeepSeek", "Qwen3"], importance: 95 },
  { eventType: "模型发布", keywords: ["model", "模型", "open model", "weights", "release", "发布"], importance: 85 },
  { eventType: "开发生态", keywords: ["API", "SDK", "CLI", "GitHub", "developer", "agent", "tools"], importance: 75 },
  { eventType: "产品应用", keywords: ["ChatGPT", "Gemini app", "Claude", "workspace", "app", "product"], importance: 70 },
  { eventType: "行业动态", keywords: ["pricing", "price", "plan", "enterprise", "availability", "套餐", "价格"], importance: 65 },
  { eventType: "官方前瞻", keywords: ["preview", "roadmap", "coming", "soon", "预览", "即将"], importance: 60 }
] as const;

// 采集器只接受官方白名单 URL，并强制使用 RSS 条目发布时间，保证时间线不是新闻流的二次加工。
export async function collectAiTimelineEvents(
  options: CollectAiTimelineEventsOptions = {}
): Promise<CollectAiTimelineEventsResult> {
  const sources = options.sources ?? officialAiTimelineSources;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const discoveredAt = (options.now ?? new Date()).toISOString();
  const result: CollectAiTimelineEventsResult = {
    events: [],
    fetchedItemCount: 0,
    skippedItemCount: 0,
    failures: []
  };

  for (const source of sources) {
    try {
      const response = await fetchImpl(source.feedUrl);

      if (!response.ok) {
        result.failures.push({
          sourceLabel: source.sourceLabel,
          feedUrl: source.feedUrl,
          reason: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
        });
        continue;
      }

      const feed = await parser.parseString(await response.text());
      result.fetchedItemCount += feed.items.length;

      for (const item of feed.items) {
        const event = mapFeedItemToTimelineEvent(source, item, discoveredAt);

        if (!event) {
          result.skippedItemCount += 1;
          continue;
        }

        result.events.push(event);
      }
    } catch (error) {
      result.failures.push({
        sourceLabel: source.sourceLabel,
        feedUrl: source.feedUrl,
        reason: error instanceof Error ? error.message : "Unknown AI timeline source error"
      });
    }
  }

  return result;
}

function mapFeedItemToTimelineEvent(
  source: OfficialAiTimelineSource,
  item: Parser.Item,
  discoveredAt: string
): AiTimelineEventInput | null {
  const title = item.title?.trim() ?? "";
  const officialUrl = normalizeOfficialUrl(item.link, source);
  const publishedAt = toIsoDate(item.isoDate ?? item.pubDate);

  if (!title || !officialUrl || !publishedAt) {
    return null;
  }

  const summary = toSummary(item.contentSnippet ?? item.content ?? item.summary ?? readDescription(item));
  const classification = classifyTimelineEvent(source, `${title}\n${summary ?? ""}`);

  return {
    companyKey: source.companyKey,
    companyName: source.companyName,
    eventType: classification.eventType,
    title,
    summary,
    officialUrl,
    sourceLabel: source.sourceLabel,
    sourceKind: source.sourceKind,
    publishedAt,
    discoveredAt,
    importance: classification.importance,
    rawSourceJson: {
      source: {
        companyKey: source.companyKey,
        sourceLabel: source.sourceLabel,
        feedUrl: source.feedUrl
      },
      rssItem: {
        guid: item.guid,
        link: item.link,
        pubDate: item.pubDate,
        isoDate: item.isoDate
      }
    }
  };
}

function classifyTimelineEvent(source: OfficialAiTimelineSource, text: string) {
  const normalized = text.toLowerCase();
  const matchedRule = classifierRules.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  );

  return matchedRule ?? {
    eventType: source.defaultEventType,
    importance: 50
  };
}

function normalizeOfficialUrl(value: string | undefined, source: OfficialAiTimelineSource): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, source.feedUrl).toString();
    return source.allowedUrlPrefixes.some((prefix) => url.startsWith(prefix)) ? url : null;
  } catch {
    return null;
  }
}

function toIsoDate(value?: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toSummary(value?: string): string | null {
  if (!value) {
    return null;
  }

  const summary = cheerio.load(`<div>${value}</div>`)("div").text().replace(/\s+/g, " ").trim();
  return summary || null;
}

function readDescription(item: Parser.Item): string | undefined {
  return (item as Parser.Item & { description?: string }).description;
}
