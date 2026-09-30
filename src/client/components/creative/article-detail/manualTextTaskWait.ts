import { getManualTextTaskStatus, getRegenIntroStatus, type ManualTextTaskResult, type RegenIntroResult, type ManualModelOperation } from "../../../services/creativeApi.js";
import { HttpError } from "../../../services/http.js";

export type ManualTextOperation = ManualModelOperation | "intro";

/** 每篇每类保存一个任务编号；不保存文案、凭据或模型输出。 */
function storageKey(articleId: number, operation: ManualTextOperation): string {
  return `hotnow:manual-text-task:${articleId}:${operation}`;
}

/** 读取可恢复任务编号；浏览器禁用存储时仍允许当前页面正常使用。 */
export function readManualTextTask(articleId: number, operation: ManualTextOperation): string | null {
  try { return localStorage.getItem(storageKey(articleId, operation)); } catch { return null; }
}

/** 受理后保存编号、终态后删除；存储失败不取消后台任务。 */
export function saveManualTextTask(articleId: number, operation: ManualTextOperation, taskId: string | null): void {
  try {
    const key = storageKey(articleId, operation);
    if (taskId) localStorage.setItem(key, taskId);
    else localStorage.removeItem(key);
  } catch { /* 不把浏览器存储限制变成任务执行失败。 */ }
}

/** 恢复原编号或提交一次后观察；页面关闭只停止观察，不取消后台任务。 */
export async function runManualModelTask(articleId: number, operation: ManualModelOperation,
  submit: () => Promise<{ ok: boolean; taskId?: string; reason?: string }>, isCurrent: () => boolean): Promise<ManualTextTaskResult | null> {
  const existing = readManualTextTask(articleId, operation);
  const result = existing ? { ok: true, taskId: existing } : await submit();
  if (!result.ok || !result.taskId) return result;
  saveManualTextTask(articleId, operation, result.taskId);
  return waitManualTextTask(articleId, operation, result.taskId, isCurrent);
}

/** 查询原任务直到终态；排队无截止时间，网络故障退避，离开文章停止查询但不取消任务。 */
export async function waitManualTextTask(articleId: number, operation: ManualTextOperation, taskId: string,
  isCurrent: () => boolean): Promise<(ManualTextTaskResult & RegenIntroResult) | null> {
  let delay = 3000;
  while (isCurrent()) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    if (!isCurrent()) return null;
    try {
      const result = operation === "intro" ? await getRegenIntroStatus(articleId, taskId)
        : await getManualTextTaskStatus(articleId, operation, taskId);
      if (!isCurrent()) return null;
      delay = 3000;
      if (["done", "failed", "stopped"].includes(result.status ?? "") || !result.ok) {
        saveManualTextTask(articleId, operation, null);
        return result;
      }
    } catch (error) {
      if (error instanceof HttpError && [400, 401, 403, 404].includes(error.status)) {
        if (error.status === 404) saveManualTextTask(articleId, operation, null);
        throw error;
      }
      // 代理/网络超时只是观察失败，不能重新投递模型任务。
      delay = Math.min(delay * 2, 30_000);
    }
  }
  return null;
}
