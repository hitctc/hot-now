import { ref, reactive, computed, watch } from "vue";
import type { CreativeFinishedArticle } from "../../services/creativeApi";
import { streamPushArticleToDraft, readCreativeFinishedArticle, type PushDraftResult, type PushStepId, type PushProgressEvent, type WechatThemeId } from "../../services/creativeApi";
import { renderWechatThemePreview } from "../../services/wechatRenderer";

export type ArticlePushConfirmModalProps = {
  visible: boolean;
  article: CreativeFinishedArticle | null;
  themeId: WechatThemeId;
  themeLabel: string;
  defaultAccountName: string;
};

export type ArticlePushConfirmModalEvents = {
  "update:visible": [value: boolean];
  success: [];
};

/** 管理推送确认弹窗的最新稿读取与进度；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useArticlePushConfirmModal(props: ArticlePushConfirmModalProps, emit: <K extends keyof ArticlePushConfirmModalEvents>(event: K, ...args: ArticlePushConfirmModalEvents[K]) => void) {


  // 推送步骤定义：id 与后端 PushStepId 一一对应
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
  const stepStates = reactive<Record<string, { status: StepStatus; detail?: string }>>(
    Object.fromEntries(STEP_DEFS.map((s) => [s.id, { status: "pending" as StepStatus }]))
  );

  // 弹窗打开时重置状态
  watch(
    () => props.visible,
    (v) => {
      if (v) {
        pushState.value = "idle";
        pushResult.value = null;
        STEP_DEFS.forEach((s) => {
          stepStates[s.id] = { status: "pending" };
        });
      }
    }
  );
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

  // 将自定义状态映射为 Ant Steps 的 status
  function mapStepStatus(state: StepStatus): "wait" | "process" | "finish" | "error" {
    if (state === "pending") return "wait";
    if (state === "running") return "process";
    if (state === "done") return "finish";
    return "error";
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
  /** 读取当前最新稿件后发起现役草稿推送，并维护进度和完成事件。 */
  async function startPush(): Promise<void> {
    if (!props.article) return;
    pushState.value = "pushing";
    pushResult.value = null;
    STEP_DEFS.forEach((s) => { stepStates[s.id] = { status: "pending" }; });

    // 从 DB 拉最新数据，确保推送的是已保存的内容而非内存中的旧版本
    let latestArticle = props.article;
    try {
      latestArticle = await readCreativeFinishedArticle(props.article.id);
    } catch { /* 拉取失败则回退到内存中的数据 */ }

    const html = latestArticle.contentMarkdown
      ? renderWechatThemePreview(latestArticle.contentMarkdown, props.themeId)
      : undefined;

    try {
      const result = await streamPushArticleToDraft(latestArticle.id, props.themeId, html, handleProgressEvent);
      pushResult.value = result;
      pushState.value = "done";
      if (result.ok) emit("success");
    } catch (err) {
      pushResult.value = { ok: false, errorCode: "fetch-error", errorMessage: (err as Error).message };
      pushState.value = "done";
    }
  }

  const isPushing = computed(() => pushState.value === "pushing");
  const isDone = computed(() => pushState.value === "done");
  const failedStepError = computed(() => pushResult.value?.ok ? "" : (pushResult.value?.errorMessage || "推送失败"));
  const failedStepTitle = computed(() => STEP_DEFS.find((step) => stepStates[step.id].status === "error")?.title || "推送");

  return {
    STEP_DEFS,
    pushState,
    pushResult,
    stepStates,
    getPublishTitle,
    mapStepStatus,
    startPush,
    isPushing,
    isDone,
    failedStepError,
    failedStepTitle,
  };
}
