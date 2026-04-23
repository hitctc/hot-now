import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import {
  readWeiboTrendingRunState,
  runWeiboTrendingCollection
} from "../../src/core/weibo/runWeiboTrendingCollection.js";

describe("runWeiboTrendingCollection", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("persists matched trending topics and exposes the latest run state", async () => {
    const handle = await createTestDatabase("hot-now-weibo-run-");
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
                note: "机器人公司完成新融资",
                word_scheme: "#机器人公司完成新融资#",
                realpos: 6,
                num: 888
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await runWeiboTrendingCollection(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T10:00:00.000Z")
    });

    expect(result).toEqual({
      accepted: true,
      action: "collect-weibo-trending",
      fetchedTopicCount: 2,
      matchedTopicCount: 2,
      persistedContentItemCount: 2,
      reusedContentItemCount: 0,
      failureCount: 0
    });

    const contentRows = handle.db
      .prepare(
        `
          SELECT cs.kind AS source_kind, ci.external_id, ci.title
          FROM content_items ci
          JOIN content_sources cs ON cs.id = ci.source_id
          WHERE cs.kind = 'weibo_trending'
          ORDER BY ci.id ASC
        `
      )
      .all() as Array<{ source_kind: string; external_id: string; title: string }>;

    expect(contentRows).toEqual([
      {
        source_kind: "weibo_trending",
        external_id: expect.stringContaining("weibo:trending:"),
        title: "OpenAI 发布 GPT 新模型"
      },
      {
        source_kind: "weibo_trending",
        external_id: expect.stringContaining("weibo:trending:"),
        title: "机器人公司完成新融资"
      }
    ]);

    const state = readWeiboTrendingRunState(handle.db);

    expect(state).toMatchObject({
      lastFetchedAt: "2026-04-23T10:00:00.000Z",
      lastSuccessAt: expect.any(String),
      lastResult: "本次匹配成功，命中 2 个微博热搜话题。"
    });
    expect(state.fixedKeywords.length).toBeGreaterThan(0);
  });

  it("reuses existing trending items on repeated matches", async () => {
    const handle = await createTestDatabase("hot-now-weibo-run-reuse-");
    handles.push(handle);

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
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
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    await runWeiboTrendingCollection(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T10:00:00.000Z")
    });
    const result = await runWeiboTrendingCollection(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T11:00:00.000Z")
    });

    expect(result).toMatchObject({
      persistedContentItemCount: 0,
      reusedContentItemCount: 1
    });
  });

  it("records upstream failures into the latest run state", async () => {
    const handle = await createTestDatabase("hot-now-weibo-run-failed-");
    handles.push(handle);

    const fetchMock = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    const result = await runWeiboTrendingCollection(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T10:00:00.000Z")
    });

    expect(result).toMatchObject({
      accepted: true,
      matchedTopicCount: 0,
      failureCount: 1
    });
    expect(readWeiboTrendingRunState(handle.db)).toMatchObject({
      lastResult: "本次匹配成功，但没有命中 AI 相关微博热搜。"
    });
  });
});
