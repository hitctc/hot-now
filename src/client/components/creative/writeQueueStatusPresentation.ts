import type { WriteQueueStatus, WriteQueueTask } from "../../services/creativeApi.js";

type LunaStatus = WriteQueueStatus["luna"];

/** 将非负剩余秒数转成中文时长，供约略倒计时展示，不代表实际执行承诺。 */
function duration(seconds: number): string {
  const value = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(value / 60);
  return minutes ? `${minutes}分${value % 60}秒` : `${value}秒`;
}

/** 用收到状态的时间递减后台剩余秒数；没有有效时间时不臆造恢复期限。 */
export function describeLunaStatus(luna: LunaStatus, now: number, reportedAt: number): string {
  if (!luna) return "模型状态暂未提供";
  if (luna.paused || luna.available === false) {
    const reason = luna.reason === "account_unavailable" ? "账号或额度相关异常（未确认额度耗尽）"
      : luna.reason === "cli_unavailable" ? "模型调用程序不可用" : "模型暂不可用（原因尚未明确）";
    if (typeof luna.remaining_seconds !== "number" || !Number.isFinite(luna.remaining_seconds)) {
      return `${reason}；冷却等待中，暂无准确重试时间，可取消任务`;
    }
    const remaining = luna.remaining_seconds - Math.max(0, (now - reportedAt) / 1000);
    if (remaining <= 0) return `${reason}；冷却时间已到，等待服务确认恢复，请勿重复提交`;
    return `${reason}；冷却中，约${duration(remaining)}后尝试恢复；恢复成功后按队列继续执行，可取消任务`;
  }
  const occupancy = luna.active ? `资源占用中：${luna.label || "其他模型任务"}` : "模型资源空闲";
  // 后台 probe 标记可能在成功调用后仍保留，不能据此宣称正在恢复或尚未恢复。
  return luna.probe ? `上次冷却已结束；${occupancy}，实际可用性以请求结果为准` : occupancy;
}

/** 解释排队、单任务冷却或让位原因；未知排队时长不展示伪造的执行时间。 */
export function describeQueuedTask(task: WriteQueueTask, luna: LunaStatus, now: number): string {
  if (luna?.paused || luna?.available === false) return "模型冷却等待中，恢复成功后按优先级执行；仍可取消";
  if (task.next_retry_at) {
    const retryAt = Date.parse(task.next_retry_at);
    if (Number.isFinite(retryAt)) {
      return retryAt > now ? `上次执行未成功，冷却重试中；约${duration((retryAt - now) / 1000)}后重新排队，仍可取消`
        : "重试冷却已到期，等待可用资源和队列调度";
    }
  }
  if (task.phase_status === "paused" && task.phase_name?.includes("让位")) {
    return "已保存进度，让位人工操作；优先任务结束后自动续跑";
  }
  if (task.phase_status === "waiting") return "等待 Luna 资源，本次执行尚未开始；资源释放后按优先级继续";
  return "排队等待，前方任务完成或安全让位后执行；暂无准确预计时间";
}

/** 区分资源等待与已获租约的任务处理；租约不等于模型实时进度，不改调度状态。 */
export function describeCurrentTask(task: WriteQueueTask, luna: LunaStatus, now: number, reportedAt: number): string {
  if (task.cancel_requested) return "已申请取消，等待安全检查点停止；不会强杀当前模型请求";
  if (task.phase_status === "storage_error") return "任务存储失败，已暂停执行；修复存储后才能继续";
  if (luna?.paused || luna?.available === false) return describeLunaStatus(luna, now, reportedAt);
  if (luna?.active) {
    return luna.task_id === task.task_id ? "已获得 Luna 资源，任务处理中（含模型调用与结果回写）"
      : "等待 Luna 资源，当前由其他任务占用；释放后继续";
  }
  if (task.phase_status === "waiting" || task.phase_status === "retry_waiting") return describeQueuedTask(task, luna, now);
  return "任务处理中，后台尚未报告具体进度；请勿重复提交";
}
