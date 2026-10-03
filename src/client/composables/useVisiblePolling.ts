import { onBeforeUnmount, onMounted } from "vue";

/** 观察页面可见性并合并同一读取通道；返回手动刷新及有效性检查，卸载时清理计时器和监听。 */
export function useVisiblePolling(read: () => Promise<void>, intervalMs: number) {
  let disposed = false;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** 手动刷新可直接调用；在途读取共用同一 Promise，不重叠创建请求。 */
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = read().finally(() => { inFlight = null; });
    return inFlight;
  }

  /** 周期和恢复可见共用入口；隐藏页不创建新的非必要读取。 */
  function refreshWhenVisible(): void {
    if (!document.hidden) void refresh();
  }

  onMounted(() => {
    refreshWhenVisible();
    timer = setInterval(refreshWhenVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
  });
  onBeforeUnmount(() => {
    disposed = true;
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", refreshWhenVisible);
  });

  return { refresh, isActive: () => !disposed };
}
