import { useVisiblePolling } from "../../composables/useVisiblePolling.js";
import { ref, computed } from "vue";
import { fetchCodexTasks, type CodexTask } from "../../services/monitorApi.js";

export type CodexTaskQueueEvents = {
  openArticle: [articleId: number];
};

/** 管理Codex 任务快照和展示状态；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useCodexTaskQueue() {


  const tasks = ref<CodexTask[]>([]);
  const loading = ref(false);
  const total = ref(0);
  /** 读取当前展示快照并更新加载状态；网络失败按原合同保留已成功的数据。 */
  async function readSnapshot(): Promise<void> {
    loading.value = true;
    try {
      const res = await fetchCodexTasks({ limit: 10 });
      if (!isActive()) return;
      tasks.value = res.tasks;
      total.value = res.total;
    } catch { /* 静默 */ }
    finally { if (isActive()) loading.value = false; }
  }

  // 按状态统计
  const statusCounts = computed(() => {
    const counts = { queued: 0, running: 0, completed: 0, failed: 0 };
    for (const t of tasks.value) {
      if (t.status in counts) counts[t.status as keyof typeof counts]++;
    }
    return counts;
  });

  // 状态颜色和标签
  const statusConfig: Record<string, { color: string; label: string }> = {
    queued:   { color: "default", label: "排队中" },
    running:  { color: "blue",    label: "执行中" },
    completed:{ color: "green",   label: "已完成" },
    failed:   { color: "red",     label: "失败" },
  };
  /** 将任务耗时转换为秒或分的展示文本，不改变任务状态。 */
  function formatDuration(ms: number | null): string {
    if (ms == null) return "-";
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m${sec % 60}s`;
  }
  /** 把传入时间转换成展示文本，不发起请求或修改业务状态。 */
  function formatTime(iso: string | null): string {
    if (!iso) return "-";
    // 只取时分秒
    return iso.replace(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/, "").replace(/Z$/, "").substring(0, 8);
  }
  /** 将时间与当前时刻的差值格式化为相对时间，仅用于展示。 */
  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return `${Math.round(diff / 1000)}秒前`;
    if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟前`;
    return `${Math.round(diff / 3600_000)}小时前`;
  }

  const { refresh, isActive } = useVisiblePolling(readSnapshot, 30_000);

  return {
    tasks,
    loading,
    total,
    refresh,
    statusCounts,
    statusConfig,
    formatDuration,
    timeAgo,
  };
}
