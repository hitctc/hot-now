import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import {
  collectWeiboTrendingIssues,
  fixedWeiboTrendingKeywords
} from "../../src/core/weibo/weiboTrendingCollector.js";

describe("weiboTrendingCollector", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("filters the trending list by fixed AI keywords and only returns matched topics", async () => {
    const handle = await createTestDatabase("hot-now-weibo-collector-");
    handles.push(handle);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: 1,
          data: {
            realtime: [
              {
                note: "OpenAI 发布 GPT 新模型",
                word_scheme: "#OpenAI 发布 GPT 新模型#",
                realpos: 2,
                num: 1234
              },
              {
                note: "华谊兄弟被申请破产重整",
                word_scheme: "#华谊兄弟被申请破产重整#",
                realpos: 3,
                num: 999
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const issues = await collectWeiboTrendingIssues(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T10:00:00.000Z")
    });

    expect(fixedWeiboTrendingKeywords).toContain("OpenAI");
    expect(issues.failures).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      date: "2026-04-23",
      issueUrl: "https://s.weibo.com/top/summary",
      sourceKind: "weibo_trending",
      sourceType: "aggregator"
    });
    expect(issues[0].items).toHaveLength(1);
    expect(issues[0].items[0]).toMatchObject({
      title: "OpenAI 发布 GPT 新模型",
      sourceName: "微博热搜榜",
      externalId: expect.stringContaining("weibo:trending:")
    });
    expect(JSON.parse(issues[0].items[0].metadataJson ?? "{}")).toMatchObject({
      collector: {
        kind: "weibo_trending"
      },
      matchedKeywords: expect.arrayContaining(["OpenAI"]),
      rank: 2,
      hotValue: 1234
    });
  });

  it("returns a failure when the upstream list cannot be loaded", async () => {
    const handle = await createTestDatabase("hot-now-weibo-collector-failed-");
    handles.push(handle);

    const fetchMock = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    const issues = await collectWeiboTrendingIssues(handle.db, { fetch: fetchMock });

    expect(issues).toHaveLength(0);
    expect(issues.failures).toEqual([
      {
        kind: "weibo_trending",
        reason: "Weibo trending failed with 503"
      }
    ]);
  });
});
