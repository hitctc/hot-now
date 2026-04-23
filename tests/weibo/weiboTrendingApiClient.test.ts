import { describe, expect, it, vi } from "vitest";
import { fetchWeiboTrending } from "../../src/core/weibo/weiboTrendingApiClient.js";

describe("weiboTrendingApiClient", () => {
  it("requests weibo hot search with browser-like headers and normalizes realtime topics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: 1,
          data: {
            realtime: [
              {
                note: "OpenAI 发布 GPT 新模型",
                word_scheme: "#OpenAI 发布 GPT 新模型#",
                realpos: 3,
                num: 123456,
                small_icon_desc: "新"
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await fetchWeiboTrending({ fetch: fetchMock });

    expect(result).toMatchObject({
      ok: true,
      topics: [
        {
          title: "OpenAI 发布 GPT 新模型",
          rank: 3,
          hotValue: 123456,
          label: "新",
          wordScheme: "#OpenAI 发布 GPT 新模型#"
        }
      ]
    });
    expect((result.ok && result.topics[0]?.url) || "").toContain("https://s.weibo.com/weibo?q=");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://weibo.com/ajax/side/hotSearch",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: "application/json",
          referer: "https://weibo.com/"
        })
      })
    );
  });

  it("returns a readable error when payload shape is invalid or response fails", async () => {
    const invalidPayloadFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: 1, data: { list: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(fetchWeiboTrending({ fetch: invalidPayloadFetch })).resolves.toEqual({
      ok: false,
      reason: "Weibo trending returned invalid payload"
    });

    const failedFetch = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));

    await expect(fetchWeiboTrending({ fetch: failedFetch })).resolves.toEqual({
      ok: false,
      reason: "Weibo trending failed with 503"
    });
  });
});
