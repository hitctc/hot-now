import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { AiTimelineEventInput, AiTimelineSourceRunInput } from "./aiTimelineTypes.js";
import { createAiTimelineEventKey } from "./aiTimelineEventKey.js";
import { classifyImportantAiTimelineEvent } from "./aiTimelineImportance.js";
import {
  getOfficialAiTimelineSourceUrl,
  officialAiTimelineSources,
  type OfficialAiTimelineHtmlDateSectionsSource,
  type OfficialAiTimelineHtmlEmbeddedJsonPostsSource,
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
  sourceRuns: AiTimelineSourceRunInput[];
};

type CollectedSourceEvents = Omit<CollectAiTimelineEventsResult, "failures" | "sourceRuns">;

type HuggingFaceModelApiItem = {
  id?: string;
  modelId?: string;
  createdAt?: string;
  pipeline_tag?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
};

type EmbeddedJsonPostItem = {
  slug?: string;
  date?: string;
  title?: string;
  description?: string;
  category?: {
    name?: string;
  };
};

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
    failures: [],
    sourceRuns: []
  };

  for (const source of sources) {
    try {
      const sourceResult = await collectSourceEvents(source, fetchImpl, discoveredAt);
      result.events.push(...sourceResult.events);
      result.fetchedItemCount += sourceResult.fetchedItemCount;
      result.skippedItemCount += sourceResult.skippedItemCount;
      result.sourceRuns.push(createSourceRun(source, discoveredAt, {
        status: sourceResult.events.length > 0 ? "success" : "empty",
        fetchedItemCount: sourceResult.fetchedItemCount,
        candidateEventCount: sourceResult.events.length,
        importantEventCount: sourceResult.events.filter((event) => event.importanceLevel === "S" || event.importanceLevel === "A").length,
        latestOfficialPublishedAt: readLatestPublishedAt(sourceResult.events)
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown AI timeline source error";
      result.failures.push({
        sourceLabel: source.sourceLabel,
        sourceUrl: getOfficialAiTimelineSourceUrl(source),
        feedUrl: source.sourceKind === "rss_feed" ? source.feedUrl : undefined,
        reason
      });
      result.sourceRuns.push(createSourceRun(source, discoveredAt, {
        status: "failed",
        errorMessage: reason
      }));
    }
  }

  return result;
}

async function collectSourceEvents(
  source: OfficialAiTimelineSource,
  fetchImpl: AiTimelineFetch,
  discoveredAt: string
): Promise<CollectedSourceEvents> {
  switch (source.sourceKind) {
    case "rss_feed":
      return collectRssEvents(source, fetchImpl, discoveredAt);
    case "html_update_cards":
      return collectHtmlUpdateCardEvents(source, fetchImpl, discoveredAt);
    case "html_date_sections":
      return collectHtmlDateSectionEvents(source, fetchImpl, discoveredAt);
    case "html_embedded_json_posts":
      return collectHtmlEmbeddedJsonPostEvents(source, fetchImpl, discoveredAt);
    case "huggingface_models":
      return collectHuggingFaceModelEvents(source, fetchImpl, discoveredAt);
  }
}

async function collectRssEvents(
  source: OfficialAiTimelineRssSource,
  fetchImpl: AiTimelineFetch,
  discoveredAt: string
): Promise<CollectedSourceEvents> {
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
): Promise<CollectedSourceEvents> {
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
    const link = source.linkSelector ? $(item).find(source.linkSelector).first().attr("href") : $(item).attr("href");
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
): Promise<CollectedSourceEvents> {
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
    const sectionItems = readSectionItems(
      $,
      heading,
      [source.dateHeadingSelector, source.yearHeadingSelector].filter(Boolean).join(", "),
      source.sectionItemSelector
    )
      .slice(0, source.maxItemsPerSection ?? 8);
    const publishedAtWithYear = publishedAt ?? toIsoDateWithYear(dateValue, readNearestYearHint($, heading, source.yearHeadingSelector));

    fetchedItemCount += sectionItems.length;

    for (const [index, item] of sectionItems.entries()) {
      const text = cleanText($(item).text());
      const title = toTitleFromText(text);
      const officialUrl = normalizeOfficialUrl(
        headingId ? `${source.pageUrl}#${headingId}-item-${index + 1}` : `${source.pageUrl}#item-${index + 1}`,
        source,
        source.pageUrl
      );
      const event = title && publishedAtWithYear && officialUrl
        ? createTimelineEvent(source, {
            title,
            summary: text,
            officialUrl,
            publishedAt: publishedAtWithYear,
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
): Promise<CollectedSourceEvents> {
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

async function collectHtmlEmbeddedJsonPostEvents(
  source: OfficialAiTimelineHtmlEmbeddedJsonPostsSource,
  fetchImpl: AiTimelineFetch,
  discoveredAt: string
): Promise<CollectedSourceEvents> {
  const response = await fetchOk(fetchImpl, source.pageUrl);
  const posts = readEmbeddedJsonPosts(await response.text(), source.postsArrayKey).slice(0, source.maxItems ?? 20);
  const events: AiTimelineEventInput[] = [];
  let skippedItemCount = 0;

  for (const post of posts) {
    const title = cleanText(post.title);
    const publishedAt = toIsoDate(post.date);
    const officialUrl = post.slug
      ? normalizeOfficialUrl(`${source.itemUrlPrefix}${post.slug}`, source, source.pageUrl)
      : null;
    const summary = post.description
      ? cleanText(`${post.category?.name ? `${post.category.name}: ` : ""}${post.description}`)
      : null;
    const event = title && publishedAt && officialUrl
      ? createTimelineEvent(source, {
          title,
          summary,
          officialUrl,
          publishedAt,
          discoveredAt,
          rawItem: post
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
    fetchedItemCount: posts.length,
    skippedItemCount
  };
}

function mapFeedItemToTimelineEvent(
  source: OfficialAiTimelineRssSource,
  item: Parser.Item,
  discoveredAt: string
): AiTimelineEventInput | null {
  const title = `${source.titlePrefix ?? ""}${item.title?.trim() ?? ""}`.trim();
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
      title: item.title,
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
  const classification = classifyImportantAiTimelineEvent({
    companyKey: source.companyKey,
    companyName: source.companyName,
    sourceLabel: source.sourceLabel,
    defaultEventType: source.defaultEventType,
    title: input.title,
    summary: input.summary,
    officialUrl: input.officialUrl
  });

  return {
    sourceId: source.id,
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
    importanceLevel: classification.importanceLevel,
    releaseStatus: classification.releaseStatus,
    importanceSummaryZh: classification.importanceSummaryZh,
    visibilityStatus: classification.visibilityStatus,
    detectedEntities: classification.detectedEntities,
    eventKey: createAiTimelineEventKey({
      companyKey: source.companyKey,
      title: input.title,
      publishedAt: input.publishedAt,
      detectedEntities: classification.detectedEntities
    }),
    rawSourceJson: {
      source: {
        sourceId: source.id,
        companyKey: source.companyKey,
        sourceLabel: source.sourceLabel,
        sourceUrl: getOfficialAiTimelineSourceUrl(source)
      },
      item: input.rawItem
    }
  };
}

function createSourceRun(
  source: OfficialAiTimelineSource,
  timestamp: string,
  input: Pick<AiTimelineSourceRunInput, "status"> & Partial<AiTimelineSourceRunInput>
): AiTimelineSourceRunInput {
  return {
    sourceId: source.id,
    companyKey: source.companyKey,
    companyName: source.companyName,
    sourceLabel: source.sourceLabel,
    sourceKind: source.sourceKind,
    status: input.status,
    startedAt: timestamp,
    finishedAt: timestamp,
    fetchedItemCount: input.fetchedItemCount ?? 0,
    candidateEventCount: input.candidateEventCount ?? 0,
    importantEventCount: input.importantEventCount ?? 0,
    latestOfficialPublishedAt: input.latestOfficialPublishedAt ?? null,
    errorMessage: input.errorMessage ?? null
  };
}

function readLatestPublishedAt(events: AiTimelineEventInput[]): string | null {
  const timestamps = events
    .map((event) => new Date(event.publishedAt).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
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
  const monthNames = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  const englishDateOnly = new RegExp(`^(${monthNames})\\s+\\d{1,2},\\s+\\d{4}$`, "i");
  const englishMonthYearOnly = new RegExp(`^(${monthNames})\\s+\\d{4}$`, "i");
  const englishMonthDayOnly = new RegExp(`^(${monthNames})\\s+\\d{1,2}$`, "i");
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const isoDateTimeWithoutZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/;
  const chineseDate = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);

  if (chineseDate) {
    const [, year, month, day] = chineseDate;
    return parseDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  }

  const normalizedEnglishValue = value
    .replace(/\bSept\./i, "September")
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./gi, "$1");
  if (englishMonthDayOnly.test(normalizedEnglishValue)) {
    return null;
  }
  const normalizedValue = englishDateOnly.test(normalizedEnglishValue) || englishMonthYearOnly.test(normalizedEnglishValue) || isoDateOnly.test(normalizedEnglishValue)
    ? `${normalizedEnglishValue} UTC`
    : isoDateTimeWithoutZone.test(normalizedEnglishValue)
      ? `${normalizedEnglishValue}Z`
    : normalizedEnglishValue;
  const parsed = new Date(normalizedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toIsoDateWithYear(value?: string, yearHint?: number): string | null {
  if (!value || !yearHint) {
    return null;
  }

  const trimmed = cleanText(value);
  const monthDayOnly = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i;
  return monthDayOnly.test(trimmed) ? parseDate(`${trimmed}, ${yearHint}`) : null;
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

function readNearestYearHint($: cheerio.CheerioAPI, heading: AnyNode, yearHeadingSelector?: string): number | undefined {
  if (!yearHeadingSelector) {
    return undefined;
  }

  const yearText = cleanText($(heading).prevAll(yearHeadingSelector).first().text());
  const fullYear = yearText.match(/\b(20\d{2})\b/);
  const shortYear = yearText.match(/\b\d{2}\b/);

  if (fullYear) {
    return Number(fullYear[1]);
  }

  if (shortYear) {
    return 2000 + Number(shortYear[0]);
  }

  return undefined;
}

function readEmbeddedJsonPosts(html: string, postsArrayKey: string): EmbeddedJsonPostItem[] {
  const decoded = html
    .replace(/\\"/g, "\"")
    .replace(/\\u0026/g, "&")
    .replace(/\\n/g, "\n");
  const keyIndex = decoded.indexOf(`"${postsArrayKey}":[`);

  if (keyIndex < 0) {
    return [];
  }

  const arrayStart = decoded.indexOf("[", keyIndex);
  const arrayText = readBalancedJsonArray(decoded, arrayStart);

  if (!arrayText) {
    return [];
  }

  try {
    const parsed = JSON.parse(arrayText);
    return Array.isArray(parsed) ? parsed as EmbeddedJsonPostItem[] : [];
  } catch {
    return [];
  }
}

function readBalancedJsonArray(value: string, startIndex: number): string | null {
  if (startIndex < 0 || value[startIndex] !== "[") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}
