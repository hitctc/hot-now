import type { FastifyReply, FastifyRequest } from "fastify";
import { findCreativeFinishedArticleById } from "../../core/creative/creativeFinishedArticleRepository.js";
import { buildInlinePromptSource, planInlineImagePlaceholders } from "../../core/creative/inlineImagePromptPlanner.js";
import type { CreativeFinishedArticleRouteContext } from "./creativeFinishedArticleRouteShared.js";

const operations = ["title", "keywords", "comments", "extensions", "summary", "cover-prompts", "inline-prompts", "image-prompts"] as const;
type Operation = typeof operations[number];
const legacyOperations: Record<string, Operation> = {
  "regen-title": "title", "regen-code-image-keywords": "keywords", "generate-comments": "comments",
  "generate-author-extensions": "extensions", "regen-summary": "summary", "regen-image-prompts": "image-prompts",
  "generate-cover-prompt": "cover-prompts", "generate-inline-prompts": "inline-prompts",
};

/** 注册人工模型任务代理；Hermes 保存任务，HotNow 仅校验输入、准备正文占位符和展示结果。 */
export function registerCreativeFinishedArticleTextTaskRoutes({ app, options, db }: CreativeFinishedArticleRouteContext): void {
  /** 提交和状态查询独立于模型耗时；旧入口也返回异步编号，不能绕过唯一队列。 */
  async function proxy(operation: Operation, method: "POST" | "GET", request: FastifyRequest, reply: FastifyReply) {
    if (request.url.startsWith("/actions/")) {
      if (!options.authorizeStateAction(request, reply)) return;
    } else if (options.readSession(request, reply) === undefined) return;
    if (!db) return reply.code(503).send({ ok: false, reason: "database-not-available" });
    const id = Number((request.params as { id: string }).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ ok: false, reason: "invalid-article-id" });
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) return reply.code(404).send({ ok: false, reason: "article-not-found" });
    const base = process.env.HERMES_API_BASE_URL;
    const token = process.env.HERMES_API_TOKEN;
    if (!base || !token) return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    const taskId = (request.query as { taskId?: string }).taskId;
    if (method === "GET" && (!taskId || typeof taskId !== "string")) {
      return reply.code(400).send({ ok: false, reason: "missing-task-id" });
    }
    let input: Record<string, unknown> = {};
    if (method === "POST" && operation === "inline-prompts") {
      const body = request.body as { index?: unknown } | undefined;
      const index = body?.index;
      if (index !== undefined && (typeof index !== "number" || !Number.isSafeInteger(index) || index < 1)) {
        return reply.code(400).send({ ok: false, reason: "invalid-image-index" });
      }
      const planned = planInlineImagePlaceholders(article.humanMarkdown || article.contentMarkdown,
        article.direction === "short_content" ? "short_content" : "article");
      if (!planned.count || (typeof index === "number" && index > planned.count)) {
        return reply.code(400).send({ ok: false, reason: "no-suitable-inline-image-position" });
      }
      input = { content: buildInlinePromptSource(planned.markdown), plannedMarkdown: planned.markdown,
        inlineIndex: index, requiredIndexes: index ? [index] : Array.from({ length: planned.count }, (_, i) => i + 1) };
    }
    try {
      const query = new URLSearchParams({ articleId: String(id), operation, ...(taskId ? { taskId } : {}) });
      const response = await fetch(`${base.replace(/\/+$/, "")}/api/manual-text-tasks${method === "GET" ? `/status?${query}` : ""}`, {
        method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ articleId: id, operation, expectedUpdatedAt: article.updatedAt, input, requestId: (request.body as { requestId?: unknown } | undefined)?.requestId }) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json() as { success?: boolean; taskId?: string; status?: string; error?: string; phaseName?: string };
      if (!response.ok || !data.success) {
        return reply.code(response.status >= 500 ? 502 : response.status >= 400 ? response.status : 502)
          .send({ ok: false, reason: data.error ?? "Hermes 模型任务请求失败" });
      }
      if (method === "POST" && !data.taskId) return reply.code(502).send({ ok: false, reason: "missing-task-id" });
      const failed = data.status === "failed" || data.status === "stopped";
      const latest = data.status === "done" ? findCreativeFinishedArticleById(db, id) : null;
      return reply.code(method === "POST" ? 202 : 200).send({
        ok: !failed, taskId: data.taskId, status: data.status, phaseName: data.phaseName, reason: data.error,
        ...(latest ? { article: latest, titles: latest.titles, titleCandidates: latest.titleCandidates,
          keywords: latest.codeImageKeywords ?? [], comments: latest.comments, extensions: latest.authorExtensions,
          summary100: latest.summary100?.[0] ?? "" } : {}),
      });
    } catch {
      // 超时不能证明提交失败；客户端保留请求编号，下次提交由 Hermes 找回原活动或终态任务。
      return reply.code(502).send({ ok: false, reason: "任务服务暂不可达，请查询原任务状态，勿重复投递" });
    }
  }

  app.addHook("preHandler", async (request, reply) => {
    if (request.method !== "POST") return;
    const match = request.url.split("?")[0]?.match(/^\/(?:api|actions)\/creative\/finished-articles\/\d+\/([^/]+)$/);
    const operation = match && legacyOperations[match[1]!];
    if (operation) return proxy(operation, "POST", request, reply);
  });
  for (const operation of operations) {
    const path = `/api/creative/finished-articles/:id/manual-text/${operation}`;
    for (const method of ["POST", "GET"] as const) {
      app.route({ method, url: method === "GET" ? `${path}/status` : path,
        handler: (request, reply) => proxy(operation, method, request, reply) });
    }
  }
  /** 按文章+编号取消；执行中由 Hermes 在安全边界停止，不清空其他任务。 */
  app.post("/api/creative/finished-articles/:id/manual-text/cancel", async (request, reply) => {
    if (options.readSession(request, reply) === undefined) return;
    if (!db) return reply.code(503).send({ ok: false, reason: "database-not-available" });
    const id = Number((request.params as { id: string }).id);
    const taskId = (request.body as { taskId?: unknown } | null)?.taskId;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof taskId !== "string" || !taskId) return reply.code(400).send({ ok: false, reason: "invalid-task-id" });
    if (!findCreativeFinishedArticleById(db, id)) return reply.code(404).send({ ok: false, reason: "article-not-found" });
    const base = process.env.HERMES_API_BASE_URL;
    const token = process.env.HERMES_API_TOKEN;
    if (!base || !token) return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    try {
      const response = await fetch(`${base.replace(/\/+$/, "")}/api/manual-text-tasks/cancel`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: id, taskId }), signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json() as { success?: boolean; status?: string; error?: string };
      return reply.code(response.ok ? 200 : response.status >= 500 ? 502 : response.status)
        .send({ ok: Boolean(result.success), status: result.status, reason: result.error });
    } catch { return reply.code(502).send({ ok: false, reason: "取消状态暂不可查，请查询原任务" }); }
  });
}
