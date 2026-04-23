import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import {
  createHackerNewsQuery,
  deleteHackerNewsQuery,
  listHackerNewsQueries,
  markHackerNewsQueryFetchResult,
  toggleHackerNewsQuery,
  updateHackerNewsQuery
} from "../../src/core/hackernews/hackerNewsQueryRepository.js";

describe("hackerNewsQueryRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("creates normalized queries with defaults and stable listing order", async () => {
    const handle = await createTestDatabase("hot-now-hn-query-create-");
    handles.push(handle);

    const company = createHackerNewsQuery(handle.db, {
      query: "  OpenAI  ",
      notes: "重点厂商"
    });
    const topic = createHackerNewsQuery(handle.db, {
      query: "AI agents",
      priority: 85,
      isEnabled: false
    });

    expect(company.ok).toBe(true);
    expect(topic.ok).toBe(true);
    expect(company.ok ? company.query : null).toMatchObject({
      query: "OpenAI",
      priority: 60,
      isEnabled: true,
      notes: "重点厂商"
    });
    expect(topic.ok ? topic.query : null).toMatchObject({
      query: "AI agents",
      priority: 85,
      isEnabled: false,
      notes: null
    });

    expect(listHackerNewsQueries(handle.db).map((item) => item.query)).toEqual(["AI agents", "OpenAI"]);
  });

  it("rejects invalid and duplicate query inputs", async () => {
    const handle = await createTestDatabase("hot-now-hn-query-invalid-");
    handles.push(handle);

    expect(createHackerNewsQuery(handle.db, { query: "" })).toEqual({ ok: false, reason: "invalid-query" });
    expect(createHackerNewsQuery(handle.db, { query: "   " })).toEqual({ ok: false, reason: "invalid-query" });
    expect(createHackerNewsQuery(handle.db, { query: "OpenAI", priority: 101 })).toEqual({
      ok: false,
      reason: "invalid-priority"
    });

    expect(createHackerNewsQuery(handle.db, { query: "OpenAI" }).ok).toBe(true);
    expect(createHackerNewsQuery(handle.db, { query: "openai" })).toEqual({
      ok: false,
      reason: "duplicate-query"
    });
  });

  it("updates, toggles and deletes query config without wiping prior fetch status", async () => {
    const handle = await createTestDatabase("hot-now-hn-query-update-");
    handles.push(handle);
    const created = createHackerNewsQuery(handle.db, { query: "OpenAI" });
    const queryId = created.ok ? created.query.id : 0;

    markHackerNewsQueryFetchResult(handle.db, {
      id: queryId,
      success: false,
      fetchedAt: "2026-04-23T08:00:00.000Z",
      error: "rate limited"
    });

    const updated = updateHackerNewsQuery(handle.db, {
      id: queryId,
      query: "AI agents",
      priority: 88,
      isEnabled: true,
      notes: "搜索补漏"
    });

    expect(updated.ok ? updated.query : null).toMatchObject({
      id: queryId,
      query: "AI agents",
      priority: 88,
      isEnabled: true,
      notes: "搜索补漏",
      lastFetchedAt: "2026-04-23T08:00:00.000Z",
      lastResult: "rate limited"
    });

    const toggled = toggleHackerNewsQuery(handle.db, queryId, false);
    expect(toggled.ok ? toggled.query.isEnabled : null).toBe(false);

    expect(deleteHackerNewsQuery(handle.db, queryId)).toEqual({ ok: true, id: queryId });
    expect(deleteHackerNewsQuery(handle.db, queryId)).toEqual({ ok: false, reason: "not-found" });
  });

  it("records successful and failed fetch summaries per query", async () => {
    const handle = await createTestDatabase("hot-now-hn-query-fetch-status-");
    handles.push(handle);
    const created = createHackerNewsQuery(handle.db, { query: "Anthropic" });
    const queryId = created.ok ? created.query.id : 0;

    const success = markHackerNewsQueryFetchResult(handle.db, {
      id: queryId,
      success: true,
      fetchedAt: "2026-04-23T09:00:00.000Z",
      message: "本次搜索成功，获得 2 条候选内容。"
    });

    expect(success.ok ? success.query : null).toMatchObject({
      lastFetchedAt: "2026-04-23T09:00:00.000Z",
      lastSuccessAt: "2026-04-23T09:00:00.000Z",
      lastResult: "本次搜索成功，获得 2 条候选内容。"
    });

    const failed = markHackerNewsQueryFetchResult(handle.db, {
      id: queryId,
      success: false,
      fetchedAt: "2026-04-23T10:00:00.000Z",
      error: "x".repeat(520)
    });

    expect(failed.ok ? failed.query : null).toMatchObject({
      lastFetchedAt: "2026-04-23T10:00:00.000Z",
      lastSuccessAt: "2026-04-23T09:00:00.000Z"
    });
    expect(failed.ok ? failed.query.lastResult?.length : 0).toBe(500);
  });
});
