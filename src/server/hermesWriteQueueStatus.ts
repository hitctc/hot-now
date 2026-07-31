export type HermesWriteQueueStatus = {
  current: unknown | null;
  queue_length: number;
  queue: unknown[];
  stats: Record<string, number>;
  recent?: unknown[];
  run_started_at?: string | null;
  status_delayed?: boolean;
  status_unavailable?: boolean;
  status_message?: string;
  status_cached_at?: string;
};

type StatusReaderOptions = {
  fetchStatus: () => Promise<HermesWriteQueueStatus>;
  freshMs?: number;
  maxStaleMs?: number;
  now?: () => number;
};

/** 复制缓存结果，避免路由补充素材标题时污染下一次响应。 */
function cloneStatus(status: HermesWriteQueueStatus): HermesWriteQueueStatus {
  return structuredClone(status);
}

/** 创建带服务端单飞、短缓存和旧状态降级的 Hermes 队列状态读取器。 */
export function createHermesWriteQueueStatusReader(options: StatusReaderOptions): {
  read: () => Promise<HermesWriteQueueStatus>;
} {
  const freshMs = options.freshMs ?? 15_000;
  const maxStaleMs = options.maxStaleMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  let lastSuccess: { status: HermesWriteQueueStatus; readAt: number } | null = null;
  let activeRequest: Promise<HermesWriteQueueStatus> | null = null;

  /** 超时或网络失败时返回有明确延迟标记的旧状态，不让状态浮标阻塞主要页面。 */
  function delayedFallback(): HermesWriteQueueStatus {
    const currentTime = now();
    if (lastSuccess && currentTime - lastSuccess.readAt <= maxStaleMs) {
      return {
        ...cloneStatus(lastSuccess.status),
        status_delayed: true,
        status_unavailable: false,
        status_message: "写作队列状态延迟",
        status_cached_at: new Date(lastSuccess.readAt).toISOString()
      };
    }

    return {
      current: null,
      queue_length: 0,
      queue: [],
      stats: {
        total_submitted: 0,
        total_completed: 0,
        total_failed: 0,
        total_stopped: 0
      },
      status_delayed: true,
      status_unavailable: true,
      status_message: "暂时无法获取写作队列状态"
    };
  }

  return {
    async read() {
      const currentTime = now();
      if (lastSuccess && currentTime - lastSuccess.readAt <= freshMs) {
        return cloneStatus(lastSuccess.status);
      }

      if (!activeRequest) {
        activeRequest = options.fetchStatus()
          .then((status) => {
            lastSuccess = { status: cloneStatus(status), readAt: now() };
            return cloneStatus(status);
          })
          .finally(() => {
            activeRequest = null;
          });
      }

      try {
        return await activeRequest;
      } catch {
        return delayedFallback();
      }
    }
  };
}
