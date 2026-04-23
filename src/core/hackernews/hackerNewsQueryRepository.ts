import type { SqliteDatabase } from "../db/openDatabase.js";

export type HackerNewsQueryRecord = {
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

export type SaveHackerNewsQueryInput = {
  id?: number;
  query: string;
  priority?: number | null;
  isEnabled?: boolean | null;
  notes?: string | null;
};

export type SaveHackerNewsQueryResult =
  | { ok: true; query: HackerNewsQueryRecord }
  | {
      ok: false;
      reason: "invalid-id" | "invalid-query" | "invalid-priority" | "duplicate-query" | "not-found";
    };

export type DeleteHackerNewsQueryResult = { ok: true; id: number } | { ok: false; reason: "invalid-id" | "not-found" };

export type ToggleHackerNewsQueryResult =
  | { ok: true; query: HackerNewsQueryRecord }
  | { ok: false; reason: "invalid-id" | "not-found" };

export type MarkHackerNewsQueryFetchResultInput =
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

type HackerNewsQueryRow = {
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

// The sources page needs the strongest HN queries near the top so operators can scan intent quickly.
export function listHackerNewsQueries(db: SqliteDatabase): HackerNewsQueryRecord[] {
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
        FROM hackernews_queries
        ORDER BY priority DESC, query COLLATE NOCASE ASC, id ASC
      `
    )
    .all() as HackerNewsQueryRow[];

  return rows.map(mapHackerNewsQueryRow);
}

// Creation keeps validation close to persistence so future HTTP actions can stay thin and deterministic.
export function createHackerNewsQuery(db: SqliteDatabase, input: SaveHackerNewsQueryInput): SaveHackerNewsQueryResult {
  const normalized = normalizeHackerNewsQueryInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  try {
    const result = db
      .prepare(
        `
          INSERT INTO hackernews_queries (
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
      .run(toHackerNewsQueryStatementParams(normalized.query));

    return readHackerNewsQueryById(db, Number(result.lastInsertRowid));
  } catch (error) {
    if (isSqliteUniqueError(error)) {
      return { ok: false, reason: "duplicate-query" };
    }

    throw error;
  }
}

// Update replaces editable fields but deliberately preserves last fetch status for operators.
export function updateHackerNewsQuery(db: SqliteDatabase, input: SaveHackerNewsQueryInput): SaveHackerNewsQueryResult {
  if (!Number.isInteger(input.id) || Number(input.id) <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const normalized = normalizeHackerNewsQueryInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  try {
    const result = db
      .prepare(
        `
          UPDATE hackernews_queries
          SET query = @query,
              priority = @priority,
              is_enabled = @isEnabled,
              notes = @notes,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `
      )
      .run({ ...toHackerNewsQueryStatementParams(normalized.query), id: input.id });

    if (result.changes === 0) {
      return { ok: false, reason: "not-found" };
    }

    return readHackerNewsQueryById(db, Number(input.id));
  } catch (error) {
    if (isSqliteUniqueError(error)) {
      return { ok: false, reason: "duplicate-query" };
    }

    throw error;
  }
}

// Delete only removes the HN query config; already collected content stays in the shared content pool.
export function deleteHackerNewsQuery(db: SqliteDatabase, id: number): DeleteHackerNewsQueryResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db.prepare("DELETE FROM hackernews_queries WHERE id = ?").run(id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return { ok: true, id };
}

// The enable toggle stays narrow so operators can pause a noisy HN query without resubmitting the full form.
export function toggleHackerNewsQuery(
  db: SqliteDatabase,
  id: number,
  enable: boolean
): ToggleHackerNewsQueryResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db
    .prepare(
      `
        UPDATE hackernews_queries
        SET is_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(enable ? 1 : 0, id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return readHackerNewsQueryById(db, id);
}

// Fetch status is stored per query so the sources page can distinguish failures from 0-result searches.
export function markHackerNewsQueryFetchResult(
  db: SqliteDatabase,
  input: MarkHackerNewsQueryFetchResultInput
): ToggleHackerNewsQueryResult {
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result =
    input.success === true
      ? db
          .prepare(
            `
              UPDATE hackernews_queries
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
              UPDATE hackernews_queries
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

  return readHackerNewsQueryById(db, input.id);
}

function readHackerNewsQueryById(db: SqliteDatabase, id: number): { ok: true; query: HackerNewsQueryRecord } {
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
        FROM hackernews_queries
        WHERE id = ?
      `
    )
    .get(id) as HackerNewsQueryRow | undefined;

  if (!row) {
    throw new Error(`Expected hackernews_queries row ${id} to exist after write.`);
  }

  return { ok: true, query: mapHackerNewsQueryRow(row) };
}

function mapHackerNewsQueryRow(row: HackerNewsQueryRow): HackerNewsQueryRecord {
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

function normalizeHackerNewsQueryInput(
  input: SaveHackerNewsQueryInput
): { ok: true; query: Omit<HackerNewsQueryRecord, "id" | "lastFetchedAt" | "lastSuccessAt" | "lastResult" | "createdAt" | "updatedAt"> } | SaveHackerNewsQueryResult {
  const normalizedQuery = input.query.trim().replace(/\s+/g, " ");

  if (normalizedQuery.length === 0) {
    return { ok: false, reason: "invalid-query" };
  }

  const priority = normalizePriority(input.priority);

  if (priority === null) {
    return { ok: false, reason: "invalid-priority" };
  }

  return {
    ok: true,
    query: {
      query: normalizedQuery,
      priority,
      isEnabled: input.isEnabled ?? true,
      notes: normalizeOptionalText(input.notes)
    }
  };
}

function normalizePriority(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return 60;
  }

  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return null;
  }

  return value;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMessage(value: string): string {
  return value.trim().slice(0, 500);
}

function toHackerNewsQueryStatementParams(
  input: Omit<HackerNewsQueryRecord, "id" | "lastFetchedAt" | "lastSuccessAt" | "lastResult" | "createdAt" | "updatedAt">
) {
  return {
    query: input.query,
    priority: input.priority,
    isEnabled: input.isEnabled ? 1 : 0,
    notes: input.notes
  };
}

function isSqliteUniqueError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
