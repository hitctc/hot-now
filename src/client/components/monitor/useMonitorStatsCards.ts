import { useVisiblePolling } from "../../composables/useVisiblePolling.js";
import { ref } from "vue";
import { fetchMonitorStats, fetchPlatformStats, type MonitorStats, type PlatformStats } from "../../services/monitorApi.js";



/** 管理监控与平台统计的并行快照；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useMonitorStatsCards() {


  const stats = ref<MonitorStats | null>(null);
  const platform = ref<PlatformStats | null>(null);
  const loading = ref(false);
  /** 读取当前展示快照并更新加载状态；网络失败按原合同保留已成功的数据。 */
  async function readSnapshot(): Promise<void> {
    loading.value = true;
    try {
      const [s, p] = await Promise.allSettled([fetchMonitorStats(), fetchPlatformStats()]);
      if (!isActive()) return;
      if (s.status === "fulfilled") stats.value = s.value;
      if (p.status === "fulfilled") platform.value = p.value;
    } finally { if (isActive()) loading.value = false; }
  }
  /** 解析运行概要，异常 JSON 返回原有空值而不影响统计读取。 */
  function parseStepsSummary(raw: string): Record<string, unknown> | null {
    try { return JSON.parse(raw); }
    catch { return null; }
  }
  /** 计算并格式化运行耗时，不改原始时间或任务终态。 */
  function runDuration(started: string, finished: string | null): string {
    if (!finished) return "-";
    const ms = new Date(finished + "Z").getTime() - new Date(started + "Z").getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
  }

  const statusColorMap: Record<string, string> = { done: "green", error: "red", running: "blue" };

  const { refresh, isActive } = useVisiblePolling(readSnapshot, 30_000);

  return {
    stats,
    platform,
    loading,
    refresh,
    parseStepsSummary,
    runDuration,
    statusColorMap,
  };
}
