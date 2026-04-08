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
        { fetch: fetchMock, wechatResolver: null }
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

  it("resolves simplified wechat input from relay-backed article url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          rssUrl: "https://resolver.example.test/feed/123.xml",
          resolvedName: "数字生命卡兹克",
          siteUrl: "https://mp.weixin.qq.com/",
          resolverSummary: "resolved-via:article-url"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
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
          wechatResolver: { baseUrl: "https://resolver.example.test", token: "resolver-secret" }
        }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        mode: "create",
        sourceType: "wechat_bridge",
        kind: expect.stringMatching(/^wechat_[a-z0-9_]+$/),
        name: "数字生命卡兹克",
        siteUrl: "https://mp.weixin.qq.com/",
        rssUrl: "https://resolver.example.test/feed/123.xml",
        bridgeKind: "resolver"
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://resolver.example.test/wechat/resolve-source",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer resolver-secret"
        }),
        body: JSON.stringify({
          wechatName: "数字生命卡兹克",
          articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
        })
      })
    );
  });

  it("resolves simplified wechat input from relay-backed name lookup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          rssUrl: "https://resolver.example.test/feed/987.xml",
          resolvedName: "数字生命卡兹克",
          siteUrl: "https://mp.weixin.qq.com/",
          resolverSummary: "resolved-via:name-lookup"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
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
          wechatResolver: { baseUrl: "https://resolver.example.test", token: "resolver-secret" }
        }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        mode: "create",
        sourceType: "wechat_bridge",
        kind: expect.stringMatching(/^wechat_[a-z0-9_]+$/),
        name: "数字生命卡兹克",
        siteUrl: "https://mp.weixin.qq.com/",
        rssUrl: "https://resolver.example.test/feed/987.xml",
        bridgeKind: "resolver"
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://resolver.example.test/wechat/resolve-source",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer resolver-secret"
        }),
        body: JSON.stringify({
          wechatName: "数字生命卡兹克"
        })
      })
    );
  });
});
