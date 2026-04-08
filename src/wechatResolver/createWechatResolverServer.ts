import Fastify from "fastify";
import { createWechat2RssPublicIndexProvider } from "./providers/wechat2rssPublicIndexProvider.js";
import type { ResolveWechatSourceInput, ResolveWechatSourceResult } from "./types.js";

type ResolverHandler = (input: ResolveWechatSourceInput) => Promise<ResolveWechatSourceResult | null>;

type CreateWechatResolverServerOptions = {
  authToken: string;
  resolveWechatSource?: ResolverHandler;
};

// The local resolver sidecar exposes a tiny, stable contract so HotNow can resolve wechat sources
// without learning about provider fallback, public index fetches, or other third-party details.
export function createWechatResolverServer(options: CreateWechatResolverServerOptions) {
  const app = Fastify();
  const resolveWechatSource =
    options.resolveWechatSource ?? createWechat2RssPublicIndexProvider().resolveSource;

  app.get("/health", async () => ({ ok: true }));

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
