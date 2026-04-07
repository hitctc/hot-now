import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LlmProviderKind } from "../llm/providerSettingsRepository.js";
import type { NlRuleScope } from "./nlRuleRepository.js";

export type NlEvaluationDecision = "boost" | "penalize" | "block" | "neutral";
export type NlEvaluationStrengthLevel = "low" | "medium" | "high" | null;

export type SaveNlEvaluationInput = {
  contentItemId: number;
  evaluations: Array<{
    scope: NlRuleScope;
    decision: NlEvaluationDecision;
    strengthLevel: NlEvaluationStrengthLevel;
    scoreDelta: number;
    matchedKeywords: string[];
    reason: string | null;
    providerKind: LlmProviderKind;
    evaluatedAt: string;
  }>;
};

export type SaveNlEvaluationsResult = { ok: true; saved: number } | { ok: false; reason: "not-found" };

export type NlEvaluationRecord = {
  contentItemId: number;
  scope: NlRuleScope;
  decision: NlEvaluationDecision;
  strengthLevel: NlEvaluationStrengthLevel;
  scoreDelta: number;
  matchedKeywords: string[];
  reason: string | null;
  providerKind: LlmProviderKind;
  evaluatedAt: string;
};

export type CreateNlEvaluationRunInput = {
  runType: string;
  status: string;
  providerKind?: LlmProviderKind | null;
  startedAt: string;
  itemCount?: number;
  successCount?: number;
  failureCount?: number;
};

export type FinishNlEvaluationRunInput = {
  id: number;
  status: string;
  finishedAt: string;
  itemCount: number;
  successCount: number;
  failureCount: number;
  notes?: string | null;
};

export type UpdateNlEvaluationRunProgressInput = {
  id: number;
  successCount: number;
  failureCount: number;
};

export type NlEvaluationRunRecord = {
  id: number;
  runType: string;
  status: string;
  providerKind: LlmProviderKind | null;
  startedAt: string;
  finishedAt: string | null;
  itemCount: number;
  successCount: number;
  failureCount: number;
  notes: string | null;
  createdAt: string;
};

type EvaluationRow = {
  contentItemId: number;
  scope: NlRuleScope;
  decision: NlEvaluationDecision;
  strengthLevel: string | null;
  scoreDelta: number;
  matchedKeywordsJson: string;
  reason: string | null;
  providerKind: LlmProviderKind;
  evaluatedAt: string;
};

type EvaluationRunRow = {
  id: number;
  runType: string;
  status: string;
  providerKind: LlmProviderKind | null;
  startedAt: string;
  finishedAt: string | null;
  itemCount: number;
  successCount: number;
  failureCount: number;
  notes: string | null;
  createdAt: string;
};

export function saveNlEvaluations(db: SqliteDatabase, input: SaveNlEvaluationInput): SaveNlEvaluationsResult {
  // Evaluations are stored per content item + scope so recomputes can refresh one scope without
  // duplicating older judgments for the same article.
  if (!contentItemExists(db, input.contentItemId)) {
    return { ok: false, reason: "not-found" };
  }

  const upsert = db.prepare(
    `
      INSERT INTO content_nl_evaluations (
        content_item_id,
        scope,
        decision,
        strength_level,
        score_delta,
        matched_keywords_json,
        reason,
        provider_kind,
        evaluated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_item_id, scope) DO UPDATE SET
        decision = excluded.decision,
        strength_level = excluded.strength_level,
        score_delta = excluded.score_delta,
        matched_keywords_json = excluded.matched_keywords_json,
        reason = excluded.reason,
        provider_kind = excluded.provider_kind,
        evaluated_at = excluded.evaluated_at
    `
  );
  const writeAll = db.transaction(() => {
    for (const evaluation of input.evaluations) {
      upsert.run(
        input.contentItemId,
        evaluation.scope,
        evaluation.decision,
        evaluation.strengthLevel,
        evaluation.scoreDelta,
        JSON.stringify(normalizeKeywords(evaluation.matchedKeywords)),
        normalizeNullableText(evaluation.reason),
        evaluation.providerKind,
        evaluation.evaluatedAt
      );
    }
  });

  writeAll();
  return { ok: true, saved: input.evaluations.length };
}

export function listNlEvaluationsForContent(db: SqliteDatabase, contentItemId: number): NlEvaluationRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          content_item_id AS contentItemId,
          scope,
          decision,
          strength_level AS strengthLevel,
          score_delta AS scoreDelta,
          matched_keywords_json AS matchedKeywordsJson,
          reason,
          provider_kind AS providerKind,
          evaluated_at AS evaluatedAt
        FROM content_nl_evaluations
        WHERE content_item_id = ?
        ORDER BY scope ASC
      `
    )
    .all(contentItemId) as EvaluationRow[];

  return rows.map((row) => ({
    contentItemId: row.contentItemId,
    scope: row.scope,
    decision: row.decision,
    strengthLevel: normalizeStrengthLevel(row.strengthLevel),
    scoreDelta: row.scoreDelta,
    matchedKeywords: parseKeywordJson(row.matchedKeywordsJson),
    reason: row.reason,
    providerKind: row.providerKind,
    evaluatedAt: row.evaluatedAt
  }));
}

export function createNlEvaluationRun(db: SqliteDatabase, input: CreateNlEvaluationRunInput): number {
  // Runs are tracked separately from evaluation rows so the settings page can show recompute status
  // even while individual content judgments are still being written.
  const result = db
    .prepare(
      `
        INSERT INTO nl_evaluation_runs (
          run_type,
          status,
          provider_kind,
          started_at,
          item_count,
          success_count,
          failure_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.runType,
      input.status,
      input.providerKind ?? null,
      input.startedAt,
      input.itemCount ?? 0,
      input.successCount ?? 0,
      input.failureCount ?? 0
    );

  return Number(result.lastInsertRowid);
}

export function updateNlEvaluationRunProgress(db: SqliteDatabase, input: UpdateNlEvaluationRunProgressInput): void {
  // Progress is updated independently from the final status so the UI can estimate remaining time
  // before the long-running recompute writes its finished marker.
  db.prepare(
    `
      UPDATE nl_evaluation_runs
      SET success_count = ?,
          failure_count = ?
      WHERE id = ?
    `
  ).run(input.successCount, input.failureCount, input.id);
}

export function finishNlEvaluationRun(db: SqliteDatabase, input: FinishNlEvaluationRunInput): void {
  db.prepare(
    `
      UPDATE nl_evaluation_runs
      SET status = ?,
          finished_at = ?,
          item_count = ?,
          success_count = ?,
          failure_count = ?,
          notes = ?
      WHERE id = ?
    `
  ).run(
    input.status,
    input.finishedAt,
    input.itemCount,
    input.successCount,
    input.failureCount,
    normalizeNullableText(input.notes),
    input.id
  );
}

export function listNlEvaluationRuns(db: SqliteDatabase): NlEvaluationRunRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          run_type AS runType,
          status,
          provider_kind AS providerKind,
          started_at AS startedAt,
          finished_at AS finishedAt,
          item_count AS itemCount,
          success_count AS successCount,
          failure_count AS failureCount,
          notes,
          created_at AS createdAt
        FROM nl_evaluation_runs
        ORDER BY id DESC
      `
    )
    .all() as EvaluationRunRow[];

  return rows;
}

function contentItemExists(db: SqliteDatabase, contentItemId: number): boolean {
  const row = db.prepare("SELECT id FROM content_items WHERE id = ? LIMIT 1").get(contentItemId) as
    | { id: number }
    | undefined;
  return Boolean(row);
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeKeywords(keywords: string[]): string[] {
  return keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);
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

function normalizeStrengthLevel(value: string | null): NlEvaluationStrengthLevel {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}
