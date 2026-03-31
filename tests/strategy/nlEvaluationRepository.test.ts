import { afterEach, describe, expect, it } from "vitest";
import {
  createNlEvaluationRun,
  finishNlEvaluationRun,
  listNlEvaluationRuns,
  listNlEvaluationsForContent,
  saveNlEvaluations
} from "../../src/core/strategy/nlEvaluationRepository.js";
import { createTestDatabase, insertTestContentItem, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("nlEvaluationRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("upserts evaluation rows by content item and scope", async () => {
    const handle = await createTestDatabase("hot-now-nl-evaluations-");
    handles.push(handle);

    const contentItemId = insertTestContentItem(handle.db, {
      sourceKind: "openai",
      title: "Agent workflow report",
      canonicalUrl: "https://example.com/evaluation-agent-workflow"
    });

    const firstSave = saveNlEvaluations(handle.db, {
      contentItemId,
      evaluations: [
        {
          scope: "global",
          decision: "boost",
          strengthLevel: "medium",
          scoreDelta: 24,
          matchedKeywords: ["agent", "workflow"],
          reason: "命中全局 agent workflow 偏好",
          providerKind: "deepseek",
          evaluatedAt: "2026-03-31T07:00:00.000Z"
        },
        {
          scope: "ai",
          decision: "boost",
          strengthLevel: "high",
          scoreDelta: 42,
          matchedKeywords: ["agent"],
          reason: "AI 页明显相关",
          providerKind: "deepseek",
          evaluatedAt: "2026-03-31T07:00:00.000Z"
        }
      ]
    });
    const secondSave = saveNlEvaluations(handle.db, {
      contentItemId,
      evaluations: [
        {
          scope: "global",
          decision: "block",
          strengthLevel: "medium",
          scoreDelta: 0,
          matchedKeywords: ["融资"],
          reason: "命中暂不展示融资快讯",
          providerKind: "minimax",
          evaluatedAt: "2026-03-31T08:00:00.000Z"
        }
      ]
    });

    expect(firstSave).toEqual({ ok: true, saved: 2 });
    expect(secondSave).toEqual({ ok: true, saved: 1 });
    expect(listNlEvaluationsForContent(handle.db, contentItemId)).toEqual([
      {
        contentItemId,
        scope: "ai",
        decision: "boost",
        strengthLevel: "high",
        scoreDelta: 42,
        matchedKeywords: ["agent"],
        reason: "AI 页明显相关",
        providerKind: "deepseek",
        evaluatedAt: "2026-03-31T07:00:00.000Z"
      },
      {
        contentItemId,
        scope: "global",
        decision: "block",
        strengthLevel: "medium",
        scoreDelta: 0,
        matchedKeywords: ["融资"],
        reason: "命中暂不展示融资快讯",
        providerKind: "minimax",
        evaluatedAt: "2026-03-31T08:00:00.000Z"
      }
    ]);
  });

  it("returns not-found when the target content item is missing", async () => {
    const handle = await createTestDatabase("hot-now-nl-evaluations-");
    handles.push(handle);

    const result = saveNlEvaluations(handle.db, {
      contentItemId: 999_999,
      evaluations: [
        {
          scope: "global",
          decision: "neutral",
          strengthLevel: null,
          scoreDelta: 0,
          matchedKeywords: [],
          reason: null,
          providerKind: "deepseek",
          evaluatedAt: "2026-03-31T07:00:00.000Z"
        }
      ]
    });

    expect(result).toEqual({
      ok: false,
      reason: "not-found"
    });
  });

  it("creates and finishes evaluation runs with aggregated counters", async () => {
    const handle = await createTestDatabase("hot-now-nl-evaluations-");
    handles.push(handle);

    const runId = createNlEvaluationRun(handle.db, {
      runType: "full-recompute",
      status: "running",
      providerKind: "kimi",
      startedAt: "2026-03-31T07:00:00.000Z"
    });

    finishNlEvaluationRun(handle.db, {
      id: runId,
      status: "completed",
      finishedAt: "2026-03-31T07:05:00.000Z",
      itemCount: 12,
      successCount: 11,
      failureCount: 1,
      notes: "one request retried"
    });

    expect(listNlEvaluationRuns(handle.db)).toEqual([
      {
        id: runId,
        runType: "full-recompute",
        status: "completed",
        providerKind: "kimi",
        startedAt: "2026-03-31T07:00:00.000Z",
        finishedAt: "2026-03-31T07:05:00.000Z",
        itemCount: 12,
        successCount: 11,
        failureCount: 1,
        notes: "one request retried",
        createdAt: expect.any(String)
      }
    ]);
  });
});
