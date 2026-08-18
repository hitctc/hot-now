import type { FastifyReply, FastifyRequest } from "fastify";

import { readSessionCookieToken, readSessionToken } from "../core/auth/session.js";

/** 解析统一登录 Cookie，所有服务端入口复用同一套 session 校验。 */
export function readAuthenticatedSession(cookieHeader: string | undefined, sessionSecret: string) {
  const sessionToken = readSessionCookieToken(cookieHeader);

  if (!sessionToken || !sessionSecret) {
    return null;
  }

  return readSessionToken(sessionToken, sessionSecret);
}

/** API 鉴权失败返回 JSON 401，保持页面跳转与 API 调用的响应语义分离。 */
export function readSettingsApiSession(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (authEnabled && !session) {
    reply.code(401).send({ ok: false, reason: "unauthorized" });
    return undefined;
  }

  return session;
}

/** 状态变更路由的统一 session 门禁，未登录时不继续执行 handler。 */
export function ensureStateActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
): boolean {
  if (!authEnabled) {
    return true;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (!session) {
    void reply.code(401).send({ ok: false, reason: "unauthorized" });
    return false;
  }

  return true;
}

/** 外部创作 Agent 使用独立 token；未配置时明确返回服务不可用，避免误放行。 */
export function validateCreativeApiToken(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) {
    void reply.code(503).send({ ok: false, reason: "creative-api-token-not-configured" });
    return false;
  }

  const token = request.headers["x-creative-token"];
  if (token !== expectedToken) {
    void reply.code(401).send({ ok: false, reason: "invalid-token" });
    return false;
  }

  return true;
}

/** 手动动作使用 API 风格的 unauthorized 响应，便于页面和脚本统一消费。 */
export function ensureManualActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
): boolean {
  if (!authEnabled) {
    return true;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (!session) {
    void reply.code(401).send({ accepted: false, reason: "unauthorized" });
    return false;
  }

  return true;
}
