/** Hermes 自动化控制的薄 HTTP 适配层；不在 HotNow 保存队列、开关或业务状态。 */

export type HermesAutomationResponse = {
  status: number;
  data: Record<string, unknown>;
};

/** 读取 Hermes 阶段有效状态；网络异常时自动任务必须按关闭处理。 */
export async function isHermesAutomationAllowed(stage: string): Promise<boolean> {
  const result = await callHermesAutomation("/api/automation/status", "GET", undefined, 5_000);
  if (result.status !== 200 || result.data.mode !== "running") {
    return false;
  }
  const stages = result.data.stages;
  if (!stages || typeof stages !== "object") {
    return false;
  }
  const state = (stages as Record<string, unknown>)[stage];
  return Boolean(state && typeof state === "object" && (state as Record<string, unknown>).effective === true);
}

/** 调用 Hermes 统一控制面，配置缺失和网络失败都返回可判断的 HTTP 结果。 */
export async function callHermesAutomation(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  timeoutMs = 15_000
): Promise<HermesAutomationResponse> {
  const baseUrl = process.env.HERMES_API_BASE_URL?.trim();
  const token = process.env.HERMES_API_TOKEN?.trim();
  if (!baseUrl || !token) {
    return { status: 503, data: { ok: false, reason: "hermes-api-not-configured" } };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {})
      },
      ...(method === "POST" && body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { ok: false, reason: text || `Hermes HTTP ${response.status}` };
    }
    return { status: response.status, data };
  } catch (error) {
    return {
      status: 502,
      data: { ok: false, reason: "hermes-api-unreachable", detail: (error as Error).message }
    };
  }
}
