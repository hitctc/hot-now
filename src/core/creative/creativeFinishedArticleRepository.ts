import type { SqliteDatabase } from "../db/openDatabase.js";
import { updateCreativeSourceItemLinkedArticle } from "./creativeSourceItemRepository.js";
import type { CreativeFinishedArticleMode } from "./types.js";

// ── Column selection & row mapping ──────────────────────────────────────────

const SELECT_COLUMNS = `
  id,
  source_item_id,
  mode,
  thesis,
  intro,
  content_markdown,
  titles,
  hooks,
  quotes,
  summary_100,
  images_json,
  cover_image_url,
  cover_image_index,
  title_index,
  intro_index,
  status,
  anomaly_reason,
  raw_response_text,
  wechat_published,
  wechat_theme_id,
  wechat_html,
  created_at,
  updated_at,
  (SELECT COUNT(*) FROM wechat_draft_push_log WHERE article_id = creative_finished_articles.id AND status = 'success') AS push_count
` as const;

type ArticleRow = {
  id: number;
  source_item_id: number;
  mode: string | null;
  thesis: string | null;
  intro: string | null;
  content_markdown: string;
  titles: string | null;
  hooks: string | null;
  quotes: string | null;
  summary_100: string | null;
  images_json: string | null;
  cover_image_url: string | null;
  cover_image_index: number;
  title_index: number;
  intro_index: number;
  status: string;
  anomaly_reason: string | null;
  raw_response_text: string | null;
  wechat_published: number;
  wechat_theme_id: string | null;
  wechat_html: string | null;
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

function mapRow(row: ArticleRow): CreativeFinishedArticleRecord {
  return {
    id: row.id,
    sourceItemId: row.source_item_id,
    mode: (row.mode as CreativeFinishedArticleMode) || null,
    thesis: row.thesis,
    intro: row.intro ? JSON.parse(row.intro) : null,
    contentMarkdown: row.content_markdown,
    titles: row.titles ? JSON.parse(row.titles) : null,
    hooks: row.hooks ? JSON.parse(row.hooks) : null,
    quotes: row.quotes ? JSON.parse(row.quotes) : null,
    summary100: row.summary_100,
    imagesJson: row.images_json ? JSON.parse(row.images_json) : null,
    images: row.images_json ? JSON.parse(row.images_json) : null,
    coverImage: parseCoverImages(row.cover_image_url),
    coverImageIndex: row.cover_image_index ?? 0,
    titleIndex: row.title_index ?? 0,
    introIndex: row.intro_index ?? 0,
    status: row.status,
    anomalyReason: row.anomaly_reason,
    rawResponseText: row.raw_response_text,
    wechatPublished: row.wechat_published === 1,
    wechatThemeId: row.wechat_theme_id,
    wechatHtml: row.wechat_html,
    pushCount: row.push_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ── Public types ────────────────────────────────────────────────────────────

export type CreativeFinishedArticleRecord = {
  id: number;
  sourceItemId: number;
  mode: CreativeFinishedArticleMode | null;
  thesis: string | null;
  intro: string[] | null;
  contentMarkdown: string;
  titles: string[] | null;
  hooks: string[] | null;
  quotes: string[] | null;
  summary100: string | null;
  imagesJson: unknown[] | null;
  images: unknown[] | null;
  coverImage: string[];
  coverImageIndex: number;
  titleIndex: number;
  introIndex: number;
  status: string;
  anomalyReason: string | null;
  rawResponseText: string | null;
  wechatPublished: boolean;
  wechatThemeId: string | null;
  wechatHtml: string | null;
  pushCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InsertCreativeFinishedArticleInput = {
  sourceItemId: number;
  mode?: CreativeFinishedArticleMode;
  thesis?: string;
  intro?: string[];
  contentMarkdown: string;
  titles?: string[];
  hooks?: string[];
  quotes?: string[];
  summary100?: string;
  images?: unknown[];
  coverImage?: string[];
  rawResponseText?: string;
};

export type EditCreativeFinishedArticleInput = {
  mode?: CreativeFinishedArticleMode;
  thesis?: string;
  intro?: string[];
  introIndex?: number;
  contentMarkdown?: string;
  titles?: string[];
  hooks?: string[];
  quotes?: string[];
  summary100?: string;
  images?: unknown[];
  coverImage?: string[];
  coverImageIndex?: number;
  titleIndex?: number;
  rawResponseText?: string;
  status?: string;
  anomalyReason?: string;
  wechatThemeId?: string | null;
  wechatHtml?: string | null;
};

export type ListCreativeFinishedArticlesFilters = {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
};

export type ListCreativeFinishedArticlesResult = {
  items: CreativeFinishedArticleRecord[];
  total: number;
  page: number;
  pageSize: number;
};

// ── Insert ──────────────────────────────────────────────────────────────────

export function insertCreativeFinishedArticle(
  db: SqliteDatabase,
  input: InsertCreativeFinishedArticleInput
): CreativeFinishedArticleRecord {
  db.prepare(
    `
      INSERT INTO creative_finished_articles (
        source_item_id,
        mode,
        thesis,
        intro,
        content_markdown,
        titles,
        hooks,
        quotes,
        summary_100,
        images_json,
        cover_image_url,
        status,
        raw_response_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?)
    `
  ).run(
    input.sourceItemId,
    input.mode ?? null,
    input.thesis ?? null,
    input.intro ? JSON.stringify(input.intro) : null,
    input.contentMarkdown,
    input.titles ? JSON.stringify(input.titles) : null,
    input.hooks ? JSON.stringify(input.hooks) : null,
    input.quotes ? JSON.stringify(input.quotes) : null,
    input.summary100 ?? null,
    input.images ? JSON.stringify(input.images) : null,
    input.coverImage ? JSON.stringify(input.coverImage) : null,
    input.rawResponseText ?? null
  );

  const row = db
    .prepare("SELECT id FROM creative_finished_articles WHERE source_item_id = ? ORDER BY id DESC LIMIT 1")
    .get(input.sourceItemId) as { id: number } | undefined;

  if (!row) {
    throw new Error("creative finished article insert did not return a persisted row");
  }

  // Backlink the source item so the relationship is bidirectional.
  updateCreativeSourceItemLinkedArticle(db, input.sourceItemId, row.id);

  return findCreativeFinishedArticleById(db, row.id)!;
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

  if (filters.search) {
    whereClauses.push("(content_markdown LIKE ? OR thesis LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM creative_finished_articles ${whereClause}`)
    .get(...params) as { total: number };

  const offset = (page - 1) * pageSize;
  const items = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM creative_finished_articles ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as ArticleRow[];

  return {
    items: items.map(mapRow),
    total: countRow.total,
    page,
    pageSize
  };
}

// ── Edit content fields ────────────────────────────────────────────────────

export function editCreativeFinishedArticle(
  db: SqliteDatabase,
  id: number,
  input: EditCreativeFinishedArticleInput
): { ok: boolean; reason?: string } {
  const current = findCreativeFinishedArticleById(db, id);
  if (!current) {
    return { ok: false, reason: "article not found" };
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
  if (input.intro !== undefined) {
    setClauses.push("intro = ?");
    params.push(JSON.stringify(input.intro));
  }
  if (input.contentMarkdown !== undefined) {
    setClauses.push("content_markdown = ?");
    params.push(input.contentMarkdown);
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
    params.push(input.summary100);
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
  if (input.introIndex !== undefined) {
    setClauses.push("intro_index = ?");
    params.push(input.introIndex);
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

  if (setClauses.length === 0) {
    return { ok: true };
  }

  setClauses.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);

  db.prepare(`UPDATE creative_finished_articles SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

  return { ok: true };
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
