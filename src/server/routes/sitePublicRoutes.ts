import { readFileSync } from "node:fs";
import path from "node:path";
import type { SitePageRouteContext } from "./sitePageRouteShared.js";
import {
  normalizeClientAssetPath,
  resolveBrandCacheControl,
  resolveClientAssetMimeType,
} from "./sitePageAssetHelpers.js";
import { readContentPageModelApiData } from "./sitePageContentHelpers.js";
import { listCreativeRawRssItems, type CreativeRawRssFeed } from "../../core/creative/creativeRawRssFeedRepository.js";

/** 注册健康检查、静态资源、内容 API 和创作 feed API。 */
export function registerSitePublicRoutes(context: SitePageRouteContext): void {
  const { app, options, deps, db, siteCss, siteJs, clientBuildRoot } = context;

  app.get("/health", async () => ({ ok: true }));
  app.get("/assets/site.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(siteCss));
  app.get("/assets/site.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(siteJs));
  app.get("/favicon.ico", async (_request, reply) => {
    const faviconPath = path.resolve(process.cwd(), "src/server/public/brand/hotnow-favicon.png");

    try {
      return reply.type("image/png").send(readFileSync(faviconPath));
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });
  app.get("/brand/*", async (request, reply) => {
    const { "*": rawAssetPath = "" } = request.params as { "*": string };
    const normalizedAssetPath = normalizeClientAssetPath(rawAssetPath);

    if (!normalizedAssetPath || path.extname(normalizedAssetPath).toLowerCase() !== ".png") {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const brandRoot = path.resolve(process.cwd(), "src/server/public/brand");
    const resolvedAssetPath = path.resolve(brandRoot, normalizedAssetPath);
    const brandRootWithSeparator = `${brandRoot}${path.sep}`;

    // 品牌静态资源只允许读取 brand 目录下的 png，避免请求路径越界到工作区其他文件。
    if (!resolvedAssetPath.startsWith(brandRootWithSeparator) && resolvedAssetPath !== brandRoot) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    try {
      const assetBody = readFileSync(resolvedAssetPath);
      return reply
        .header("Cache-Control", resolveBrandCacheControl(request))
        .type("image/png")
        .send(assetBody);
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });
  app.get("/client/*", async (request, reply) => {
    const { "*": rawAssetPath = "" } = request.params as { "*": string };
    const normalizedAssetPath = normalizeClientAssetPath(rawAssetPath);

    if (!normalizedAssetPath) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const resolvedAssetPath = path.resolve(clientBuildRoot, normalizedAssetPath);
    const clientBuildRootWithSeparator = `${clientBuildRoot}${path.sep}`;

    // The static client endpoint only serves files that remain under dist/client.
    if (!resolvedAssetPath.startsWith(clientBuildRootWithSeparator) && resolvedAssetPath !== clientBuildRoot) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const extension = path.extname(resolvedAssetPath).toLowerCase();

    if (extension !== ".js" && extension !== ".css") {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    try {
      const assetBody = readFileSync(resolvedAssetPath, "utf8");
      return reply.type(resolveClientAssetMimeType(extension)).send(assetBody);
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });


  app.get("/api/content/ai-new", async (request, reply) => {
    return reply.send(await readContentPageModelApiData(deps, request, "ai-new"));
  });

  app.get("/api/content/ai-hot", async (request, reply) => {
    return reply.send(await readContentPageModelApiData(deps, request, "ai-hot"));
  });




  // ─── Creative: Feed API（为外部 Agent 暴露高分 AI 新讯候选，token 鉴权） ───

  app.get("/api/creative/feed/ai-new", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }

    if (!deps.listContentView) {
      return reply.code(503).send({ ok: false, reason: "content-view-not-available" });
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    // minScore 为百分制整数（0-100），默认 80
    const query = request.query as Record<string, string | undefined>;
    const rawMinScore = parseFloat(query.minScore ?? "80");
    const minScore = Number.isFinite(rawMinScore) && rawMinScore >= 0 && rawMinScore <= 100 ? rawMinScore : 80;

    // 按评分降序拉取 AI 新讯全量候选（不传 selectedSourceKinds，不受用户来源偏好影响）
    const allCards = await deps.listContentView("ai", { sortMode: "content_score" });

    // 查出已推入素材库的 URL 集合，用于去重
    const pushedUrls = new Set<string>(
      (db.prepare("SELECT url FROM creative_source_items").all() as Array<{ url: string }>).map((r) => r.url)
    );

    const filtered = allCards
      .filter((card) => card.contentScore >= minScore && !pushedUrls.has(card.canonicalUrl))
      .slice(0, 50);

    // 批量取 body_markdown，RSS 来源大多为空，Agent 需自行抓取原文
    const idPlaceholders = filtered.map(() => "?").join(", ");
    const bodyRows = filtered.length > 0
      ? (db.prepare(`SELECT id, body_markdown FROM content_items WHERE id IN (${idPlaceholders})`).all(...filtered.map((c) => c.id)) as Array<{ id: number; body_markdown: string | null }>)
      : [];
    const bodyById = new Map(bodyRows.map((r) => [r.id, r.body_markdown]));

    const candidates = filtered.map((card) => ({
      id: card.id,
      title: card.title,
      summary: card.summary,
      fullContent: bodyById.get(card.id) ?? null,
      canonicalUrl: card.canonicalUrl,
      publishedAt: card.publishedAt,
      contentScore: card.contentScore,
      sourceName: card.sourceName,
      sourceKind: card.sourceKind
    }));

    return reply.send({ ok: true, total: candidates.length, items: candidates });
  });

  app.get("/api/creative/feed/raw-rss", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }
    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const query = request.query as Record<string, string | undefined>;
    const rawSourceFeed = query.sourceFeed?.trim();
    const sourceFeed = rawSourceFeed === "juya-ai-daily" || rawSourceFeed === "wechat-rss"
      ? rawSourceFeed as CreativeRawRssFeed
      : rawSourceFeed
        ? null
        : undefined;

    if (sourceFeed === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-feed" });
    }

    const windowHours = parseBoundedInteger(query.windowHours, 48, 1, 168);
    const limit = parseBoundedInteger(query.limit, 200, 1, 500);
    const result = listCreativeRawRssItems(db, { sourceFeed, windowHours, limit });
    return reply.send({ ok: true, ...result });
  });
}

function parseBoundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
