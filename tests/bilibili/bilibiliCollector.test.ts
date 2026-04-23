import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { collectBilibiliIssues } from "../../src/core/bilibili/bilibiliCollector.js";
import { createBilibiliQuery } from "../../src/core/bilibili/bilibiliQueryRepository.js";

describe("bilibiliCollector", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns no issues when there are no enabled bilibili queries", async () => {
    const handle = await createTestDatabase("hot-now-bili-collector-empty-");
    handles.push(handle);

    await expect(collectBilibiliIssues(handle.db)).resolves.toMatchObject({
      length: 0,
      failures: []
    });
  });

  it("collects at most the first five enabled queries and persists per-query fetch status", async () => {
    const handle = await createTestDatabase("hot-now-bili-collector-");
    handles.push(handle);

    const names = ["OpenAI", "Anthropic", "Cursor", "AI agents", "LLM evals", "MCP"];
    names.forEach((name, index) => {
      createBilibiliQuery(handle.db, {
        query: name,
        priority: 100 - index
      });
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const requestUrl = input instanceof URL ? input : new URL(input);
      const query = requestUrl.searchParams.get("keyword");

      if (query === "LLM evals") {
        return new Response(JSON.stringify({ code: 0, data: { result: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            result: [
              {
                bvid: `BV-${query}`,
                title: `<em class="keyword">${query}</em> 解读`,
                author: "AI Daily",
                mid: 7788,
                pubdate: 1776835200,
                play: 1234,
                like: 88,
                review: 21,
                video_review: 233
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const issues = await collectBilibiliIssues(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T08:30:00.000Z")
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.map((call) => ((call[0] as URL).searchParams.get("keyword")))).toEqual([
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
      issueUrl: "https://search.bilibili.com/",
      sourceKind: "bilibili_search",
      sourceType: "aggregator",
      sourcePriority: 78
    });
    expect(issues[0].items).toHaveLength(4);
    expect(issues[0].items[0]).toMatchObject({
      rank: 1,
      category: "video_platform",
      title: "OpenAI 解读",
      sourceUrl: "https://www.bilibili.com/video/BV-OpenAI",
      sourceName: "B 站 / OpenAI",
      externalId: "bilibili:BV-OpenAI"
    });
    expect(JSON.parse(issues[0].items[0].metadataJson ?? "{}")).toMatchObject({
      collector: {
        kind: "bilibili_search",
        query: "OpenAI",
        priority: 100
      },
      author: "AI Daily",
      bvid: "BV-OpenAI",
      like: 88,
      comment: 21,
      danmaku: 233,
      matchedQueries: ["OpenAI"]
    });
    expect(
      handle.db.prepare("SELECT last_fetched_at, last_success_at, last_result FROM bilibili_queries WHERE query = ?").get("OpenAI")
    ).toEqual({
      last_fetched_at: "2026-04-23T08:30:00.000Z",
      last_success_at: "2026-04-23T08:30:00.000Z",
      last_result: "本次搜索成功，获得 1 条候选视频。"
    });
    expect(handle.db.prepare("SELECT last_result FROM bilibili_queries WHERE query = ?").get("LLM evals")).toEqual({
      last_result: "本次搜索成功，但没有获得可入库候选视频。"
    });
    expect(handle.db.prepare("SELECT last_fetched_at FROM bilibili_queries WHERE query = ?").get("MCP")).toEqual({
      last_fetched_at: null
    });
  });

  it("records per-query failures and keeps successful queries moving", async () => {
    const handle = await createTestDatabase("hot-now-bili-collector-failure-");
    handles.push(handle);
    createBilibiliQuery(handle.db, { query: "OpenAI", priority: 90 });
    createBilibiliQuery(handle.db, { query: "Anthropic", priority: 80 });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const query = (input as URL).searchParams.get("keyword");

      if (query === "OpenAI") {
        return new Response("busy", { status: 503 });
      }

      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            result: [{ bvid: "BV-anthropic", title: "Anthropic ships", author: "AI Daily" }]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const issues = await collectBilibiliIssues(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T08:30:00.000Z")
    });

    expect(issues.failures).toEqual([
      {
        kind: "bilibili_search",
        reason: "OpenAI: Bilibili search failed with 503"
      }
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].items).toHaveLength(1);
    expect(
      handle.db.prepare("SELECT last_fetched_at, last_success_at, last_result FROM bilibili_queries WHERE query = ?").get("OpenAI")
    ).toEqual({
      last_fetched_at: "2026-04-23T08:30:00.000Z",
      last_success_at: null,
      last_result: "Bilibili search failed with 503"
    });
    expect(handle.db.prepare("SELECT last_success_at FROM bilibili_queries WHERE query = ?").get("Anthropic")).toEqual({
      last_success_at: "2026-04-23T08:30:00.000Z"
    });
  });
});
