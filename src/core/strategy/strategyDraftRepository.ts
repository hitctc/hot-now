import type { SqliteDatabase } from "../db/openDatabase.js";

export type StrategyDraftScope = "unspecified" | "global" | "hot" | "articles" | "ai";

export type StrategyDraft = {
  id: number;
  sourceFeedbackId: number | null;
  draftText: string;
  suggestedScope: StrategyDraftScope;
  draftEffectSummary: string | null;
  positiveKeywords: string[];
  negativeKeywords: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateStrategyDraftInput = {
  sourceFeedbackId?: number | null;
  draftText: string;
  suggestedScope?: StrategyDraftScope;
  draftEffectSummary?: string | null;
  positiveKeywords?: string[];
  negativeKeywords?: string[];
};

export type UpdateStrategyDraftInput = {
  id: number;
  sourceFeedbackId?: number | null;
  draftText: string;
  suggestedScope?: StrategyDraftScope;
  draftEffectSummary?: string | null;
  positiveKeywords?: string[];
  negativeKeywords?: string[];
};

export type UpdateStrategyDraftResult = { ok: true } | { ok: false; reason: "not-found" };

type StrategyDraftRow = {
  id: number;
  sourceFeedbackId: number | null;
  draftText: string;
  suggestedScope: string;
  draftEffectSummary: string | null;
  positiveKeywordsJson: string;
  negativeKeywordsJson: string;
  createdAt: string;
  updatedAt: string;
};

export function createStrategyDraft(db: SqliteDatabase, input: CreateStrategyDraftInput): number {
  // Drafts stay separate from formal rules so admins can freely reshape feedback-derived suggestions
  // before they touch the real strategy text areas.
  const result = db
    .prepare(
      `
        INSERT INTO strategy_drafts (
          source_feedback_id,
          draft_text,
          suggested_scope,
          draft_effect_summary,
          positive_keywords_json,
          negative_keywords_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.sourceFeedbackId ?? null,
      normalizeDraftText(input.draftText),
      normalizeSuggestedScope(input.suggestedScope),
      normalizeNullableText(input.draftEffectSummary),
      JSON.stringify(normalizeKeywords(input.positiveKeywords)),
      JSON.stringify(normalizeKeywords(input.negativeKeywords))
    );

  return Number(result.lastInsertRowid);
}

export function updateStrategyDraft(
  db: SqliteDatabase,
  input: UpdateStrategyDraftInput
): UpdateStrategyDraftResult {
  // Updates rewrite the editable fields in one statement so the workbench can keep the current draft
  // snapshot without having to delete and recreate rows.
  const result = db
    .prepare(
      `
        UPDATE strategy_drafts
        SET source_feedback_id = ?,
            draft_text = ?,
            suggested_scope = ?,
            draft_effect_summary = ?,
            positive_keywords_json = ?,
            negative_keywords_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(
      input.sourceFeedbackId ?? null,
      normalizeDraftText(input.draftText),
      normalizeSuggestedScope(input.suggestedScope),
      normalizeNullableText(input.draftEffectSummary),
      JSON.stringify(normalizeKeywords(input.positiveKeywords)),
      JSON.stringify(normalizeKeywords(input.negativeKeywords)),
      input.id
    );

  return result.changes > 0 ? { ok: true } : { ok: false, reason: "not-found" };
}

export function listStrategyDrafts(db: SqliteDatabase): StrategyDraft[] {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          source_feedback_id AS sourceFeedbackId,
          draft_text AS draftText,
          suggested_scope AS suggestedScope,
          draft_effect_summary AS draftEffectSummary,
          positive_keywords_json AS positiveKeywordsJson,
          negative_keywords_json AS negativeKeywordsJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM strategy_drafts
        ORDER BY datetime(updated_at) DESC, id DESC
      `
    )
    .all() as StrategyDraftRow[];

  return rows.map((row) => ({
    id: row.id,
    sourceFeedbackId: row.sourceFeedbackId,
    draftText: row.draftText,
    suggestedScope: normalizeSuggestedScope(row.suggestedScope),
    draftEffectSummary: row.draftEffectSummary,
    positiveKeywords: parseKeywordJson(row.positiveKeywordsJson),
    negativeKeywords: parseKeywordJson(row.negativeKeywordsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

export function deleteStrategyDraft(db: SqliteDatabase, draftId: number): boolean {
  const result = db.prepare("DELETE FROM strategy_drafts WHERE id = ?").run(draftId);
  return result.changes > 0;
}

function normalizeSuggestedScope(value: string | undefined): StrategyDraftScope {
  return value === "global" || value === "hot" || value === "articles" || value === "ai" ? value : "unspecified";
}

function normalizeDraftText(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error("strategy draft text must not be empty");
  }

  return normalized;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeKeywords(keywords: string[] | undefined): string[] {
  return (keywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);
}

function parseKeywordJson(rawValue: string): string[] {
  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Invalid rows fall through to an empty list.
  }

  return [];
}
