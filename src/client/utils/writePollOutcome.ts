import type { WriteQueueStatus } from "../services/creativeApi.js";

export type WritePollOutcome =
  | { kind: "pending" }
  | { kind: "completed" }
  | { kind: "stopped"; step?: number; stepName?: string; reason: string }
  | { kind: "failed"; reason: string };

/**
 * 合并素材状态和队列最近终态，避免任务快速结束后页面只看到队列消失。
 */
export function resolveWritePollOutcome(
  sourceItemId: number,
  writingStatus: string,
  taskId: string | undefined,
  queueStatus: WriteQueueStatus | null,
): WritePollOutcome {
  if (writingStatus === "done") {
    return { kind: "completed" };
  }

  const recent = queueStatus?.recent ?? [];
  const terminal = taskId
    ? recent.find((task) => task.task_id === taskId)
    : recent.find((task) => task.source_item_id === sourceItemId);

  if (terminal?.status === "stopped") {
    return {
      kind: "stopped",
      step: terminal.stop_step,
      stepName: terminal.stop_step_name,
      reason: terminal.reason_text || terminal.error || "未通过写作质量闸门",
    };
  }
  if (terminal?.status === "failed") {
    return { kind: "failed", reason: terminal.error || "写作任务执行失败" };
  }

  // 队列历史不可用时，仍要对平台已有终态给出可见反馈。
  if (writingStatus === "skipped") {
    return { kind: "stopped", reason: "未通过写作质量闸门" };
  }
  if (writingStatus === "failed") {
    return { kind: "failed", reason: "写作任务执行失败" };
  }
  return { kind: "pending" };
}
