import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWechatResolverServer,
  type ResolveWechatSourceInput,
  type ResolveWechatSourceResult
} from "../../src/wechatResolver/createWechatResolverServer.js";

describe("createWechatResolverServer", () => {
  const apps: Array<Awaited<ReturnType<typeof createWechatResolverServer>>> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close();
    }
  });

  it("returns health for local sidecar checks", async () => {
    const app = createWechatResolverServer({
      authToken: "resolver-secret",
      resolveWechatSource: vi.fn()
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("rejects requests without the resolver bearer token", async () => {
    const app = createWechatResolverServer({
      authToken: "resolver-secret",
      resolveWechatSource: vi.fn()
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/wechat/resolve-source",
      payload: { wechatName: "数字生命卡兹克" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("returns a normalized success payload when the resolver finds a source", async () => {
    const resolveWechatSource = vi
      .fn<[ResolveWechatSourceInput], Promise<ResolveWechatSourceResult>>()
      .mockResolvedValue({
        rssUrl: "https://wechat2rss.xlab.app/feed/demo-ai.xml",
        resolvedName: "数字生命卡兹克",
        siteUrl: "https://mp.weixin.qq.com/",
        resolverSummary: "local-wechat2rss-public-index:name-lookup"
      });
    const app = createWechatResolverServer({
      authToken: "resolver-secret",
      resolveWechatSource
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/wechat/resolve-source",
      headers: { authorization: "Bearer resolver-secret" },
      payload: { wechatName: "数字生命卡兹克", articleUrl: "https://mp.weixin.qq.com/s?__biz=demo" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      rssUrl: "https://wechat2rss.xlab.app/feed/demo-ai.xml",
      resolvedName: "数字生命卡兹克",
      siteUrl: "https://mp.weixin.qq.com/",
      resolverSummary: "local-wechat2rss-public-index:name-lookup"
    });
    expect(resolveWechatSource).toHaveBeenCalledWith({
      wechatName: "数字生命卡兹克",
      articleUrl: "https://mp.weixin.qq.com/s?__biz=demo"
    });
  });

  it("returns a not-found reason when no provider can resolve the source", async () => {
    const app = createWechatResolverServer({
      authToken: "resolver-secret",
      resolveWechatSource: vi.fn().mockResolvedValue(null)
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/wechat/resolve-source",
      headers: { authorization: "Bearer resolver-secret" },
      payload: { wechatName: "不存在的公众号" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false, reason: "not_found" });
  });

  it("renders a local wechat feed endpoint for dynamic provider fallbacks", async () => {
    const app = createWechatResolverServer({
      authToken: "resolver-secret",
      resolveWechatSource: vi.fn(),
      renderWechatFeed: vi.fn().mockResolvedValue(`<?xml version="1.0"?><rss><channel><title>demo</title></channel></rss>`)
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/wechat/feed/sogou-articles.xml?wechatName=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B&articleUrl=https%3A%2F%2Fmp.weixin.qq.com%2Fs%3F__biz%3Ddemo"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/rss+xml");
    expect(response.body).toContain("<channel>");
  });
});
