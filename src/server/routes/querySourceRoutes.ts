import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DeleteHackerNewsQueryResult, SaveHackerNewsQueryInput, SaveHackerNewsQueryResult, ToggleHackerNewsQueryResult } from "../../core/hackernews/hackerNewsQueryRepository.js";
import type { BilibiliQueryRecord, DeleteBilibiliQueryResult, SaveBilibiliQueryInput, SaveBilibiliQueryResult, ToggleBilibiliQueryResult } from "../../core/bilibili/bilibiliQueryRepository.js";

type SaveMode = "create" | "update";
export type QuerySourceRouteOptions = {
  authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
  createHackerNewsQuery?: (input: SaveHackerNewsQueryInput) => Promise<SaveHackerNewsQueryResult> | SaveHackerNewsQueryResult;
  updateHackerNewsQuery?: (input: SaveHackerNewsQueryInput) => Promise<SaveHackerNewsQueryResult> | SaveHackerNewsQueryResult;
  deleteHackerNewsQuery?: (id: number) => Promise<DeleteHackerNewsQueryResult> | DeleteHackerNewsQueryResult;
  toggleHackerNewsQuery?: (id: number, enable: boolean) => Promise<ToggleHackerNewsQueryResult> | ToggleHackerNewsQueryResult;
  createBilibiliQuery?: (input: SaveBilibiliQueryInput) => Promise<SaveBilibiliQueryResult> | SaveBilibiliQueryResult;
  updateBilibiliQuery?: (input: SaveBilibiliQueryInput) => Promise<SaveBilibiliQueryResult> | SaveBilibiliQueryResult;
  deleteBilibiliQuery?: (id: number) => Promise<DeleteBilibiliQueryResult> | DeleteBilibiliQueryResult;
  toggleBilibiliQuery?: (id: number, enable: boolean) => Promise<ToggleBilibiliQueryResult> | ToggleBilibiliQueryResult;
};

/** 注册 Hacker News 与 B站的关键词来源配置接口。 */
export function registerQuerySourceRoutes(app: FastifyInstance, options: QuerySourceRouteOptions): void {
    app.post("/actions/hackernews/create", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.createHackerNewsQuery) {
        return reply.code(503).send({ ok: false, reason: "hackernews-disabled" });
      }

      const payload = parseHackerNewsQuerySavePayload(request.body, "create");

      if (!payload) {
        return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-payload" });
      }

      return sendHackerNewsQuerySaveResult(reply, await options.createHackerNewsQuery(payload));
    });

    app.post("/actions/hackernews/update", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.updateHackerNewsQuery) {
        return reply.code(503).send({ ok: false, reason: "hackernews-disabled" });
      }

      const payload = parseHackerNewsQuerySavePayload(request.body, "update");

      if (!payload) {
        return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-payload" });
      }

      return sendHackerNewsQuerySaveResult(reply, await options.updateHackerNewsQuery(payload));
    });

    app.post("/actions/hackernews/delete", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.deleteHackerNewsQuery) {
        return reply.code(503).send({ ok: false, reason: "hackernews-disabled" });
      }

      const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);

      if (id === null) {
        return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-id" });
      }

      const result = await options.deleteHackerNewsQuery(id);

      if (!result.ok) {
        return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
      }

      return reply.send({ ok: true, id: result.id });
    });

    app.post("/actions/hackernews/toggle", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.toggleHackerNewsQuery) {
        return reply.code(503).send({ ok: false, reason: "hackernews-disabled" });
      }

      const body = request.body as { id?: unknown; enable?: unknown } | undefined;
      const id = parsePositiveInteger(body?.id);
      const enable = typeof body?.enable === "boolean" ? body.enable : null;

      if (id === null) {
        return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-id" });
      }

      if (enable === null) {
        return reply.code(400).send({ ok: false, reason: "invalid-hackernews-query-enable" });
      }

      const result = await options.toggleHackerNewsQuery(id, enable);

      if (!result.ok) {
        return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
      }

      return reply.send({ ok: true, id: result.query.id, enable: result.query.isEnabled });
    });

    app.post("/actions/bilibili/create", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.createBilibiliQuery) {
        return reply.code(503).send({ ok: false, reason: "bilibili-disabled" });
      }

      const payload = parseBilibiliQuerySavePayload(request.body, "create");

      if (!payload) {
        return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-payload" });
      }

      return sendBilibiliQuerySaveResult(reply, await options.createBilibiliQuery(payload));
    });

    app.post("/actions/bilibili/update", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.updateBilibiliQuery) {
        return reply.code(503).send({ ok: false, reason: "bilibili-disabled" });
      }

      const payload = parseBilibiliQuerySavePayload(request.body, "update");

      if (!payload) {
        return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-payload" });
      }

      return sendBilibiliQuerySaveResult(reply, await options.updateBilibiliQuery(payload));
    });

    app.post("/actions/bilibili/delete", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.deleteBilibiliQuery) {
        return reply.code(503).send({ ok: false, reason: "bilibili-disabled" });
      }

      const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);

      if (id === null) {
        return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-id" });
      }

      const result = await options.deleteBilibiliQuery(id);

      if (!result.ok) {
        return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
      }

      return reply.send({ ok: true, id: result.id });
    });

    app.post("/actions/bilibili/toggle", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.toggleBilibiliQuery) {
        return reply.code(503).send({ ok: false, reason: "bilibili-disabled" });
      }

      const body = request.body as { id?: unknown; enable?: unknown } | undefined;
      const id = parsePositiveInteger(body?.id);
      const enable = typeof body?.enable === "boolean" ? body.enable : null;

      if (id === null) {
        return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-id" });
      }

      if (enable === null) {
        return reply.code(400).send({ ok: false, reason: "invalid-bilibili-query-enable" });
      }

      const result = await options.toggleBilibiliQuery(id, enable);

      if (!result.ok) {
        return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
      }

      return reply.send({ ok: true, id: result.query.id, enable: result.query.isEnabled });
    });

}

function sendHackerNewsQuerySaveResult(reply: FastifyReply, result: SaveHackerNewsQueryResult) {
  if (result.ok) {
    return reply.send({ ok: true, query: result.query });
  }

  if (result.reason === "not-found") {
    return reply.code(404).send({ ok: false, reason: result.reason });
  }

  if (result.reason === "duplicate-query") {
    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

function sendBilibiliQuerySaveResult(reply: FastifyReply, result: SaveBilibiliQueryResult) {
  if (result.ok) {
    return reply.send({ ok: true, query: result.query });
  }

  if (result.reason === "not-found") {
    return reply.code(404).send({ ok: false, reason: result.reason });
  }

  if (result.reason === "duplicate-query") {
    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}


/** 校验查询来源的实体主键。 */
function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parseHackerNewsQuerySavePayload(
  body: unknown,
  mode: "create" | "update"
): SaveHackerNewsQueryInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const query = typeof payload.query === "string" ? payload.query.trim() : "";

  if (!query) {
    return null;
  }

  const id = mode === "update" ? parsePositiveInteger(payload.id) : null;

  if (mode === "update" && id === null) {
    return null;
  }

  return {
    ...(id !== null ? { id } : {}),
    query,
    priority: typeof payload.priority === "number" ? payload.priority : null,
    isEnabled: typeof payload.isEnabled === "boolean" ? payload.isEnabled : null,
    notes: typeof payload.notes === "string" ? payload.notes : null
  };
}

function parseBilibiliQuerySavePayload(
  body: unknown,
  mode: "create" | "update"
): SaveBilibiliQueryInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const query = typeof payload.query === "string" ? payload.query.trim() : "";

  if (!query) {
    return null;
  }

  const id = mode === "update" ? parsePositiveInteger(payload.id) : null;

  if (mode === "update" && id === null) {
    return null;
  }

  return {
    ...(id !== null ? { id } : {}),
    query,
    priority: typeof payload.priority === "number" ? payload.priority : null,
    isEnabled: typeof payload.isEnabled === "boolean" ? payload.isEnabled : null,
    notes: typeof payload.notes === "string" ? payload.notes : null
  };
}

