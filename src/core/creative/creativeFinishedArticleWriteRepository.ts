import type { SqliteDatabase } from "../db/openDatabase.js";
import { updateCreativeSourceItemLinkedArticle } from "./creativeSourceItemRepository.js";
import { findCreativeFinishedArticleById } from "./creativeFinishedArticleReadRepository.js";
import type {
  CreativeFinishedArticleRecord,
  EditCreativeFinishedArticleInput,
  InsertCreativeFinishedArticleInput,
  SaveArticlePerformanceFeedbackInput,
} from "./creativeFinishedArticleTypes.js";

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
        title_index,
        human_markdown,
        origin_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    input.titleIndex ?? 0,
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

/** 校验人工状态转换后，仅更新调用方明确提供的文章字段。 */
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

/** 切换人工维护的公众号已发布标记。 */
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

/** 切换人工维护的可发筛选标记。 */
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

/** 软删除成品文章，并同时取消置顶。 */
export function softDeleteFinishedArticle(db: SqliteDatabase, id: number): boolean {
  const result = db.prepare(
    "UPDATE creative_finished_articles SET deleted_at = datetime('now'), pinned_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL"
  ).run(id);
  return result.changes > 0;
}

/** 恢复软删除的成品文章。 */
export function restoreFinishedArticle(db: SqliteDatabase, id: number): boolean {
  const result = db.prepare(
    "UPDATE creative_finished_articles SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NOT NULL"
  ).run(id);
  return result.changes > 0;
}

/** 切换置顶；置顶时间同时决定多个置顶文章的排序。 */
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
