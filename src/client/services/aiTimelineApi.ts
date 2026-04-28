import { requestJson } from "./http";

export const aiTimelineEventTypes = [
  "要闻",
  "模型发布",
  "开发生态",
  "产品应用",
  "行业动态",
  "官方前瞻"
] as const;

export type AiTimelineEventType = (typeof aiTimelineEventTypes)[number];
export type AiTimelineImportanceLevel = "S" | "A" | "B" | "C";
export type AiTimelineReleaseStatus = "released" | "official_preview" | "open_sourced" | "updated";
export type AiTimelineVisibilityStatus = "auto_visible" | "hidden" | "manual_visible";
export type AiTimelineReliabilityStatus = "single_source" | "multi_source" | "source_degraded" | "manual_verified";

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

export type AiTimelineFilterOptions = {
  eventTypes: AiTimelineEventType[];
  companies: Array<{
    key: string;
    name: string;
    eventCount: number;
  }>;
};

export type AiTimelinePageModel = {
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  generatedAt: string | null;
  filters: AiTimelineFilterOptions;
  events: AiTimelineEventRecord[];
};

export type ReadAiTimelinePageOptions = {
  eventType?: string;
  company?: string;
  searchKeyword?: string;
  page?: number;
};

// 时间线 API 使用 query string 表达当前筛选，方便页面刷新或后续同步到路由时不改接口契约。
export function readAiTimelinePage(options: ReadAiTimelinePageOptions = {}): Promise<AiTimelinePageModel> {
  const params = new URLSearchParams();

  if (options.eventType?.trim()) {
    params.set("eventType", options.eventType.trim());
  }

  if (options.company?.trim()) {
    params.set("company", options.company.trim());
  }

  if (options.searchKeyword?.trim()) {
    params.set("q", options.searchKeyword.trim());
  }

  if (options.page !== undefined && Number.isInteger(options.page) && options.page > 1) {
    params.set("page", String(options.page));
  }

  const queryString = params.toString();
  return requestJson<AiTimelinePageModel>(queryString ? `/api/ai-timeline?${queryString}` : "/api/ai-timeline");
}
