import Fastify from "fastify";
import { createWechat2RssPublicIndexProvider } from "./providers/wechat2rssPublicIndexProvider.js";
import { createSogouArticleSearchProvider } from "./providers/sogouArticleSearchProvider.js";
import type { ResolveWechatSourceInput, ResolveWechatSourceResult } from "./types.js";

type ResolverHandler = (input: ResolveWechatSourceInput) => Promise<ResolveWechatSourceResult | null>;
type FeedRenderer = (input: ResolveWechatSourceInput) => Promise<string | null>;

type CreateWechatResolverServerOptions = {
  authToken: string;
  publicBaseUrl?: string;
  fetch?: typeof fetch;
  resolveWechatSource?: ResolverHandler;
  renderWechatFeed?: FeedRenderer;
};

// The local resolver sidecar exposes a tiny, stable contract so HotNow can resolve wechat sources
// without learning about provider fallback, public index fetches, or other third-party details.
export function createWechatResolverServer(options: CreateWechatResolverServerOptions) {
  const app = Fastify();
  const publicBaseUrl = options.publicBaseUrl?.replace(/\/$/, "") ?? "http://127.0.0.1:4040";
  const publicIndexProvider = createWechat2RssPublicIndexProvider({
    fetch: options.fetch
  });
  const sogouArticleProvider = createSogouArticleSearchProvider({
    resolverBaseUrl: publicBaseUrl,
    fetch: options.fetch
  });
  const resolveWechatSource = options.resolveWechatSource ?? createResolverHandler();
  const renderWechatFeed = options.renderWechatFeed ?? sogouArticleProvider.renderFeed;

  app.get("/health", async () => ({ ok: true }));
  // 这个动态 feed 端点只服务 resolver fallback，把外部索引结果折叠成普通 RSS。
  // 主应用后续仍然只认标准 rss_url，不需要感知底层到底命中了哪个 provider。
  app.get<{
    Querystring: ResolveWechatSourceInput;
  }>("/wechat/feed/sogou-articles.xml", async (request, reply) => {
    const input = normalizeResolverInput(request.query);

    if (!input) {
      return reply.code(400).type("text/plain; charset=utf-8").send("invalid_input");
    }

    try {
      const feedXml = await renderWechatFeed(input);

      if (!feedXml) {
        return reply.code(404).type("text/plain; charset=utf-8").send("not_found");
      }

      return reply.type("application/rss+xml; charset=utf-8").send(feedXml);
    } catch {
      return reply.code(503).type("text/plain; charset=utf-8").send("resolver_unavailable");
    }
  });

  app.post<{
    Body: ResolveWechatSourceInput;
  }>("/wechat/resolve-source", async (request, reply) => {
    if (!isAuthorized(request.headers.authorization, options.authToken)) {
      return reply.code(401).send({ ok: false, reason: "unauthorized" });
    }

    const input = normalizeResolverInput(request.body);

    if (!input) {
      return reply.code(400).send({ ok: false, reason: "invalid_input" });
    }

    try {
      const resolved = await resolveWechatSource(input);

      if (!resolved) {
        return reply.code(404).send({ ok: false, reason: "not_found" });
      }

      return reply.send({
        ok: true,
        rssUrl: resolved.rssUrl,
        resolvedName: resolved.resolvedName,
        siteUrl: resolved.siteUrl,
        resolverSummary: resolved.resolverSummary
      });
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_article_url") {
        return reply.code(400).send({ ok: false, reason: "invalid_article_url" });
      }

      return reply.code(503).send({ ok: false, reason: "resolver_unavailable" });
    }
  });

  return app;

  // 解析顺序保持“公开索引优先、文章检索 fallback”，让常见命中先走最快路径，
  // 只有公开索引找不到时才退到更重的文章页元数据 + 搜狗检索。
  function createResolverHandler(): ResolverHandler {
    return async (input) => {
      const publicMatch = await publicIndexProvider.resolveSource(input);

      if (publicMatch) {
        return publicMatch;
      }

      return await sogouArticleProvider.resolveSource(input);
    };
  }
}

export type { ResolveWechatSourceInput, ResolveWechatSourceResult };

function normalizeResolverInput(body: ResolveWechatSourceInput | undefined): ResolveWechatSourceInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const wechatName = typeof body.wechatName === "string" ? body.wechatName.trim() : "";
  const articleUrl = typeof body.articleUrl === "string" ? body.articleUrl.trim() : "";

  if (!wechatName && !articleUrl) {
    return null;
  }

  return {
    ...(wechatName ? { wechatName } : {}),
    ...(articleUrl ? { articleUrl } : {})
  };
}

function isAuthorized(authorizationHeader: string | undefined, expectedToken: string): boolean {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return false;
  }

  return authorizationHeader.slice("Bearer ".length).trim() === expectedToken;
}
