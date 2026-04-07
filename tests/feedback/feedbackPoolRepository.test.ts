import { afterEach, describe, expect, it } from "vitest";
import {
  clearFeedbackPool,
  deleteFeedbackPoolEntry,
  listFeedbackPoolEntries,
  saveFeedbackPoolEntry
} from "../../src/core/feedback/feedbackPoolRepository.js";
import { createTestDatabase, insertTestContentItem, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("feedbackPoolRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("upserts one feedback row per content item and keeps the latest payload", async () => {
    const handle = await createTestDatabase("hot-now-feedback-pool-");
    handles.push(handle);

    const contentItemId = insertTestContentItem(handle.db, {
      sourceKind: "openai",
      title: "Agent workflow report",
      canonicalUrl: "https://example.com/agent-workflow-report"
    });

    const firstSave = saveFeedbackPoolEntry(handle.db, {
      contentItemId,
      freeText: "保留 agent 工作流方向",
      suggestedEffect: "boost",
      strengthLevel: "high",
      positiveKeywords: ["agent", "workflow"],
      negativeKeywords: ["融资"]
    });
    const secondSave = saveFeedbackPoolEntry(handle.db, {
      contentItemId,
      freeText: "这类融资快讯先别展示",
      suggestedEffect: "block",
      strengthLevel: "medium",
      positiveKeywords: ["agent"],
      negativeKeywords: ["融资", "快讯"]
    });

    expect(firstSave).toEqual({
      ok: true,
      entryId: expect.any(Number)
    });
    expect(secondSave).toEqual({
      ok: true,
      entryId: firstSave.ok ? firstSave.entryId : -1
    });

    expect(listFeedbackPoolEntries(handle.db)).toEqual([
      {
        id: firstSave.ok ? firstSave.entryId : -1,
        contentItemId,
        contentTitle: "Agent workflow report",
        canonicalUrl: "https://example.com/agent-workflow-report",
        sourceName: "OpenAI",
        freeText: "这类融资快讯先别展示",
        suggestedEffect: "block",
        strengthLevel: "medium",
        positiveKeywords: ["agent"],
        negativeKeywords: ["融资", "快讯"],
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      }
    ]);
  });

  it("returns not-found when feedback points at a missing content item", async () => {
    const handle = await createTestDatabase("hot-now-feedback-pool-");
    handles.push(handle);

    const result = saveFeedbackPoolEntry(handle.db, {
      contentItemId: 999_999,
      freeText: "missing target"
    });

    expect(result).toEqual({
      ok: false,
      reason: "not-found"
    });
  });

  it("deletes single feedback rows and clears the remaining pool", async () => {
    const handle = await createTestDatabase("hot-now-feedback-pool-");
    handles.push(handle);

    const firstContentId = insertTestContentItem(handle.db, {
      title: "First pending feedback",
      canonicalUrl: "https://example.com/feedback-1"
    });
    const secondContentId = insertTestContentItem(handle.db, {
      title: "Second pending feedback",
      canonicalUrl: "https://example.com/feedback-2"
    });

    const firstSave = saveFeedbackPoolEntry(handle.db, {
      contentItemId: firstContentId,
      freeText: "first"
    });
    saveFeedbackPoolEntry(handle.db, {
      contentItemId: secondContentId,
      freeText: "second"
    });

    expect(deleteFeedbackPoolEntry(handle.db, firstSave.ok ? firstSave.entryId : -1)).toBe(true);
    expect(clearFeedbackPool(handle.db)).toBe(1);
    expect(listFeedbackPoolEntries(handle.db)).toEqual([]);
  });
});
