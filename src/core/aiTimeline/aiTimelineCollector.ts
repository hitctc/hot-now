import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { AiTimelineEventInput, AiTimelineEventType } from "./aiTimelineTypes.js";
import {
  getOfficialAiTimelineSourceUrl,
  officialAiTimelineSources,
  type OfficialAiTimelineHtmlDateSectionsSource,
  type OfficialAiTimelineHtmlUpdateCardsSource,
  type OfficialAiTimelineHuggingFaceModelsSource,
  type OfficialAiTimelineRssSource,
  type OfficialAiTimelineSource
} from "./officialAiTimelineSources.js";

const parser = new Parser();

export type AiTimelineFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type AiTimelineCollectionFailure = {
  sourceLabel: string;
  sourceUrl: string;
  feedUrl?: string;
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

type HuggingFaceModelApiItem = {
  id?: string;
  modelId?: string;
  createdAt?: string;
  pipeline_tag?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
};

const classifierRules: readonly AiTimelineClassifierRule[] = [
  { eventType: "要闻", keywords: ["GPT-5", "GPT-5.5", "Gemini 3", "Claude 4", "DeepSeek", "Qwen3"], importance: 95 },
  { eventType: "模型发布", keywords: ["model", "模型", "open model", "weights", "release", "released", "launched", "发布"], importance: 85 },
  { eventType: "开发生态", keywords: ["API", "SDK", "CLI", "GitHub", "developer", "agent", "tools", "command"], importance: 75 },
  { eventType: "产品应用", keywords: ["ChatGPT", "Gemini app", "Claude", "workspace", "app", "product"], importance: 70 },
  { eventType: "行业动态", keywords: ["pricing", "price", "plan", "enterprise", "availability", "deprecation", "套餐", "价格"], importance: 65 },
  { eventType: "官方前瞻", keywords: ["preview", "roadmap", "coming", "soon", "预览", "即将"], importance: 60 }
] as const;

// 采集器按来源类型分发，但统一执行官方 URL 白名单和发布时间校验，避免把二手或无时间点信息混入时间线。
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
      const sourceResult = await collectSourceEvents(source, fetchImpl, discoveredAt);
      result.events.push(...sourceResult.events);
      result.fetchedItemCount += sourceResult.fetchedItemCount;
      result.skippedItemCount += sourceResult.skippedItemCount;
    } catch (error) {
      result.failures.push({
        sourceLabel: source.sourceLabel,
        sourceUrl: getOfficialAiTimelineSourceUrl(source),
        feedUrl: source.sourceKind === "rss_feed" ? source.feedUrl : undefined,
        reason: error instanceof Error ? error.message : "Unknown AI timeline source error"
      });
    }
  }

  return result;
}

async function collectSourceEvents(
  source: OfficialAiTimelineSource,
  fetchImpl: AiTimelineFetch,
  discoveredAt: string
): Promise<Omit<CollectAiTimelineEventsResult, "failures">> {
  switch (source.sourceKind) {
    case "rss_feed":
      return collectRssEvents(source, fetchImpl, discoveredAt);
    case "html_update_cards":
      return collectHtmlUpdateCardEvents(source, fetchImpl, discoveredAt);
    case "html_date_sections":
      return collectHtmlDateSectionEvents(source, fetchImpl, discoveredAt);
    case "huggingface_models":
      return collectHuggingFaceModelEvents(source, fetchImpl, discoveredAt);
  }
}

async function collectRssEvents(
  source: OfficialAiTimelineRssSource,
  fetchImpl: AiTimelineFetch,
  discoveredAt: string
): Promise<Omit<CollectAiTimelineEventsResult, "failures">> {
  const response = await fetchOk(fetchImpl, source.feedUrl);
  const feed = await parser.parseString(await response.text());
  const items = feed.items.slice(0, source.maxItems ?? 30);
  const events: AiTimelineEventInput[] = [];
  let skippedItemCount = 0;

  for (const item of items) {
    const event = mapFeedItemToTimelineEvent(source, item, discoveredAt);

    if (!event) {
      skippedItemCount += 1;
      continue;
    }

    events.push(event);
  }

  return {
    events,
    fetchedItemCount: items.length,
    skippedItemCount
  };
}

async function collectHtmlUpdateCardEvents(
  source: OfficialAiTimelineHtmlUpdateCardsSource,
  fetchImpl: AiTimelineFetch,
  discoveredAt: string
): Promise<Omit<CollectAiTimelineEventsResult, "failures">> {
  const response = await fetchOk(fetchImpl, source.pageUrl);
  const $ = cheerio.load(await response.text());
  const items = $(source.itemSelector).slice(0, source.maxItems ?? 20).toArray();
  const events: AiTimelineEventInput[] = [];
  let skippedItemCount = 0;

  for (const [index, item] of items.entries()) {
    const titleText = cleanText($(item).find(source.titleSelector).first().text());
    const title = titleText ? `${source.titlePrefix ?? ""}${titleText}` : "";
    const dateElement = $(item).find(source.dateSelector).first();
    const dateValue = source.dateAttribute ? dateElement.attr(source.dateAttribute) : dateElement.text();
    const publishedAt = toIsoDate(dateValue);
    const summary = source.summarySelector ? toSummary($(item).find(source.summarySelector).first().html() ?? "") : null;
    const link = source.linkSelector ? $(item).find(source.linkSelector).first().attr("href") : undefined;
    const officialUrl = normalizeOfficialUrl(link ?? `${source.pageUrl}#${index + 1}`, source, source.pageUrl);
    const event = title && publishedAt && officialUrl
      ? createTimelineEvent(source, {
          title,
          summary,
          officialUrl,
          publishedAt,
          discoveredAt,
          rawItem: { title: titleText, date: dateValue, link }
        })
      : null;

    if (!event) {
      skippedItemCount += 1;
      continue;
    }

    events.push(event);
  }

  return {
    events,
    fetchedItemCount: items.length,
    skippedItemCount
  };
}

async function collectHtmlDateSectionEvents(
  source: OfficialAiTimelineHtmlDateSectionsSource,
  fetchImpl: AiTimelineFetch,
  discoveredAt: string
): Promise<Omit<CollectAiTimelineEventsResult, "failures">> {
  const response = await fetchOk(fetchImpl, source.pageUrl);
  const $ = cheerio.load(await response.text());
  const headings = $(source.dateHeadingSelector).slice(0, source.maxSections ?? 20).toArray();
  const events: AiTimelineEventInput[] = [];
  let fetchedItemCount = 0;
  let skippedItemCount = 0;

  for (const heading of headings) {
    const dateValue = $(heading).attr("data-text") ?? $(heading).text();
    const publishedAt = toIsoDate(dateValue);
    const headingId = $(heading).attr("id");
    const sectionItems = readSectionItems($, heading, source.dateHeadingSelector, source.sectionItemSelector)
      .slice(0, source.maxItemsPerSection ?? 8);

    fetchedItemCount += sectionItems.length;

    for (const [index, item] of sectionItems.entries()) {
      const text = cleanText($(item).text());
      const title = toTitleFromText(text);
      const officialUrl = normalizeOfficialUrl(
        headingId ? `${source.pageUrl}#${headingId}-item-${index + 1}` : `${source.pageUrl}#item-${index + 1}`,
        source,
        source.pageUrl
      );
      const event = title && publishedAt && officialUrl
        ? createTimelineEvent(source, {
            title,
            summary: text,
            officialUrl,
            publishedAt,
            discoveredAt,
            rawItem: { date: dateValue, headingId, index }
          })
        : null;

      if (!event) {
        skippedItemCount += 1;
        continue;
      }

      events.push(event);
    }
  }

  return {
    events,
    fetchedItemCount,
    skippedItemCount
  };
}

async function collectHuggingFaceModelEvents(
  source: OfficialAiTimelineHuggingFaceModelsSource,
  fetchImpl: AiTimelineFetch,
  discoveredAt: string
): Promise<Omit<CollectAiTimelineEventsResult, "failures">> {
  const response = await fetchOk(fetchImpl, source.apiUrl);
  const payload = await response.json();
  const models = Array.isArray(payload) ? payload.slice(0, source.maxItems ?? 20) as HuggingFaceModelApiItem[] : [];
  const events: AiTimelineEventInput[] = [];
  let skippedItemCount = 0;

  for (const model of models) {
    const modelId = model.modelId ?? model.id;
    const publishedAt = toIsoDate(model.createdAt);
    const officialUrl = modelId ? normalizeOfficialUrl(`https://huggingface.co/${modelId}`, source, source.orgUrl) : null;
    const title = modelId ? `发布模型 ${modelId}` : "";
    const summary = modelId
      ? `Hugging Face 官方组织 ${source.orgName} 新增模型 ${modelId}${model.pipeline_tag ? `，任务类型 ${model.pipeline_tag}` : ""}。`
      : null;
    const event = title && publishedAt && officialUrl
      ? createTimelineEvent(source, {
          title,
          summary,
          officialUrl,
          publishedAt,
          discoveredAt,
          rawItem: model
        })
      : null;

    if (!event) {
      skippedItemCount += 1;
      continue;
    }

    events.push(event);
  }

  return {
    events,
    fetchedItemCount: models.length,
    skippedItemCount
  };
}

function mapFeedItemToTimelineEvent(
  source: OfficialAiTimelineRssSource,
  item: Parser.Item,
  discoveredAt: string
): AiTimelineEventInput | null {
  const title = item.title?.trim() ?? "";
  const officialUrl = normalizeOfficialUrl(item.link, source, source.feedUrl);
  const publishedAt = toIsoDate(item.isoDate ?? item.pubDate);

  if (!title || !officialUrl || !publishedAt) {
    return null;
  }

  return createTimelineEvent(source, {
    title,
    summary: toSummary(item.contentSnippet ?? item.content ?? item.summary ?? readDescription(item)),
    officialUrl,
    publishedAt,
    discoveredAt,
    rawItem: {
      guid: item.guid,
      link: item.link,
      pubDate: item.pubDate,
      isoDate: item.isoDate
    }
  });
}

function createTimelineEvent(
  source: OfficialAiTimelineSource,
  input: {
    title: string;
    summary?: string | null;
    officialUrl: string;
    publishedAt: string;
    discoveredAt: string;
    rawItem: unknown;
  }
): AiTimelineEventInput {
  const classification = classifyTimelineEvent(source, `${input.title}\n${input.summary ?? ""}`);

  return {
    companyKey: source.companyKey,
    companyName: source.companyName,
    eventType: classification.eventType,
    title: input.title,
    summary: input.summary,
    officialUrl: input.officialUrl,
    sourceLabel: source.sourceLabel,
    sourceKind: source.sourceKind,
    publishedAt: input.publishedAt,
    discoveredAt: input.discoveredAt,
    importance: classification.importance,
    rawSourceJson: {
      source: {
        companyKey: source.companyKey,
        sourceLabel: source.sourceLabel,
        sourceUrl: getOfficialAiTimelineSourceUrl(source)
      },
      item: input.rawItem
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

async function fetchOk(fetchImpl: AiTimelineFetch, url: string): Promise<Response> {
  const response = await fetchImpl(url, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "hot-now-ai-timeline/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }

  return response;
}

function readSectionItems(
  $: cheerio.CheerioAPI,
  heading: AnyNode,
  headingSelector: string,
  itemSelector: string
): AnyNode[] {
  const sectionNodes: AnyNode[] = [];
  let cursor = $(heading).next();

  while (cursor.length > 0 && !cursor.is(headingSelector)) {
    const node = cursor.get(0);

    if (node?.type === "tag") {
      sectionNodes.push(node);
    }

    cursor = cursor.next();
  }

  const sectionHtml = sectionNodes.map((node) => $.html(node)).join("");
  const section = cheerio.load(`<section>${sectionHtml}</section>`);
  return section(itemSelector).toArray();
}

function normalizeOfficialUrl(value: string | undefined, source: OfficialAiTimelineSource, baseUrl: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, baseUrl).toString();
    return source.allowedUrlPrefixes.some((prefix) => url.startsWith(prefix)) ? url : null;
  } catch {
    return null;
  }
}

function toIsoDate(value?: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = cleanText(value);
  const explicitOffset = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})(?:\s+[+-]\d{4})?$/);

  if (explicitOffset) {
    const [, date, time, hour, minute] = explicitOffset;
    return parseDate(`${date}T${time}${hour}:${minute}`);
  }

  return parseDate(trimmed);
}

function parseDate(value: string): string | null {
  const englishDateOnly = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i;
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const normalizedValue = englishDateOnly.test(value) || isoDateOnly.test(value) ? `${value} UTC` : value;
  const parsed = new Date(normalizedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toSummary(value?: string): string | null {
  if (!value) {
    return null;
  }

  const summary = cleanText(cheerio.load(`<div>${value}</div>`)("div").text());
  return summary || null;
}

function toTitleFromText(value: string): string {
  const firstSentence = value.split(/(?<=[.!?。！？])\s+/u)[0] ?? value;
  return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}...` : firstSentence;
}

function cleanText(value?: string): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function readDescription(item: Parser.Item): string | undefined {
  return (item as Parser.Item & { description?: string }).description;
}
