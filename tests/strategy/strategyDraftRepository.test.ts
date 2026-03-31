import { afterEach, describe, expect, it } from "vitest";
import { saveFeedbackPoolEntry } from "../../src/core/feedback/feedbackPoolRepository.js";
import {
  createStrategyDraft,
  deleteStrategyDraft,
  listStrategyDrafts,
  updateStrategyDraft
} from "../../src/core/strategy/strategyDraftRepository.js";
import { createTestDatabase, insertTestContentItem, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("strategyDraftRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("creates drafts and updates editable fields in place", async () => {
    const handle = await createTestDatabase("hot-now-strategy-draft-");
    handles.push(handle);

    const contentItemId = insertTestContentItem(handle.db, {
      title: "Feedback-backed content",
      canonicalUrl: "https://example.com/feedback-backed-content"
    });
    const feedbackSave = saveFeedbackPoolEntry(handle.db, {
      contentItemId,
      freeText: "把这条反馈转成草稿"
    });

    if (!feedbackSave.ok) {
      throw new Error("expected feedback seed to succeed");
    }

    const draftId = createStrategyDraft(handle.db, {
      sourceFeedbackId: feedbackSave.entryId,
      draftText: "优先保留 agent workflow 和模型工程拆解",
      suggestedScope: "unspecified",
      draftEffectSummary: "偏向加分",
      positiveKeywords: ["agent", "workflow"],
      negativeKeywords: ["融资"]
    });
    const updateResult = updateStrategyDraft(handle.db, {
      id: draftId,
      sourceFeedbackId: feedbackSave.entryId,
      draftText: "AI 页优先保留 agent workflow 和模型工程拆解",
      suggestedScope: "ai",
      draftEffectSummary: "AI 页高优先",
      positiveKeywords: ["agent", "workflow", "model"],
      negativeKeywords: ["融资", "快讯"]
    });

    expect(updateResult).toEqual({ ok: true });
    expect(listStrategyDrafts(handle.db)).toEqual([
      {
        id: draftId,
        sourceFeedbackId: feedbackSave.entryId,
        draftText: "AI 页优先保留 agent workflow 和模型工程拆解",
        suggestedScope: "ai",
        draftEffectSummary: "AI 页高优先",
        positiveKeywords: ["agent", "workflow", "model"],
        negativeKeywords: ["融资", "快讯"],
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      }
    ]);
  });

  it("returns not-found when updating a missing draft", async () => {
    const handle = await createTestDatabase("hot-now-strategy-draft-");
    handles.push(handle);

    const result = updateStrategyDraft(handle.db, {
      id: 999_999,
      draftText: "missing",
      suggestedScope: "global"
    });

    expect(result).toEqual({
      ok: false,
      reason: "not-found"
    });
  });

  it("lists newer drafts first and deletes rows by id", async () => {
    const handle = await createTestDatabase("hot-now-strategy-draft-");
    handles.push(handle);

    const firstId = createStrategyDraft(handle.db, {
      draftText: "first draft",
      suggestedScope: "hot"
    });
    const secondId = createStrategyDraft(handle.db, {
      draftText: "second draft",
      suggestedScope: "articles"
    });

    expect(listStrategyDrafts(handle.db).map((draft) => draft.id)).toEqual([secondId, firstId]);
    expect(deleteStrategyDraft(handle.db, secondId)).toBe(true);
    expect(listStrategyDrafts(handle.db).map((draft) => draft.id)).toEqual([firstId]);
  });
});
