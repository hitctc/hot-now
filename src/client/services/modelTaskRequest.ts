import { HttpError, requestJson } from "./http.js";

const PREFIX = "hotnow:model-request:";
const aliases: Record<string, string> = { "regen-intro": "intro", "regen-title": "title", "regen-code-image-keywords": "keywords",
  "generate-comments": "comments", "generate-author-extensions": "extensions", "regen-summary": "summary", "regen-image-prompts": "image-prompts",
  "generate-cover-prompt": "cover-prompts", "generate-inline-prompts": "inline-prompts" };
const memory = new Map<string, string>();

/** 仅匹配已接入幂等合同的人工文案入口；不对保存、上传或普通请求加隐式重试。 */
function requestKey(path: string): string | null {
  if (path === "/api/creative/daily-digests/generate") return `${PREFIX}daily:`;
  const match = path.match(/^\/api\/creative\/finished-articles\/(\d+)\/(?:manual-text\/)?([^/]+)$/);
  if (!match) return null;
  const operation = aliases[match[2]!] || match[2]!;
  if (!["intro", "title", "keywords", "comments", "extensions", "summary", "cover-prompts", "inline-prompts", "image-prompts"].includes(operation)) return null;
  return `${PREFIX}${match[1]}:${operation}`;
}

/** 终态后删除该操作的请求编号；只删除本功能键，不清空浏览器其他数据。 */
export function clearModelTaskRequest(articleId: number, operation: string): void {
  const key = `${PREFIX}${articleId}:${operation}`;
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { /* 禁用存储时使用当前页面的内存映射。 */ }
}

/** 日报终态后清理原素材日期的请求编号，不影响其他日报日期或文案操作。 */
export function clearDailyDigestRequest(date?: string): void {
  const key = `${PREFIX}daily:${date || "yesterday"}`;
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { /* 只清理本功能的请求元数据。 */ }
}

/** 提交前持久保存随机请求编号；网络失败与关闭页面都保留它，重试不会创造新任务。 */
export async function requestModelTask<T>(path: string, init?: RequestInit): Promise<T> {
  let key = requestKey(path);
  // 普通请求保持原调用参数，不让模型任务包装改变 GET 等既有接口合同。
  if (!key || init?.method !== "POST") return init === undefined ? requestJson<T>(path) : requestJson<T>(path, init);
  const payload = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  if (key === `${PREFIX}daily:`) key += String(payload.date || "yesterday");
  let requestId = memory.get(key);
  try { requestId = localStorage.getItem(key) || requestId; } catch { /* 不读取凭据或文案，仅请求编号。 */ }
  if (!requestId) {
    requestId = `${Date.now()}-${crypto.randomUUID().replaceAll("-", "")}`;
    try { localStorage.setItem(key, requestId); } catch { /* 不能保证禁用存储时跨刷新恢复，当前页面仍幂等。 */ }
  }
  memory.set(key, requestId);
  try {
    const result = await requestJson<T>(path, { ...init, body: JSON.stringify({ ...payload, requestId }) });
    const response = result as { taskId?: string; status?: string; ok?: boolean };
    // 受理响应不清编号：即使页面在保存 taskId 前关闭，下次也能重放同一个提交。
    if (!response.taskId || ["done", "failed", "stopped"].includes(response.status || "")) {
      memory.delete(key);
      try { localStorage.removeItem(key); } catch { /* 内存映射已清理。 */ }
    }
    return result;
  } catch (error) {
    if (error instanceof HttpError && [400, 403, 404, 409].includes(error.status)) {
      memory.delete(key);
      try { localStorage.removeItem(key); } catch { /* 明确拒绝并非响应丢失。 */ }
    }
    throw error;
  }
}
