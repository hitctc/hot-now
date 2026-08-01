import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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
}
