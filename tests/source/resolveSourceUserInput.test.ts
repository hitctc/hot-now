import { describe, expect, it, vi } from "vitest";

import { resolveSourceUserInput } from "../../src/core/source/resolveSourceUserInput.js";

describe("resolveSourceUserInput", () => {
  it("resolves simplified rss input into normalized source fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0"?>
         <rss version="2.0">
           <channel>
             <title>Example Feed</title>
             <link>https://example.com/</link>
           </channel>
         </rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } }
      )
    );

    await expect(
      resolveSourceUserInput(
        {
          mode: "create",
          sourceType: "rss",
          rssUrl: "https://example.com/feed.xml"
        },
        { fetch: fetchMock, wechatBridge: null }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        mode: "create",
        sourceType: "rss",
        kind: "example_feed",
        name: "Example Feed",
        siteUrl: "https://example.com/",
        rssUrl: "https://example.com/feed.xml",
        bridgeKind: null,
        bridgeConfigJson: null
      })
    );
  });

  it("resolves simplified wechat input from article url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ err: "", data: "https://bridge.example.test/feed/123.xml" }), {
        status: 200
      })
    );

    await expect(
      resolveSourceUserInput(
        {
          mode: "create",
          sourceType: "wechat_bridge",
          wechatName: "数字生命卡兹克",
          articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
        },
        {
          fetch: fetchMock,
          wechatBridge: { baseUrl: "https://bridge.example.test", token: "secret-token" }
        }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        mode: "create",
        sourceType: "wechat_bridge",
        kind: expect.stringMatching(/^wechat_[a-z0-9_]+$/),
        name: "数字生命卡兹克",
        siteUrl: "https://mp.weixin.qq.com/",
        rssUrl: "https://bridge.example.test/feed/123.xml",
        bridgeKind: "wechat2rss"
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.test/addurl?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%3F__biz%3Dabc&k=secret-token"
    );
  });

  it("resolves simplified wechat input from name lookup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          err: "",
          data: [
            {
              id: 12345,
              name: "数字生命卡兹克",
              link: "https://bridge.example.test/feed/987.xml"
            }
          ]
        }),
        { status: 200 }
      )
    );

    await expect(
      resolveSourceUserInput(
        {
          mode: "create",
          sourceType: "wechat_bridge",
          wechatName: "数字生命卡兹克"
        },
        {
          fetch: fetchMock,
          wechatBridge: { baseUrl: "https://bridge.example.test", token: "secret-token" }
        }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        mode: "create",
        sourceType: "wechat_bridge",
        kind: expect.stringMatching(/^wechat_[a-z0-9_]+$/),
        name: "数字生命卡兹克",
        siteUrl: "https://mp.weixin.qq.com/",
        rssUrl: "https://bridge.example.test/feed/987.xml",
        bridgeKind: "wechat2rss"
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.test/list?name=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B&k=secret-token"
    );
  });
});
