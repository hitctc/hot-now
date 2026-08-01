import type { SqliteDatabase } from "../db/openDatabase.js";
import type { CreativeFinishedArticleMode } from "./types.js";
import type {
  ArticleRewriteLevel,
  CreativeFinishedArticleRecord,
  ListCreativeFinishedArticlesFilters,
  ListCreativeFinishedArticlesResult,
} from "./creativeFinishedArticleTypes.js";


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

// 列表保留表格和状态判断所需字段，正文只取 51 字用于既有发布条件判断。
const LIST_SELECT_COLUMNS = `
  id,
  source_item_id,
  mode,
  NULL AS thesis,
  NULL AS intros,
  SUBSTR(content_markdown, 1, 51) AS content_markdown,
  NULL AS human_markdown,
  titles,
  NULL AS hooks,
  NULL AS quotes,
  NULL AS summary_100,
  NULL AS images_json,
  cover_image_url,
  cover_image_index,
  title_index,
  intro_index,
  summary_index,
  status,
  anomaly_reason,
  NULL AS raw_response_text,
  wechat_published,
  publishable,
  NULL AS cover_image_prompt,
  NULL AS inline_image_prompts,
  CASE
    WHEN json_valid(similarity_check)
    THEN json_object('literal_similarity', json_extract(similarity_check, '$.literal_similarity'))
    ELSE NULL
  END AS similarity_check,
  needs_manual_review,
  manual_review_reason,
  manual_review_reasons,
  CASE
    WHEN json_valid(step_trace)
    THEN json_array(
      json_object(
        'startedAt',
        (
          SELECT json_extract(trace.value, '$.startedAt')
          FROM json_each(creative_finished_articles.step_trace) AS trace
          WHERE json_extract(trace.value, '$.startedAt') IS NOT NULL
          ORDER BY trace.key ASC
          LIMIT 1
        )
      ),
      json_object(
        'finishedAt',
        (
          SELECT json_extract(trace.value, '$.finishedAt')
          FROM json_each(creative_finished_articles.step_trace) AS trace
          WHERE json_extract(trace.value, '$.finishedAt') IS NOT NULL
          ORDER BY trace.key DESC
          LIMIT 1
        )
      )
    )
    ELSE NULL
  END AS step_trace,
  current_step,
  stop_step,
  reason_code,
  reason_text,
  deleted_at,
  wechat_theme_id,
  NULL AS wechat_html,
  direction,
  seq_number,
  form,
  reversal_score,
  reversal_angle,
  image_prompts,
  NULL AS comments,
  NULL AS author_extensions,
  pipeline_version,
  NULL AS reader_task,
  NULL AS reader_relevance,
  NULL AS evidence_pack,
  NULL AS reader_value_plan,
  NULL AS fact_skeleton,
  NULL AS oral_draft,
  NULL AS title_candidates,
  NULL AS fact_source_checklist,
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
/** 按成品文章主键读取完整记录，供编辑与推送流程使用。 */
export function findCreativeFinishedArticleById(
  db: SqliteDatabase,
  id: number
): CreativeFinishedArticleRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_finished_articles WHERE id = ?`)
    .get(id) as ArticleRow | undefined;

  return row ? mapRow(row) : null;
}

/** 按素材主键读取其关联的成品文章。 */
export function findCreativeFinishedArticleBySourceItemId(
  db: SqliteDatabase,
  sourceItemId: number
): CreativeFinishedArticleRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM creative_finished_articles WHERE source_item_id = ?`)
    .get(sourceItemId) as ArticleRow | undefined;

  return row ? mapRow(row) : null;
}

/** 按既有筛选、置顶排序与轻量投影分页读取成品文章。 */
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
  const selectedColumns = filters.summaryOnly ? LIST_SELECT_COLUMNS : SELECT_COLUMNS;
  const items = db
    .prepare(
      `SELECT ${selectedColumns} FROM creative_finished_articles ${whereClause}
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
