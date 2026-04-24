export const aiTimelineEventTypes = [
  "要闻",
  "模型发布",
  "开发生态",
  "产品应用",
  "行业动态",
  "官方前瞻"
] as const;

export type AiTimelineEventType = (typeof aiTimelineEventTypes)[number];

export type AiTimelineEventInput = {
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
  page?: number;
  pageSize?: number;
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
