import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "transfer-encoding",
  "upgrade"
]);

const REMOTE_PROXY_PATHS = ["/api/", "/actions/", "/login", "/logout"] as const;

/** 将开发代理地址限制为 origin，避免把本地请求意外转发到带路径或凭据的未知地址。 */
export function normalizeRemoteApiOrigin(rawOrigin: string | undefined): string | undefined {
  const value = rawOrigin?.trim();

  if (!value) {
    return undefined;
  }

  const origin = new URL(value);

  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("HOT_NOW_DEV_REMOTE_API_ORIGIN 必须使用 http 或 https");
  }

  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("HOT_NOW_DEV_REMOTE_API_ORIGIN 只能配置 origin，例如 https://now.achuan.cc");
  }

  return origin.origin;
}

/** 把本地开发服务的 API、登录和登出请求转给正式站点，页面仍保持在本地地址。 */
export function registerRemoteApiProxy(
  app: FastifyInstance,
  options: {
    origin: string;
    token?: string;
  }
): void {
  // 代理放在 preHandler，确保 Fastify 已经完成 JSON 解析，正文保存和图片请求不会丢失请求体。
  app.addHook("preHandler", async (request, reply) => {
    if (!shouldProxyPath(request.url)) {
      return;
    }

    await proxyRequest(request, reply, options);
  });
}

function shouldProxyPath(requestUrl: string): boolean {
  const pathname = new URL(requestUrl, "http://hot-now.local").pathname;
  return REMOTE_PROXY_PATHS.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

async function proxyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: { origin: string; token?: string }
): Promise<void> {
  const targetUrl = new URL(request.url, options.origin);
  const headers = copyRequestHeaders(request, options.token);

  try {
    const body = serializeRequestBody(request, headers.get("content-type"));
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual"
    });

    copyResponseHeaders(response, reply, options.origin, request);
    reply.code(response.status);

    if (!response.body || request.method === "HEAD" || response.status === 204 || response.status === 304) {
      await reply.send();
      return;
    }

    // 保留 SSE 推送进度和图片响应的流式特性，避免本地代理把长请求重新缓冲成一次性响应。
    await reply.send(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]));
  } catch (error) {
    request.log.error({ error }, "远程正式 API 代理请求失败");

    if (!reply.sent) {
      await reply.code(502).send({ ok: false, reason: "remote-api-unavailable" });
    }
  }
}

function copyRequestHeaders(request: FastifyRequest, token: string | undefined): Headers {
  // 只转发浏览器业务请求头，去掉连接级头，避免本地连接信息污染正式站点请求。
  const headers = new Headers();

  for (const [name, rawValue] of Object.entries(request.headers)) {
    if (HOP_BY_HOP_HEADERS.has(name) || rawValue === undefined) {
      continue;
    }

    headers.set(name, Array.isArray(rawValue) ? rawValue.join(", ") : rawValue);
  }

  if (token && !headers.has("x-creative-token")) {
    headers.set("x-creative-token", token);
  }

  return headers;
}

function serializeRequestBody(request: FastifyRequest, contentType: string | null): string | undefined {
  // 当前客户端的写请求统一使用 JSON；显式拒绝无法安全重建的其他请求体，避免静默丢数据。
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  if (request.body === undefined || request.body === null) {
    return undefined;
  }

  if (typeof request.body === "string") {
    return request.body;
  }

  if (Buffer.isBuffer(request.body)) {
    return request.body.toString("utf8");
  }

  if (!contentType?.includes("application/json")) {
    throw new Error(`远程代理暂不支持 ${contentType || "未知"} 请求体`);
  }

  return JSON.stringify(request.body);
}

function copyResponseHeaders(
  response: Response,
  reply: FastifyReply,
  remoteOrigin: string,
  request: FastifyRequest
): void {
  // fetch 可能已经解压正式站点响应，因此不把 content-encoding 原样带回本地浏览器。
  for (const [name, value] of response.headers) {
    if (HOP_BY_HOP_HEADERS.has(name) || name === "set-cookie") {
      continue;
    }

    if (name === "location") {
      reply.header(name, rewriteRedirectLocation(value, remoteOrigin, request));
      continue;
    }

    reply.header(name, value);
  }

  for (const cookie of readSetCookies(response.headers)) {
    reply.header("set-cookie", normalizeLocalCookie(cookie));
  }
}

function readSetCookies(headers: Headers): string[] {
  // Node 运行时优先使用多 Cookie API，旧运行时再退回兼容解析。
  const headersWithGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headersWithGetSetCookie.getSetCookie?.();

  if (cookies && cookies.length > 0) {
    return cookies;
  }

  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,=]+=[^;,=]+)/u) : [];
}

function normalizeLocalCookie(cookie: string): string {
  // 本地开发走 HTTP，去掉正式域名和 Secure 属性，但保留登录 Cookie 的有效期与 HttpOnly。
  return cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => !/^domain=/iu.test(part) && !/^secure$/iu.test(part))
    .join("; ");
}

function rewriteRedirectLocation(location: string, remoteOrigin: string, request: FastifyRequest): string {
  // 登录成功后的绝对跳转必须留在本地代理地址，否则浏览器会绕过代理回到正式站点。
  const protocol = request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = request.headers.host || "127.0.0.1";
  const normalizedHost = (protocol === "http" && host.endsWith(":80")) || (protocol === "https" && host.endsWith(":443"))
    ? host.slice(0, -3)
    : host;
  const localOrigin = `${protocol}://${normalizedHost}`;

  return location.startsWith(remoteOrigin)
    ? `${localOrigin}${location.slice(remoteOrigin.length)}`
    : location;
}
