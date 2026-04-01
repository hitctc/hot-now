import { afterEach, describe, expect, it, vi } from "vitest";
import { listNlEvaluationsForContent, listNlEvaluationRuns } from "../../src/core/strategy/nlEvaluationRepository.js";
import { saveNlRuleSet } from "../../src/core/strategy/nlRuleRepository.js";
import { runNlEvaluationCycle } from "../../src/core/strategy/runNlEvaluationCycle.js";
import { createTestDatabase, insertTestContentItem, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("runNlEvaluationCycle", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("marks the run as skipped when no provider is available", async () => {
    const handle = await createTestDatabase("hot-now-run-nl-cycle-");
    handles.push(handle);

    insertTestContentItem(handle.db, {
      title: "Agent workflow",
      canonicalUrl: "https://example.com/agent-workflow"
    });
    saveNlRuleSet(handle.db, "base", {
      enabled: true,
      ruleText: "保留 agent workflow 相关内容。"
    });

    const result = await runNlEvaluationCycle(
      handle.db,
      {
        mode: "full-recompute"
      },
      {
        resolveProvider: async () => ({ ok: false, reason: "missing-provider-settings" }),
        now: () => new Date("2026-03-31T09:00:00.000Z")
      }
    );

    expect(result).toEqual({
      runId: expect.any(Number),
      status: "skipped",
      itemCount: 1,
      successCount: 0,
      failureCount: 0
    });
    expect(listNlEvaluationRuns(handle.db)).toEqual([
      {
        id: result.runId,
        runType: "full-recompute",
        status: "skipped",
        providerKind: null,
        startedAt: "2026-03-31T09:00:00.000Z",
        finishedAt: "2026-03-31T09:00:00.000Z",
        itemCount: 1,
        successCount: 0,
        failureCount: 0,
        notes: "missing-provider-settings",
        createdAt: expect.any(String)
      }
    ]);
  });

  it("evaluates content items and maps decision strength into fixed score deltas", async () => {
    const handle = await createTestDatabase("hot-now-run-nl-cycle-");
    handles.push(handle);

    const boostedContentId = insertTestContentItem(handle.db, {
      sourceKind: "openai",
      title: "Agent workflow update",
      canonicalUrl: "https://example.com/agent-workflow-update"
    });
    const blockedContentId = insertTestContentItem(handle.db, {
      sourceKind: "juya",
      title: "Funding flash",
      canonicalUrl: "https://example.com/funding-flash"
    });
    saveNlRuleSet(handle.db, "base", {
      enabled: true,
      ruleText: "融资快讯先不要展示，agent workflow 相关内容加分。"
    });
    saveNlRuleSet(handle.db, "ai_new", {
      enabled: true,
      ruleText: "AI 页优先保留 agent 与模型工程内容。"
    });

    const evaluateContent = vi.fn(async ({ content }: { content: { title: string } }) => {
      if (content.title === "Agent workflow update") {
        return {
          evaluations: [
            {
              scope: "base" as const,
              decision: "boost" as const,
              strengthLevel: "medium" as const,
              matchedKeywords: ["agent", "workflow"],
              reason: "命中 agent workflow 偏好"
            },
            {
              scope: "ai_hot" as const,
              decision: "neutral" as const,
              strengthLevel: null,
              matchedKeywords: [],
              reason: null
            },
            {
              scope: "ai_new" as const,
              decision: "boost" as const,
              strengthLevel: "high" as const,
              matchedKeywords: ["agent"],
              reason: "AI 页强相关"
            }
          ]
        };
      }

      return {
        evaluations: [
          {
            scope: "base" as const,
            decision: "block" as const,
            strengthLevel: "medium" as const,
            matchedKeywords: ["融资"],
            reason: "命中融资快讯屏蔽"
          },
          {
            scope: "ai_hot" as const,
            decision: "neutral" as const,
            strengthLevel: null,
            matchedKeywords: [],
            reason: null
          },
          {
            scope: "ai_new" as const,
            decision: "penalize" as const,
            strengthLevel: "low" as const,
            matchedKeywords: ["融资"],
            reason: "AI 页不优先这类内容"
          }
        ]
      };
    });

    const result = await runNlEvaluationCycle(
      handle.db,
      {
        mode: "full-recompute"
      },
      {
        resolveProvider: async () => ({
          ok: true,
          provider: {
            providerKind: "deepseek",
            modelName: "deepseek-chat",
            evaluateContent
          }
        }),
        now: () => new Date("2026-03-31T10:00:00.000Z")
      }
    );

    expect(result).toEqual({
      runId: expect.any(Number),
      status: "completed",
      itemCount: 2,
      successCount: 2,
      failureCount: 0
    });
    expect(evaluateContent).toHaveBeenCalledTimes(2);
    expect(listNlEvaluationsForContent(handle.db, boostedContentId)).toEqual([
      {
        contentItemId: boostedContentId,
        scope: "ai_hot",
        decision: "neutral",
        strengthLevel: null,
        scoreDelta: 0,
        matchedKeywords: [],
        reason: null,
        providerKind: "deepseek",
        evaluatedAt: "2026-03-31T10:00:00.000Z"
      },
      {
        contentItemId: boostedContentId,
        scope: "ai_new",
        decision: "boost",
        strengthLevel: "high",
        scoreDelta: 42,
        matchedKeywords: ["agent"],
        reason: "AI 页强相关",
        providerKind: "deepseek",
        evaluatedAt: "2026-03-31T10:00:00.000Z"
      },
      {
        contentItemId: boostedContentId,
        scope: "base",
        decision: "boost",
        strengthLevel: "medium",
        scoreDelta: 24,
        matchedKeywords: ["agent", "workflow"],
        reason: "命中 agent workflow 偏好",
        providerKind: "deepseek",
        evaluatedAt: "2026-03-31T10:00:00.000Z"
      }
    ]);
    expect(listNlEvaluationsForContent(handle.db, blockedContentId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "base",
          decision: "block",
          scoreDelta: 0
        }),
        expect.objectContaining({
          scope: "ai_new",
          decision: "penalize",
          scoreDelta: -10
        })
      ])
    );
  });

  it("keeps the run completed when only part of the content batch fails", async () => {
    const handle = await createTestDatabase("hot-now-run-nl-cycle-");
    handles.push(handle);

    const firstContentId = insertTestContentItem(handle.db, {
      title: "Stable content",
      canonicalUrl: "https://example.com/stable-content"
    });
    const secondContentId = insertTestContentItem(handle.db, {
      title: "Broken content",
      canonicalUrl: "https://example.com/broken-content"
    });
    saveNlRuleSet(handle.db, "base", {
      enabled: true,
      ruleText: "保留稳定内容。"
    });

    const result = await runNlEvaluationCycle(
      handle.db,
      {
        mode: "full-recompute"
      },
      {
        resolveProvider: async () => ({
          ok: true,
          provider: {
            providerKind: "kimi",
            modelName: "kimi-k2.5",
            evaluateContent: async ({ content }) => {
              if (content.title === "Broken content") {
                throw new Error("provider timeout");
              }

              return {
                evaluations: [
                  {
                    scope: "base" as const,
                    decision: "boost" as const,
                    strengthLevel: "low" as const,
                    matchedKeywords: ["稳定"],
                    reason: "主规则命中"
                  },
                  {
                    scope: "ai_hot" as const,
                    decision: "neutral" as const,
                    strengthLevel: null,
                    matchedKeywords: [],
                    reason: null
                  },
                  {
                    scope: "ai_new" as const,
                    decision: "neutral" as const,
                    strengthLevel: null,
                    matchedKeywords: [],
                    reason: null
                  }
                ]
              };
            }
          }
        }),
        now: () => new Date("2026-03-31T11:00:00.000Z")
      }
    );

    expect(result).toEqual({
      runId: expect.any(Number),
      status: "completed",
      itemCount: 2,
      successCount: 1,
      failureCount: 1
    });
    expect(listNlEvaluationsForContent(handle.db, firstContentId)).toHaveLength(3);
    expect(listNlEvaluationsForContent(handle.db, secondContentId)).toEqual([]);
    expect(listNlEvaluationRuns(handle.db)[0]?.notes).toContain("provider timeout");
  });
});
