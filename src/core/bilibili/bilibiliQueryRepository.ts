import type { SqliteDatabase } from "../db/openDatabase.js";

export type BilibiliQueryRecord = {
  id: number;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveBilibiliQueryInput = {
  id?: number;
  query: string;
  priority?: number | null;
  isEnabled?: boolean | null;
  notes?: string | null;
};

export type SaveBilibiliQueryResult =
  | { ok: true; query: BilibiliQueryRecord }
  | {
      ok: false;
      reason: "invalid-id" | "invalid-query" | "invalid-priority" | "duplicate-query" | "not-found";
    };

export type DeleteBilibiliQueryResult = { ok: true; id: number } | { ok: false; reason: "invalid-id" | "not-found" };

export type ToggleBilibiliQueryResult =
  | { ok: true; query: BilibiliQueryRecord }
  | { ok: false; reason: "invalid-id" | "not-found" };

export type MarkBilibiliQueryFetchResultInput =
  | {
      id: number;
      fetchedAt: string;
      success: true;
      message: string;
    }
  | {
      id: number;
      fetchedAt: string;
      success: false;
      error: string;
    };

type BilibiliQueryRow = {
  id: number;
  query: string;
  priority: number;
  is_enabled: number;
  notes: string | null;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_result: string | null;
  created_at: string;
  updated_at: string;
};

// B 站 query 在 sources 工作台里需要按信号强弱排序，方便先看最重要的视频搜索词。
export function listBilibiliQueries(db: SqliteDatabase): BilibiliQueryRecord[] {
  const rows = db
    .prepare(
      `
        SELECT id,
               query,
               priority,
               is_enabled,
               notes,
               last_fetched_at,
               last_success_at,
               last_result,
               created_at,
               updated_at
        FROM bilibili_queries
        ORDER BY priority DESC, query COLLATE NOCASE ASC, id ASC
      `
    )
    .all() as BilibiliQueryRow[];

  return rows.map(mapBilibiliQueryRow);
}

// 创建时把验证靠近存储层，后面的 HTTP action 就可以保持薄而稳定。
export function createBilibiliQuery(db: SqliteDatabase, input: SaveBilibiliQueryInput): SaveBilibiliQueryResult {
  const normalized = normalizeBilibiliQueryInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  try {
    const result = db
      .prepare(
        `
          INSERT INTO bilibili_queries (
            query,
            priority,
            is_enabled,
            notes,
            updated_at
          )
          VALUES (
            @query,
            @priority,
            @isEnabled,
            @notes,
            CURRENT_TIMESTAMP
          )
        `
      )
      .run(toBilibiliQueryStatementParams(normalized.query));

    return readBilibiliQueryById(db, Number(result.lastInsertRowid));
  } catch (error) {
    if (isSqliteUniqueError(error)) {
      return { ok: false, reason: "duplicate-query" };
    }

    throw error;
  }
}

// 更新时只替换可编辑字段，最近执行状态继续保留给运营排查。
export function updateBilibiliQuery(db: SqliteDatabase, input: SaveBilibiliQueryInput): SaveBilibiliQueryResult {
  if (!Number.isInteger(input.id) || Number(input.id) <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const normalized = normalizeBilibiliQueryInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  try {
    const result = db
      .prepare(
        `
          UPDATE bilibili_queries
          SET query = @query,
              priority = @priority,
              is_enabled = @isEnabled,
              notes = @notes,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `
      )
      .run({ ...toBilibiliQueryStatementParams(normalized.query), id: input.id });

    if (result.changes === 0) {
      return { ok: false, reason: "not-found" };
    }

    return readBilibiliQueryById(db, Number(input.id));
  } catch (error) {
    if (isSqliteUniqueError(error)) {
      return { ok: false, reason: "duplicate-query" };
    }

    throw error;
  }
}

// 删除只清理 query 配置，不碰已经入库的视频内容。
export function deleteBilibiliQuery(db: SqliteDatabase, id: number): DeleteBilibiliQueryResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db.prepare("DELETE FROM bilibili_queries WHERE id = ?").run(id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return { ok: true, id };
}

// 启停动作保持窄接口，工作台可以直接暂停噪音 query，而不必重提整张表单。
export function toggleBilibiliQuery(db: SqliteDatabase, id: number, enable: boolean): ToggleBilibiliQueryResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db
    .prepare(
      `
        UPDATE bilibili_queries
        SET is_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(enable ? 1 : 0, id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return readBilibiliQueryById(db, id);
}

// 每个 query 都要单独记录最近执行状态，这样 B 站搜索失败时可以直接定位到具体词。
export function markBilibiliQueryFetchResult(
  db: SqliteDatabase,
  input: MarkBilibiliQueryFetchResultInput
): ToggleBilibiliQueryResult {
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result =
    input.success === true
      ? db
          .prepare(
            `
              UPDATE bilibili_queries
              SET last_fetched_at = ?,
                  last_success_at = ?,
                  last_result = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `
          )
          .run(input.fetchedAt, input.fetchedAt, normalizeMessage(input.message), input.id)
      : db
          .prepare(
            `
              UPDATE bilibili_queries
              SET last_fetched_at = ?,
                  last_result = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `
          )
          .run(input.fetchedAt, normalizeMessage(input.error), input.id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return readBilibiliQueryById(db, input.id);
}

function readBilibiliQueryById(db: SqliteDatabase, id: number): { ok: true; query: BilibiliQueryRecord } {
  const row = db
    .prepare(
      `
        SELECT id,
               query,
               priority,
               is_enabled,
               notes,
               last_fetched_at,
               last_success_at,
               last_result,
               created_at,
               updated_at
        FROM bilibili_queries
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(id) as BilibiliQueryRow | undefined;

  if (!row) {
    throw new Error(`Expected bilibili_queries row ${id} to exist after write.`);
  }

  return { ok: true, query: mapBilibiliQueryRow(row) };
}

function normalizeBilibiliQueryInput(input: SaveBilibiliQueryInput): SaveBilibiliQueryResult {
  const query = input.query.trim();

  if (!query) {
    return { ok: false, reason: "invalid-query" };
  }

  const priority = input.priority ?? 60;

  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    return { ok: false, reason: "invalid-priority" };
  }

  return {
    ok: true,
    query: {
      id: 0,
      query,
      priority,
      isEnabled: input.isEnabled ?? true,
      notes: normalizeNullableText(input.notes),
      lastFetchedAt: null,
      lastSuccessAt: null,
      lastResult: null,
      createdAt: "",
      updatedAt: ""
    }
  };
}

function toBilibiliQueryStatementParams(query: BilibiliQueryRecord) {
  return {
    query: query.query,
    priority: query.priority,
    isEnabled: query.isEnabled ? 1 : 0,
    notes: query.notes
  };
}

function mapBilibiliQueryRow(row: BilibiliQueryRow): BilibiliQueryRecord {
  return {
    id: row.id,
    query: row.query,
    priority: row.priority,
    isEnabled: row.is_enabled === 1,
    notes: row.notes,
    lastFetchedAt: row.last_fetched_at,
    lastSuccessAt: row.last_success_at,
    lastResult: row.last_result,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeMessage(value: string): string {
  return value.trim().slice(0, 500);
}

function isSqliteUniqueError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
