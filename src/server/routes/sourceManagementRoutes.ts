import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type {
  DeleteSourceResult,
  SaveSourceInput,
  SaveSourceResult,
  ToggleSourceResult,
  UpdateSourceDisplayModeResult
} from "../../core/source/sourceMutationRepository.js";

type SaveMode = "create" | "update";

export type SourceManagementRouteOptions = {
  authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
  createSource?: (input: SaveSourceInput) => Promise<SaveSourceResult> | SaveSourceResult;
  updateSource?: (input: SaveSourceInput) => Promise<SaveSourceResult> | SaveSourceResult;
  deleteSource?: (kind: string) => Promise<DeleteSourceResult> | DeleteSourceResult;
  toggleSource?: (kind: string, enable: boolean) => Promise<ToggleSourceResult> | ToggleSourceResult;
  updateSourceDisplayMode?: (
    kind: string,
    showAllWhenSelected: boolean
  ) => Promise<UpdateSourceDisplayModeResult> | UpdateSourceDisplayModeResult;
};

/** 注册通用 RSS 和微信桥接来源的配置写入接口。 */
export function registerSourceManagementRoutes(
  app: FastifyInstance,
  options: SourceManagementRouteOptions
): void {
  app.post("/actions/sources/toggle", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }

    if (!options.toggleSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown; enable?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-enable" });
    }

    const result = await options.toggleSource(kind, enable);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, kind, enable });
  });

  app.post("/actions/sources/create", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }

    if (!options.createSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const payload = parseSourceSavePayload(request.body, "create");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    return sendSourceSaveResult(reply, await options.createSource(payload));
  });

  app.post("/actions/sources/update", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }

    if (!options.updateSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const payload = parseSourceSavePayload(request.body, "update");

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    return sendSourceSaveResult(reply, await options.updateSource(payload));
  });

  app.post("/actions/sources/delete", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }

    if (!options.deleteSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    const result = await options.deleteSource(kind);

    if (!result.ok) {
      if (result.reason === "not-found") {
        return reply.code(404).send({ ok: false, reason: "not-found" });
      }

      return reply.code(409).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, kind: result.kind });
  });

  app.post("/actions/sources/display-mode", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }

    if (!options.updateSourceDisplayMode) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown; showAllWhenSelected?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
    const showAllWhenSelected = typeof body?.showAllWhenSelected === "boolean" ? body.showAllWhenSelected : null;

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
    }

    if (showAllWhenSelected === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-display-mode" });
    }

    const result = await options.updateSourceDisplayMode(kind, showAllWhenSelected);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, kind, showAllWhenSelected });
  });
}

/** 只接受通用来源仓储支持的 RSS 与微信桥接两类保存请求。 */
function parseSourceSavePayload(body: unknown, mode: SaveMode): SaveSourceInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const sourceType = typeof payload.sourceType === "string" ? payload.sourceType.trim() : "";

  if (sourceType === "rss") {
    const rssUrl = typeof payload.rssUrl === "string" ? payload.rssUrl.trim() : "";

    if (!rssUrl) {
      return null;
    }

    const kind = typeof payload.kind === "string" ? payload.kind.trim() : "";

    if (mode === "update") {
      return kind ? { mode: "update", sourceType: "rss", kind, rssUrl } : null;
    }

    return { mode: "create", sourceType: "rss", rssUrl };
  }

  if (sourceType !== "wechat_bridge") {
    return null;
  }

  const wechatName = typeof payload.wechatName === "string" ? payload.wechatName.trim() : "";

  if (!wechatName) {
    return null;
  }

  const articleUrl = typeof payload.articleUrl === "string" ? payload.articleUrl.trim() : "";
  const kind = typeof payload.kind === "string" ? payload.kind.trim() : "";

  if (mode === "update") {
    return kind
      ? { mode: "update", sourceType: "wechat_bridge", kind, wechatName, ...(articleUrl ? { articleUrl } : {}) }
      : null;
  }

  return { mode: "create", sourceType: "wechat_bridge", wechatName, ...(articleUrl ? { articleUrl } : {}) };
}

/** 将仓储的领域错误映射回既有的 HTTP 状态与响应体。 */
function sendSourceSaveResult(reply: FastifyReply, result: SaveSourceResult) {
  if (!result.ok) {
    if (result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    if (result.reason === "wechat-resolver-disabled") {
      return reply.code(503).send({ ok: false, reason: "wechat-resolver-disabled" });
    }

    if (result.reason === "wechat-resolver-not-found") {
      return reply.code(404).send({ ok: false, reason: "wechat-resolver-not-found" });
    }

    if (result.reason === "resolver-unavailable") {
      return reply.code(502).send({ ok: false, reason: "resolver-unavailable" });
    }

    if (result.reason === "invalid-rss-feed") {
      return reply.code(400).send({ ok: false, reason: "invalid-rss-feed" });
    }

    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.send({ ok: true, kind: result.kind });
}
