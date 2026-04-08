import { describe, expect, it, vi } from "vitest";
import { createWechat2RssPublicIndexProvider } from "../../src/wechatResolver/providers/wechat2rssPublicIndexProvider.js";

const sampleIndexHtml = `
  <h1>完整公众号列表</h1>
  <p><a href="https://wechat2rss.xlab.app/feed/demo-ai.xml">数字生命卡兹克</a></p>
  <p><a href="https://wechat2rss.xlab.app/feed/demo-hot.xml">机器之心</a></p>
`;

describe("wechat2rssPublicIndexProvider", () => {
  it("resolves a public feed by exact wechat name and reuses the cached index", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sampleIndexHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    );
    const provider = createWechat2RssPublicIndexProvider({
      fetch: fetchMock,
      now: () => 1_000
    });

    await expect(provider.resolveSource({ wechatName: "数字生命卡兹克" })).resolves.toEqual({
      rssUrl: "https://wechat2rss.xlab.app/feed/demo-ai.xml",
      resolvedName: "数字生命卡兹克",
      siteUrl: "https://mp.weixin.qq.com/",
      resolverSummary: "local-wechat2rss-public-index:name-lookup"
    });
    await expect(provider.resolveSource({ wechatName: "数字生命卡兹克" })).resolves.toEqual({
      rssUrl: "https://wechat2rss.xlab.app/feed/demo-ai.xml",
      resolvedName: "数字生命卡兹克",
      siteUrl: "https://mp.weixin.qq.com/",
      resolverSummary: "local-wechat2rss-public-index:name-lookup"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps article-url input as a hint but still resolves from the public index name match", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sampleIndexHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    );
    const provider = createWechat2RssPublicIndexProvider({
      fetch: fetchMock
    });

    await expect(
      provider.resolveSource({
        wechatName: " 数字生命 卡兹克 ",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=demo"
      })
    ).resolves.toEqual({
      rssUrl: "https://wechat2rss.xlab.app/feed/demo-ai.xml",
      resolvedName: "数字生命卡兹克",
      siteUrl: "https://mp.weixin.qq.com/",
      resolverSummary: "local-wechat2rss-public-index:article-url-hint"
    });
  });

  it("returns null when the public index does not contain the target account", async () => {
    const provider = createWechat2RssPublicIndexProvider({
      fetch: vi.fn().mockResolvedValue(
        new Response(sampleIndexHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      )
    });

    await expect(provider.resolveSource({ wechatName: "不存在的公众号" })).resolves.toBeNull();
  });
});
