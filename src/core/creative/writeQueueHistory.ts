export const WRITE_QUEUE_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

type HistoryTask = {
  task_id?: unknown;
  finished_at?: unknown;
  started_at?: unknown;
  submitted_at?: unknown;
};

/** 按存储语义解析记录时间；SQLite无时区时间按UTC，无效值返回NaN，不猜测日期。 */
function historyTimestamp(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return Date.parse(normalized);
}

/** 判断时间是否落在当前时刻倒推24小时的闭区间，排除未来及无效时间；不修改记录。 */
export function isInWriteQueueHistoryWindow(value: unknown, now: number): boolean {
  const stamp = historyTimestamp(value);
  return Number.isFinite(stamp) && stamp >= now - WRITE_QUEUE_HISTORY_WINDOW_MS && stamp <= now;
}

/** 合并兼容接口的历史与最近结果，按任务编号去重并倒序返回全部24小时记录，不按条数截断。 */
export function selectWriteQueueHistory<T extends HistoryTask>(
  status: { history?: readonly T[]; recent?: readonly T[] } | null | undefined,
  now: number = Date.now(),
): T[] {
  const records = [...(status?.history ?? []), ...(status?.recent ?? [])]
    .map((task) => ({ task, stamp: historyTimestamp(task.finished_at || task.started_at || task.submitted_at) }))
    .filter(({ stamp }) => Number.isFinite(stamp) && stamp >= now - WRITE_QUEUE_HISTORY_WINDOW_MS && stamp <= now)
    .sort((left, right) => right.stamp - left.stamp);
  const seen = new Set<string>();
  return records.filter(({ task }) => {
    if (typeof task.task_id !== "string" || !task.task_id) return true;
    if (seen.has(task.task_id)) return false;
    seen.add(task.task_id);
    return true;
  }).map(({ task }) => task);
}
