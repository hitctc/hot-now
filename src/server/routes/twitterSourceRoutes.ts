import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type {
  DeleteTwitterAccountResult,
  SaveTwitterAccountInput,
  SaveTwitterAccountResult,
  ToggleTwitterAccountResult
} from "../../core/twitter/twitterAccountRepository.js";
import type {
  DeleteTwitterSearchKeywordResult,
  SaveTwitterSearchKeywordInput,
  SaveTwitterSearchKeywordResult,
  ToggleTwitterSearchKeywordResult
} from "../../core/twitter/twitterSearchKeywordRepository.js";

type SaveMode = "create" | "update";

export type TwitterSourceRouteOptions = {
  authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
  createTwitterAccount?: (input: SaveTwitterAccountInput) => Promise<SaveTwitterAccountResult> | SaveTwitterAccountResult;
  updateTwitterAccount?: (input: SaveTwitterAccountInput) => Promise<SaveTwitterAccountResult> | SaveTwitterAccountResult;
  deleteTwitterAccount?: (id: number) => Promise<DeleteTwitterAccountResult> | DeleteTwitterAccountResult;
  toggleTwitterAccount?: (id: number, enable: boolean) => Promise<ToggleTwitterAccountResult> | ToggleTwitterAccountResult;
  createTwitterSearchKeyword?: (
    input: SaveTwitterSearchKeywordInput
  ) => Promise<SaveTwitterSearchKeywordResult> | SaveTwitterSearchKeywordResult;
  updateTwitterSearchKeyword?: (
    input: SaveTwitterSearchKeywordInput
  ) => Promise<SaveTwitterSearchKeywordResult> | SaveTwitterSearchKeywordResult;
  deleteTwitterSearchKeyword?: (
    id: number
  ) => Promise<DeleteTwitterSearchKeywordResult> | DeleteTwitterSearchKeywordResult;
  toggleTwitterSearchKeywordCollect?: (
    id: number,
    enable: boolean
  ) => Promise<ToggleTwitterSearchKeywordResult> | ToggleTwitterSearchKeywordResult;
  toggleTwitterSearchKeywordVisible?: (
    id: number,
    enable: boolean
  ) => Promise<ToggleTwitterSearchKeywordResult> | ToggleTwitterSearchKeywordResult;
};

/** 注册 Twitter 账号与搜索关键词的配置写入接口。 */
export function registerTwitterSourceRoutes(app: FastifyInstance, options: TwitterSourceRouteOptions): void {
  app.post("/actions/twitter-accounts/create", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.createTwitterAccount) return reply.code(503).send({ ok: false, reason: "twitter-accounts-disabled" });

    const payload = parseTwitterAccountSavePayload(request.body, "create");
    if (!payload) return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-payload" });

    return sendTwitterAccountSaveResult(reply, await options.createTwitterAccount(payload));
  });

  app.post("/actions/twitter-accounts/update", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.updateTwitterAccount) return reply.code(503).send({ ok: false, reason: "twitter-accounts-disabled" });

    const payload = parseTwitterAccountSavePayload(request.body, "update");
    if (!payload) return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-payload" });

    return sendTwitterAccountSaveResult(reply, await options.updateTwitterAccount(payload));
  });

  app.post("/actions/twitter-accounts/delete", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.deleteTwitterAccount) return reply.code(503).send({ ok: false, reason: "twitter-accounts-disabled" });

    const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);
    if (id === null) return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-id" });

    const result = await options.deleteTwitterAccount(id);
    if (!result.ok) return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });

    return reply.send({ ok: true, id: result.id });
  });

  app.post("/actions/twitter-accounts/toggle", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.toggleTwitterAccount) return reply.code(503).send({ ok: false, reason: "twitter-accounts-disabled" });

    const body = request.body as { id?: unknown; enable?: unknown } | undefined;
    const id = parsePositiveInteger(body?.id);
    const enable = typeof body?.enable === "boolean" ? body.enable : null;
    if (id === null) return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-id" });
    if (enable === null) return reply.code(400).send({ ok: false, reason: "invalid-twitter-account-enable" });

    const result = await options.toggleTwitterAccount(id, enable);
    if (!result.ok) return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });

    return reply.send({ ok: true, id: result.account.id, enable: result.account.isEnabled });
  });

  app.post("/actions/twitter-keywords/create", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.createTwitterSearchKeyword) return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });

    const payload = parseTwitterKeywordSavePayload(request.body, "create");
    if (!payload) return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-payload" });

    return sendTwitterKeywordSaveResult(reply, await options.createTwitterSearchKeyword(payload));
  });

  app.post("/actions/twitter-keywords/update", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.updateTwitterSearchKeyword) return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });

    const payload = parseTwitterKeywordSavePayload(request.body, "update");
    if (!payload) return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-payload" });

    return sendTwitterKeywordSaveResult(reply, await options.updateTwitterSearchKeyword(payload));
  });

  app.post("/actions/twitter-keywords/delete", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.deleteTwitterSearchKeyword) return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });

    const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);
    if (id === null) return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-id" });

    const result = await options.deleteTwitterSearchKeyword(id);
    if (!result.ok) return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });

    return reply.send({ ok: true, id: result.id });
  });

  app.post("/actions/twitter-keywords/toggle-collect", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.toggleTwitterSearchKeywordCollect) return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });

    const body = request.body as { id?: unknown; enable?: unknown } | undefined;
    const id = parsePositiveInteger(body?.id);
    const enable = typeof body?.enable === "boolean" ? body.enable : null;
    if (id === null) return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-id" });
    if (enable === null) return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-collect-enable" });

    const result = await options.toggleTwitterSearchKeywordCollect(id, enable);
    if (!result.ok) return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });

    return reply.send({ ok: true, id: result.keyword.id, enable: result.keyword.isCollectEnabled });
  });

  app.post("/actions/twitter-keywords/toggle-visible", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.toggleTwitterSearchKeywordVisible) return reply.code(503).send({ ok: false, reason: "twitter-keywords-disabled" });

    const body = request.body as { id?: unknown; enable?: unknown } | undefined;
    const id = parsePositiveInteger(body?.id);
    const enable = typeof body?.enable === "boolean" ? body.enable : null;
    if (id === null) return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-id" });
    if (enable === null) return reply.code(400).send({ ok: false, reason: "invalid-twitter-keyword-visible-enable" });

    const result = await options.toggleTwitterSearchKeywordVisible(id, enable);
    if (!result.ok) return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });

    return reply.send({ ok: true, id: result.keyword.id, enable: result.keyword.isVisible });
  });
}

/** 解析 Twitter 账号创建或更新请求，更新操作必须携带正整数 id。 */
function parseTwitterAccountSavePayload(body: unknown, mode: SaveMode): SaveTwitterAccountInput | null {
  if (!body || typeof body !== "object") return null;

  const payload = body as Record<string, unknown>;
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  if (!username) return null;

  const id = mode === "update" ? parsePositiveInteger(payload.id) : null;
  if (mode === "update" && id === null) return null;

  return {
    ...(id !== null ? { id } : {}),
    username,
    userId: typeof payload.userId === "string" ? payload.userId : null,
    displayName: typeof payload.displayName === "string" ? payload.displayName : null,
    category: typeof payload.category === "string" ? payload.category : null,
    priority: typeof payload.priority === "number" ? payload.priority : null,
    includeReplies: typeof payload.includeReplies === "boolean" ? payload.includeReplies : null,
    isEnabled: typeof payload.isEnabled === "boolean" ? payload.isEnabled : null,
    notes: typeof payload.notes === "string" ? payload.notes : null
  };
}

/** 解析 Twitter 关键词创建或更新请求，保留采集和展示两个独立开关。 */
function parseTwitterKeywordSavePayload(body: unknown, mode: SaveMode): SaveTwitterSearchKeywordInput | null {
  if (!body || typeof body !== "object") return null;

  const payload = body as Record<string, unknown>;
  const keyword = typeof payload.keyword === "string" ? payload.keyword.trim() : "";
  if (!keyword) return null;

  const id = mode === "update" ? parsePositiveInteger(payload.id) : null;
  if (mode === "update" && id === null) return null;

  return {
    ...(id !== null ? { id } : {}),
    keyword,
    category: typeof payload.category === "string" ? payload.category : null,
    priority: typeof payload.priority === "number" ? payload.priority : null,
    isCollectEnabled: typeof payload.isCollectEnabled === "boolean" ? payload.isCollectEnabled : null,
    isVisible: typeof payload.isVisible === "boolean" ? payload.isVisible : null,
    notes: typeof payload.notes === "string" ? payload.notes : null
  };
}

/** 将账号仓储结果映射为历史接口承诺的状态码和字段。 */
function sendTwitterAccountSaveResult(reply: FastifyReply, result: SaveTwitterAccountResult) {
  if (result.ok) return reply.send({ ok: true, account: result.account });
  if (result.reason === "not-found") return reply.code(404).send({ ok: false, reason: result.reason });
  if (result.reason === "duplicate-username") return reply.code(409).send({ ok: false, reason: result.reason });
  return reply.code(400).send({ ok: false, reason: result.reason });
}

/** 将关键词仓储结果映射为历史接口承诺的状态码和字段。 */
function sendTwitterKeywordSaveResult(reply: FastifyReply, result: SaveTwitterSearchKeywordResult) {
  if (result.ok) return reply.send({ ok: true, keyword: result.keyword });
  if (result.reason === "not-found") return reply.code(404).send({ ok: false, reason: result.reason });
  if (result.reason === "duplicate-keyword") return reply.code(409).send({ ok: false, reason: result.reason });
  return reply.code(400).send({ ok: false, reason: result.reason });
}

/** 限制可变更的实体 id 为正整数，避免仓储层收到无效主键。 */
function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
