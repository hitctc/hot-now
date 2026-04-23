import type { SqliteDatabase } from "../db/openDatabase.js";

export const twitterSearchKeywordCategories = ["official_vendor", "product", "person", "topic", "media", "other"] as const;

export type TwitterSearchKeywordCategory = (typeof twitterSearchKeywordCategories)[number];

export type TwitterSearchKeywordRecord = {
  id: number;
  keyword: string;
  category: TwitterSearchKeywordCategory;
  priority: number;
  isCollectEnabled: boolean;
  isVisible: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveTwitterSearchKeywordInput = {
  id?: number;
  keyword: string;
  category?: string | null;
  priority?: number | null;
  isCollectEnabled?: boolean | null;
  isVisible?: boolean | null;
  notes?: string | null;
};

export type SaveTwitterSearchKeywordResult =
  | { ok: true; keyword: TwitterSearchKeywordRecord }
  | {
      ok: false;
      reason: "invalid-id" | "invalid-keyword" | "invalid-category" | "invalid-priority" | "duplicate-keyword" | "not-found";
    };

export type DeleteTwitterSearchKeywordResult =
  | { ok: true; id: number }
  | { ok: false; reason: "invalid-id" | "not-found" };

export type ToggleTwitterSearchKeywordResult =
  | { ok: true; keyword: TwitterSearchKeywordRecord }
  | { ok: false; reason: "invalid-id" | "not-found" };

export type MarkTwitterSearchKeywordFetchResultInput =
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

type TwitterSearchKeywordRow = {
  id: number;
  keyword: string;
  category: string;
  priority: number;
  is_collect_enabled: number;
  is_visible: number;
  notes: string | null;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_result: string | null;
  created_at: string;
  updated_at: string;
};

// The sources page needs keywords ordered by signal first so the most important search terms stay near the top.
export function listTwitterSearchKeywords(db: SqliteDatabase): TwitterSearchKeywordRecord[] {
  const rows = db
    .prepare(
      `
        SELECT id,
               keyword,
               category,
               priority,
               is_collect_enabled,
               is_visible,
               notes,
               last_fetched_at,
               last_success_at,
               last_result,
               created_at,
               updated_at
        FROM twitter_search_keywords
        ORDER BY priority DESC, keyword COLLATE NOCASE ASC, id ASC
      `
    )
    .all() as TwitterSearchKeywordRow[];

  return rows.map(mapTwitterSearchKeywordRow);
}

// Keyword creation keeps validation local so later HTTP actions can stay thin and deterministic.
export function createTwitterSearchKeyword(
  db: SqliteDatabase,
  input: SaveTwitterSearchKeywordInput
): SaveTwitterSearchKeywordResult {
  const normalized = normalizeTwitterSearchKeywordInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  try {
    const result = db
      .prepare(
        `
          INSERT INTO twitter_search_keywords (
            keyword,
            category,
            priority,
            is_collect_enabled,
            is_visible,
            notes,
            updated_at
          )
          VALUES (
            @keyword,
            @category,
            @priority,
            @isCollectEnabled,
            @isVisible,
            @notes,
            CURRENT_TIMESTAMP
          )
        `
      )
      .run(toTwitterSearchKeywordStatementParams(normalized.keyword));

    return readTwitterSearchKeywordById(db, Number(result.lastInsertRowid));
  } catch (error) {
    if (isSqliteUniqueError(error)) {
      return { ok: false, reason: "duplicate-keyword" };
    }

    throw error;
  }
}

// Update replaces editable config fields but preserves fetch status so operators can still see prior runs.
export function updateTwitterSearchKeyword(
  db: SqliteDatabase,
  input: SaveTwitterSearchKeywordInput
): SaveTwitterSearchKeywordResult {
  if (!Number.isInteger(input.id) || Number(input.id) <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const normalized = normalizeTwitterSearchKeywordInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  try {
    const result = db
      .prepare(
        `
          UPDATE twitter_search_keywords
          SET keyword = @keyword,
              category = @category,
              priority = @priority,
              is_collect_enabled = @isCollectEnabled,
              is_visible = @isVisible,
              notes = @notes,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `
      )
      .run({ ...toTwitterSearchKeywordStatementParams(normalized.keyword), id: input.id });

    if (result.changes === 0) {
      return { ok: false, reason: "not-found" };
    }

    return readTwitterSearchKeywordById(db, Number(input.id));
  } catch (error) {
    if (isSqliteUniqueError(error)) {
      return { ok: false, reason: "duplicate-keyword" };
    }

    throw error;
  }
}

// Delete only removes the keyword config; already collected content stays in content_items.
export function deleteTwitterSearchKeyword(db: SqliteDatabase, id: number): DeleteTwitterSearchKeywordResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db.prepare("DELETE FROM twitter_search_keywords WHERE id = ?").run(id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return { ok: true, id };
}

// The collect toggle stays narrow so the UI can pause future searches without resubmitting the full form.
export function toggleTwitterSearchKeywordCollect(
  db: SqliteDatabase,
  id: number,
  enable: boolean
): ToggleTwitterSearchKeywordResult {
  return toggleTwitterSearchKeywordBooleanField(db, id, "is_collect_enabled", enable);
}

// The visible toggle is separate from collection so operators can hide a noisy keyword without deleting history.
export function toggleTwitterSearchKeywordVisible(
  db: SqliteDatabase,
  id: number,
  visible: boolean
): ToggleTwitterSearchKeywordResult {
  return toggleTwitterSearchKeywordBooleanField(db, id, "is_visible", visible);
}

// Search status is persisted per keyword so the sources page can distinguish hard failures from 0-result runs.
export function markTwitterSearchKeywordFetchResult(
  db: SqliteDatabase,
  input: MarkTwitterSearchKeywordFetchResultInput
): ToggleTwitterSearchKeywordResult {
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result =
    input.success === true
      ? db
          .prepare(
            `
              UPDATE twitter_search_keywords
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
              UPDATE twitter_search_keywords
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

  return readTwitterSearchKeywordById(db, input.id);
}

function readTwitterSearchKeywordById(
  db: SqliteDatabase,
  id: number
): { ok: true; keyword: TwitterSearchKeywordRecord } {
  const row = db
    .prepare(
      `
        SELECT id,
               keyword,
               category,
               priority,
               is_collect_enabled,
               is_visible,
               notes,
               last_fetched_at,
               last_success_at,
               last_result,
               created_at,
               updated_at
        FROM twitter_search_keywords
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(id) as TwitterSearchKeywordRow | undefined;

  if (!row) {
    throw new Error(`twitter search keyword not found after write: ${id}`);
  }

  return { ok: true, keyword: mapTwitterSearchKeywordRow(row) };
}

function toggleTwitterSearchKeywordBooleanField(
  db: SqliteDatabase,
  id: number,
  column: "is_collect_enabled" | "is_visible",
  enabled: boolean
): ToggleTwitterSearchKeywordResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db
    .prepare(
      `
        UPDATE twitter_search_keywords
        SET ${column} = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(enabled ? 1 : 0, id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return readTwitterSearchKeywordById(db, id);
}

function mapTwitterSearchKeywordRow(row: TwitterSearchKeywordRow): TwitterSearchKeywordRecord {
  return {
    id: row.id,
    keyword: row.keyword,
    category: row.category as TwitterSearchKeywordCategory,
    priority: row.priority,
    isCollectEnabled: row.is_collect_enabled === 1,
    isVisible: row.is_visible === 1,
    notes: row.notes,
    lastFetchedAt: row.last_fetched_at,
    lastSuccessAt: row.last_success_at,
    lastResult: row.last_result,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTwitterSearchKeywordInput(
  input: SaveTwitterSearchKeywordInput
): { ok: true; keyword: Omit<TwitterSearchKeywordRecord, "id" | "lastFetchedAt" | "lastSuccessAt" | "lastResult" | "createdAt" | "updatedAt"> } | SaveTwitterSearchKeywordResult {
  const keyword = normalizeKeyword(input.keyword);

  if (!keyword) {
    return { ok: false, reason: "invalid-keyword" };
  }

  const category = normalizeCategory(input.category);

  if (!category) {
    return { ok: false, reason: "invalid-category" };
  }

  const priority = normalizePriority(input.priority);

  if (priority == null) {
    return { ok: false, reason: "invalid-priority" };
  }

  return {
    ok: true,
    keyword: {
      keyword,
      category,
      priority,
      isCollectEnabled: input.isCollectEnabled ?? true,
      isVisible: input.isVisible ?? true,
      notes: normalizeNullableText(input.notes)
    }
  };
}

function normalizeKeyword(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCategory(value: string | null | undefined): TwitterSearchKeywordCategory | null {
  if (value == null || value === "") {
    return "topic";
  }

  return twitterSearchKeywordCategories.includes(value as TwitterSearchKeywordCategory)
    ? (value as TwitterSearchKeywordCategory)
    : null;
}

function normalizePriority(value: number | null | undefined): number | null {
  const normalized = value == null ? 60 : Number(value);
  return Number.isInteger(normalized) && normalized >= 0 && normalized <= 100 ? normalized : null;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeMessage(value: string): string {
  const normalized = value.trim();
  return normalized.length > 500 ? normalized.slice(0, 500) : normalized;
}

function toTwitterSearchKeywordStatementParams(
  input: Omit<TwitterSearchKeywordRecord, "id" | "lastFetchedAt" | "lastSuccessAt" | "lastResult" | "createdAt" | "updatedAt">
) {
  return {
    keyword: input.keyword,
    category: input.category,
    priority: input.priority,
    isCollectEnabled: input.isCollectEnabled ? 1 : 0,
    isVisible: input.isVisible ? 1 : 0,
    notes: input.notes
  };
}

function isSqliteUniqueError(error: unknown): boolean {
  return error instanceof Error && /unique/i.test(error.message);
}
