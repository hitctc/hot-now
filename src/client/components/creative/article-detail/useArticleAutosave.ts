import { ref, watch, type Ref } from "vue";
import { message } from "ant-design-vue";

import { editFinishedArticle, type CreativeFinishedArticle } from "../../../services/creativeApi.js";
import { createLatestAutosaveQueue } from "./latestAutosaveQueue.js";

type AutosavePayload = { articleId: number; content: string };

export type ArticleAutosaveOptions = {
  /** 返回当前文章，队列回写前用它确认抽屉没有切换到另一篇文章。 */
  getArticle: () => CreativeFinishedArticle | null;
  /** 编辑器正文和人工转写内容由父组件持有，组合式逻辑只监听并提交。 */
  editContent: Ref<string>;
  humanContent: Ref<string>;
  /** 快照仍由父组件共享，标题、图片和显式保存会同步更新它们。 */
  getLastSavedContent: () => string;
  setLastSavedContent: (content: string) => void;
  getLastSavedHuman: () => string;
  setLastSavedHuman: (content: string) => void;
  isOpen: () => boolean;
  isReadonly: () => boolean;
  onSaved: () => void;
};

/**
 * 管理文章详情的双栏自动保存：停止输入后防抖，保存请求严格串行，并且只提交最新版。
 * 显式保存和关闭抽屉仍由父组件决定何时调用这里的收口方法。
 */
export function useArticleAutosave(options: ArticleAutosaveOptions) {
  const saving = ref(false);
  const lastSavedAt = ref<number | null>(null);
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let humanAutoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** 左栏自动保存只落盘草稿快照，不读取或改写当前编辑器状态。 */
  async function persistDraftAutosave(payload: AutosavePayload): Promise<void> {
    saving.value = true;
    try {
      await editFinishedArticle(payload.articleId, { contentMarkdown: payload.content });
      if (options.getArticle()?.id !== payload.articleId) return;
      options.setLastSavedContent(payload.content);
      if (options.editContent.value === payload.content) lastSavedAt.value = Date.now();
      options.onSaved();
    } catch (error) {
      if (options.getArticle()?.id === payload.articleId) message.error("自动保存失败");
      throw error;
    } finally {
      saving.value = false;
    }
  }

  /** 中栏自动保存只落盘用户原文，标题同步留给显式标题操作、手动保存和推送。 */
  async function persistHumanAutosave(payload: AutosavePayload): Promise<void> {
    try {
      await editFinishedArticle(payload.articleId, { humanMarkdown: payload.content });
      if (options.getArticle()?.id !== payload.articleId) return;
      options.setLastSavedHuman(payload.content);
      if (options.humanContent.value === payload.content) lastSavedAt.value = Date.now();
    } catch (error) {
      if (options.getArticle()?.id === payload.articleId) message.error("人工转写保存失败");
      throw error;
    }
  }

  const draftAutosaveQueue = createLatestAutosaveQueue(persistDraftAutosave);
  const humanAutosaveQueue = createLatestAutosaveQueue(persistHumanAutosave);

  /** 清理尚未触发的防抖任务，显式保存和标题联动会先接管当前内容。 */
  function clearAutosaveTimers(): void {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    if (humanAutoSaveTimer) { clearTimeout(humanAutoSaveTimer); humanAutoSaveTimer = null; }
  }

  /** 等待已经发出的自动保存结束，并丢弃失败遗留的旧快照。 */
  async function prepareExplicitContentSave(): Promise<void> {
    clearAutosaveTimers();
    await Promise.allSettled([
      draftAutosaveQueue.waitForIdle(),
      humanAutosaveQueue.waitForIdle(),
    ]);
    draftAutosaveQueue.clearPending();
    humanAutosaveQueue.clearPending();
  }

  /** 将左栏当前最新版交给串行队列，错误已经在持久化边界提示。 */
  function enqueueDraftAutosave(content: string): void {
    const articleId = options.getArticle()?.id;
    if (!articleId) return;
    void draftAutosaveQueue.enqueue({ articleId, content }).catch(() => {});
  }

  /** 将中栏当前最新版交给串行队列，不在响应后回写 humanContent。 */
  function enqueueHumanAutosave(content: string): void {
    const articleId = options.getArticle()?.id;
    if (!articleId) return;
    void humanAutosaveQueue.enqueue({ articleId, content }).catch(() => {});
  }

  // 两栏均在停止输入 5 秒后入队；定时器触发时读取当前值，避免提交闭包中的旧版本。
  watch(options.editContent, (value) => {
    if (!options.isOpen() || options.isReadonly() || value === options.getLastSavedContent()) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      if (options.editContent.value !== options.getLastSavedContent()) {
        enqueueDraftAutosave(options.editContent.value);
      }
    }, 5_000);
  });

  watch(options.humanContent, (value) => {
    if (!options.isOpen() || options.isReadonly() || value === options.getLastSavedHuman()) return;
    if (humanAutoSaveTimer) clearTimeout(humanAutoSaveTimer);
    humanAutoSaveTimer = setTimeout(() => {
      humanAutoSaveTimer = null;
      if (options.humanContent.value !== options.getLastSavedHuman()) {
        enqueueHumanAutosave(options.humanContent.value);
      }
    }, 5_000);
  });

  return {
    saving,
    lastSavedAt,
    clearAutosaveTimers,
    prepareExplicitContentSave,
    enqueueDraftAutosave,
    enqueueHumanAutosave,
  };
}
