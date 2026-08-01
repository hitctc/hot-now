import type { SqliteDatabase } from "../db/openDatabase.js";
import type { CreativeSourceItemWritingStatus } from "./types.js";
import type {
  AccountFitDetails,
  CreativeSourceItemWritingStopDetails,
  InsertCreativeSourceItemInput,
  TrendBreakdown,
  UpdateCreativeSourceItemAccountFitInput,
} from "./creativeSourceItemTypes.js";

/** 幂等写入采集素材，并仅补齐既有记录缺失的采集字段。 */
export function insertCreativeSourceItem(
  db: SqliteDatabase,
  input: InsertCreativeSourceItemInput
): { id: number; created: boolean } {
  // 幂等插入：先按 externalId + collectorAgent 查，再按 url + collectorAgent 兜底
  let existing = db
    .prepare("SELECT id, full_content, summary, source_name, author, cover_image_url, tags, word_count, content_type, score, published_at, collector_timestamp FROM creative_source_items WHERE external_id = ? AND collector_agent = ?")
    .get(input.externalId, input.collectorAgent) as Record<string, unknown> | undefined;

  if (!existing && input.url) {
    existing = db
      .prepare("SELECT id, full_content, summary, source_name, author, cover_image_url, tags, word_count, content_type, score, published_at, collector_timestamp FROM creative_source_items WHERE url = ? AND collector_agent = ?")
      .get(input.url, input.collectorAgent) as Record<string, unknown> | undefined;
  }

  if (existing) {
    const patches: { col: string; val: unknown }[] = [];
    type FieldMap = { input: string | number | null | undefined; col: string };
    const fields: FieldMap[] = [
      { input: input.fullContent, col: "full_content" },
      { input: input.summary, col: "summary" },
      { input: input.sourceName, col: "source_name" },
      { input: input.author, col: "author" },
      { input: input.coverImageUrl, col: "cover_image_url" },
      { input: input.tags, col: "tags" },
      { input: input.wordCount, col: "word_count" },
      { input: input.contentType, col: "content_type" },
      { input: input.score, col: "score" },
      { input: input.publishedAt, col: "published_at" },
      { input: input.collectorTimestamp, col: "collector_timestamp" },
      { input: input.trendScore, col: "trend_score" },
      { input: input.trendBreakdown ? JSON.stringify(input.trendBreakdown) : undefined, col: "trend_breakdown" },
    ];
    for (const f of fields) {
      if (f.input == null) continue;
      const existingVal = existing[f.col];
      // full_content 字段：已有值是反爬垃圾内容时允许覆盖
      if (f.col === "full_content" && existingVal != null && typeof existingVal === "string" && existingVal.includes("环境异常")) {
        patches.push({ col: f.col, val: f.input });
      } else if (existingVal === null || existingVal === undefined) {
        patches.push({ col: f.col, val: f.input });
      }
    }
    if (patches.length > 0) {
      const setClause = patches.map(p => `${p.col} = ?`).join(", ") + ", updated_at = CURRENT_TIMESTAMP";
      db.prepare(`UPDATE creative_source_items SET ${setClause} WHERE id = ?`).run(
        ...patches.map(p => p.val),
        existing.id
      );
    }
    return { id: existing.id as number, created: false };
  }

  const rawPayloadJson = JSON.stringify(input);
  const direction = input.direction ?? "article";
  // 长内容必须先过账号适配门禁，外部调用方传入 ready 也不能绕过。
  const writingStatus = direction === "article" ? "pending" : (input.writingStatus ?? "ready");
  // seq_number：同 direction 内从 1 递增（幂等命中已走 UPDATE 分支，这里是新建）
  const seqRow = db.prepare(
    "SELECT COALESCE(MAX(seq_number), 0) + 1 AS next FROM creative_source_items WHERE direction = ?"
  ).get(direction) as { next: number };

  db.prepare(
    `
      INSERT INTO creative_source_items (
        external_id,
        collector_agent,
        title,
        url,
        source_name,
        summary,
        full_content,
        author,
        cover_image_url,
        tags,
        language,
        word_count,
        content_type,
        score,
        published_at,
        collector_timestamp,
        writing_status,
        raw_payload_json,
        trend_score,
        trend_breakdown,
        direction,
        seq_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.externalId,
    input.collectorAgent,
    input.title,
    input.url,
    input.sourceName ?? null,
    input.summary ?? null,
    input.fullContent ?? null,
    input.author ?? null,
    input.coverImageUrl ?? null,
    input.tags ?? null,
    input.language ?? "zh",
    input.wordCount ?? null,
    input.contentType ?? null,
    input.score ?? null,
    input.publishedAt ?? null,
    input.collectorTimestamp ?? null,
    writingStatus,
    rawPayloadJson,
    input.trendScore ?? null,
    input.trendBreakdown ? JSON.stringify(input.trendBreakdown) : null,
    direction,
    seqRow.next
  );

  const row = db
    .prepare("SELECT id FROM creative_source_items WHERE external_id = ? AND collector_agent = ?")
    .get(input.externalId, input.collectorAgent) as { id: number } | undefined;

  if (!row) {
    throw new Error("creative source item insert did not return a persisted row");
  }

  return { id: row.id, created: true };
}

// ── Update writing status ───────────────────────────────────────────────────

/**
 * 更新素材写作状态；开始新一轮写作或完成时清除上一轮停止说明。
 */
export function updateCreativeSourceItemWritingStatus(
  db: SqliteDatabase,
  id: number,
  status: CreativeSourceItemWritingStatus,
  stopDetails?: CreativeSourceItemWritingStopDetails
): boolean {
  let result;
  if ((status === "skipped" || status === "failed") && stopDetails) {
    result = db
      .prepare(
        `UPDATE creative_source_items
         SET writing_status = ?,
             writing_stop_step = ?,
             writing_stop_step_name = ?,
             writing_stop_reason = ?,
             writing_stopped_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(status, stopDetails.step, stopDetails.stepName, stopDetails.reason, id);
  } else if (status !== "skipped" && status !== "failed") {
    result = db
      .prepare(
        `UPDATE creative_source_items
         SET writing_status = ?,
             writing_stop_step = NULL,
             writing_stop_step_name = NULL,
             writing_stop_reason = NULL,
             writing_stopped_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(status, id);
  } else {
    result = db
      .prepare("UPDATE creative_source_items SET writing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(status, id);
  }

  return result.changes > 0;
}

// ── Update trend score ──────────────────────────────────────────────────────

/** 更新素材趋势评分及其评分拆解。 */
export function updateCreativeSourceItemTrendScore(
  db: SqliteDatabase,
  id: number,
  trendScore: number,
  trendBreakdown: TrendBreakdown
): boolean {
  const result = db
    .prepare(
      "UPDATE creative_source_items SET trend_score = ?, trend_breakdown = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(trendScore, JSON.stringify(trendBreakdown), id);
  return result.changes > 0;
}

/**
 * 保存账号适配度；队列服务决定准入后的写作状态，回写只保存评估事实。
 */
export function updateCreativeSourceItemAccountFit(
  db: SqliteDatabase,
  id: number,
  input: UpdateCreativeSourceItemAccountFitInput
): boolean {
  const writingStatus = input.level === "high" ? "ready" : input.level === "low" ? "excluded" : "pending";
  const statusSql = input.updateWritingStatus ? ", writing_status = ?" : "";
  const values: unknown[] = [
    input.level,
    input.reason,
    JSON.stringify(input.details),
    input.ruleVersion,
  ];
  if (input.updateWritingStatus) {
    values.push(writingStatus);
  }
  values.push(id);
  const result = db
    .prepare(
      `UPDATE creative_source_items
       SET account_fit_level = ?,
           account_fit_reason = ?,
           account_fit_details_json = ?,
           account_fit_rule_version = ?,
           account_fit_evaluated_at = CURRENT_TIMESTAMP
           ${statusSql},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(...values);
  return result.changes > 0;
}

// ── Update mutable fields (score, fullContent) ──────────────────────────────

/** 更新人工可修正的素材评分或正文，不接受空更新。 */
export function updateCreativeSourceItemFields(
  db: SqliteDatabase,
  id: number,
  fields: { score?: number; fullContent?: string }
): boolean {
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (fields.score !== undefined) {
    updates.push("score = ?");
    values.push(fields.score);
  }
  if (fields.fullContent !== undefined) {
    updates.push("full_content = ?");
    values.push(fields.fullContent);
  }
  if (updates.length === 0) return false;

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const result = db
    .prepare(`UPDATE creative_source_items SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

// ── Update linked article ───────────────────────────────────────────────────

/** 记录素材与已生成成品文章的关联。 */
export function updateCreativeSourceItemLinkedArticle(
  db: SqliteDatabase,
  id: number,
  articleId: number
): boolean {
  const result = db
    .prepare(
      "UPDATE creative_source_items SET linked_article_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(articleId, id);

  return result.changes > 0;
}

/** 切换素材可写标记（0↔1）。 */
export function toggleSourceItemWritable(db: SqliteDatabase, id: number): { writable: boolean } | null {
  const row = db.prepare("SELECT writable FROM creative_source_items WHERE id = ?").get(id) as { writable: number } | undefined;
  if (!row) return null;
  const newValue = row.writable === 1 ? 0 : 1;
  db.prepare("UPDATE creative_source_items SET writable = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newValue, id);
  return { writable: newValue === 1 };
}
