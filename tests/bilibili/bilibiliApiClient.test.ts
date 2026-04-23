import { describe, expect, it, vi } from "vitest";
import { searchBilibiliVideos } from "../../src/core/bilibili/bilibiliApiClient.js";

describe("bilibiliApiClient", () => {
  it("requests bilibili search with video mode, pubdate sort and expected page size", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            result: [
              {
                bvid: "BV1xx411c7mD",
                title: "<em class=\"keyword\">OpenAI</em> 发布会解读",
                arcurl: "https://www.bilibili.com/video/BV1xx411c7mD",
                author: "AI Daily",
                mid: 7788,
                description: "一期讲清楚 OpenAI 新动作",
                pubdate: 1776854400,
                play: "1.2万",
                like: 345,
                review: 12,
                video_review: 678,
                favorites: 90
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await searchBilibiliVideos({
      query: "OpenAI",
      fetch: fetchMock
    });

    expect(result).toMatchObject({
      ok: true,
      hits: [
        {
          bvid: "BV1xx411c7mD",
          title: "OpenAI 发布会解读",
          url: "https://www.bilibili.com/video/BV1xx411c7mD",
          author: "AI Daily",
          mid: "7788",
          description: "一期讲清楚 OpenAI 新动作",
          publishedAt: "2026-04-22T10:40:00.000Z",
          likeCount: 345,
          commentCount: 12,
          danmakuCount: 678,
          favoriteCount: 90
        }
      ]
    });

    const requestUrl = fetchMock.mock.calls[0]?.[0];
    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).origin + (requestUrl as URL).pathname).toBe(
      "https://api.bilibili.com/x/web-interface/search/type"
    );
    expect((requestUrl as URL).searchParams.get("keyword")).toBe("OpenAI");
    expect((requestUrl as URL).searchParams.get("search_type")).toBe("video");
    expect((requestUrl as URL).searchParams.get("order")).toBe("pubdate");
    expect((requestUrl as URL).searchParams.get("page")).toBe("1");
    expect((requestUrl as URL).searchParams.get("page_size")).toBe("10");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        referer: "https://search.bilibili.com/"
      })
    });
  });

  it("filters invalid hits and returns clear errors for invalid payloads or failed responses", async () => {
    const invalidPayloadFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { items: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(
      searchBilibiliVideos({
        query: "AI agents",
        fetch: invalidPayloadFetch
      })
    ).resolves.toEqual({
      ok: false,
      reason: "Bilibili search returned invalid payload"
    });

    const failedFetch = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(
      searchBilibiliVideos({
        query: "AI agents",
        fetch: failedFetch
      })
    ).resolves.toEqual({
      ok: false,
      reason: "Bilibili search failed with 503"
    });
  });
});
