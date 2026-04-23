import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { collectHackerNewsIssues } from "../../src/core/hackernews/hackerNewsCollector.js";
import { createHackerNewsQuery } from "../../src/core/hackernews/hackerNewsQueryRepository.js";

describe("hackerNewsCollector", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns no issues when there are no enabled HN queries", async () => {
    const handle = await createTestDatabase("hot-now-hn-collector-empty-");
    handles.push(handle);

    await expect(collectHackerNewsIssues(handle.db)).resolves.toMatchObject({
      length: 0,
      failures: []
    });
  });

  it("collects at most the first five enabled queries, persists fetch status, and falls back to HN item urls", async () => {
    const handle = await createTestDatabase("hot-now-hn-collector-");
    handles.push(handle);

    const names = ["OpenAI", "Anthropic", "Cursor", "AI agents", "LLM evals", "MCP"];
    names.forEach((name, index) => {
      createHackerNewsQuery(handle.db, {
        query: name,
        priority: 100 - index
      });
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const requestUrl = input instanceof URL ? input : new URL(input);
      const query = requestUrl.searchParams.get("query");

      if (query === "LLM evals") {
        return new Response(JSON.stringify({ hits: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          hits: [
            {
              objectID: `hn-${query}`,
              title: `${query} launch`,
              author: "pg",
              points: 88,
              num_comments: 21,
              created_at: "2026-04-22T08:00:00.000Z"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const issues = await collectHackerNewsIssues(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T08:30:00.000Z")
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.map((call) => ((call[0] as URL).searchParams.get("query")))).toEqual([
      "OpenAI",
      "Anthropic",
      "Cursor",
      "AI agents",
      "LLM evals"
    ]);
    expect(issues.failures).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      date: "2026-04-23",
      issueUrl: "https://hn.algolia.com/",
      sourceKind: "hackernews_search",
      sourceType: "aggregator",
      sourcePriority: 82
    });
    expect(issues[0].items).toHaveLength(4);
    expect(issues[0].items[0]).toMatchObject({
      rank: 1,
      category: "developer_community",
      title: "OpenAI launch",
      sourceUrl: "https://news.ycombinator.com/item?id=hn-OpenAI",
      sourceName: "Hacker News / OpenAI",
      externalId: "hackernews:hn-OpenAI",
      publishedAt: "2026-04-22T08:00:00.000Z"
    });
    expect(JSON.parse(issues[0].items[0].metadataJson ?? "{}")).toMatchObject({
      collector: {
        kind: "hackernews_search",
        query: "OpenAI",
        priority: 100
      },
      author: "pg",
      points: 88,
      numComments: 21,
      hnObjectId: "hn-OpenAI",
      matchedQueries: ["OpenAI"]
    });
    expect(
      handle.db
        .prepare("SELECT last_fetched_at, last_success_at, last_result FROM hackernews_queries WHERE query = ?")
        .get("OpenAI")
    ).toEqual({
      last_fetched_at: "2026-04-23T08:30:00.000Z",
      last_success_at: "2026-04-23T08:30:00.000Z",
      last_result: "本次搜索成功，获得 1 条候选内容。"
    });
    expect(
      handle.db
        .prepare("SELECT last_result FROM hackernews_queries WHERE query = ?")
        .get("LLM evals")
    ).toEqual({
      last_result: "本次搜索成功，但没有获得可入库候选内容。"
    });
    expect(
      handle.db
        .prepare("SELECT last_fetched_at FROM hackernews_queries WHERE query = ?")
        .get("MCP")
    ).toEqual({
      last_fetched_at: null
    });
  });

  it("records per-query failures and keeps successful queries moving", async () => {
    const handle = await createTestDatabase("hot-now-hn-collector-failure-");
    handles.push(handle);
    createHackerNewsQuery(handle.db, { query: "OpenAI", priority: 90 });
    createHackerNewsQuery(handle.db, { query: "Anthropic", priority: 80 });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const query = (input as URL).searchParams.get("query");

      if (query === "OpenAI") {
        return new Response("busy", { status: 503 });
      }

      return new Response(
        JSON.stringify({
          hits: [
            {
              objectID: "hn-anthropic",
              title: "Anthropic ships",
              url: "https://example.com/anthropic"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const issues = await collectHackerNewsIssues(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T08:30:00.000Z")
    });

    expect(issues.failures).toEqual([
      {
        kind: "hackernews_search",
        reason: "OpenAI: Hacker News search failed with 503"
      }
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].items).toHaveLength(1);
    expect(
      handle.db
        .prepare("SELECT last_fetched_at, last_success_at, last_result FROM hackernews_queries WHERE query = ?")
        .get("OpenAI")
    ).toEqual({
      last_fetched_at: "2026-04-23T08:30:00.000Z",
      last_success_at: null,
      last_result: "Hacker News search failed with 503"
    });
    expect(
      handle.db
        .prepare("SELECT last_success_at FROM hackernews_queries WHERE query = ?")
        .get("Anthropic")
    ).toEqual({
      last_success_at: "2026-04-23T08:30:00.000Z"
    });
  });
});
