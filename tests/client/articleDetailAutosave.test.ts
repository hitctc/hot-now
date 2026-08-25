import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi, afterEach } from "vitest";

import { createLatestAutosaveQueue } from "../../src/client/components/creative/article-detail/latestAutosaveQueue.js";
import { useArticleAutosave } from "../../src/client/components/creative/article-detail/useArticleAutosave.js";
import { editFinishedArticle, type CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

vi.mock("../../src/client/services/creativeApi.js", () => ({
  editFinishedArticle: vi.fn().mockResolvedValue({ ok: true }),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("article detail autosave", () => {
  it("自动保存成功不触发父页面刷新，避免旧详情响应覆盖编辑内容", async () => {
    vi.useFakeTimers();
    const article = { id: 16212 } as CreativeFinishedArticle;
    const editContent = ref("旧草稿");
    const humanContent = ref("人工稿");
    const scope = effectScope();

    scope.run(() => useArticleAutosave({
      getArticle: () => article,
      editContent,
      humanContent,
      getLastSavedContent: () => "旧草稿",
      setLastSavedContent: () => {},
      getLastSavedHuman: () => "人工稿",
      setLastSavedHuman: () => {},
      isOpen: () => true,
      isReadonly: () => false,
    }));

    editContent.value = "用户刚编辑的新草稿";
    await nextTick();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(editFinishedArticle).toHaveBeenCalledWith(article.id, {
      contentMarkdown: "用户刚编辑的新草稿",
    });
    scope.stop();
  });

  it("保存进行中只保留最新版，并严格串行写入", async () => {
    const first = deferred();
    const saved: string[] = [];
    let activeCount = 0;
    let maxActiveCount = 0;
    const save = vi.fn(async (content: string) => {
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      saved.push(content);
      if (content === "旧快照") await first.promise;
      activeCount -= 1;
    });
    const queue = createLatestAutosaveQueue(save);

    const running = queue.enqueue("旧快照");
    void queue.enqueue("中间版本");
    void queue.enqueue("正在编辑的最新版");

    expect(saved).toEqual(["旧快照"]);
    first.resolve();
    await running;

    expect(saved).toEqual(["旧快照", "正在编辑的最新版"]);
    expect(maxActiveCount).toBe(1);
  });

  it("保存失败后保留待保存内容，下一次入队可用最新版恢复", async () => {
    const saved: string[] = [];
    let shouldFail = true;
    const queue = createLatestAutosaveQueue(async (content: string) => {
      saved.push(content);
      if (shouldFail) throw new Error("network down");
    });

    await expect(queue.enqueue("失败时的内容")).rejects.toThrow("network down");
    shouldFail = false;
    await queue.enqueue("失败后继续编辑的最新版");

    expect(saved).toEqual(["失败时的内容", "失败后继续编辑的最新版"]);
  });

  it("旧快照失败时仍继续保存请求期间产生的最新版", async () => {
    const first = deferred();
    const saved: string[] = [];
    const queue = createLatestAutosaveQueue(async (content: string) => {
      saved.push(content);
      if (content === "即将失败的旧快照") {
        await first.promise;
        throw new Error("old snapshot failed");
      }
    });

    const running = queue.enqueue("即将失败的旧快照");
    void queue.enqueue("失败期间产生的最新版");
    first.resolve();
    await running;

    expect(saved).toEqual(["即将失败的旧快照", "失败期间产生的最新版"]);
  });
});
