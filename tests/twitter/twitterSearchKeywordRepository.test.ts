import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import {
  createTwitterSearchKeyword,
  deleteTwitterSearchKeyword,
  listTwitterSearchKeywords,
  markTwitterSearchKeywordFetchResult,
  toggleTwitterSearchKeywordCollect,
  toggleTwitterSearchKeywordVisible,
  updateTwitterSearchKeyword
} from "../../src/core/twitter/twitterSearchKeywordRepository.js";

describe("twitterSearchKeywordRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("creates normalized keywords with defaults and stable listing order", async () => {
    const handle = await createTestDatabase("hot-now-twitter-keywords-");
    handles.push(handle);

    const vendor = createTwitterSearchKeyword(handle.db, {
      keyword: "  OpenAI  ",
      category: "official_vendor",
      notes: "重点厂商"
    });
    const topic = createTwitterSearchKeyword(handle.db, {
      keyword: "AI Agent",
      priority: 85,
      isCollectEnabled: false
    });

    expect(vendor.ok).toBe(true);
    expect(topic.ok).toBe(true);
    expect(vendor.ok ? vendor.keyword : null).toMatchObject({
      keyword: "OpenAI",
      category: "official_vendor",
      priority: 60,
      isCollectEnabled: true,
      isVisible: true,
      notes: "重点厂商"
    });
    expect(topic.ok ? topic.keyword : null).toMatchObject({
      keyword: "AI Agent",
      category: "topic",
      priority: 85,
      isCollectEnabled: false,
      isVisible: true
    });

    expect(listTwitterSearchKeywords(handle.db).map((keyword) => keyword.keyword)).toEqual(["AI Agent", "OpenAI"]);
  });

  it("rejects invalid and duplicate keyword inputs", async () => {
    const handle = await createTestDatabase("hot-now-twitter-keyword-invalid-");
    handles.push(handle);

    expect(createTwitterSearchKeyword(handle.db, { keyword: "" })).toEqual({ ok: false, reason: "invalid-keyword" });
    expect(createTwitterSearchKeyword(handle.db, { keyword: "   " })).toEqual({ ok: false, reason: "invalid-keyword" });
    expect(createTwitterSearchKeyword(handle.db, { keyword: "OpenAI", category: "unknown" })).toEqual({
      ok: false,
      reason: "invalid-category"
    });
    expect(createTwitterSearchKeyword(handle.db, { keyword: "OpenAI", priority: 101 })).toEqual({
      ok: false,
      reason: "invalid-priority"
    });

    expect(createTwitterSearchKeyword(handle.db, { keyword: "OpenAI" }).ok).toBe(true);
    expect(createTwitterSearchKeyword(handle.db, { keyword: "openai" })).toEqual({
      ok: false,
      reason: "duplicate-keyword"
    });
  });

  it("updates, toggles and deletes keyword configuration without wiping prior fetch status", async () => {
    const handle = await createTestDatabase("hot-now-twitter-keyword-update-");
    handles.push(handle);
    const created = createTwitterSearchKeyword(handle.db, {
      keyword: "OpenAI",
      category: "official_vendor"
    });
    const keywordId = created.ok ? created.keyword.id : 0;

    markTwitterSearchKeywordFetchResult(handle.db, {
      id: keywordId,
      success: false,
      fetchedAt: "2026-04-23T08:00:00.000Z",
      error: "rate limited"
    });

    const updated = updateTwitterSearchKeyword(handle.db, {
      id: keywordId,
      keyword: "OpenAI Search",
      category: "topic",
      priority: 88,
      isCollectEnabled: true,
      isVisible: true,
      notes: "搜索补漏"
    });

    expect(updated.ok ? updated.keyword : null).toMatchObject({
      id: keywordId,
      keyword: "OpenAI Search",
      category: "topic",
      priority: 88,
      isCollectEnabled: true,
      isVisible: true,
      notes: "搜索补漏",
      lastFetchedAt: "2026-04-23T08:00:00.000Z",
      lastResult: "rate limited"
    });

    const toggledCollect = toggleTwitterSearchKeywordCollect(handle.db, keywordId, false);
    expect(toggledCollect.ok ? toggledCollect.keyword.isCollectEnabled : null).toBe(false);

    const toggledVisible = toggleTwitterSearchKeywordVisible(handle.db, keywordId, false);
    expect(toggledVisible.ok ? toggledVisible.keyword.isVisible : null).toBe(false);

    expect(deleteTwitterSearchKeyword(handle.db, keywordId)).toEqual({ ok: true, id: keywordId });
    expect(deleteTwitterSearchKeyword(handle.db, keywordId)).toEqual({ ok: false, reason: "not-found" });
  });

  it("records successful and failed fetch summaries per keyword", async () => {
    const handle = await createTestDatabase("hot-now-twitter-keyword-fetch-status-");
    handles.push(handle);
    const created = createTwitterSearchKeyword(handle.db, { keyword: "Sam Altman", category: "person" });
    const keywordId = created.ok ? created.keyword.id : 0;

    const success = markTwitterSearchKeywordFetchResult(handle.db, {
      id: keywordId,
      success: true,
      fetchedAt: "2026-04-23T09:00:00.000Z",
      message: "本次抓取成功，获得 2 条可入库推文。"
    });

    expect(success.ok ? success.keyword : null).toMatchObject({
      lastFetchedAt: "2026-04-23T09:00:00.000Z",
      lastSuccessAt: "2026-04-23T09:00:00.000Z",
      lastResult: "本次抓取成功，获得 2 条可入库推文。"
    });

    const failed = markTwitterSearchKeywordFetchResult(handle.db, {
      id: keywordId,
      success: false,
      fetchedAt: "2026-04-23T10:00:00.000Z",
      error: "x".repeat(520)
    });

    expect(failed.ok ? failed.keyword : null).toMatchObject({
      lastFetchedAt: "2026-04-23T10:00:00.000Z",
      lastSuccessAt: "2026-04-23T09:00:00.000Z"
    });
    expect(failed.ok ? failed.keyword.lastResult?.length : 0).toBe(500);
  });
});
