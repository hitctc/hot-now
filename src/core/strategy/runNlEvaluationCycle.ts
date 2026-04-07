import { resolveNlScoreDelta } from "./nlDecision.js";
import {
  saveNlEvaluations,
  createNlEvaluationRun,
  finishNlEvaluationRun,
  updateNlEvaluationRunProgress
} from "./nlEvaluationRepository.js";
import { listNlRuleSets, type NlRuleScope } from "./nlRuleRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import type { ResolveLlmProviderResult } from "../llm/createLlmProvider.js";
import type { LlmEvaluationContent } from "../llm/providers/shared.js";

export type NlEvaluationCycleMode = "full-recompute" | "incremental-after-collect";

export type RunNlEvaluationCycleInput = {
  mode: NlEvaluationCycleMode;
  contentItemIds?: number[];
};

export type RunNlEvaluationCycleDeps = {
  resolveProvider?: () => Promise<ResolveLlmProviderResult> | ResolveLlmProviderResult;
  now?: () => Date;
  shouldStop?: () => boolean;
};

export type RunNlEvaluationCycleResult = {
  runId: number;
  status: "running" | "completed" | "failed" | "skipped" | "cancelled";
  itemCount: number;
  successCount: number;
  failureCount: number;
};

type CandidateRow = LlmEvaluationContent;

export async function runNlEvaluationCycle(
  db: SqliteDatabase,
  input: RunNlEvaluationCycleInput,
  deps: RunNlEvaluationCycleDeps = {}
): Promise<RunNlEvaluationCycleResult> {
  const now = deps.now ?? (() => new Date());
  const candidates = listEvaluationCandidates(db, input);
  const ruleSets = readRuleSetMap(db);
  const startedAt = now().toISOString();
  const resolveProvider = deps.resolveProvider ?? (async () => ({ ok: false, reason: "missing-provider-settings" as const }));
  const shouldStop = deps.shouldStop ?? (() => false);

  if (candidates.length === 0) {
    const runId = createNlEvaluationRun(db, {
      runType: input.mode,
      status: "skipped",
      providerKind: null,
      startedAt
    });

    finishNlEvaluationRun(db, {
      id: runId,
      status: "skipped",
      finishedAt: startedAt,
      itemCount: 0,
      successCount: 0,
      failureCount: 0,
      notes: "no-candidate-content"
    });

    return {
      runId,
      status: "skipped",
      itemCount: 0,
      successCount: 0,
      failureCount: 0
    };
  }

  if (!hasActiveRules(ruleSets)) {
    const runId = createNlEvaluationRun(db, {
      runType: input.mode,
      status: "skipped",
      providerKind: null,
      startedAt
    });

    finishNlEvaluationRun(db, {
      id: runId,
      status: "skipped",
      finishedAt: startedAt,
      itemCount: candidates.length,
      successCount: 0,
      failureCount: 0,
      notes: "no-active-rules"
    });

    return {
      runId,
      status: "skipped",
      itemCount: candidates.length,
      successCount: 0,
      failureCount: 0
    };
  }

  const resolvedProvider = await resolveProvider();

  if (!resolvedProvider.ok) {
    const runId = createNlEvaluationRun(db, {
      runType: input.mode,
      status: "skipped",
      providerKind: null,
      startedAt
    });

    finishNlEvaluationRun(db, {
      id: runId,
      status: "skipped",
      finishedAt: startedAt,
      itemCount: candidates.length,
      successCount: 0,
      failureCount: 0,
      notes: resolvedProvider.reason
    });

    return {
      runId,
      status: "skipped",
      itemCount: candidates.length,
      successCount: 0,
      failureCount: 0
    };
  }

  const runId = createNlEvaluationRun(db, {
    runType: input.mode,
    status: "running",
    providerKind: resolvedProvider.provider.providerKind,
    startedAt,
    itemCount: candidates.length,
    successCount: 0,
    failureCount: 0
  });
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;
  let cancelled = false;

  for (const candidate of candidates) {
    // User-triggered cancellation is checked between content items so already-finished evaluations stay effective
    // and the current provider request does not need cross-vendor abort support.
    if (shouldStop()) {
      cancelled = true;
      errors.push("cancelled-by-user");
      break;
    }

    try {
      const evaluationResult = await resolvedProvider.provider.evaluateContent({
        content: candidate,
        ruleSets
      });
      const saveResult = saveNlEvaluations(db, {
        contentItemId: candidate.id,
        evaluations: evaluationResult.evaluations.map((evaluation) => ({
          scope: evaluation.scope,
          decision: evaluation.decision,
          strengthLevel: evaluation.strengthLevel,
          scoreDelta: resolveNlScoreDelta(evaluation.decision, evaluation.strengthLevel),
          matchedKeywords: evaluation.matchedKeywords,
          reason: evaluation.reason,
          providerKind: resolvedProvider.provider.providerKind,
          evaluatedAt: startedAt
        }))
      });

      if (!saveResult.ok) {
        failureCount += 1;
        errors.push(`${candidate.id}: failed to persist evaluations`);
        continue;
      }

      successCount += 1;
    } catch (error) {
      failureCount += 1;
      errors.push(`${candidate.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      // Progress is written after every candidate so the settings page can show processed count
      // and remaining-time estimates while a full recompute is still ongoing.
      updateNlEvaluationRunProgress(db, {
        id: runId,
        successCount,
        failureCount
      });
    }
  }

  const status = cancelled ? "cancelled" : successCount === 0 && failureCount > 0 ? "failed" : "completed";
  const finishedAt = now().toISOString();

  finishNlEvaluationRun(db, {
    id: runId,
    status,
    finishedAt,
    itemCount: candidates.length,
    successCount,
    failureCount,
    notes: errors.length > 0 ? errors.join("; ") : null
  });

  return {
    runId,
    status,
    itemCount: candidates.length,
    successCount,
    failureCount
  };
}

function listEvaluationCandidates(db: SqliteDatabase, input: RunNlEvaluationCycleInput): CandidateRow[] {
  if (input.mode === "incremental-after-collect") {
    const ids = uniqueNumbers(input.contentItemIds ?? []);

    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");

    return db
      .prepare(
        `
          SELECT
            ci.id AS id,
            ci.title AS title,
            COALESCE(ci.summary, '') AS summary,
            COALESCE(ci.body_markdown, '') AS bodyMarkdown,
            ci.canonical_url AS canonicalUrl,
            ci.published_at AS publishedAt,
            cs.kind AS sourceKind,
            cs.name AS sourceName
          FROM content_items ci
          JOIN content_sources cs ON cs.id = ci.source_id
          WHERE ci.id IN (${placeholders})
          ORDER BY ci.id ASC
        `
      )
      .all(...ids) as CandidateRow[];
  }

  return db
    .prepare(
      `
        SELECT
          ci.id AS id,
          ci.title AS title,
          COALESCE(ci.summary, '') AS summary,
          COALESCE(ci.body_markdown, '') AS bodyMarkdown,
          ci.canonical_url AS canonicalUrl,
          ci.published_at AS publishedAt,
          cs.kind AS sourceKind,
          cs.name AS sourceName
        FROM content_items ci
        JOIN content_sources cs ON cs.id = ci.source_id
        ORDER BY ci.id ASC
      `
    )
    .all() as CandidateRow[];
}

function readRuleSetMap(db: SqliteDatabase): Record<NlRuleScope, string> {
  const rules = listNlRuleSets(db);

  return {
    base: rules.find((rule) => rule.scope === "base" && rule.enabled)?.ruleText ?? "",
    ai_new: rules.find((rule) => rule.scope === "ai_new" && rule.enabled)?.ruleText ?? "",
    ai_hot: rules.find((rule) => rule.scope === "ai_hot" && rule.enabled)?.ruleText ?? ""
  };
}

function hasActiveRules(ruleSets: Record<NlRuleScope, string>): boolean {
  return Object.values(ruleSets).some((ruleText) => ruleText.trim().length > 0);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}
