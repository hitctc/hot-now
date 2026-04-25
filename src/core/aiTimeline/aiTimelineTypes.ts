export const aiTimelineEventTypes = [
  "要闻",
  "模型发布",
  "开发生态",
  "产品应用",
  "行业动态",
  "官方前瞻"
] as const;

export type AiTimelineEventType = (typeof aiTimelineEventTypes)[number];

export const aiTimelineImportanceLevels = ["S", "A", "B", "C"] as const;
export const aiTimelineReleaseStatuses = ["released", "official_preview"] as const;
export const aiTimelineVisibilityStatuses = ["auto_visible", "hidden", "manual_visible"] as const;
export const aiTimelineReliabilityStatuses = ["single_source", "multi_source", "source_degraded", "manual_verified"] as const;

export type AiTimelineImportanceLevel = (typeof aiTimelineImportanceLevels)[number];
export type AiTimelineReleaseStatus = (typeof aiTimelineReleaseStatuses)[number];
export type AiTimelineVisibilityStatus = (typeof aiTimelineVisibilityStatuses)[number];
export type AiTimelineReliabilityStatus = (typeof aiTimelineReliabilityStatuses)[number];
export type AiTimelineSourceRunStatus = "success" | "failed" | "empty" | "stale";

export type AiTimelineEventEvidenceRecord = {
  id: number;
  eventId: number;
  sourceId: string;
  companyKey: string;
  sourceLabel: string;
  sourceKind: string;
  officialUrl: string;
  title: string;
  summary: string | null;
  publishedAt: string;
  discoveredAt: string;
  rawSourceJson: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AiTimelineEventEvidenceInput = {
  eventId: number;
  sourceId: string;
  companyKey: string;
  sourceLabel: string;
  sourceKind: string;
  officialUrl: string;
  title: string;
  summary?: string | null;
  publishedAt: string;
  discoveredAt: string;
  rawSourceJson?: unknown;
};

export type AiTimelineSourceRunInput = {
  sourceId: string;
  companyKey: string;
  companyName: string;
  sourceLabel: string;
  sourceKind: string;
  status: AiTimelineSourceRunStatus;
  startedAt: string;
  finishedAt?: string | null;
  fetchedItemCount?: number;
  candidateEventCount?: number;
  importantEventCount?: number;
  latestOfficialPublishedAt?: string | null;
  errorMessage?: string | null;
};

export type AiTimelineSourceHealthRecord = {
  sourceId: string;
  companyKey: string;
  companyName: string;
  sourceLabel: string;
  sourceKind: string;
  sourceUrl: string;
  latestStatus: AiTimelineSourceRunStatus | null;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  fetchedItemCount: number;
  candidateEventCount: number;
  importantEventCount: number;
  latestOfficialPublishedAt: string | null;
  errorMessage: string | null;
};

export type AiTimelineHealthOverview = {
  visibleImportantCount7d: number;
  latestVisiblePublishedAt: string | null;
  latestCollectStartedAt: string | null;
  failedSourceCount: number;
  staleSourceCount: number;
};

export type AiTimelineEventInput = {
  sourceId?: string;
  companyKey: string;
  companyName: string;
  eventType: AiTimelineEventType;
  title: string;
  summary?: string | null;
  officialUrl: string;
  sourceLabel: string;
  sourceKind: string;
  publishedAt: string;
  discoveredAt: string;
  importance?: number;
  importanceLevel?: AiTimelineImportanceLevel;
  releaseStatus?: AiTimelineReleaseStatus;
  importanceSummaryZh?: string | null;
  visibilityStatus?: AiTimelineVisibilityStatus;
  detectedEntities?: string[];
  eventKey?: string | null;
  rawSourceJson?: unknown;
};

export type AiTimelineEventRecord = {
  id: number;
  companyKey: string;
  companyName: string;
  eventType: AiTimelineEventType;
  title: string;
  summary: string | null;
  officialUrl: string;
  sourceLabel: string;
  sourceKind: string;
  publishedAt: string;
  discoveredAt: string;
  importance: number;
  importanceLevel: AiTimelineImportanceLevel;
  releaseStatus: AiTimelineReleaseStatus;
  importanceSummaryZh: string | null;
  visibilityStatus: AiTimelineVisibilityStatus;
  manualTitle: string | null;
  manualSummaryZh: string | null;
  manualImportanceLevel: AiTimelineImportanceLevel | null;
  detectedEntities: string[];
  eventKey: string | null;
  reliabilityStatus: AiTimelineReliabilityStatus;
  evidenceCount: number;
  lastVerifiedAt: string | null;
  evidenceLinks: AiTimelineEventEvidenceRecord[];
  displayTitle: string;
  displaySummaryZh: string | null;
  rawSourceJson: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AiTimelineUpsertResult = {
  insertedCount: number;
  updatedCount: number;
};

export type AiTimelineListQuery = {
  eventType?: AiTimelineEventType | string | null;
  companyKey?: string | null;
  searchKeyword?: string | null;
  importanceLevels?: AiTimelineImportanceLevel[];
  visibilityStatuses?: AiTimelineVisibilityStatus[];
  recentDays?: number;
  referenceTime?: Date;
  page?: number;
  pageSize?: number;
};

export type AiTimelineManualUpdateInput = {
  visibilityStatus?: AiTimelineVisibilityStatus;
  manualTitle?: string | null;
  manualSummaryZh?: string | null;
  manualImportanceLevel?: AiTimelineImportanceLevel | null;
};

export type AiTimelineFilterOptions = {
  eventTypes: AiTimelineEventType[];
  companies: Array<{
    key: string;
    name: string;
    eventCount: number;
  }>;
};

export type AiTimelinePageModel = {
  events: AiTimelineEventRecord[];
  filters: AiTimelineFilterOptions;
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  };
};

export function isAiTimelineEventType(value: string): value is AiTimelineEventType {
  return aiTimelineEventTypes.includes(value as AiTimelineEventType);
}

export function isAiTimelineImportanceLevel(value: string): value is AiTimelineImportanceLevel {
  return aiTimelineImportanceLevels.includes(value as AiTimelineImportanceLevel);
}

export function isAiTimelineReleaseStatus(value: string): value is AiTimelineReleaseStatus {
  return aiTimelineReleaseStatuses.includes(value as AiTimelineReleaseStatus);
}

export function isAiTimelineVisibilityStatus(value: string): value is AiTimelineVisibilityStatus {
  return aiTimelineVisibilityStatuses.includes(value as AiTimelineVisibilityStatus);
}

export function isAiTimelineReliabilityStatus(value: string): value is AiTimelineReliabilityStatus {
  return aiTimelineReliabilityStatuses.includes(value as AiTimelineReliabilityStatus);
}
