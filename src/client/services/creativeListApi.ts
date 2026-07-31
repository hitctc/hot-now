import { requestJson } from "./http.js";

// ─── Types ───

export type TrendBreakdown = {
  topicPower: number;
  emotionResonance: number;
  infoGap: number;
  socialCurrency: number;
  timingWindow: number;
  audienceBreadth: number;
};

export type CreativeSourceItem = {
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
  writingStatus: string;
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
  linkedArticleId: number | null;
  tracedSources: TracedSource[] | null;
  writable: boolean;
  writeCount: number;
  direction?: string;
  seqNumber?: number | null;
  createdAt: string;
  updatedAt: string;
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

export type TracedSource = {
  title: string;
  url: string;
  source_name: string;
  published_at?: string;
  relevance_score?: number;
  reason?: string;
};

// images 字段支持两种格式：纯 URL 字符串 或 带元数据的对象
export type ArticleImageEntry = string | {
  url: string;
  purpose?: string;
  alt?: string;
};

// 写作流程单步追踪
export type StepTraceEntry = {
  step: number;
  stepName: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  summary?: string;
  error?: string;
  meta?: Record<string, unknown>;
};

export type ArticleComment = { reader: string; author_reply: string };
export type ArticleRewriteLevel = "light" | "medium" | "heavy";
export type ArticleTitleCandidate = {
  title: string;
  group: "impact" | "risk" | "counterintuitive" | "action";
  group_label: string;
  target_reader: string;
  click_reason: string;
  content_payoff: string;
  clickbait_risk: "low" | "medium" | "high";
  recommendation: "high" | "medium" | "low" | "fallback";
  reader_task?: string;
};

export type CreativeFinishedArticle = {
  id: number;
  sourceItemId: number | null;
  mode: string | null;
  thesis: string | null;
  intros: string[] | null;
  contentMarkdown: string;
  humanMarkdown: string | null;
  titles: string | null;
  hooks: string | null;
  quotes: string | null;
  summary100: string[] | null;
  imagesJson: string | ArticleImageEntry[] | null;
  images: string | ArticleImageEntry[] | null;
  coverImage: string[];
  coverImageIndex: number;
  titleIndex: number;
  introIndex: number;
  summaryIndex: number;
  status: string;
  anomalyReason: string | null;
  rawResponseText: string | null;
  wechatPublished: boolean;
  publishable: boolean;
  coverImagePrompt: string | null;
  inlineImagePrompts: Record<string, string> | null;
  similarityCheck: Record<string, unknown> | null;
  needsManualReview: boolean;
  manualReviewReason: string | null;
  manualReviewReasons: string[] | null;
  stepTrace: StepTraceEntry[] | null;
  currentStep: number | null;
  stopStep: number | null;
  reasonCode: string | null;
  reasonText: string | null;
  deletedAt: string | null;
  wechatThemeId: string | null;
  wechatHtml: string | null;
  pushCount: number;
  direction?: string;
  seqNumber?: number | null;
  form?: string | null;
  reversalScore?: number | null;
  reversalAngle?: string | null;
  imagePrompts?: string[] | null;
  comments?: ArticleComment[] | null;
  authorExtensions?: string[] | null;
  pipelineVersion: string | null;
  readerTask: string | null;
  readerRelevance: Record<string, unknown> | null;
  evidencePack: Record<string, unknown> | null;
  readerValuePlan: Record<string, unknown> | null;
  factSkeleton: Record<string, unknown> | null;
  oralDraft: string | null;
  titleCandidates: ArticleTitleCandidate[] | null;
  factSourceChecklist: unknown[] | null;
  titleSelectionConfirmed: boolean;
  performanceDeliveredUsers: number | null;
  performanceReadUsers: number | null;
  performanceShareUsers: number | null;
  performanceNewFollowers: number | null;
  performanceRewriteLevel: ArticleRewriteLevel | null;
  performanceTitleSnapshot: string | null;
  performanceTitleGroupSnapshot: string | null;
  performanceReaderTaskSnapshot: string | null;
  performanceRecordedAt: string | null;
  originType: "pipeline" | "manual";
  pinnedAt: string | null;
  trendScore: number | null;
  trendBreakdown: TrendBreakdown | null;
  sourceTitle: string | null;
  sourceName: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceItemListResponse = {
  items: CreativeSourceItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type FinishedArticleListResponse = {
  items: CreativeFinishedArticle[];
  total: number;
  page: number;
  pageSize: number;
};

// 图片转存接口类型
// ─── Source Items ───

/** 读取素材摘要列表，完整正文由详情接口按需获取。 */
export function readCreativeSourceItems(params?: {
  page?: number;
  pageSize?: number;
  writingStatus?: string;
  collectorAgent?: string;
  sourceName?: string;
  writable?: boolean;
  search?: string;
  /** 爆文分下限，仅显示 trend_score >= 该值的素材；为 null/undefined 时不限 */
  minTrendScore?: number;
  accountFitLevel?: AccountFitLevel | "unassessed";
  direction?: string;
}): Promise<SourceItemListResponse> {
  const query = new URLSearchParams();
  query.set("view", "summary");
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.writingStatus) query.set("writingStatus", params.writingStatus);
  if (params?.collectorAgent) query.set("collectorAgent", params.collectorAgent);
  if (params?.sourceName) query.set("sourceName", params.sourceName);
  if (params?.writable) query.set("writable", "1");
  if (params?.search) query.set("search", params.search);
  if (params?.minTrendScore != null) query.set("trendScoreMin", String(params.minTrendScore));
  if (params?.accountFitLevel) query.set("accountFitLevel", params.accountFitLevel);
  if (params?.direction) query.set("direction", params.direction);
  const qs = query.toString();
  return requestJson<SourceItemListResponse>(`/api/creative/source-items${qs ? `?${qs}` : ""}`);
}

/** 读取单条素材的完整字段。 */
export function readCreativeSourceItem(id: number): Promise<CreativeSourceItem> {
  return requestJson<CreativeSourceItem>(`/api/creative/source-items/${id}`);
}

/** 读取素材来源名称，供列表筛选器复用。 */
export function fetchSourceNames(): Promise<string[]> {
  return requestJson<string[]>("/api/creative/source-names");
}

// ─── Finished Articles ───

/** 读取成品摘要列表，编辑所需的大字段不随列表返回。 */
export function readCreativeFinishedArticles(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  publishable?: string;
  includeDeleted?: string;
  direction?: string;
}): Promise<FinishedArticleListResponse> {
  const query = new URLSearchParams();
  query.set("view", "summary");
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.publishable) query.set("publishable", params.publishable);
  if (params?.includeDeleted) query.set("includeDeleted", params.includeDeleted);
  if (params?.direction) query.set("direction", params.direction);
  const qs = query.toString();
  return requestJson<FinishedArticleListResponse>(`/api/creative/finished-articles${qs ? `?${qs}` : ""}`);
}

/** 读取单篇成品的完整编辑数据。 */
export function readCreativeFinishedArticle(id: number): Promise<CreativeFinishedArticle> {
  return requestJson<CreativeFinishedArticle>(`/api/creative/finished-articles/${id}`);
}
