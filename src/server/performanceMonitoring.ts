import type { FastifyInstance, FastifyRequest } from "fastify";

export const DEFAULT_SLOW_REQUEST_MS = 500;

export type SlowRequestDetails = {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  responseBytes?: number;
};

type PerformanceMonitoringOptions = {
  slowRequestMs?: number;
  logSlowRequest?: (details: SlowRequestDetails, request: FastifyRequest) => void;
};

/** 读取慢请求阈值；无效配置回退默认值，避免错误环境变量让日志失控。 */
export function resolveSlowRequestThreshold(
  rawValue: string | undefined,
  fallback = DEFAULT_SLOW_REQUEST_MS
): number {
  if (!rawValue?.trim()) return fallback;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** 安装统一性能钩子，只记录超过阈值的请求，并通过 Server-Timing 暴露服务端耗时。 */
export function installPerformanceMonitoring(
  app: FastifyInstance,
  options: PerformanceMonitoringOptions = {}
): void {
  const slowRequestMs = options.slowRequestMs ?? DEFAULT_SLOW_REQUEST_MS;

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("server-timing", `app;dur=${Math.max(0, reply.elapsedTime).toFixed(1)}`);
    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    const durationMs = Math.max(0, reply.elapsedTime);
    if (durationMs < slowRequestMs) return;

    const details: SlowRequestDetails = {
      method: request.method,
      route: request.routeOptions.url || stripQuery(request.raw.url || ""),
      statusCode: reply.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      ...readResponseBytes(reply.getHeader("content-length"))
    };

    if (options.logSlowRequest) {
      options.logSlowRequest(details, request);
      return;
    }

    request.log.warn({ performance: details }, "slow request");
  });

  app.addHook("onError", async (request, _reply, error) => {
    request.log.error({
      err: error,
      method: request.method,
      route: request.routeOptions.url || stripQuery(request.raw.url || "")
    }, "request failed");
  });
}

/** 只保留 URL 路径，避免搜索词、令牌等查询参数进入性能日志。 */
function stripQuery(url: string): string {
  return url.split("?", 1)[0] || "/";
}

/** 把 Fastify 的 Content-Length 响应头收敛成可选字节数。 */
function readResponseBytes(header: string | number | string[] | undefined): { responseBytes?: number } {
  const value = Array.isArray(header) ? header[0] : header;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? { responseBytes: parsed } : {};
}
