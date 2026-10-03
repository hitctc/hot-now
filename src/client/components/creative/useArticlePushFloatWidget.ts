import { ref, reactive, computed, watch, onBeforeUnmount } from "vue";
import type { CreativeFinishedArticle } from "../../services/creativeApi";
import { streamPushArticleToDraft, readCreativeFinishedArticle, type PushDraftResult, type PushStepId, type PushProgressEvent, type WechatThemeId } from "../../services/creativeApi";
import { renderWechatThemePreview } from "../../services/wechatRenderer";

export type ArticlePushFloatWidgetProps = {
  visible: boolean;
  article: CreativeFinishedArticle | null;
  themeId: WechatThemeId;
  themeLabel: string;
  defaultAccountName: string;
};

export type ArticlePushFloatWidgetEvents = {
  "update:visible": [value: boolean];
  success: [];
};

/** 管理推送浮窗的进度、结果与自动关闭；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useArticlePushFloatWidget(props: ArticlePushFloatWidgetProps, emit: <K extends keyof ArticlePushFloatWidgetEvents>(event: K, ...args: ArticlePushFloatWidgetEvents[K]) => void) {


  const STEP_DEFS: { id: PushStepId; title: string }[] = [
    { id: "validate", title: "校验文章数据" },
    { id: "compat", title: "微信兼容处理" },
    { id: "token", title: "获取授权令牌" },
    { id: "cover", title: "上传封面图" },
    { id: "images", title: "上传正文图片" },
    { id: "draft", title: "创建草稿" },
    { id: "status", title: "更新文章状态" },
  ];

  type StepStatus = "pending" | "running" | "done" | "error";

  const pushState = ref<"idle" | "pushing" | "done">("idle");
  const pushResult = ref<PushDraftResult | null>(null);
  const secondsUntilClose = ref<number | null>(null);
  let autoCloseTimer: ReturnType<typeof setInterval> | null = null;
  const stepStates = reactive<Record<string, { status: StepStatus; detail?: string }>>(
    Object.fromEntries(STEP_DEFS.map((s) => [s.id, { status: "pending" as StepStatus }]))
  );

  /** 停止本次自动关闭并清除倒计时；用于取消、手动关闭和组件销毁，避免影响下一篇。 */
  function cancelAutoClose(): void {
    if (autoCloseTimer !== null) clearInterval(autoCloseTimer);
    autoCloseTimer = null;
    secondsUntilClose.value = null;
  }

  /** 成功推送后显示五秒倒计时，到零时按手动关闭的同一事件通知父页面。 */
  function startAutoClose(): void {
    cancelAutoClose();
    if (!props.visible) return;
    secondsUntilClose.value = 5;
    autoCloseTimer = setInterval(() => {
      if (secondsUntilClose.value === null) return;
      if (secondsUntilClose.value <= 1) close();
      else secondsUntilClose.value -= 1;
    }, 1000);
  }

  /** 重置确认态并清理上一次推送的计时器；切换文章或重新推送时调用。 */
  function resetState(): void {
    cancelAutoClose();
    pushState.value = "idle";
    pushResult.value = null;
    STEP_DEFS.forEach((s) => { stepStates[s.id] = { status: "pending" }; });
  }

  watch(
    () => props.visible,
    (v) => {
      if (v) resetState();
      else cancelAutoClose();
    }
  );
  onBeforeUnmount(cancelAutoClose);
  /** 从当前稿件候选中选择推送展示标题，不修改服务端文章。 */
  function getPublishTitle(article: CreativeFinishedArticle): string {
    if (!article.titles) return "未命名文章";
    let titles: string[] = [];
    if (Array.isArray(article.titles)) titles = article.titles;
    else if (typeof article.titles === "string") {
      try { const p = JSON.parse(article.titles); if (Array.isArray(p)) titles = p; } catch { /* */ }
    }
    if (titles.length === 0) return "未命名文章";
    const idx = Math.min(article.titleIndex ?? 0, titles.length - 1);
    return titles[idx >= 0 ? idx : 0];
  }
  /** 把流式进度事件合并到本地步骤展示，不重新提交推送。 */
  function handleProgressEvent(event: PushProgressEvent): void {
    if (event.step === "complete") return;
    const state = stepStates[event.step];
    if (!state) return;
    state.status = event.status;
    if (event.detail) state.detail = event.detail;
    if (event.status === "done") state.detail = undefined;
  }

  /** 立即启动当前文章推送，并在悬浮窗内持续更新进度与最终结果。 */
  async function startPush(): Promise<void> {
    if (!props.article || pushState.value === "pushing") return;
    cancelAutoClose();
    pushState.value = "pushing";
    pushResult.value = null;
    STEP_DEFS.forEach((s) => { stepStates[s.id] = { status: "pending" }; });

    let latestArticle = props.article;
    try {
      latestArticle = await readCreativeFinishedArticle(props.article.id);
    } catch { /* 拉取失败则回退到内存中的数据 */ }

    const sourceMarkdown = latestArticle.humanMarkdown ?? latestArticle.contentMarkdown;
    const html = sourceMarkdown
      ? renderWechatThemePreview(sourceMarkdown, props.themeId)
      : undefined;

    try {
      const result = await streamPushArticleToDraft(latestArticle.id, props.themeId, html, handleProgressEvent);
      pushResult.value = result;
      pushState.value = "done";
      if (result.ok) {
        emit("success");
        startAutoClose();
      }
    } catch (err) {
      pushResult.value = { ok: false, errorCode: "fetch-error", errorMessage: (err as Error).message };
      pushState.value = "done";
    }
  }

  /** 手动或倒计时关闭浮窗，停止后续计时并通知父页面更新可见状态。 */
  function close(): void {
    cancelAutoClose();
    emit("update:visible", false);
  }

  const isPushing = computed(() => pushState.value === "pushing");
  const isDone = computed(() => pushState.value === "done");
  const failedStepError = computed(() => pushResult.value?.ok ? "" : (pushResult.value?.errorMessage || "推送失败"));
  const failedStepTitle = computed(() => STEP_DEFS.find((step) => stepStates[step.id].status === "error")?.title || "推送");

  return {
    STEP_DEFS,
    pushState,
    pushResult,
    secondsUntilClose,
    stepStates,
    cancelAutoClose,
    resetState,
    getPublishTitle,
    startPush,
    close,
    isPushing,
    isDone,
    failedStepError,
    failedStepTitle,
  };
}
