import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SqliteDatabase } from "../../core/db/openDatabase.js";
import type { CreativeAutomationService } from "../../core/creative/creativeAutomationService.js";
import {
  findCreativeSourceItemById,
  insertCreativeSourceItem,
  toggleSourceItemWritable,
  updateCreativeSourceItemAccountFit,
  updateCreativeSourceItemFields,
  updateCreativeSourceItemTrendScore,
  updateCreativeSourceItemWritingStatus,
  type AccountFitDetails,
} from "../../core/creative/creativeSourceItemRepository.js";

export type CreativeSourceActionRouteOptions = {
  db?: SqliteDatabase;
  automation?: CreativeAutomationService;
  authorizeCreativeApiToken: (request: FastifyRequest, reply: FastifyReply) => boolean;
  hasCreativeApiToken: (request: FastifyRequest) => boolean;
  authorizeSession: (request: FastifyRequest, reply: FastifyReply) => boolean;
  authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
};

/**
 * 注册创作素材的写入、写作调度和状态回写接口。
 * 保持 Agent token、管理端 session 与 Hermes 调用的既有契约，由服务装配层注入鉴权。
 */
export function registerCreativeSourceActionRoutes(
  app: FastifyInstance,
  options: CreativeSourceActionRouteOptions
): void {
  const { db } = options;

  // ─── Creative: Push API (token-authenticated) ───

  app.post("/api/creative/source-items", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }

    const body = request.body as Record<string, unknown> | undefined;
    const externalId = typeof body?.externalId === "string" ? body.externalId.trim() : "";
    const collectorAgent = typeof body?.collectorAgent === "string" ? body.collectorAgent.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!externalId || !collectorAgent || !title || !url) {
      return reply.code(400).send({ ok: false, reason: "missing-required-fields" });
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const result = insertCreativeSourceItem(db, {
      externalId,
      collectorAgent,
      title,
      url,
      sourceName: typeof body?.sourceName === "string" ? body.sourceName : undefined,
      summary: typeof body?.summary === "string" ? body.summary : undefined,
      fullContent: typeof body?.fullContent === "string" ? body.fullContent : undefined,
      author: typeof body?.author === "string" ? body.author : undefined,
      coverImageUrl: typeof body?.coverImageUrl === "string" ? body.coverImageUrl : undefined,
      tags: typeof body?.tags === "string" ? body.tags : (Array.isArray(body?.tags) ? JSON.stringify(body.tags) : undefined),
      language: typeof body?.language === "string" ? body.language : undefined,
      wordCount: typeof body?.wordCount === "number" ? body.wordCount : undefined,
      contentType: typeof body?.contentType === "string" ? body.contentType : undefined,
      score: typeof body?.score === "number" ? body.score : undefined,
      publishedAt: typeof body?.publishedAt === "string" ? body.publishedAt : undefined,
      collectorTimestamp: typeof body?.collectorTimestamp === "string" ? body.collectorTimestamp : undefined,
      writingStatus: typeof body?.writingStatus === "string"
        && ["pending", "ready", "queued", "writing", "done", "skipped", "excluded", "failed"].includes(body.writingStatus)
        ? body.writingStatus as "pending" | "ready" | "queued" | "writing" | "done" | "skipped" | "excluded" | "failed"
        : undefined,
      trendScore: typeof body?.trendScore === "number" ? body.trendScore : undefined,
      trendBreakdown: typeof body?.trendBreakdown === "object" && body.trendBreakdown !== null ? body.trendBreakdown as any : undefined,
      direction: typeof body?.direction === "string" ? body.direction : undefined
    });

    if (result.created) {
      // 长内容创建后立即唤醒持久化评估队列；重复采集不会新增任务。
      options.automation?.onSourceCreated(result.id);
    }
    return reply.code(result.created ? 201 : 200).send({
      id: result.id,
      externalId,
      created: result.created
    });
  });

  // ─── 本地自动化状态与开关：只控制 HotNow 的自动任务，人工动作始终可用 ───
  app.get("/api/creative/automation/status", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) return;
    if (!options.automation) return reply.code(503).send({ ok: false, reason: "creative-automation-not-available" });
    return reply.send({ ok: true, ...options.automation.getStatus() });
  });

  app.post("/api/creative/automation/:kind/enabled", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) return;
    if (!options.automation) return reply.code(503).send({ ok: false, reason: "creative-automation-not-available" });
    const kind = (request.params as { kind: string }).kind;
    const enabled = (request.body as { enabled?: unknown } | undefined)?.enabled;
    if ((kind !== "master" && kind !== "evaluate" && kind !== "write") || typeof enabled !== "boolean") return reply.code(400).send({ ok: false, reason: "invalid-automation-setting" });
    if (kind === "master") {
      options.automation.setMasterEnabled(enabled);
    } else {
      options.automation.setEnabled(kind, enabled);
    }
    return reply.send({ ok: true, ...options.automation.getStatus() });
  });

  // ─── 素材库写文章：先进入 HotNow 持久化队列，再由单 worker 投递 Hermes ───
  app.post("/api/creative/source-items/:id/write-article", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) return;
    if (!db || !options.automation) return reply.code(503).send({ ok: false, reason: "creative-automation-not-available" });

    const id = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as { thesis?: string; forceAccountFit?: boolean } | undefined;
    const result = options.automation.enqueueManualWrite(
      id,
      typeof body?.thesis === "string" ? body.thesis.trim() || undefined : undefined,
      body?.forceAccountFit === true,
    );
    if (!result.accepted) {
      const status = result.reason === "account-fit-low-confirmation-required" ? 422 : result.reason === "source-item-not-found" ? 404 : 409;
      return reply.code(status).send({ ok: false, reason: result.reason });
    }
    return reply.code(202).send({ ok: true, status: "queued", taskId: result.jobId });
  });

  // ─── 手动评估账号适配度：与自动任务共用单 worker，不阻塞页面请求 ───
  app.post("/api/creative/source-items/:id/evaluate-account-fit", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) return;
    if (!db || !options.automation) return reply.code(503).send({ ok: false, reason: "creative-automation-not-available" });
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!findCreativeSourceItemById(db, id)) return reply.code(404).send({ ok: false, reason: "source-item-not-found" });
    const result = options.automation.enqueueManualEvaluation(id);
    if (!result.accepted && result.reason !== "job-already-active") return reply.code(409).send({ ok: false, reason: result.reason });
    return reply.code(202).send({ ok: true, status: "queued", taskId: result.jobId, reason: result.reason });
  });

  // ─── 短内容素材写短内容：调用 Hermes /api/short/write，异步执行 ───
  app.post("/api/creative/source-items/:id/write-short", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as { externalId?: string; form?: string } | undefined;
    const item = findCreativeSourceItemById(db, id);
    if (!item) { return reply.code(404).send({ ok: false, reason: "source-item-not-found" }); }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    const form = body?.form === "tuwen" ? "tuwen" : "duanwen";
    const hermesBody: Record<string, unknown> = { form };
    if (typeof body?.externalId === "string" && body.externalId.trim()) {
      hermesBody.external_id = body.externalId.trim();
    }

    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/short/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify(hermesBody),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
      }

      const data = await res.json() as { success?: boolean; error?: string };
      if (!data.success) {
        return reply.code(502).send({ ok: false, reason: data.error ?? "写短内容失败", hermesResponse: JSON.stringify(data) });
      }

      return reply.send({ ok: true, status: "writing" });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
    }
  });



  // ─── 手动输入内容写文章：创建手动素材 + 触发 Hermes 写作 ───
  app.post("/actions/creative/source-items/manual-write", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const body = request.body as { title?: string; content?: string; contentType?: string; mode?: string; thesis?: string } | undefined;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const contentType = body?.contentType === "article" ? "article" : "viewpoint";
    if (!content) {
      return reply.code(400).send({ ok: false, reason: "content-required" });
    }

    // 生成素材字段
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : content.slice(0, 50).replace(/\n/g, " ");
    const externalId = `manual-${Date.now()}`;

    const result = insertCreativeSourceItem(db, {
      externalId,
      collectorAgent: "manual",
      title,
      url: "",
      sourceName: "手动输入",
      summary: contentType === "viewpoint" ? content : content.slice(0, 300),
      fullContent: content,
    });

    if (!options.automation) return reply.code(503).send({ ok: false, reason: "creative-automation-not-available" });
    const queued = options.automation.enqueueManualWrite(result.id, typeof body?.thesis === "string" ? body.thesis.trim() || undefined : undefined);
    if (!queued.accepted) return reply.code(409).send({ ok: false, reason: queued.reason });
    return reply.code(202).send({ ok: true, sourceItemId: result.id, taskId: queued.jobId, status: "queued" });
  });

  // ─── 素材溯源：调用 Hermes 搜索原始来源 ───
  app.post("/actions/creative/source-items/:id/trace", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const item = findCreativeSourceItemById(db, id);
    if (!item) { return reply.code(404).send({ ok: false, reason: "source-item-not-found" }); }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

    // 取标题 + 摘要前 1500 字作为搜索内容
    const contentForTrace = (item.summary ?? item.fullContent ?? "").slice(0, 1500);

    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/source-trace`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify({
          sourceItemId: id,
          title: item.title,
          content: contentForTrace,
          sourceUrl: item.url || undefined,
          maxResults: 3,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: errorBody });
      }

      const data = await res.json() as { ok?: boolean; status?: string };
      return reply.send({ ok: true, status: data.status ?? "tracing" });
    } catch (err) {
      const errMessage = (err as Error).message ?? String(err);
      return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: errMessage });
    }
  });

  // ─── 素材溯源回调：Hermes 写入溯源结果 ───
  app.put("/api/creative/source-items/:id/trace-results", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as { results?: unknown[] } | undefined;
    const results = Array.isArray(body?.results) ? body.results : [];

    // 结果写入 traced_sources_json 字段
    db.prepare("UPDATE creative_source_items SET traced_sources_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(JSON.stringify(results), id);

    return reply.send({ ok: true });
  });



  // ─── Creative: Actions (session-authenticated) ───

  app.post("/actions/creative/source-items/:id/writing-status", async (request, reply) => {
    const hasToken = options.hasCreativeApiToken(request);
    if (!hasToken) {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const body = request.body as {
      writingStatus?: unknown;
      stopStep?: unknown;
      stopStepName?: unknown;
      stopReason?: unknown;
    } | undefined;
    const id = parseInt(params.id, 10);
    const status = typeof body?.writingStatus === "string" ? body.writingStatus : "";
    if (!["pending", "ready", "queued", "writing", "done", "skipped", "excluded", "failed"].includes(status)) {
      return reply.code(400).send({ ok: false, reason: "invalid-status" });
    }
    const hasStopDetails = body?.stopStep !== undefined
      || body?.stopStepName !== undefined
      || body?.stopReason !== undefined;
    const stopDetailsValid = typeof body?.stopStep === "number"
      && Number.isInteger(body.stopStep)
      && body.stopStep > 0
      && typeof body?.stopStepName === "string"
      && body.stopStepName.trim().length > 0
      && typeof body?.stopReason === "string"
      && body.stopReason.trim().length > 0;
    if (hasStopDetails && (!["skipped", "failed"].includes(status) || !stopDetailsValid)) {
      return reply.code(400).send({ ok: false, reason: "invalid-stop-details" });
    }
    const updated = updateCreativeSourceItemWritingStatus(
      db,
      id,
      status as "pending" | "ready" | "queued" | "writing" | "done" | "skipped" | "excluded" | "failed",
      stopDetailsValid
        ? {
            step: body.stopStep as number,
            stepName: (body.stopStepName as string).trim(),
            reason: (body.stopReason as string).trim(),
          }
        : undefined
    );
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    return reply.send({ ok: true });
  });

  // ─── 素材可写标记切换 ───
  app.post("/actions/creative/source-items/:id/toggle-writable", async (request, reply) => {
    if (!options.authorizeSession(request, reply)) { return; }
    if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

    const id = parseInt((request.params as { id: string }).id, 10);
    const updated = toggleSourceItemWritable(db, id);
    if (!updated) { return reply.code(404).send({ ok: false, reason: "not-found" }); }
    return reply.send({ ok: true, writable: updated.writable });
  });

  app.post("/actions/creative/source-items/:id/update", async (request, reply) => {
    const hasToken = options.hasCreativeApiToken(request);
    if (!hasToken) {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const body = request.body as Record<string, unknown> | undefined;
    const id = parseInt(params.id, 10);

    const score = typeof body?.score === "number" ? body.score : undefined;
    const fullContent = typeof body?.fullContent === "string" ? body.fullContent : undefined;

    if (score === undefined && fullContent === undefined) {
      return reply.code(400).send({ ok: false, reason: "no-fields-to-update" });
    }

    if (score !== undefined && (score < 0 || score > 100)) {
      return reply.code(400).send({ ok: false, reason: "score-out-of-range" });
    }

    const updated = updateCreativeSourceItemFields(db, id, { score, fullContent });
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    return reply.send({ ok: true });
  });

  app.post("/actions/creative/source-items/:id/trend-score", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const params = request.params as { id: string };
    const body = request.body as Record<string, unknown> | undefined;
    const id = parseInt(params.id, 10);
    const trendScore = typeof body?.trendScore === "number" ? body.trendScore : undefined;
    const trendBreakdown = typeof body?.trendBreakdown === "object" && body?.trendBreakdown !== null ? body.trendBreakdown as Record<string, number> : undefined;

    if (trendScore == null || !trendBreakdown) {
      return reply.code(400).send({ ok: false, reason: "missing-trend-score-or-breakdown" });
    }

    const updated = updateCreativeSourceItemTrendScore(db, id, trendScore, trendBreakdown as any);
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    return reply.send({ ok: true });
  });

  app.put("/actions/creative/source-items/:id/account-fit", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }
    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    const id = parseInt((request.params as { id: string }).id, 10);
    const body = request.body as Record<string, unknown> | undefined;
    const level = typeof body?.level === "string" ? body.level : "";
    const allowedLevels = new Set(["high", "medium", "low", "insufficient", "error"]);
    if (
      !allowedLevels.has(level)
      || typeof body?.reason !== "string"
      || typeof body?.ruleVersion !== "string"
      || typeof body?.details !== "object"
      || body.details === null
    ) {
      return reply.code(400).send({ ok: false, reason: "invalid-account-fit-payload" });
    }

    const updated = updateCreativeSourceItemAccountFit(db, id, {
      level: level as "high" | "medium" | "low" | "insufficient" | "error",
      reason: body.reason,
      details: body.details as AccountFitDetails,
      ruleVersion: body.ruleVersion,
      updateWritingStatus: false,
    });
    if (!updated) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }
    // 规则版本漂移时只撤销未开始的自动写作，并重评最近窗口内的未完成长素材。
    options.automation?.recordAccountFitRuleVersion(body.ruleVersion, id);
    return reply.send({ ok: true });
  });

}
