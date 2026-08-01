import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CreateWechatRssSourcesInput, CreateWechatRssSourcesResult, DeleteWechatRssSourceResult, UpdateWechatRssSourceInput, UpdateWechatRssSourceResult } from "../../core/wechatRss/wechatRssSourceRepository.js";

export type WechatRssRouteOptions = {
  authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
  createWechatRssSources?: (input: CreateWechatRssSourcesInput) => Promise<CreateWechatRssSourcesResult> | CreateWechatRssSourcesResult;
  updateWechatRssSource?: (input: UpdateWechatRssSourceInput) => Promise<UpdateWechatRssSourceResult> | UpdateWechatRssSourceResult;
  deleteWechatRssSource?: (id: number) => Promise<DeleteWechatRssSourceResult> | DeleteWechatRssSourceResult;
};
/** 注册公众号 RSS 来源配置接口。 */
export function registerWechatRssRoutes(app: FastifyInstance, options: WechatRssRouteOptions): void {
    app.post("/actions/wechat-rss/create", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.createWechatRssSources) {
        return reply.code(503).send({ ok: false, reason: "wechat-rss-disabled" });
      }

      const payload = parseWechatRssCreatePayload(request.body);

      if (!payload) {
        return reply.code(400).send({ ok: false, reason: "invalid-wechat-rss-payload" });
      }

      return sendWechatRssCreateResult(reply, await options.createWechatRssSources(payload));
    });

    app.post("/actions/wechat-rss/update", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.updateWechatRssSource) {
        return reply.code(503).send({ ok: false, reason: "wechat-rss-disabled" });
      }

      const payload = parseWechatRssUpdatePayload(request.body);

      if (!payload) {
        return reply.code(400).send({ ok: false, reason: "invalid-wechat-rss-payload" });
      }

      return sendWechatRssUpdateResult(reply, await options.updateWechatRssSource(payload));
    });

    app.post("/actions/wechat-rss/delete", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.deleteWechatRssSource) {
        return reply.code(503).send({ ok: false, reason: "wechat-rss-disabled" });
      }

      const id = parsePositiveInteger((request.body as { id?: unknown } | undefined)?.id);

      if (id === null) {
        return reply.code(400).send({ ok: false, reason: "invalid-wechat-rss-source-id" });
      }

      const result = await options.deleteWechatRssSource(id);

      if (!result.ok) {
        return reply.code(result.reason === "not-found" ? 404 : 400).send({ ok: false, reason: result.reason });
      }

      return reply.send({ ok: true, id: result.id });
    });

}
/** 校验公众号 RSS 主键。 */
function parsePositiveInteger(value: unknown): number | null { return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null; }

function parseWechatRssCreatePayload(body: unknown): CreateWechatRssSourcesInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const rssUrls = payload.rssUrls;

  if (typeof rssUrls === "string") {
    return { rssUrls };
  }

  if (Array.isArray(rssUrls) && rssUrls.every((value) => typeof value === "string")) {
    return { rssUrls };
  }

  return null;
}

function parseWechatRssUpdatePayload(body: unknown): UpdateWechatRssSourceInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const id = parsePositiveInteger(payload.id);
  const rssUrl = payload.rssUrl;
  const displayName = payload.displayName;

  if (id === null || typeof rssUrl !== "string") {
    return null;
  }

  return {
    id,
    rssUrl,
    displayName: typeof displayName === "string" ? displayName : null
  };
}

function sendWechatRssCreateResult(reply: FastifyReply, result: CreateWechatRssSourcesResult) {
  if (result.ok) {
    return reply.send({
      ok: true,
      created: result.created,
      skippedDuplicateUrls: result.skippedDuplicateUrls
    });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

function sendWechatRssUpdateResult(reply: FastifyReply, result: UpdateWechatRssSourceResult) {
  if (result.ok) {
    return reply.send({ ok: true, source: result.source });
  }

  if (result.reason === "not-found") {
    return reply.code(404).send({ ok: false, reason: result.reason });
  }

  if (result.reason === "duplicate-rss-url") {
    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.code(400).send({ ok: false, reason: result.reason });
}

