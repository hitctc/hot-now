import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SaveProviderSettingsInput, SaveProviderSettingsResult, UpdateProviderSettingsActivationResult } from "../../core/llm/providerSettingsRepository.js";
import { isWriteQueuePreferences, type WriteQueuePreferences } from "../../core/auth/userPreferences.js";

export type SettingsApiSession = { username: string; displayName: string; role: string; issuedAt: number; expiresAt: number } | null;

export type SettingsApiRouteOptions = {
  readSession: (request: FastifyRequest, reply: FastifyReply) => SettingsApiSession | undefined;
  authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
  readViewRules: () => Promise<unknown>;
  saveContentFilterRule?: (input: { ruleKey: string; toggles: unknown; weights: unknown }) => Promise<
    { ok: true; ruleKey: "ai" | "hot" } | { ok: false; reason: string }
  > | { ok: true; ruleKey: "ai" | "hot" } | { ok: false; reason: string };
  readSources: () => Promise<unknown>;
  readProfile: (session: SettingsApiSession) => Promise<unknown>;
  readWriteQueuePreferences?: () => Promise<WriteQueuePreferences | null> | WriteQueuePreferences | null;
  saveWriteQueuePreferences?: (preferences: WriteQueuePreferences) => Promise<void> | void;
  verifyLogin?: (username: string, password: string) => Promise<unknown> | unknown;
  updatePassword?: (newPassword: string) => Promise<void>;
  readAiTimelineAdmin: (request: FastifyRequest) => Promise<unknown>;
  listWechatMpAccounts?: () => unknown[];
  saveWechatMpAccount?: (input: {
    id?: number;
    name: string;
    appId: string;
    appSecret?: string;
    notes?: string;
    isDefault?: boolean;
    isEnabled?: boolean;
  }) => Promise<{ ok: boolean; id: number }>;
  deleteWechatMpAccount?: (id: number) => boolean;
  setDefaultWechatMpAccount?: (id: number) => boolean;
  saveProviderSettings?: (input: SaveProviderSettingsInput) => Promise<SaveProviderSettingsResult> | SaveProviderSettingsResult;
  updateProviderSettingsActivation?: (input: { providerKind: SaveProviderSettingsInput["providerKind"]; enable: boolean }) => Promise<UpdateProviderSettingsActivationResult> | UpdateProviderSettingsActivationResult;
  deleteProviderSettings?: (providerKind: SaveProviderSettingsInput["providerKind"]) => Promise<boolean> | boolean;
};

/** 注册视图规则、来源、个人资料、时间线和公众号账号设置接口。 */
export function registerSettingsApiRoutes(
  app: FastifyInstance,
  options: SettingsApiRouteOptions
): void {
  app.get("/api/settings/view-rules", async (request, reply) => {
    const session = options.readSession(request, reply);

    if (session === undefined) {
      return;
    }

    return reply.send(await options.readViewRules());
  });

  app.post("/actions/view-rules/content-filters", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }

    const body = request.body as { ruleKey?: unknown; toggles?: unknown; weights?: unknown } | undefined;
    const ruleKey = typeof body?.ruleKey === "string" ? body.ruleKey.trim() : "";
    const result = await options.saveContentFilterRule?.({
      ruleKey,
      toggles: body?.toggles,
      weights: body?.weights
    });

    if (!result || result.ok === false) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-filter-config" });
    }

    return reply.send({ ok: true, ruleKey: result.ruleKey });
  });

  app.get("/api/settings/sources", async (request, reply) => {
    const session = options.readSession(request, reply);

    if (session === undefined) {
      return;
    }

    return reply.send(await options.readSources());
  });

  app.get("/api/settings/profile", async (request, reply) => {
    const session = options.readSession(request, reply);

    if (session === undefined) {
      return;
    }

    return reply.send({ profile: await options.readProfile(session) });
  });

  /** 读取当前登录账号的队列布局偏好；首次登录返回 null 供前端迁移旧展开状态。 */
  app.get("/api/settings/write-queue-preferences", async (request, reply) => {
    if (options.readSession(request, reply) === undefined) return;
    if (!options.readWriteQueuePreferences) {
      return reply.code(503).send({ ok: false, reason: "write-queue-preferences-unavailable" });
    }

    return reply.send({ preferences: await options.readWriteQueuePreferences() });
  });

  /** 校验并保存当前账号的队列布局偏好；未登录、档位非法或存储失败时返回明确错误。 */
  app.put("/api/settings/write-queue-preferences", async (request, reply) => {
    if (options.readSession(request, reply) === undefined) return;
    if (!options.saveWriteQueuePreferences) {
      return reply.code(503).send({ ok: false, reason: "write-queue-preferences-unavailable" });
    }

    const body = request.body as unknown;
    if (!isWriteQueuePreferences(body)) {
      return reply.code(400).send({ ok: false, reason: "invalid-write-queue-preferences" });
    }

    try {
      await options.saveWriteQueuePreferences(body);
      return reply.send({ ok: true, preferences: body });
    } catch (error) {
      request.log.error(error, "Save write queue preferences failed");
      return reply.code(500).send({ ok: false, reason: "write-queue-preferences-save-failed" });
    }
  });

  app.put("/api/settings/profile/password", async (request, reply) => {
    const session = options.readSession(request, reply);

    if (session === undefined) {
      return;
    }

    const body = request.body as Record<string, unknown> | undefined;
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ ok: false, error: "当前密码和新密码不能为空" });
    }

    if (newPassword.length < 6) {
      return reply.status(400).send({ ok: false, error: "新密码至少 6 位" });
    }

    if (!options.verifyLogin) {
      return reply.status(503).send({ ok: false, error: "服务未配置登录验证" });
    }

    const user = await options.verifyLogin(session!.username, currentPassword);

    if (!user) {
      return reply.status(401).send({ ok: false, error: "当前密码不正确" });
    }

    if (!options.updatePassword) {
      return reply.status(503).send({ ok: false, error: "服务未配置密码更新" });
    }

    await options.updatePassword(newPassword);
    return reply.send({ ok: true });
  });

  app.get("/api/settings/ai-timeline", async (request, reply) => {
    const session = options.readSession(request, reply);

    if (session === undefined) {
      return;
    }

    return reply.send(await options.readAiTimelineAdmin(request));
  });
  app.get("/api/settings/ai-timeline-events", async (request, reply) => {
    const session = options.readSession(request, reply);

    if (session === undefined) {
      return;
    }

    return reply.send(await options.readAiTimelineAdmin(request));
  });

  app.get("/api/settings/ai-timeline/events", async (request, reply) => {
    const session = options.readSession(request, reply);

    if (session === undefined) {
      return;
    }

    return reply.send(await options.readAiTimelineAdmin(request));
  });

  app.get("/api/settings/wechat-mp", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) return;

    if (!options.listWechatMpAccounts) {
      return reply.code(503).send({ ok: false, reason: "wechat-mp-not-configured" });
    }
    const accounts = options.listWechatMpAccounts();
    return reply.send({ ok: true, accounts });
  });

  app.post("/actions/wechat-mp/save", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }
    if (!options.saveWechatMpAccount) {
      return reply.code(503).send({ ok: false, reason: "wechat-mp-not-configured" });
    }

    const body = request.body as {
      id?: number;
      name: string;
      appId: string;
      appSecret?: string;
      notes?: string;
      isDefault?: boolean;
      isEnabled?: boolean;
    };

    if (!body.name || !body.appId) {
      return reply.code(400).send({ ok: false, reason: "name-and-appid-required" });
    }

    try {
      const result = await options.saveWechatMpAccount(body);
      return reply.send(result);
    } catch (err) {
      request.log.error(err, "Save wechat mp account failed");
      return reply.code(500).send({ ok: false, reason: "save-failed" });
    }
  });

  app.post("/actions/wechat-mp/delete", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }
    if (!options.deleteWechatMpAccount) {
      return reply.code(503).send({ ok: false, reason: "wechat-mp-not-configured" });
    }

    const body = request.body as { id: number };
    if (!body.id) {
      return reply.code(400).send({ ok: false, reason: "id-required" });
    }

    const deleted = options.deleteWechatMpAccount(body.id);
    return reply.send({ ok: deleted });
  });

  app.post("/actions/wechat-mp/set-default", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }
    if (!options.setDefaultWechatMpAccount) {
      return reply.code(503).send({ ok: false, reason: "wechat-mp-not-configured" });
    }

    const body = request.body as { id: number };
    if (!body.id) {
      return reply.code(400).send({ ok: false, reason: "id-required" });
    }

    const result = options.setDefaultWechatMpAccount(body.id);
    return reply.send({ ok: result });
  });

  app.post("/actions/view-rules/provider-settings", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.saveProviderSettings) return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    if (!isProviderKind(providerKind) || !apiKey) return reply.code(400).send({ ok: false, reason: "invalid-provider-settings" });
    const result = await options.saveProviderSettings({ providerKind, apiKey });
    if (!result.ok && result.reason === "master-key-required") return reply.code(409).send({ ok: false, reason: "master-key-required" });
    return reply.send({ ok: true, providerKind });
  });

  app.post("/actions/view-rules/provider-settings/activation", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.updateProviderSettingsActivation) return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";
    const enable = typeof body?.enable === "boolean" ? body.enable : null;
    if (!isProviderKind(providerKind) || enable === null) return reply.code(400).send({ ok: false, reason: "invalid-provider-activation" });
    const result = await options.updateProviderSettingsActivation({ providerKind, enable });
    if (!result.ok && result.reason === "not-found") return reply.code(409).send({ ok: false, reason: "provider-settings-not-found" });
    return reply.send({ ok: true, providerKind, isEnabled: enable });
  });

  app.post("/actions/view-rules/provider-settings/delete", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) return;
    if (!options.deleteProviderSettings) return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";
    if (!isProviderKind(providerKind)) return reply.code(400).send({ ok: false, reason: "invalid-provider-settings" });
    await options.deleteProviderSettings(providerKind);
    return reply.send({ ok: true });
  });
}

/** 仅接受当前配置仓储支持的供应商标识。 */
function isProviderKind(value: string): value is SaveProviderSettingsInput["providerKind"] { return value === "deepseek" || value === "minimax" || value === "kimi"; }
