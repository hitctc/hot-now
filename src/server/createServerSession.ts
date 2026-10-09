import type { FastifyReply, FastifyRequest } from "fastify";

import { readSessionCookieToken, readSessionToken, type SessionUser } from "../core/auth/session.js";
import type { ApiAccessTokenPrincipal } from "../core/auth/apiAccessTokenRepository.js";

type ApiAccessTokenLookup = (token: string) => ApiAccessTokenPrincipal | null;
type ApiAuthenticatedSession = SessionUser & {
  issuedAt: number;
  expiresAt: number;
};

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
  sessionSecret: string,
  readApiToken?: ApiAccessTokenLookup
): ApiAuthenticatedSession | null | undefined {
  const session = resolveApiSession(request, authEnabled, sessionSecret, readApiToken);

  if (session === undefined) {
    reply.code(401).send({ ok: false, reason: "unauthorized" });
  }

  return session;
}

/** 凭证生命周期操作必须由网页登录会话发起，API token 不能签发、列出或撤销凭证。 */
export function readInteractiveSettingsApiSession(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
): (SessionUser & { issuedAt: number; expiresAt: number }) | undefined {
  const session = authEnabled ? readAuthenticatedSession(request.headers.cookie, sessionSecret) : null;

  if (!session) {
    reply.code(401).send({ ok: false, reason: "unauthorized" });
    return undefined;
  }

  return session;
}

/** 状态变更路由的统一登录门禁；支持会话与完整权限 API token。 */
export function ensureStateActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  readApiToken?: ApiAccessTokenLookup
): boolean {
  if (!authEnabled) {
    return true;
  }

  return readSettingsApiSession(request, reply, authEnabled, sessionSecret, readApiToken) !== undefined;
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

/** 手动动作使用 API 风格的 unauthorized 响应，并允许完整权限 API token。 */
export function ensureManualActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  readApiToken?: ApiAccessTokenLookup
): boolean {
  if (!authEnabled) {
    return true;
  }

  if (resolveApiSession(request, authEnabled, sessionSecret, readApiToken) === undefined) {
    void reply.code(401).send({ accepted: false, reason: "unauthorized" });
    return false;
  }

  return true;
}

/** 优先采用登录 Cookie，其次校验 Bearer token；未认证返回 undefined，关闭登录时返回 null。 */
function resolveApiSession(
  request: FastifyRequest,
  authEnabled: boolean,
  sessionSecret: string,
  readApiToken?: ApiAccessTokenLookup
): ApiAuthenticatedSession | null | undefined {
  if (!authEnabled) {
    return null;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);
  if (session) {
    return session;
  }

  const bearerToken = request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const principal = bearerToken && readApiToken ? readApiToken(bearerToken) : null;
  if (!principal) {
    return undefined;
  }

  return {
    username: principal.username,
    displayName: principal.displayName,
    role: principal.role,
    issuedAt: Math.floor(Date.parse(principal.createdAt) / 1000),
    expiresAt: Math.floor(Date.parse(principal.expiresAt) / 1000)
  };
}
