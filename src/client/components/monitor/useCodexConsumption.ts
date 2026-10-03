import { useVisiblePolling } from "../../composables/useVisiblePolling.js";
import { ref, computed } from "vue";
import { fetchCodexConsumption, type CodexConsumptionResponse } from "../../services/monitorApi.js";

export type CodexConsumptionEvents = {
  openArticle: [articleId: number];
};

/** 管理Codex 消耗快照和展示时间；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useCodexConsumption() {


  const data = ref<CodexConsumptionResponse | null>(null);
  const loading = ref(false);
  /** 读取当前展示快照并更新加载状态；网络失败按原合同保留已成功的数据。 */
  async function readSnapshot(): Promise<void> {
    loading.value = true;
    try {
      const snapshot = await fetchCodexConsumption({ limit: 10 });
      if (isActive()) data.value = snapshot;
    } catch { /* 静默 */ }
    finally { if (isActive()) loading.value = false; }
  }

  const items = computed(() => data.value?.items ?? []);
  const pendingCount = computed(() => data.value?.pending_count ?? 0);
  const nextScheduleAt = computed(() => data.value?.next_schedule_at);
  const scheduleInterval = computed(() => data.value?.schedule_interval_seconds);

  // 下次消费倒计时
  function formatCountdown(iso: string | null): string {
    if (!iso) return "-";
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return "即将执行";
    if (diff < 60_000) return `${Math.round(diff / 1000)}秒后`;
    if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟后`;
    return `${Math.round(diff / 3600_000)}小时后`;
  }

  // 消费状态配置
  const consumeConfig: Record<string, { color: string; label: string }> = {
    success:         { color: "green",  label: "已消费" },
    pending:         { color: "blue",   label: "待消费" },
    failed:          { color: "red",    label: "消费失败" },
    failed_generate: { color: "red",    label: "生图失败" },
  };
  /** 将时间与当前时刻的差值格式化为相对时间，仅用于展示。 */
  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return `${Math.round(diff / 1000)}秒前`;
    if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟前`;
    return `${Math.round(diff / 3600_000)}小时前`;
  }

  const { refresh, isActive } = useVisiblePolling(readSnapshot, 30_000);

  return {
    loading,
    refresh,
    items,
    pendingCount,
    nextScheduleAt,
    scheduleInterval,
    formatCountdown,
    consumeConfig,
    timeAgo,
  };
}
