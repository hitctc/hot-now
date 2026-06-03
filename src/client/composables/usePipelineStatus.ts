import { ref, onMounted, onBeforeUnmount } from "vue";
import { fetchMonitorStats } from "../services/monitorApi.js";

// 模块级单例：所有组件共享同一份状态
const pipelineOn = ref(true);
const writeOn = ref(true);
const loading = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const stats = await fetchMonitorStats();
    pipelineOn.value = stats.switches.pipeline === "on";
    writeOn.value = stats.switches.write === "on";
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

/**
 * 全局管线状态 composable。
 * 多个组件同时使用时共享同一份轮询，引用计数归零后自动停止。
 */
export function usePipelineStatus() {
  onMounted(() => {
    refCount++;
    if (refCount === 1) {
      refresh();
      pollTimer = setInterval(refresh, 30_000);
    }
  });

  onBeforeUnmount(() => {
    refCount--;
    if (refCount <= 0) {
      refCount = 0;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
  });

  return {
    pipelineOn,
    writeOn,
    loading,
    refresh,
  };
}
