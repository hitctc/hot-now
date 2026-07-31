import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SqliteDatabase } from "../../core/db/openDatabase.js";
import {
  findCreativeFinishedArticleById,
  listCreativeFinishedArticles
} from "../../core/creative/creativeFinishedArticleRepository.js";
import {
  findCreativeSourceItemById,
  listCreativeSourceItems
} from "../../core/creative/creativeSourceItemRepository.js";

type CreativeListRouteOptions = {
  db?: SqliteDatabase;
  creativeApiToken?: string;
  authorizeSession: (request: FastifyRequest, reply: FastifyReply) => boolean;
};

/** 创作查询接口同时兼容外部 Agent token 和管理端 session。 */
function authorizeCreativeRead(
  request: FastifyRequest,
  reply: FastifyReply,
  options: CreativeListRouteOptions
): boolean {
  const hasToken = Boolean(
    options.creativeApiToken
      && request.headers["x-creative-token"] === options.creativeApiToken
  );
  return hasToken || options.authorizeSession(request, reply);
}

/** 注册创作素材与成品的只读列表、详情接口，不改变原有 URL 和响应结构。 */
export function registerCreativeListRoutes(
  app: FastifyInstance,
  options: CreativeListRouteOptions
): void {
  app.get("/api/creative/source-items", async (request, reply) => {
    if (!authorizeCreativeRead(request, reply, options)) return;
    if (!options.db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const query = request.query as Record<string, string | undefined>;
    const result = listCreativeSourceItems(options.db, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      writingStatus: query.writingStatus as "pending" | "ready" | "queued" | "writing" | "done" | "skipped" | "excluded" | "failed" | undefined,
      collectorAgent: query.collectorAgent,
      sourceName: query.sourceName,
      writable: query.writable === "1" ? true : undefined,
      search: query.search,
      trendScoreMin: query.trendScoreMin ? parseInt(query.trendScoreMin, 10) : undefined,
      accountFitLevel: query.accountFitLevel as "high" | "medium" | "low" | "insufficient" | "error" | "unassessed" | undefined,
      sourceFeed: query.sourceFeed || undefined,
      last24h: query.sourceFeed ? true : undefined,
      direction: query.direction,
      summaryOnly: query.view === "summary"
    });

    const linkedIds = result.items
      .filter((item) => item.linkedArticleId != null)
      .map((item) => item.linkedArticleId!);
    if (linkedIds.length > 0) {
      const placeholders = linkedIds.map(() => "?").join(",");
      const articleRows = options.db.prepare(
        `SELECT id, created_at, wechat_published FROM creative_finished_articles WHERE id IN (${placeholders})`
      ).all(...linkedIds) as Array<{ id: number; created_at: string; wechat_published: number }>;
      const articleMap = new Map(articleRows.map((row) => [row.id, row]));
      for (const item of result.items) {
        if (item.linkedArticleId == null) continue;
        const row = articleMap.get(item.linkedArticleId);
        Object.assign(item, {
          linkedArticleCreatedAt: row?.created_at ?? null,
          linkedArticlePublished: row?.wechat_published === 1
        });
      }
    }

    return reply.send(result);
  });

  app.get("/api/creative/source-names", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) return;
    if (!options.db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const rows = options.db.prepare(
      "SELECT DISTINCT source_name FROM creative_source_items WHERE source_name IS NOT NULL AND source_name != '' ORDER BY source_name"
    ).all() as Array<{ source_name: string }>;
    return reply.send(rows.map((row) => row.source_name));
  });

  app.get("/api/creative/source-items/:id", async (request, reply) => {
    if (!authorizeCreativeRead(request, reply, options)) return;
    if (!options.db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const { id: rawId } = request.params as { id: string };
    const item = findCreativeSourceItemById(options.db, parseInt(rawId, 10));
    if (!item) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    return reply.send(item);
  });

  app.get("/api/creative/finished-articles", async (request, reply) => {
    if (!authorizeCreativeRead(request, reply, options)) return;
    if (!options.db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const query = request.query as Record<string, string | undefined>;
    const result = listCreativeFinishedArticles(options.db, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      status: query.status,
      search: query.search,
      publishable: query.publishable === "1" ? true : undefined,
      includeDeleted: query.includeDeleted === "1" ? true : undefined,
      direction: query.direction,
      summaryOnly: query.view === "summary"
    });

    const sourceItemIds = result.items
      .map((article) => article.sourceItemId)
      .filter((id): id is number => id !== null);
    if (sourceItemIds.length > 0) {
      const placeholders = sourceItemIds.map(() => "?").join(",");
      const sourceRows = options.db.prepare(
        `SELECT id, trend_score, trend_breakdown, published_at, title, source_name FROM creative_source_items WHERE id IN (${placeholders})`
      ).all(...sourceItemIds) as Array<{
        id: number;
        trend_score: number | null;
        trend_breakdown: string | null;
        published_at: string | null;
        title: string | null;
        source_name: string | null;
      }>;
      const sourceMap = new Map(sourceRows.map((row) => [row.id, row]));
      for (const article of result.items) {
        const source = article.sourceItemId === null
          ? undefined
          : sourceMap.get(article.sourceItemId);
        Object.assign(article, {
          trendScore: source?.trend_score ?? null,
          trendBreakdown: source?.trend_breakdown ? JSON.parse(source.trend_breakdown) : null,
          publishedAt: source?.published_at ?? null,
          sourceTitle: source?.title ?? null,
          sourceName: source?.source_name ?? null
        });
      }
    }

    return reply.send(result);
  });

  app.get("/api/creative/finished-articles/:id", async (request, reply) => {
    if (!authorizeCreativeRead(request, reply, options)) return;
    if (!options.db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const { id: rawId } = request.params as { id: string };
    const article = findCreativeFinishedArticleById(options.db, parseInt(rawId, 10));
    if (!article) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    const sourceRow = article.sourceItemId === null
      ? undefined
      : options.db.prepare(
          "SELECT trend_score, trend_breakdown, published_at, title FROM creative_source_items WHERE id = ?"
        ).get(article.sourceItemId) as {
          trend_score: number | null;
          trend_breakdown: string | null;
          published_at: string | null;
          title: string;
        } | undefined;
    if (sourceRow) {
      Object.assign(article, {
        trendScore: sourceRow.trend_score ?? null,
        trendBreakdown: sourceRow.trend_breakdown ? JSON.parse(sourceRow.trend_breakdown) : null,
        publishedAt: sourceRow.published_at ?? null,
        sourceTitle: sourceRow.title ?? null
      });
    }

    return reply.send(article);
  });
}
