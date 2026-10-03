import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SqliteDatabase } from "../../core/db/openDatabase.js";
import { readCreativeFinishedDetail, readCreativeFinishedList, readCreativeSourceDetail, readCreativeSourceList, readCreativeSourceNames } from "../../core/creative/creativeListReadRepository.js";

type CreativeListRouteOptions = {
  db?: SqliteDatabase;
  creativeApiToken?: string;
  authorizeSession: (request: FastifyRequest, reply: FastifyReply) => boolean;
};

/** 创作查询接口同时兼容外部 Agent token 和管理端 session。 */
function authorizeCreativeRead(request: FastifyRequest, reply: FastifyReply, options: CreativeListRouteOptions): boolean {
  const hasToken = Boolean(options.creativeApiToken && request.headers["x-creative-token"] === options.creativeApiToken);
  return hasToken || options.authorizeSession(request, reply);
}

/** 注册原创作读取协议，领域关联和SQL由core只读仓储承担，权限/参数/错误码仍由路由处理。 */
export function registerCreativeListRoutes(app: FastifyInstance, options: CreativeListRouteOptions): void {
  app.get("/api/creative/source-items", async (request, reply) => {
    if (!authorizeCreativeRead(request, reply, options)) return;
    if (!options.db) return reply.code(503).send({ ok: false, reason: "database-not-available" });
    const query = request.query as Record<string, string | undefined>;
    return reply.send(readCreativeSourceList(options.db, {
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
    }));
  });

  app.get("/api/creative/source-names", async (request, reply) => {
    // 来源名仍只接受session，不因移动领域读取而扩大token权限。
    if (!options.authorizeSession(request, reply)) return;
    if (!options.db) return reply.code(503).send({ ok: false, reason: "database-not-available" });
    return reply.send(readCreativeSourceNames(options.db));
  });

  app.get("/api/creative/source-items/:id", async (request, reply) => {
    if (!authorizeCreativeRead(request, reply, options)) return;
    if (!options.db) return reply.code(503).send({ ok: false, reason: "database-not-available" });
    const { id: rawId } = request.params as { id: string };
    const item = readCreativeSourceDetail(options.db, parseInt(rawId, 10));
    if (!item) return reply.code(404).send({ ok: false, reason: "not-found" });
    return reply.send(item);
  });

  app.get("/api/creative/finished-articles", async (request, reply) => {
    if (!authorizeCreativeRead(request, reply, options)) return;
    if (!options.db) return reply.code(503).send({ ok: false, reason: "database-not-available" });
    const query = request.query as Record<string, string | undefined>;
    return reply.send(readCreativeFinishedList(options.db, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      status: query.status,
      search: query.search,
      publishable: query.publishable === "1" ? true : undefined,
      includeDeleted: query.includeDeleted === "1" ? true : undefined,
      direction: query.direction,
      summaryOnly: query.view === "summary"
    }));
  });

  app.get("/api/creative/finished-articles/:id", async (request, reply) => {
    if (!authorizeCreativeRead(request, reply, options)) return;
    if (!options.db) return reply.code(503).send({ ok: false, reason: "database-not-available" });
    const { id: rawId } = request.params as { id: string };
    const article = readCreativeFinishedDetail(options.db, parseInt(rawId, 10));
    if (!article) return reply.code(404).send({ ok: false, reason: "not-found" });
    return reply.send(article);
  });
}
