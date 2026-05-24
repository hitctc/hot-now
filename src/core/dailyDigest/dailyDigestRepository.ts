import type { SqliteDatabase } from "../db/openDatabase.js";

// ── Row & public type ────────────────────────────────────────────────────────

type DigestRow = {
  id: number;
  date: string;
  title: string;
  content_markdown: string;
  cover_image: string | null;
  total_items: number;
  categories: string;
  status: string;
  collector_agent: string;
  created_at: string;
  updated_at: string;
};

export type DailyDigestStatus = "generated" | "publishing" | "published" | "failed";

export type DailyDigestRecord = {
  id: number;
  date: string;
  title: string;
  contentMarkdown: string;
  coverImage: string | null;
  totalItems: number;
  categories: string[];
  status: DailyDigestStatus;
  collectorAgent: string;
  createdAt: string;
  updatedAt: string;
};

// 列表查询只返回摘要字段，不包含 contentMarkdown
export type DailyDigestListItem = Omit<DailyDigestRecord, "contentMarkdown">;

const LIST_COLUMNS = `
  id, date, title, cover_image, total_items, categories, status, collector_agent, created_at, updated_at
` as const;

function mapRow(row: DigestRow): DailyDigestRecord {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    contentMarkdown: row.content_markdown,
    coverImage: row.cover_image,
    totalItems: row.total_items,
    categories: JSON.parse(row.categories),
    status: row.status as DailyDigestStatus,
    collectorAgent: row.collector_agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapListItem(row: DigestRow): DailyDigestListItem {
  const full = mapRow(row);
  const { contentMarkdown: _, ...rest } = full;
  return rest;
}

// ── Insert ───────────────────────────────────────────────────────────────────

export type InsertDailyDigestInput = {
  date: string;
  title: string;
  contentMarkdown: string;
  coverImage?: string;
  totalItems: number;
  categories: string[];
  collectorAgent: string;
};

export function insertDailyDigest(
  db: SqliteDatabase,
  input: InsertDailyDigestInput
): DailyDigestRecord {
  db.prepare(
    `
      INSERT INTO daily_digests (date, title, content_markdown, cover_image, total_items, categories, status, collector_agent)
      VALUES (?, ?, ?, ?, ?, ?, 'generated', ?)
    `
  ).run(
    input.date,
    input.title,
    input.contentMarkdown,
    input.coverImage ?? null,
    input.totalItems,
    JSON.stringify(input.categories),
    input.collectorAgent
  );

  const row = db
    .prepare("SELECT * FROM daily_digests WHERE date = ?")
    .get(input.date) as DigestRow | undefined;

  if (!row) throw new Error("daily digest insert did not return a persisted row");
  return mapRow(row);
}

// ── Find by id ───────────────────────────────────────────────────────────────

export function findDailyDigestById(db: SqliteDatabase, id: number): DailyDigestRecord | null {
  const row = db
    .prepare("SELECT * FROM daily_digests WHERE id = ?")
    .get(id) as DigestRow | undefined;
  return row ? mapRow(row) : null;
}

// ── Find by date ─────────────────────────────────────────────────────────────

export function findDailyDigestByDate(db: SqliteDatabase, date: string): DailyDigestRecord | null {
  const row = db
    .prepare("SELECT * FROM daily_digests WHERE date = ?")
    .get(date) as DigestRow | undefined;
  return row ? mapRow(row) : null;
}

// ── List with pagination and filters ─────────────────────────────────────────

export type ListDailyDigestsFilters = {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ListDailyDigestsResult = {
  items: DailyDigestListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function listDailyDigests(
  db: SqliteDatabase,
  filters: ListDailyDigestsFilters = {}
): ListDailyDigestsResult {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, filters.pageSize ?? 20);

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    whereClauses.push("status = ?");
    params.push(filters.status);
  }
  if (filters.dateFrom) {
    whereClauses.push("date >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    whereClauses.push("date <= ?");
    params.push(filters.dateTo);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM daily_digests ${whereClause}`)
    .get(...params) as { total: number };

  const offset = (page - 1) * pageSize;
  const items = db
    .prepare(
      `SELECT ${LIST_COLUMNS} FROM daily_digests ${whereClause} ORDER BY date DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as DigestRow[];

  return {
    items: items.map(mapListItem),
    total: countRow.total,
    page,
    pageSize
  };
}

// ── Update status ────────────────────────────────────────────────────────────

export function updateDailyDigestStatus(
  db: SqliteDatabase,
  id: number,
  status: DailyDigestStatus
): DailyDigestRecord | null {
  const existing = findDailyDigestById(db, id);
  if (!existing) return null;

  db.prepare(
    "UPDATE daily_digests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(status, id);

  return findDailyDigestById(db, id);
}
