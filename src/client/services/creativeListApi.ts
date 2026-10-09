import { requestJson } from "./http.js";

// ─── Types ───

export type CodeImageCardVariant = "2.5:1" | "1:1" | "3:4";
export type CodeImageCardStatus = "pending" | "running" | "succeeded" | "failed" | "stale";
export type CodeImageCardsGenerationMode = "missing" | "all";

export type CodeImageCard = {
  variant: CodeImageCardVariant;
  url: string | null;
  width: number;
  height: number;
  status: CodeImageCardStatus;
  generatedAt: string | null;
  sourceFingerprint: string | null;
  fileSize: number | null;
  error: string | null;
};

export type TrendBreakdown = {
  topicPower: number;
  emotionResonance: number;
  infoGap: number;
  socialCurrency: number;
  timingWindow: number;
  audienceBreadth: number;
};

export type SourceRanking = {
  board: string;
  rank: number | null;
  capturedAt: string;
  kind: "ranking" | "listing" | "selection";
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
  shortWriteSchedule?: { kind: "candidate"; position: number } | { kind: "replaced"; replacedAt: string } | { kind: "not-scheduled" } | { kind: "preparing" } | { kind: "pending"; position?: number } | { kind: "waiting-batch" } | { kind: "task"; taskKind: "short_content" | "short_content_auto"; status: string; queuePosition?: number; phaseName?: string; stopStepName?: string; reasonText?: string; error?: string; finishedArticleId?: number; cancelRequested?: boolean } | null;
  writingStopStep: number | null;
  writingStopStepName: string | null;
  writingStopReason: string | null;
  writingStoppedAt: string | null;
  rawPayloadJson: string;
  sourceRanking?: SourceRanking | null;
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
  codeImageKeywords: string[] | null;
  imagesJson: string | ArticleImageEntry[] | null;
  images: string | ArticleImageEntry[] | null;
  codeImageCards: CodeImageCard[];
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
  sourceRanking?: SourceRanking | null;
  sourceCollectorAgent?: string | null;
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

export type FinishedArticleDayCount = {
  dayKey: string;
  articleCount: number;
  sourceCount: number;
  pushCount: number;
};

export type SourceDayCount = {
  dayKey: string;
  sourceCount: number;
};

export type FinishedArticleListResponse = {
  items: CreativeFinishedArticle[];
  total: number;
  page: number;
  pageSize: number;
  dayCounts: FinishedArticleDayCount[];
  sourceDayCounts: SourceDayCount[];
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
  signal?: AbortSignal;
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
  const url = `/api/creative/source-items${qs ? `?${qs}` : ""}`;
  return params?.signal
    ? requestJson<SourceItemListResponse>(url, { signal: params.signal })
    : requestJson<SourceItemListResponse>(url);
}

/** 读取单条素材的完整字段。 */
export function readCreativeSourceItem(id: number): Promise<CreativeSourceItem> {
  return requestJson<CreativeSourceItem>(`/api/creative/source-items/${id}`);
}

export type ShortWriteScheduleCandidate = {
  item_id: number;
  source_external_id?: string;
  position: number;
  /** HotNow 按外部编号唯一匹配得到的平台素材编号；不能回退使用 Hermes item_id。 */
  hotnow_source_item_id?: number | null;
  source_item_title?: string | null;
  source_item_source_name?: string | null;
};

export type ShortWriteSchedule = {
  batch_started_at: string | null;
  prepared: boolean;
  pending_item_id: number | null;
  candidates: ShortWriteScheduleCandidate[];
  replaced: { item_id: number; source_external_id?: string; replaced_at: string }[];
  pending_source_external_id?: string | null;
  short_write_tasks?: { source_external_id: string; task_kind: "short_content" | "short_content_auto"; status: string; queue_position?: number; phase_name?: string; stop_step_name?: string; reason_text?: string; error?: string; finished_article_id?: number; cancel_requested?: boolean }[];
};

/** 读取 Hermes 当前短写候选、替换记录和唯一队列任务状态；服务端不可达时由调用方降级展示。 */
export function readShortWriteSchedule(): Promise<ShortWriteSchedule> {
  return requestJson("/api/creative/short-write-schedule");
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
  signal?: AbortSignal;
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
  const url = `/api/creative/finished-articles${qs ? `?${qs}` : ""}`;
  return params?.signal
    ? requestJson<FinishedArticleListResponse>(url, { signal: params.signal })
    : requestJson<FinishedArticleListResponse>(url);
}

/** 读取单篇成品的完整编辑数据。 */
export function readCreativeFinishedArticle(id: number): Promise<CreativeFinishedArticle> {
  // 详情正文刚保存后立即重开时必须绕过浏览器旧 GET 缓存，避免显示过期正文。
  return requestJson<CreativeFinishedArticle>(`/api/creative/finished-articles/${id}`, { cache: "no-store" });
}
