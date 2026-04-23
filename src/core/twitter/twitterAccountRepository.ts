import type { SqliteDatabase } from "../db/openDatabase.js";

export const twitterAccountCategories = ["official_vendor", "product", "person", "media", "other"] as const;

export type TwitterAccountCategory = (typeof twitterAccountCategories)[number];

export type TwitterAccountRecord = {
  id: number;
  username: string;
  userId: string | null;
  displayName: string;
  category: TwitterAccountCategory;
  priority: number;
  includeReplies: boolean;
  isEnabled: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveTwitterAccountInput = {
  id?: number;
  username: string;
  userId?: string | null;
  displayName?: string | null;
  category?: string | null;
  priority?: number | null;
  includeReplies?: boolean | null;
  isEnabled?: boolean | null;
  notes?: string | null;
};

export type SaveTwitterAccountResult =
  | { ok: true; account: TwitterAccountRecord }
  | {
      ok: false;
      reason: "invalid-id" | "invalid-username" | "invalid-category" | "invalid-priority" | "duplicate-username" | "not-found";
    };

export type DeleteTwitterAccountResult = { ok: true; id: number } | { ok: false; reason: "invalid-id" | "not-found" };

export type ToggleTwitterAccountResult =
  | { ok: true; account: TwitterAccountRecord }
  | { ok: false; reason: "invalid-id" | "not-found" };

export type MarkTwitterAccountFetchResultInput =
  | {
      id: number;
      fetchedAt: string;
      success: true;
      userId?: string | null;
      message?: string | null;
    }
  | {
      id: number;
      fetchedAt: string;
      success: false;
      error: string;
    };

type TwitterAccountRow = {
  id: number;
  username: string;
  user_id: string | null;
  display_name: string;
  category: string;
  priority: number;
  include_replies: number;
  is_enabled: number;
  notes: string | null;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const usernamePattern = /^[a-z0-9_]{1,15}$/;

// The settings page needs a stable list order so higher-signal accounts stay near the top.
export function listTwitterAccounts(db: SqliteDatabase): TwitterAccountRecord[] {
  const rows = db
    .prepare(
      `
        SELECT id,
               username,
               user_id,
               display_name,
               category,
               priority,
               include_replies,
               is_enabled,
               notes,
               last_fetched_at,
               last_success_at,
               last_error,
               created_at,
               updated_at
        FROM twitter_accounts
        ORDER BY priority DESC, display_name COLLATE NOCASE ASC, id ASC
      `
    )
    .all() as TwitterAccountRow[];

  return rows.map(mapTwitterAccountRow);
}

// Create keeps validation local to the repository so later HTTP actions can stay thin.
export function createTwitterAccount(db: SqliteDatabase, input: SaveTwitterAccountInput): SaveTwitterAccountResult {
  const normalized = normalizeTwitterAccountInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  try {
    const result = db
      .prepare(
        `
          INSERT INTO twitter_accounts (
            username,
            user_id,
            display_name,
            category,
            priority,
            include_replies,
            is_enabled,
            notes,
            updated_at
          )
          VALUES (
            @username,
            @userId,
            @displayName,
            @category,
            @priority,
            @includeReplies,
            @isEnabled,
            @notes,
            CURRENT_TIMESTAMP
          )
        `
      )
      .run(normalized.account);

    return readTwitterAccountById(db, Number(result.lastInsertRowid));
  } catch (error) {
    if (isSqliteUniqueError(error)) {
      return { ok: false, reason: "duplicate-username" };
    }

    throw error;
  }
}

// Update replaces editable configuration fields but leaves fetch status untouched.
export function updateTwitterAccount(db: SqliteDatabase, input: SaveTwitterAccountInput): SaveTwitterAccountResult {
  if (!Number.isInteger(input.id) || Number(input.id) <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const normalized = normalizeTwitterAccountInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  try {
    const result = db
      .prepare(
        `
          UPDATE twitter_accounts
          SET username = @username,
              user_id = @userId,
              display_name = @displayName,
              category = @category,
              priority = @priority,
              include_replies = @includeReplies,
              is_enabled = @isEnabled,
              notes = @notes,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `
      )
      .run({ ...normalized.account, id: input.id });

    if (result.changes === 0) {
      return { ok: false, reason: "not-found" };
    }

    return readTwitterAccountById(db, Number(input.id));
  } catch (error) {
    if (isSqliteUniqueError(error)) {
      return { ok: false, reason: "duplicate-username" };
    }

    throw error;
  }
}

// Delete only removes the account configuration; already collected content remains in content_items.
export function deleteTwitterAccount(db: SqliteDatabase, id: number): DeleteTwitterAccountResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db.prepare("DELETE FROM twitter_accounts WHERE id = ?").run(id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return { ok: true, id };
}

// Toggle is intentionally narrow so the UI can switch collection state without resubmitting the form.
export function toggleTwitterAccount(db: SqliteDatabase, id: number, enable: boolean): ToggleTwitterAccountResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db
    .prepare(
      `
        UPDATE twitter_accounts
        SET is_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(enable ? 1 : 0, id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return readTwitterAccountById(db, id);
}

// Collector status is stored with the account so source operators can see stale or failing accounts quickly.
export function markTwitterAccountFetchResult(
  db: SqliteDatabase,
  input: MarkTwitterAccountFetchResultInput
): ToggleTwitterAccountResult {
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result =
    input.success === true
      ? db
          .prepare(
            `
              UPDATE twitter_accounts
              SET user_id = COALESCE(?, user_id),
                  last_fetched_at = ?,
                  last_success_at = ?,
                  last_error = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `
          )
          .run(
            normalizeNullableText(input.userId),
            input.fetchedAt,
            input.fetchedAt,
            normalizeErrorMessage(input.message),
            input.id
          )
      : db
          .prepare(
            `
              UPDATE twitter_accounts
              SET last_fetched_at = ?,
                  last_error = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `
          )
          .run(input.fetchedAt, normalizeErrorMessage(input.error), input.id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return readTwitterAccountById(db, input.id);
}

function readTwitterAccountById(db: SqliteDatabase, id: number): { ok: true; account: TwitterAccountRecord } {
  const row = db
    .prepare(
      `
        SELECT id,
               username,
               user_id,
               display_name,
               category,
               priority,
               include_replies,
               is_enabled,
               notes,
               last_fetched_at,
               last_success_at,
               last_error,
               created_at,
               updated_at
        FROM twitter_accounts
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(id) as TwitterAccountRow | undefined;

  if (!row) {
    throw new Error(`twitter account not found after write: ${id}`);
  }

  return { ok: true, account: mapTwitterAccountRow(row) };
}

function normalizeTwitterAccountInput(
  input: SaveTwitterAccountInput
):
  | { ok: true; account: Record<string, string | number | null> }
  | Extract<SaveTwitterAccountResult, { ok: false }> {
  const username = normalizeUsername(input.username);

  if (!username) {
    return { ok: false, reason: "invalid-username" };
  }

  const category = normalizeCategory(input.category ?? "official_vendor");

  if (!category) {
    return { ok: false, reason: "invalid-category" };
  }

  const priority = input.priority ?? defaultPriorityForCategory(category);

  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    return { ok: false, reason: "invalid-priority" };
  }

  return {
    ok: true,
    account: {
      username,
      userId: normalizeNullableText(input.userId),
      displayName: normalizeNullableText(input.displayName) ?? username,
      category,
      priority,
      includeReplies: input.includeReplies === true ? 1 : 0,
      isEnabled: input.isEnabled === false ? 0 : 1,
      notes: normalizeNullableText(input.notes)
    }
  };
}

function normalizeUsername(username: string): string | null {
  const normalized = username.trim().replace(/^@+/, "").toLowerCase();
  return usernamePattern.test(normalized) ? normalized : null;
}

function normalizeCategory(category: string): TwitterAccountCategory | null {
  return twitterAccountCategories.includes(category as TwitterAccountCategory)
    ? (category as TwitterAccountCategory)
    : null;
}

function defaultPriorityForCategory(category: TwitterAccountCategory): number {
  switch (category) {
    case "official_vendor":
      return 90;
    case "product":
      return 80;
    case "person":
      return 75;
    case "media":
      return 60;
    case "other":
      return 50;
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeErrorMessage(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > 500 ? normalized.slice(0, 500) : normalized;
}

function isSqliteUniqueError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function mapTwitterAccountRow(row: TwitterAccountRow): TwitterAccountRecord {
  return {
    id: row.id,
    username: row.username,
    userId: row.user_id,
    displayName: row.display_name,
    category: normalizeCategory(row.category) ?? "other",
    priority: row.priority,
    includeReplies: row.include_replies === 1,
    isEnabled: row.is_enabled === 1,
    notes: row.notes,
    lastFetchedAt: row.last_fetched_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
