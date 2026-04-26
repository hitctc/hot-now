import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  aiTimelineEventTypes,
  isAiTimelineEventType,
  isAiTimelineImportanceLevel,
  isAiTimelineReleaseStatus,
  type AiTimelineEventEvidenceRecord,
  type AiTimelineEventRecord,
  type AiTimelineListQuery,
  type AiTimelinePageModel
} from "./aiTimelineTypes.js";

export type AiTimelineFeedReadResult = {
  content: string;
  sourcePath: string;
  isFallback: boolean;
};

type AiTimelineFeedOfficialSource = {
  type?: unknown;
  title?: unknown;
  url?: unknown;
  publishedAt?: unknown;
};

type AiTimelineFeedEvent = {
  id?: unknown;
  eventKey?: unknown;
  title?: unknown;
  titleZh?: unknown;
  company?: unknown;
  companyKey?: unknown;
  product?: unknown;
  eventType?: unknown;
  actionType?: unknown;
  releaseStatus?: unknown;
  importance?: unknown;
  eventTime?: unknown;
  summaryZh?: unknown;
  whyItMattersZh?: unknown;
  officialUrl?: unknown;
  officialSources?: unknown;
  tags?: unknown;
  confidence?: unknown;
  visibility?: unknown;
};

type AiTimelineFeedData = {
  schemaVersion?: unknown;
  generatedAt?: unknown;
  events?: unknown;
};

type AiTimelineFeedManifest = {
  latest?: string;
  versions?: Array<string | { fileName?: string; file?: string; path?: string }>;
};

export async function readAiTimelineFeedFile(options: {
  url?: string | null;
  file: string;
  manifestFile: string;
  maxFallbackVersions: number;
}): Promise<AiTimelineFeedReadResult> {
  const candidates = await collectFeedCandidates(options);
  const failures: string[] = [];

  for (const [index, candidate] of candidates.entries()) {
    try {
      const content = isHttpUrl(candidate) ? await readFeedUrl(candidate) : await readFile(candidate, "utf8");
      assertValidFeedMarkdown(content);
      return {
        content,
        sourcePath: candidate,
        isFallback: index > 0
      };
    } catch (error) {
      failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`No valid AI timeline feed file found. Tried: ${failures.join("; ")}`);
}

export async function readAiTimelineFeedPageModel(
  options: {
    url?: string | null;
    file: string;
    manifestFile: string;
    maxFallbackVersions: number;
  },
  query: AiTimelineListQuery = {}
): Promise<AiTimelinePageModel> {
  const feed = await readAiTimelineFeedFile(options);
  return buildAiTimelinePageModelFromMarkdown(feed.content, query);
}

export function buildAiTimelinePageModelFromMarkdown(content: string, query: AiTimelineListQuery = {}): AiTimelinePageModel {
  const data = parseAiTimelineFeedMarkdown(content);
  const allEvents = normalizeFeedEvents(data);
  const filteredEvents = filterFeedEvents(allEvents, query);
  const pageSize = normalizePositiveInteger(query.pageSize, 50);
  const page = normalizePositiveInteger(query.page, 1);
  const totalResults = filteredEvents.length;
  const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / pageSize);
  const pageEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize);

  return {
    events: pageEvents,
    filters: {
      eventTypes: [...aiTimelineEventTypes],
      companies: buildCompanyFilters(allEvents)
    },
    pagination: {
      page,
      pageSize,
      totalResults,
      totalPages
    }
  };
}

async function collectFeedCandidates(options: {
  url?: string | null;
  file: string;
  manifestFile: string;
  maxFallbackVersions: number;
}) {
  const manifestVersions = await readManifestFeedVersions(options.manifestFile, options.maxFallbackVersions);
  const scannedVersions = await scanVersionedFeedFiles(options.file, options.maxFallbackVersions);
  const fileCandidates = [options.file, ...manifestVersions, ...scannedVersions].map((candidate) =>
    path.resolve(path.dirname(options.file), candidate)
  );
  const candidates = [options.url?.trim() ?? "", ...fileCandidates].filter(Boolean);

  return [...new Set(candidates)];
}

async function readFeedUrl(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/markdown,text/plain,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function readManifestFeedVersions(manifestFile: string, maxFallbackVersions: number) {
  try {
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as AiTimelineFeedManifest;
    const manifestDir = path.dirname(manifestFile);
    const versions = [manifest.latest, ...(Array.isArray(manifest.versions) ? manifest.versions : [])]
      .map((entry) => normalizeManifestEntry(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, maxFallbackVersions + 1);

    return versions.map((entry) => path.resolve(manifestDir, entry));
  } catch {
    return [];
  }
}

function normalizeManifestEntry(entry: string | { fileName?: string; file?: string; path?: string } | undefined) {
  if (typeof entry === "string") {
    return entry;
  }

  return entry?.fileName ?? entry?.file ?? entry?.path;
}

async function scanVersionedFeedFiles(feedFile: string, maxFallbackVersions: number) {
  try {
    const feedDir = path.dirname(feedFile);
    const parsedPath = path.parse(feedFile);
    const versionPattern = new RegExp(`^${escapeRegExp(parsedPath.name)}-\\d{8}T\\d{6}Z\\.md$`);
    const entries = await readdir(feedDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && versionPattern.test(entry.name))
      .map((entry) => path.join(feedDir, entry.name))
      .sort()
      .reverse()
      .slice(0, maxFallbackVersions);
  } catch {
    return [];
  }
}

function assertValidFeedMarkdown(content: string) {
  parseAiTimelineFeedMarkdown(content);
}

function parseAiTimelineFeedMarkdown(content: string): AiTimelineFeedData {
  const match = content.match(/```json ai-timeline-feed\n(.*?)\n```/s);

  if (!match?.[1]) {
    throw new Error("missing json ai-timeline-feed code block");
  }

  const parsed = JSON.parse(match[1]) as AiTimelineFeedData;

  if (parsed.schemaVersion !== "1.0") {
    throw new Error("schemaVersion must be 1.0");
  }

  if (!Array.isArray(parsed.events)) {
    throw new Error("events must be an array");
  }

  return parsed;
}

function normalizeFeedEvents(data: AiTimelineFeedData): AiTimelineEventRecord[] {
  const generatedAt = typeof data.generatedAt === "string" ? data.generatedAt : new Date().toISOString();

  return (data.events as AiTimelineFeedEvent[])
    .map((event, index) => normalizeFeedEvent(event, index, generatedAt))
    .filter((event): event is AiTimelineEventRecord => Boolean(event))
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

function normalizeFeedEvent(
  event: AiTimelineFeedEvent,
  index: number,
  generatedAt: string
): AiTimelineEventRecord | null {
  const eventTime = readString(event.eventTime);
  const publishedDate = eventTime ? new Date(eventTime) : null;

  if (!eventTime || !publishedDate || Number.isNaN(publishedDate.getTime())) {
    return null;
  }

  const companyKey = slugify(readString(event.companyKey) || readString(event.company) || "unknown");
  const companyName = readString(event.company) || companyKey;
  const product = readString(event.product);
  const title = readString(event.title) || readString(event.titleZh) || product || "AI 官方事件";
  const titleZh = readString(event.titleZh) || title;
  const summaryZh = readString(event.summaryZh);
  const whyItMattersZh = readString(event.whyItMattersZh);
  const officialUrl = readString(event.officialUrl);
  const eventType = readString(event.eventType);
  const releaseStatus = readString(event.releaseStatus);
  const importance = readString(event.importance);
  const confidence = readString(event.confidence);
  const visibility = readString(event.visibility);
  const officialSources = Array.isArray(event.officialSources) ? event.officialSources : [];
  const evidenceLinks = officialSources
    .map((source, sourceIndex) =>
      normalizeFeedOfficialSource(source as AiTimelineFeedOfficialSource, sourceIndex, index, companyKey, companyName, generatedAt)
    )
    .filter((source): source is AiTimelineEventEvidenceRecord => Boolean(source));
  const fallbackEvidence = officialUrl
    ? [createFallbackEvidence(index, companyKey, companyName, officialUrl, title, eventTime, generatedAt)]
    : [];
  const resolvedEvidenceLinks = evidenceLinks.length > 0 ? evidenceLinks : fallbackEvidence;
  const detectedEntities = readStringArray(event.tags).slice(0, 8);
  const eventKey = readString(event.eventKey) || `${companyKey}:${slugify(product || title)}:${eventTime.slice(0, 10)}`;
  const id = hashStringToPositiveInteger(readString(event.id) || eventKey || `${companyKey}:${index}`);
  const displaySummaryZh = [summaryZh, whyItMattersZh].filter(Boolean).join("\n\n");

  const importanceLevel = importance && isAiTimelineImportanceLevel(importance) ? importance : "B";

  if (confidence !== "high" || visibility !== "show" || resolvedEvidenceLinks.length === 0) {
    return null;
  }

  return {
    id,
    companyKey,
    companyName,
    eventType: eventType && isAiTimelineEventType(eventType) ? eventType : "要闻",
    title,
    summary: summaryZh,
    officialUrl,
    sourceLabel: "AI 官方发布时间线 feed",
    sourceKind: "ai_timeline_feed",
    publishedAt: eventTime,
    discoveredAt: generatedAt,
    importance: readImportanceScore(importanceLevel),
    importanceLevel,
    releaseStatus: releaseStatus && isAiTimelineReleaseStatus(releaseStatus) ? releaseStatus : "released",
    importanceSummaryZh: displaySummaryZh || null,
    visibilityStatus: "auto_visible",
    manualTitle: null,
    manualSummaryZh: null,
    manualImportanceLevel: null,
    detectedEntities,
    eventKey,
    reliabilityStatus: evidenceLinks.length > 1 ? "multi_source" : "single_source",
    evidenceCount: resolvedEvidenceLinks.length,
    lastVerifiedAt: generatedAt,
    evidenceLinks: resolvedEvidenceLinks,
    displayTitle: titleZh,
    displaySummaryZh: displaySummaryZh || summaryZh || whyItMattersZh || null,
    rawSourceJson: event,
    createdAt: generatedAt,
    updatedAt: generatedAt
  };
}

function readImportanceScore(importanceLevel: AiTimelineEventRecord["importanceLevel"]): number {
  switch (importanceLevel) {
    case "S":
      return 100;
    case "A":
      return 80;
    case "B":
      return 60;
    case "C":
      return 40;
  }
}

function normalizeFeedOfficialSource(
  source: AiTimelineFeedOfficialSource,
  sourceIndex: number,
  eventIndex: number,
  companyKey: string,
  companyName: string,
  generatedAt: string
): AiTimelineEventEvidenceRecord | null {
  const officialUrl = readString(source.url);
  const publishedAt = readString(source.publishedAt);

  if (!officialUrl || !publishedAt) {
    return null;
  }

  return {
    id: hashStringToPositiveInteger(`${eventIndex}:${sourceIndex}:${officialUrl}`),
    eventId: eventIndex + 1,
    sourceId: `${companyKey}-${sourceIndex + 1}`,
    companyKey,
    sourceLabel: readString(source.title) || companyName,
    sourceKind: readString(source.type) || "official_source",
    officialUrl,
    title: readString(source.title) || officialUrl,
    summary: null,
    publishedAt,
    discoveredAt: generatedAt,
    rawSourceJson: source,
    createdAt: generatedAt,
    updatedAt: generatedAt
  };
}

function createFallbackEvidence(
  eventIndex: number,
  companyKey: string,
  companyName: string,
  officialUrl: string,
  title: string,
  publishedAt: string,
  generatedAt: string
): AiTimelineEventEvidenceRecord {
  return {
    id: hashStringToPositiveInteger(`${eventIndex}:${officialUrl}`),
    eventId: eventIndex + 1,
    sourceId: `${companyKey}-official`,
    companyKey,
    sourceLabel: companyName,
    sourceKind: "official_source",
    officialUrl,
    title,
    summary: null,
    publishedAt,
    discoveredAt: generatedAt,
    rawSourceJson: null,
    createdAt: generatedAt,
    updatedAt: generatedAt
  };
}

function filterFeedEvents(events: AiTimelineEventRecord[], query: AiTimelineListQuery) {
  const recentCutoff = query.recentDays && query.recentDays > 0
    ? (query.referenceTime?.getTime() ?? Date.now()) - query.recentDays * 24 * 60 * 60 * 1000
    : null;
  const keyword = query.searchKeyword?.trim().toLowerCase();

  return events.filter((event) => {
    if (query.eventType && event.eventType !== query.eventType) {
      return false;
    }

    if (query.companyKey && event.companyKey !== query.companyKey) {
      return false;
    }

    if (query.importanceLevels?.length && !query.importanceLevels.includes(event.importanceLevel)) {
      return false;
    }

    if (query.visibilityStatuses?.length && !query.visibilityStatuses.includes(event.visibilityStatus)) {
      return false;
    }

    if (recentCutoff !== null && Date.parse(event.publishedAt) < recentCutoff) {
      return false;
    }

    if (keyword && !`${event.title} ${event.displayTitle} ${event.companyName} ${event.detectedEntities.join(" ")}`.toLowerCase().includes(keyword)) {
      return false;
    }

    return true;
  });
}

function buildCompanyFilters(events: AiTimelineEventRecord[]): AiTimelinePageModel["filters"]["companies"] {
  const companies = new Map<string, { key: string; name: string; eventCount: number }>();

  for (const event of events) {
    const current = companies.get(event.companyKey) ?? {
      key: event.companyKey,
      name: event.companyName,
      eventCount: 0
    };
    current.eventCount += 1;
    companies.set(event.companyKey, current);
  }

  return [...companies.values()].sort((left, right) => right.eventCount - left.eventCount || left.name.localeCompare(right.name));
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function hashStringToPositiveInteger(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash || 1;
}

function isHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
