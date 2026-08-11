export type LatestAutosaveQueue<T> = {
  enqueue(value: T): Promise<void>;
  waitForIdle(): Promise<void>;
  clearPending(): void;
};

/**
 * 为单个编辑栏串行保存内容；请求进行中再次入队时只保留最新版。
 * 保存失败会留下待保存值，由下一次编辑、关闭或手动保存重新覆盖并提交。
 */
export function createLatestAutosaveQueue<T>(save: (value: T) => Promise<void>): LatestAutosaveQueue<T> {
  let pending: T;
  let hasPending = false;
  let running: Promise<void> | null = null;

  /** 持续取走当前最新版，前一个请求结束前不会开始下一个请求。 */
  async function drain(): Promise<void> {
    while (hasPending) {
      const current = pending;
      hasPending = false;
      try {
        await save(current);
      } catch (error) {
        // 请求期间已有更新内容时继续尝试最新版；没有新版才保留失败快照等待下次触发。
        if (hasPending) continue;
        pending = current;
        hasPending = true;
        throw error;
      }
    }
  }

  /** 更新待保存值；已有请求运行时复用同一个排空过程。 */
  function enqueue(value: T): Promise<void> {
    pending = value;
    hasPending = true;
    if (running) return running;

    const task = drain();
    running = task.finally(() => {
      running = null;
    });
    return running;
  }

  /** 等待当前保存链结束，供手动保存和标题联动避开并发写入。 */
  function waitForIdle(): Promise<void> {
    return running ?? Promise.resolve();
  }

  /** 显式保存成功后清理失败遗留的旧快照，避免后续再次写回。 */
  function clearPending(): void {
    hasPending = false;
  }

  return { enqueue, waitForIdle, clearPending };
}
