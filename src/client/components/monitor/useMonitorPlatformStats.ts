import { useVisiblePolling } from "../../composables/useVisiblePolling.js";
import { ref } from "vue";
import { fetchPlatformStats, type PlatformStats } from "../../services/monitorApi.js";



/** 管理平台统计的兼容读取入口；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useMonitorPlatformStats() {


  const data = ref<PlatformStats | null>(null);
  const loading = ref(false);
  const error = ref("");
  /** 读取当前展示快照并更新加载状态；网络失败按原合同保留已成功的数据。 */
  async function readSnapshot(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      const snapshot = await fetchPlatformStats();
      if (isActive()) data.value = snapshot;
    } catch (err) {
      if (isActive()) error.value = "平台连接失败";
    } finally {
      if (isActive()) loading.value = false;
    }
  }

  const { refresh, isActive } = useVisiblePolling(readSnapshot, 60_000);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
