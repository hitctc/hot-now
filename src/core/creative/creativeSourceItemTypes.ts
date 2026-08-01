import type { CreativeSourceItemWritingStatus } from "./types.js";

/** 溯源结果条目。 */
export type TracedSource = {
  title: string;
  url: string;
  source_name: string;
  published_at?: string;
  relevance_score?: number;
  reason?: string;
};

export type TrendBreakdown = {
  topicPower: number;
  emotionResonance: number;
  infoGap: number;
  socialCurrency: number;
  timingWindow: number;
  audienceBreadth: number;
};

export type AccountFitLevel = "high" | "medium" | "low" | "insufficient" | "error";

export type AccountFitDetails = {
  targetReader?: string;
  readerScenario?: string;
  ordinaryImpact?: string;
  articleValue?: string;
  evidenceBasis?: string[];
  missingCriteria?: string[];
  criteria?: Record<string, boolean>;
  impactMaturity?: "current" | "near_term" | "simulation" | "future_vision" | "indirect";
  supplemented?: boolean;
  supplementDirectlyRelated?: boolean;
  searchQueries?: string[];
  technicalError?: string;
};

export type CreativeSourceItemRecord = {
  id: number;
  externalId: string;
  collectorAgent: string;
  title: string;
  url: string;
  sourceName: string | null;
  summary: string | null;
  fullContent: string | null;
  author: string | null;
  coverImageUrl: string | null;
  tags: string | null;
  language: string;
  wordCount: number | null;
  contentType: string | null;
  score: number | null;
  publishedAt: string | null;
  collectorTimestamp: string | null;
  writingStatus: CreativeSourceItemWritingStatus;
  writingStopStep: number | null;
  writingStopStepName: string | null;
  writingStopReason: string | null;
  writingStoppedAt: string | null;
  rawPayloadJson: string;
  trendScore: number | null;
  trendBreakdown: TrendBreakdown | null;
  accountFitLevel: AccountFitLevel | null;
  accountFitReason: string | null;
  accountFitDetails: AccountFitDetails | null;
  accountFitRuleVersion: string | null;
  accountFitEvaluatedAt: string | null;
  tracedSources: TracedSource[] | null;
  writable: boolean;
  direction: string;
  seqNumber: number | null;
  linkedArticleId: number | null;
  writeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InsertCreativeSourceItemInput = {
  externalId: string;
  collectorAgent: string;
  title: string;
  url: string;
  sourceName?: string | null;
  summary?: string | null;
  fullContent?: string | null;
  author?: string | null;
  coverImageUrl?: string | null;
  tags?: string | null;
  language?: string;
  wordCount?: number | null;
  contentType?: string | null;
  score?: number | null;
  publishedAt?: string | null;
  collectorTimestamp?: string | null;
  writingStatus?: CreativeSourceItemWritingStatus;
  trendScore?: number | null;
  trendBreakdown?: TrendBreakdown | null;
  direction?: string;
};

export type ListCreativeSourceItemsFilters = {
  page?: number;
  pageSize?: number;
  writingStatus?: CreativeSourceItemWritingStatus;
  collectorAgent?: string;
  sourceName?: string;
  writable?: boolean;
  search?: string;
  trendScoreMin?: number;
  accountFitLevel?: AccountFitLevel | "unassessed";
  last24h?: boolean;
  sourceFeed?: string;
  direction?: string;
  summaryOnly?: boolean;
};

export type ListCreativeSourceItemsResult = {
  items: CreativeSourceItemRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreativeSourceItemWritingStopDetails = {
  step: number;
  stepName: string;
  reason: string;
};

export type UpdateCreativeSourceItemAccountFitInput = {
  level: AccountFitLevel;
  reason: string;
  details: AccountFitDetails;
  ruleVersion: string;
  updateWritingStatus?: boolean;
};
