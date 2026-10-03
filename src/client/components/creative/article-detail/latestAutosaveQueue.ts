export type LatestAutosaveQueue<T> = {
  enqueue(value: T): Promise<void>;
  waitForIdle(): Promise<void>;
  clearPending(identity?: unknown): void;
};

/**
 * 串行保存一个编辑栏；同一文章只保留最新版，不用新文章淘汰上一文章的待保存稿。
 * 未提供身份函数时保持原单一稿件合同；失败稿留到下一次触发，不在同次排空中无限重试。
 */
export function createLatestAutosaveQueue<T>(
  save: (value: T) => Promise<void>,
  identify: (value: T) => unknown = () => undefined,
): LatestAutosaveQueue<T> {
  const pending = new Map<unknown, T>();
  let running: Promise<void> | null = null;

  /** 依次保存各文章的最新版；失败不阻断另一篇待保存稿，也不能造成重试循环。 */
  async function drain(): Promise<void> {
    const failed = new Map<unknown, T>();
    let failure: unknown;
    while (pending.size > 0) {
      const [identity, current] = pending.entries().next().value!;
      pending.delete(identity);
      failed.delete(identity);
      try {
        await save(current);
      } catch (error) {
        // 有同一文章的更新稿时继续最新版；否则保留失败稿到本次排空之后再重试。
        if (pending.has(identity)) continue;
        failed.set(identity, current);
        failure = error;
      }
    }
    for (const [identity, value] of failed) pending.set(identity, value);
    if (failed.size > 0) throw failure;
  }

  /** 合并同一身份的待保存值；所有身份仍复用同一串行排空过程。 */
  function enqueue(value: T): Promise<void> {
    pending.set(identify(value), value);
    if (running) return running;
    const task = drain();
    running = task.finally(() => { running = null; });
    return running;
  }

  /** 等待当前保存链结束，供手动保存和标题联动避开并发写入。 */
  function waitForIdle(): Promise<void> {
    return running ?? Promise.resolve();
  }

  /** 显式保存仅清理对应文章的失败快照；未传身份时兼容原清空入口。 */
  function clearPending(identity?: unknown): void {
    if (identity === undefined) pending.clear();
    else pending.delete(identity);
  }

  return { enqueue, waitForIdle, clearPending };
}
