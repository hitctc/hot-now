import type { SqliteDatabase } from "../db/openDatabase.js";
import { updateCreativeSourceItemLinkedArticle } from "./creativeSourceItemRepository.js";
import type { CreativeFinishedArticleMode } from "./types.js";

// ── Column selection & row mapping ──────────────────────────────────────────

const SELECT_COLUMNS = `
  id,
  source_item_id,
  mode,
  thesis,
  intros,
  content_markdown,
  human_markdown,
  titles,
  hooks,
  quotes,
  summary_100,
  images_json,
  cover_image_url,
  cover_image_index,
  title_index,
  intro_index,
  summary_index,
  status,
  anomaly_reason,
  raw_response_text,
  wechat_published,
  publishable,
  cover_image_prompt,
  inline_image_prompts,
  similarity_check,
  needs_manual_review,
  manual_review_reason,
  manual_review_reasons,
  step_trace,
  current_step,
  stop_step,
  reason_code,
  reason_text,
  deleted_at,
  wechat_theme_id,
  wechat_html,
  direction,
  seq_number,
  form,
  reversal_score,
  reversal_angle,
  image_prompts,
  comments,
  author_extensions,
  pipeline_version,
  reader_task,
  reader_relevance,
  evidence_pack,
  reader_value_plan,
  fact_skeleton,
  oral_draft,
  title_candidates,
  fact_source_checklist,
  title_selection_confirmed,
  performance_delivered_users,
  performance_read_users,
  performance_share_users,
  performance_new_followers,
  performance_rewrite_level,
  performance_title_snapshot,
  performance_title_group_snapshot,
  performance_reader_task_snapshot,
  performance_recorded_at,
  origin_type,
  pinned_at,
  created_at,
  updated_at,
  (SELECT COUNT(*) FROM wechat_draft_push_log WHERE article_id = creative_finished_articles.id AND status = 'success') AS push_count
` as const;

type ArticleRow = {
  id: number;
  source_item_id: number | null;
  mode: string | null;
  thesis: string | null;
  intros: string | null;
  content_markdown: string;
  human_markdown: string | null;
  titles: string | null;
  hooks: string | null;
  quotes: string | null;
  summary_100: string | null;
  summary_index: number;
  images_json: string | null;
  cover_image_url: string | null;
  cover_image_index: number;
  title_index: number;
  intro_index: number;
  status: string;
  anomaly_reason: string | null;
  raw_response_text: string | null;
  wechat_published: number;
  publishable: number;
  cover_image_prompt: string | null;
  inline_image_prompts: string | null;
  similarity_check: string | null;
  needs_manual_review: number;
  manual_review_reason: string | null;
  manual_review_reasons: string | null;
  step_trace: string | null;
  current_step: number | null;
  stop_step: number | null;
  reason_code: string | null;
  reason_text: string | null;
  deleted_at: string | null;
  wechat_theme_id: string | null;
  wechat_html: string | null;
  direction: string;
  seq_number: number | null;
  form: string | null;
  reversal_score: number | null;
  reversal_angle: string | null;
  image_prompts: string | null;
  comments: string | null;
  author_extensions: string | null;
  pipeline_version: string | null;
  reader_task: string | null;
  reader_relevance: string | null;
  evidence_pack: string | null;
  reader_value_plan: string | null;
  fact_skeleton: string | null;
  oral_draft: string | null;
  title_candidates: string | null;
  fact_source_checklist: string | null;
  title_selection_confirmed: number;
  performance_delivered_users: number | null;
  performance_read_users: number | null;
  performance_share_users: number | null;
  performance_new_followers: number | null;
  performance_rewrite_level: string | null;
  performance_title_snapshot: string | null;
  performance_title_group_snapshot: string | null;
  performance_reader_task_snapshot: string | null;
  performance_recorded_at: string | null;
  origin_type: "pipeline" | "manual";
  pinned_at: string | null;
  push_count: number;
  created_at: string;
  updated_at: string;
};

function parseCoverImages(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    return [String(parsed)];
  } catch {
    return [raw];
  }
}

function parseSummary100(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    return [String(parsed)];
  } catch {
    return [raw];
  }
}

function mapRow(row: ArticleRow): CreativeFinishedArticleRecord {
  return {
    id: row.id,
    sourceItemId: row.source_item_id,
    mode: (row.mode as CreativeFinishedArticleMode) || null,
    thesis: row.thesis,
    intros: row.intros ? JSON.parse(row.intros) : null,
    contentMarkdown: row.content_markdown,
    humanMarkdown: row.human_markdown ?? null,
    titles: row.titles ? JSON.parse(row.titles) : null,
    hooks: row.hooks ? JSON.parse(row.hooks) : null,
    quotes: row.quotes ? JSON.parse(row.quotes) : null,
    summary100: parseSummary100(row.summary_100),
    imagesJson: row.images_json ? JSON.parse(row.images_json) : null,
    images: row.images_json ? JSON.parse(row.images_json) : null,
    coverImage: parseCoverImages(row.cover_image_url),
    coverImageIndex: row.cover_image_index ?? 0,
    titleIndex: row.title_index ?? 0,
    introIndex: row.intro_index ?? 0,
    summaryIndex: row.summary_index ?? 0,
    status: row.status,
    anomalyReason: row.anomaly_reason,
    rawResponseText: row.raw_response_text,
    wechatPublished: row.wechat_published === 1,
    publishable: row.publishable === 1,
    coverImagePrompt: row.cover_image_prompt ?? null,
    inlineImagePrompts: row.inline_image_prompts ? JSON.parse(row.inline_image_prompts) : null,
    similarityCheck: row.similarity_check ? JSON.parse(row.similarity_check) : null,
    needsManualReview: row.needs_manual_review === 1,
    manualReviewReason: row.manual_review_reason ?? null,
    manualReviewReasons: row.manual_review_reasons ? JSON.parse(row.manual_review_reasons) : null,
    stepTrace: row.step_trace ? JSON.parse(row.step_trace) : null,
    currentStep: row.current_step ?? null,
    stopStep: row.stop_step ?? null,
    reasonCode: row.reason_code ?? null,
    reasonText: row.reason_text ?? null,
    deletedAt: row.deleted_at ?? null,
    wechatThemeId: row.wechat_theme_id,
    wechatHtml: row.wechat_html,
    direction: row.direction,
    seqNumber: row.seq_number,
    form: row.form,
    reversalScore: row.reversal_score,
    reversalAngle: row.reversal_angle,
    imagePrompts: row.image_prompts ? JSON.parse(row.image_prompts) : null,
    comments: row.comments ? JSON.parse(row.comments) : null,
    authorExtensions: row.author_extensions ? JSON.parse(row.author_extensions) : null,
    pipelineVersion: row.pipeline_version,
    readerTask: row.reader_task,
    readerRelevance: row.reader_relevance ? JSON.parse(row.reader_relevance) : null,
    evidencePack: row.evidence_pack ? JSON.parse(row.evidence_pack) : null,
    readerValuePlan: row.reader_value_plan ? JSON.parse(row.reader_value_plan) : null,
    factSkeleton: row.fact_skeleton ? JSON.parse(row.fact_skeleton) : null,
    oralDraft: row.oral_draft,
    titleCandidates: row.title_candidates ? JSON.parse(row.title_candidates) : null,
    factSourceChecklist: row.fact_source_checklist ? JSON.parse(row.fact_source_checklist) : null,
    titleSelectionConfirmed: row.title_selection_confirmed === 1,
    performanceDeliveredUsers: row.performance_delivered_users,
    performanceReadUsers: row.performance_read_users,
    performanceShareUsers: row.performance_share_users,
    performanceNewFollowers: row.performance_new_followers,
    performanceRewriteLevel: row.performance_rewrite_level as ArticleRewriteLevel | null,
    performanceTitleSnapshot: row.performance_title_snapshot,
    performanceTitleGroupSnapshot: row.performance_title_group_snapshot,
    performanceReaderTaskSnapshot: row.performance_reader_task_snapshot,
    performanceRecordedAt: row.performance_recorded_at,
    originType: row.origin_type,
    pinnedAt: row.pinned_at,
    pushCount: row.push_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ── Public types ────────────────────────────────────────────────────────────

// 写作流程单步追踪记录
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

export type ArticleRewriteLevel = "light" | "medium" | "heavy";

export type TitleCandidate = {
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

export type CreativeFinishedArticleRecord = {
  id: number;
  sourceItemId: number | null;
  mode: CreativeFinishedArticleMode | null;
  thesis: string | null;
  intros: string[] | null;
  contentMarkdown: string;
  humanMarkdown: string | null;
  titles: string[] | null;
  hooks: string[] | null;
  quotes: string[] | null;
  summary100: string[] | null;
  imagesJson: unknown[] | null;
  images: unknown[] | null;
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
  direction: string;
  seqNumber: number | null;
  form: string | null;
  reversalScore: number | null;
  reversalAngle: string | null;
  imagePrompts: string[] | null;
  comments: { reader: string; author_reply: string }[] | null;
  authorExtensions: string[] | null;
  pipelineVersion: string | null;
  readerTask: string | null;
  readerRelevance: Record<string, unknown> | null;
  evidencePack: Record<string, unknown> | null;
  readerValuePlan: Record<string, unknown> | null;
  factSkeleton: Record<string, unknown> | null;
  oralDraft: string | null;
  titleCandidates: TitleCandidate[] | null;
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
  pushCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InsertCreativeFinishedArticleInput = {
  sourceItemId?: number | null;
  mode?: CreativeFinishedArticleMode;
  thesis?: string;
  intros?: string[];
  contentMarkdown: string;
  humanMarkdown?: string | null;
  titles?: string[];
  hooks?: string[];
  quotes?: string[];
  summary100?: string[];
  images?: unknown[];
  coverImage?: string[];
  rawResponseText?: string;
  coverImagePrompt?: string;
  inlineImagePrompts?: Record<string, string>;
  similarityCheck?: Record<string, unknown>;
  needsManualReview?: boolean;
  manualReviewReason?: string;
  manualReviewReasons?: string[];
  status?: string;
  anomalyReason?: string;
  stepTrace?: StepTraceEntry[];
  currentStep?: number;
  stopStep?: number;
  reasonCode?: string;
  reasonText?: string;
  direction?: string;
  form?: string;
  reversalScore?: number;
  reversalAngle?: string;
  imagePrompts?: string[];
  comments?: { reader: string; author_reply: string }[];
  authorExtensions?: string[];
  pipelineVersion?: string;
  readerTask?: string;
  readerRelevance?: Record<string, unknown>;
  evidencePack?: Record<string, unknown>;
  readerValuePlan?: Record<string, unknown>;
  factSkeleton?: Record<string, unknown>;
  oralDraft?: string;
  titleCandidates?: TitleCandidate[];
  factSourceChecklist?: unknown[];
  titleSelectionConfirmed?: boolean;
  originType?: "pipeline" | "manual";
};

export type EditCreativeFinishedArticleInput = {
  mode?: CreativeFinishedArticleMode;
  thesis?: string;
  intros?: string[];
  introIndex?: number;
  contentMarkdown?: string;
  humanMarkdown?: string | null;
  titles?: string[];
  hooks?: string[];
  quotes?: string[];
  summary100?: string[];
  summaryIndex?: number;
  images?: unknown[];
  coverImage?: string[];
  coverImageIndex?: number;
  titleIndex?: number;
  rawResponseText?: string;
  status?: string;
  anomalyReason?: string | null;
  wechatThemeId?: string | null;
  wechatHtml?: string | null;
  coverImagePrompt?: string;
  inlineImagePrompts?: Record<string, string>;
  imagePrompts?: string[];
  comments?: { reader: string; author_reply: string }[];
  authorExtensions?: string[];
  similarityCheck?: Record<string, unknown>;
  needsManualReview?: boolean;
  manualReviewReason?: string;
  manualReviewReasons?: string[];
  stepTrace?: StepTraceEntry[];
  currentStep?: number;
  stopStep?: number;
  reasonCode?: string;
  reasonText?: string;
  titleCandidates?: TitleCandidate[];
  titleSelectionConfirmed?: boolean;
};

export type ListCreativeFinishedArticlesFilters = {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  publishable?: boolean;
  includeDeleted?: boolean;
  direction?: string;
};

export type ListCreativeFinishedArticlesResult = {
  items: CreativeFinishedArticleRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type SaveArticlePerformanceFeedbackInput = {
  deliveredUsers: number;
  readUsers: number;
  shareUsers: number;
  newFollowers?: number | null;
  rewriteLevel: ArticleRewriteLevel;
};

// ── Insert ──────────────────────────────────────────────────────────────────

export function insertCreativeFinishedArticle(
  db: SqliteDatabase,
  input: InsertCreativeFinishedArticleInput
): CreativeFinishedArticleRecord {
  const direction = input.direction ?? "article";
  // seq_number：同 direction 内从 1 递增
  const seqRow = db.prepare(
    "SELECT COALESCE(MAX(seq_number), 0) + 1 AS next FROM creative_finished_articles WHERE direction = ?"
  ).get(direction) as { next: number };

  const insertResult = db.prepare(
    `
      INSERT INTO creative_finished_articles (
        source_item_id,
        mode,
        thesis,
        intros,
        content_markdown,
        titles,
        hooks,
        quotes,
        summary_100,
        images_json,
        cover_image_url,
        cover_image_prompt,
        inline_image_prompts,
        similarity_check,
        needs_manual_review,
        manual_review_reason,
        manual_review_reasons,
        step_trace,
        current_step,
        stop_step,
        reason_code,
        reason_text,
        status,
        anomaly_reason,
        raw_response_text,
        direction,
        seq_number,
        form,
        reversal_score,
        reversal_angle,
        image_prompts,
        comments,
        author_extensions,
        pipeline_version,
        reader_task,
        reader_relevance,
        evidence_pack,
        reader_value_plan,
        fact_skeleton,
        oral_draft,
        title_candidates,
        fact_source_checklist,
        title_selection_confirmed,
        human_markdown,
        origin_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.sourceItemId,
    input.mode ?? null,
    input.thesis ?? null,
    input.intros ? JSON.stringify(input.intros) : null,
    input.contentMarkdown,
    input.titles ? JSON.stringify(input.titles) : null,
    input.hooks ? JSON.stringify(input.hooks) : null,
    input.quotes ? JSON.stringify(input.quotes) : null,
    input.summary100 ? JSON.stringify(input.summary100) : null,
    input.images ? JSON.stringify(input.images) : null,
    input.coverImage ? JSON.stringify(input.coverImage) : null,
    input.coverImagePrompt ?? null,
    input.inlineImagePrompts ? JSON.stringify(input.inlineImagePrompts) : null,
    input.similarityCheck ? JSON.stringify(input.similarityCheck) : null,
    input.needsManualReview ? 1 : 0,
    input.manualReviewReason ?? null,
    input.manualReviewReasons ? JSON.stringify(input.manualReviewReasons) : null,
    input.stepTrace ? JSON.stringify(input.stepTrace) : null,
    input.currentStep ?? null,
    input.stopStep ?? null,
    input.reasonCode ?? null,
    input.reasonText ?? null,
    input.status ?? "generated",
    input.anomalyReason ?? null,
    input.rawResponseText ?? null,
    direction,
    seqRow.next,
    input.form ?? null,
    input.reversalScore ?? null,
    input.reversalAngle ?? null,
    input.imagePrompts ? JSON.stringify(input.imagePrompts) : null,
    input.comments ? JSON.stringify(input.comments) : null,
    input.authorExtensions ? JSON.stringify(input.authorExtensions) : null,
    input.pipelineVersion ?? null,
    input.readerTask ?? null,
    input.readerRelevance ? JSON.stringify(input.readerRelevance) : null,
    input.evidencePack ? JSON.stringify(input.evidencePack) : null,
    input.readerValuePlan ? JSON.stringify(input.readerValuePlan) : null,
    input.factSkeleton ? JSON.stringify(input.factSkeleton) : null,
    input.oralDraft ?? null,
    input.titleCandidates ? JSON.stringify(input.titleCandidates) : null,
    input.factSourceChecklist ? JSON.stringify(input.factSourceChecklist) : null,
    input.titleSelectionConfirmed === undefined ? 1 : (input.titleSelectionConfirmed ? 1 : 0),
    input.humanMarkdown ?? null,
    input.originType ?? "pipeline"
  );

  const id = Number(insertResult.lastInsertRowid);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("creative finished article insert did not return a persisted row");
  }

  // Backlink the source item so the relationship is bidirectional.
  if (input.sourceItemId != null) {
    updateCreativeSourceItemLinkedArticle(db, input.sourceItemId, id);
  }

  return findCreativeFinishedArticleById(db, id)!;
}

// ── Find by id ──────────────────────────────────────────────────────────────

export function findCreativeFinishedArticleById(
  db: SqliteDatabase,
  id: number
): CreativeFinishedArticleRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_finished_articles WHERE id = ?`)
    .get(id) as ArticleRow | undefined;

  return row ? mapRow(row) : null;
}

// ── Find by source item id ──────────────────────────────────────────────────

export function findCreativeFinishedArticleBySourceItemId(
  db: SqliteDatabase,
  sourceItemId: number
): CreativeFinishedArticleRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_finished_articles WHERE source_item_id = ?`)
    .get(sourceItemId) as ArticleRow | undefined;

  return row ? mapRow(row) : null;
}

// ── List with pagination and filters ────────────────────────────────────────

export function listCreativeFinishedArticles(
  db: SqliteDatabase,
  filters: ListCreativeFinishedArticlesFilters = {}
): ListCreativeFinishedArticlesResult {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, filters.pageSize ?? 20);

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    whereClauses.push("status = ?");
    params.push(filters.status);
  }

  if (filters.direction) {
    whereClauses.push("direction = ?");
    params.push(filters.direction);
  }

  if (filters.search) {
    whereClauses.push("(content_markdown LIKE ? OR human_markdown LIKE ? OR titles LIKE ? OR thesis LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }

  if (filters.publishable === true) {
    whereClauses.push("publishable = 1");
  }

  // 默认排除已软删除的文章
  if (filters.includeDeleted !== true) {
    whereClauses.push("deleted_at IS NULL");
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM creative_finished_articles ${whereClause}`)
    .get(...params) as { total: number };

  const offset = (page - 1) * pageSize;
  const items = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM creative_finished_articles ${whereClause}
       ORDER BY (pinned_at IS NOT NULL) DESC, pinned_at DESC, created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as ArticleRow[];

  return {
    items: items.map(mapRow),
    total: countRow.total,
    page,
    pageSize
  };
}

// ── 状态转换校验 ──────────────────────────────────────────────────────────

/** 合法状态转换表：[fromStatus, toStatus] → 前置条件 key */
const STATUS_TRANSITIONS: Record<string, Record<string, "publish_conditions" | "none">> = {
  queued:            { ready_for_publish: "publish_conditions" },
  generated:         { ready_for_publish: "publish_conditions" },
  ready_for_publish: { generated: "none", wechat_draft: "none" },
  needs_review:      { ready_for_publish: "none", soft_deleted: "none" },
  anomaly:           { ready_for_publish: "publish_conditions" },
  manual_draft:      { wechat_draft: "publish_conditions" },
};

/** 检查文章是否满足推送前置条件；手动稿只认中栏正式正文，不设置最低字数。 */
export function checkPublishConditions(article: CreativeFinishedArticleRecord): { qualified: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!article.coverImage || article.coverImage.length === 0) missing.push("缺少封面图");
  if (!article.titles || article.titles.length === 0) missing.push("缺少标题");
  if (article.originType !== "manual" && article.pipelineVersion === "v2" && !article.titleSelectionConfirmed) {
    missing.push("尚未人工确认发布标题");
  }
  if (article.originType === "manual") {
    const bodyWithoutTitle = (article.humanMarkdown ?? "")
      .replace(/^!\[封面图[^\]]*\]\([^)]+\)\s*$/gm, "")
      .replace(/^\s*#\s+.+(?:\r?\n|$)/m, "")
      .replace(/^\s*\[IMAGE\d+\]\s*$/gm, "")
      .trim();
    if (!bodyWithoutTitle) missing.push("缺少正文");
  } else if (!article.contentMarkdown || article.contentMarkdown.length <= 50) {
    missing.push("缺少正文");
  }
  return { qualified: missing.length === 0, missing };
}

/**
 * 校验状态转换是否合法，返回错误原因或 null 表示通过。
 * @param source - 调用来源，"review" 表示审核入口（允许 needs_review → ready_for_publish）
 */
export function validateStatusTransition(
  currentStatus: string,
  targetStatus: string,
  article: CreativeFinishedArticleRecord,
  source?: string,
): string | null {
  // 目标状态与当前状态相同时放行（幂等）
  if (currentStatus === targetStatus) return null;

  const fromTable = STATUS_TRANSITIONS[currentStatus];
  if (!fromTable) return `当前状态「${currentStatus}」不允许变更`;

  const condition = fromTable[targetStatus];
  if (condition === undefined) return `非法状态转换: ${currentStatus} → ${targetStatus}`;

  // needs_review → ready_for_publish 只允许审核入口
  if (currentStatus === "needs_review" && targetStatus === "ready_for_publish" && source !== "review") {
    return "待审核文章只能通过审核入口标记为可推送";
  }

  // 检查推送前置条件
  if (condition === "publish_conditions") {
    const { qualified, missing } = checkPublishConditions(article);
    if (!qualified) return `条件不满足: ${missing.join("、")}`;
  }

  return null;
}

// ── Edit content fields ────────────────────────────────────────────────────

export function editCreativeFinishedArticle(
  db: SqliteDatabase,
  id: number,
  input: EditCreativeFinishedArticleInput,
  source?: string,
): { ok: boolean; reason?: string } {
  const current = findCreativeFinishedArticleById(db, id);
  if (!current) {
    return { ok: false, reason: "article not found" };
  }

  // 状态变更校验：Hermes 管线内部流转跳过（source="hermes"），仅校验前端人工操作
  if (input.status !== undefined && input.status !== current.status && source !== "hermes") {
    const error = validateStatusTransition(current.status, input.status, current, source);
    if (error) return { ok: false, reason: error };
  }

  // Collect fields that were actually provided so we only update those columns.
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (input.mode !== undefined) {
    setClauses.push("mode = ?");
    params.push(input.mode);
  }
  if (input.thesis !== undefined) {
    setClauses.push("thesis = ?");
    params.push(input.thesis);
  }
  if (input.intros !== undefined) {
    setClauses.push("intros = ?");
    params.push(JSON.stringify(input.intros));
  }
  if (input.contentMarkdown !== undefined) {
    setClauses.push("content_markdown = ?");
    params.push(input.contentMarkdown);
  }
  if (input.humanMarkdown !== undefined) {
    setClauses.push("human_markdown = ?");
    params.push(input.humanMarkdown);
  }
  if (input.titles !== undefined) {
    setClauses.push("titles = ?");
    params.push(JSON.stringify(input.titles));
  }
  if (input.hooks !== undefined) {
    setClauses.push("hooks = ?");
    params.push(JSON.stringify(input.hooks));
  }
  if (input.quotes !== undefined) {
    setClauses.push("quotes = ?");
    params.push(JSON.stringify(input.quotes));
  }
  if (input.summary100 !== undefined) {
    setClauses.push("summary_100 = ?");
    params.push(JSON.stringify(input.summary100));
  }
  if (input.images !== undefined) {
    setClauses.push("images_json = ?");
    params.push(JSON.stringify(input.images));
  }
  if (input.coverImage !== undefined) {
    setClauses.push("cover_image_url = ?");
    params.push(JSON.stringify(input.coverImage));
  }
  if (input.coverImageIndex !== undefined) {
    setClauses.push("cover_image_index = ?");
    params.push(input.coverImageIndex);
  }
  if (input.titleIndex !== undefined) {
    setClauses.push("title_index = ?");
    params.push(input.titleIndex);
  }
  if (input.titleCandidates !== undefined) {
    setClauses.push("title_candidates = ?");
    params.push(JSON.stringify(input.titleCandidates));
  }
  if (input.titleSelectionConfirmed !== undefined) {
    setClauses.push("title_selection_confirmed = ?");
    params.push(input.titleSelectionConfirmed ? 1 : 0);
  }
  if (input.introIndex !== undefined) {
    setClauses.push("intro_index = ?");
    params.push(input.introIndex);
  }
  if (input.summaryIndex !== undefined) {
    setClauses.push("summary_index = ?");
    params.push(input.summaryIndex);
  }
  if (input.rawResponseText !== undefined) {
    setClauses.push("raw_response_text = ?");
    params.push(input.rawResponseText);
  }
  if (input.status !== undefined) {
    setClauses.push("status = ?");
    params.push(input.status);
  }
  if (input.anomalyReason !== undefined) {
    setClauses.push("anomaly_reason = ?");
    params.push(input.anomalyReason);
  }
  if (input.wechatThemeId !== undefined) {
    setClauses.push("wechat_theme_id = ?");
    params.push(input.wechatThemeId ?? null);
  }
  if (input.wechatHtml !== undefined) {
    setClauses.push("wechat_html = ?");
    params.push(input.wechatHtml ?? null);
  }
  if (input.coverImagePrompt !== undefined) {
    setClauses.push("cover_image_prompt = ?");
    params.push(input.coverImagePrompt);
  }
  if (input.inlineImagePrompts !== undefined) {
    setClauses.push("inline_image_prompts = ?");
    params.push(JSON.stringify(input.inlineImagePrompts));
  }
  if (input.imagePrompts !== undefined) {
    setClauses.push("image_prompts = ?");
    params.push(JSON.stringify(input.imagePrompts));
  }
  if (input.comments !== undefined) {
    setClauses.push("comments = ?");
    params.push(JSON.stringify(input.comments));
  }
  if (input.authorExtensions !== undefined) {
    setClauses.push("author_extensions = ?");
    params.push(JSON.stringify(input.authorExtensions));
  }
  if (input.similarityCheck !== undefined) {
    setClauses.push("similarity_check = ?");
    params.push(JSON.stringify(input.similarityCheck));
  }
  if (input.needsManualReview !== undefined) {
    setClauses.push("needs_manual_review = ?");
    params.push(input.needsManualReview ? 1 : 0);
  }
  if (input.manualReviewReason !== undefined) {
    setClauses.push("manual_review_reason = ?");
    params.push(input.manualReviewReason);
  }
  if (input.manualReviewReasons !== undefined) {
    setClauses.push("manual_review_reasons = ?");
    params.push(JSON.stringify(input.manualReviewReasons));
  }
  if (input.stepTrace !== undefined) {
    setClauses.push("step_trace = ?");
    params.push(JSON.stringify(input.stepTrace));
  }
  if (input.currentStep !== undefined) {
    setClauses.push("current_step = ?");
    params.push(input.currentStep);
  }
  if (input.stopStep !== undefined) {
    setClauses.push("stop_step = ?");
    params.push(input.stopStep);
  }
  if (input.reasonCode !== undefined) {
    setClauses.push("reason_code = ?");
    params.push(input.reasonCode);
  }
  if (input.reasonText !== undefined) {
    setClauses.push("reason_text = ?");
    params.push(input.reasonText);
  }

  if (setClauses.length === 0) {
    return { ok: true };
  }

  setClauses.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);

  db.prepare(`UPDATE creative_finished_articles SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

  return { ok: true };
}

/**
 * 保存公众号文章发布后的最小效果反馈，并由服务端锁定标题、标题组和读者任务快照。
 * 该记录只用于前 10 篇人工试验，不参与文章状态流转，也不会修改正文。
 */
export function saveArticlePerformanceFeedback(
  db: SqliteDatabase,
  id: number,
  input: SaveArticlePerformanceFeedbackInput
): CreativeFinishedArticleRecord | null {
  const current = findCreativeFinishedArticleById(db, id);
  if (!current) return null;

  const selectedTitle = current.titles?.[current.titleIndex] ?? current.titles?.[0] ?? null;
  const selectedCandidate = current.titleCandidates?.find((item) => item.title === selectedTitle)
    ?? current.titleCandidates?.[current.titleIndex]
    ?? null;
  db.prepare(
    `
      UPDATE creative_finished_articles
      SET performance_delivered_users = ?,
          performance_read_users = ?,
          performance_share_users = ?,
          performance_new_followers = ?,
          performance_rewrite_level = ?,
          performance_title_snapshot = ?,
          performance_title_group_snapshot = ?,
          performance_reader_task_snapshot = ?,
          performance_recorded_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  ).run(
    input.deliveredUsers,
    input.readUsers,
    input.shareUsers,
    input.newFollowers ?? null,
    input.rewriteLevel,
    selectedTitle,
    selectedCandidate?.group ?? null,
    current.readerTask,
    id
  );

  return findCreativeFinishedArticleById(db, id);
}

// ── Toggle WeChat published status ─────────────────────────────────────────

// 编辑人员手动标记文章是否已在公众号发布，用于辅助记忆
export function toggleWechatPublished(db: SqliteDatabase, id: number): CreativeFinishedArticleRecord | null {
  const current = db
    .prepare("SELECT wechat_published FROM creative_finished_articles WHERE id = ?")
    .get(id) as { wechat_published: number } | undefined;
  if (!current) return null;
  const next = current.wechat_published === 1 ? 0 : 1;
  db.prepare("UPDATE creative_finished_articles SET wechat_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(next, id);
  return findCreativeFinishedArticleById(db, id);
}

// ── Toggle publishable 可发标记 ───────────────────────────────────────────

// 编辑手动标记文章是否"可发"，用于筛选
export function togglePublishable(db: SqliteDatabase, id: number): CreativeFinishedArticleRecord | null {
  const current = db
    .prepare("SELECT publishable FROM creative_finished_articles WHERE id = ?")
    .get(id) as { publishable: number } | undefined;
  if (!current) return null;
  const next = current.publishable === 1 ? 0 : 1;
  db.prepare("UPDATE creative_finished_articles SET publishable = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(next, id);
  return findCreativeFinishedArticleById(db, id);
}

// 软删除成品文章
export function softDeleteFinishedArticle(db: SqliteDatabase, id: number): boolean {
  const result = db.prepare(
    "UPDATE creative_finished_articles SET deleted_at = datetime('now'), pinned_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL"
  ).run(id);
  return result.changes > 0;
}

// 恢复已废弃的成品文章（清空 deleted_at）
export function restoreFinishedArticle(db: SqliteDatabase, id: number): boolean {
  const result = db.prepare(
    "UPDATE creative_finished_articles SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NOT NULL"
  ).run(id);
  return result.changes > 0;
}

// 置顶时间既是开关也是排序依据；再次置顶会刷新到所有置顶项的最前面。
export function togglePinnedFinishedArticle(
  db: SqliteDatabase,
  id: number
): CreativeFinishedArticleRecord | null {
  const current = db
    .prepare("SELECT pinned_at FROM creative_finished_articles WHERE id = ? AND deleted_at IS NULL")
    .get(id) as { pinned_at: string | null } | undefined;
  if (!current) return null;

  db.prepare(
    `UPDATE creative_finished_articles
     SET pinned_at = CASE WHEN pinned_at IS NULL THEN strftime('%Y-%m-%d %H:%M:%f', 'now') ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(id);
  return findCreativeFinishedArticleById(db, id);
}
