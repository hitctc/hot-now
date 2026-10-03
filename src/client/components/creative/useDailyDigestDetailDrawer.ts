import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import type { DailyDigestRecord, DailyDigestStatus } from "../../services/dailyDigestApi.js";
import { editDailyDigest, streamPushDigestToDraft, updateDailyDigestStatus, type DigestPushStepId, type DigestPushProgressEvent } from "../../services/dailyDigestApi.js";
import { wechatThemeOptions, type WechatThemeId } from "../../services/creativeApi.js";
import { renderWechatThemePreview } from "../../services/wechatRenderer.js";

export type DailyDigestDetailDrawerProps = {
  open: boolean;
  digest: DailyDigestRecord | null;
};

export type DailyDigestDetailDrawerEvents = {
  "update:open": [value: boolean];
  saved: [];
};

/** 管理日报编辑、保存和草稿推送；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useDailyDigestDetailDrawer(props: DailyDigestDetailDrawerProps, emit: <K extends keyof DailyDigestDetailDrawerEvents>(event: K, ...args: DailyDigestDetailDrawerEvents[K]) => void) {


  const activeThemeId = ref<WechatThemeId>("bauhaus");
  const saving = ref(false);
  const editContent = ref("");
  const editorFullscreen = ref(false);
  const lastSavedAt = ref<string | null>(null);

  // 推送状态
  const pushState = ref<"idle" | "pushing" | "done">("idle");
  const pushResult = ref<{ ok: boolean; errorCode?: string; errorMessage?: string } | null>(null);

  const STEP_DEFS: { id: DigestPushStepId; title: string }[] = [
    { id: "validate", title: "校验日报数据" },
    { id: "compat", title: "微信兼容处理" },
    { id: "token", title: "获取授权令牌" },
    { id: "cover", title: "上传封面图" },
    { id: "draft", title: "创建草稿" },
    { id: "status", title: "更新推送状态" },
  ];

  type StepStatus = "pending" | "running" | "done" | "error";
  const stepStates = ref<Record<string, { status: StepStatus; detail?: string }>>(
    Object.fromEntries(STEP_DEFS.map(s => [s.id, { status: "pending" as StepStatus }]))
  );
  const failedStepTitle = computed(() => STEP_DEFS.find((step) => stepStates.value[step.id]?.status === "error")?.title || "推送");

  // 编辑内容的主题预览 HTML
  const activePreviewHtml = computed(() => {
    if (!editContent.value) return "";
    return renderWechatThemePreview(editContent.value, activeThemeId.value);
  });

  const activePreviewLabel = computed(() => {
    const theme = wechatThemeOptions.find(t => t.value === activeThemeId.value);
    return theme ? `${theme.label}预览` : "排版预览";
  });

  const statusLabelMap: Record<DailyDigestStatus, string> = {
    generated: "已生成",
    publishing: "推送中",
    published: "已推送",
    failed: "推送失败",
  };

  const statusColorMap: Record<DailyDigestStatus, string> = {
    generated: "blue",
    publishing: "orange",
    published: "green",
    failed: "red",
  };
  /** 计算编辑文本的展示字数，不修改正文或保存状态。 */
  function countWords(text: string): number {
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    const englishWords = text.replace(/[一-鿿]/g, " ").split(/\s+/).filter(w => w.length > 0).length;
    return chineseChars + englishWords;
  }
  /** 将推送阶段状态转换为组件展示状态，不改变推送结果。 */
  function mapStepStatus(state: StepStatus): "wait" | "process" | "finish" | "error" {
    if (state === "pending") return "wait";
    if (state === "running") return "process";
    if (state === "done") return "finish";
    return "error";
  }
  /** 全屏时只退出并恢复页面滚动；否则通知父组件关闭，日报继续沿用手动保存合同。 */
  function handleClose() {
    if (editorFullscreen.value) {
      editorFullscreen.value = false;
      document.body.style.overflow = "";
      return;
    }
    emit("update:open", false);
  }
  /** 校验并保存当前表单/编辑稿，按现役返回值更新保存状态和事件。 */
  async function handleSave() {
    if (!props.digest || saving.value) return;
    saving.value = true;
    try {
      await editDailyDigest(props.digest.id, { contentMarkdown: editContent.value });
      lastSavedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      message.success("已保存");
      emit("saved");
    } catch {
      message.error("保存失败");
    } finally {
      saving.value = false;
    }
  }
  /** 清理日报推送的本地步骤和结果，为下一次显式推送准备展示。 */
  function resetPushState() {
    pushState.value = "idle";
    pushResult.value = null;
    STEP_DEFS.forEach(s => { stepStates.value[s.id] = { status: "pending" }; });
  }
  /** 读取当前最新稿件后发起现役草稿推送，并维护进度和完成事件。 */
  async function startPush() {
    if (!props.digest || pushState.value === "pushing") return;

    // 先保存
    if (editContent.value !== (props.digest.contentMarkdown ?? "")) {
      await handleSave();
    }

    pushState.value = "pushing";
    pushResult.value = null;
    STEP_DEFS.forEach(s => { stepStates.value[s.id] = { status: "pending" }; });

    // 更新状态为推送中
    try {
      await updateDailyDigestStatus(props.digest.id, "publishing");
    } catch { /* 静默 */ }

    const html = renderWechatThemePreview(editContent.value, activeThemeId.value);

    const handleProgress = (event: DigestPushProgressEvent) => {
      if (event.step === "complete") return;
      const state = stepStates.value[event.step];
      if (!state) return;
      state.status = event.status === "running" ? "running" : event.status === "done" ? "done" : "error";
      if (event.detail) state.detail = event.detail;
      if (event.status === "done") state.detail = undefined;
    };

    try {
      const result = await streamPushDigestToDraft(props.digest.id, activeThemeId.value, html, handleProgress);
      pushResult.value = result;
      pushState.value = "done";
      if (result.ok) {
        emit("saved");
      }
    } catch (err) {
      pushResult.value = { ok: false, errorMessage: (err as Error).message };
      pushState.value = "done";
    }
  }
  /** 切换当前编辑器的全屏展示，不改变正文内容或保存节奏。 */
  function toggleEditorFullscreen() {
    editorFullscreen.value = !editorFullscreen.value;
    document.body.style.overflow = editorFullscreen.value ? "hidden" : "";
  }
  /** 将调用方指定的文本复制到剪贴板，并按原流程反馈成功或失败。 */
  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => message.success("已复制")).catch(() => message.error("复制失败"));
  }

  watch(() => props.open, (val) => {
    if (val) {
      activeThemeId.value = "bauhaus";
      saving.value = false;
      editorFullscreen.value = false;
      lastSavedAt.value = null;
      editContent.value = props.digest?.contentMarkdown ?? "";
      document.body.style.overflow = "";
      resetPushState();
    }
  });

  watch(() => props.digest?.contentMarkdown, (val) => {
    if (val && !editContent.value) {
      editContent.value = val;
    }
  });

  return {
    activeThemeId,
    saving,
    editContent,
    editorFullscreen,
    lastSavedAt,
    pushState,
    pushResult,
    STEP_DEFS,
    stepStates,
    failedStepTitle,
    activePreviewHtml,
    activePreviewLabel,
    statusLabelMap,
    statusColorMap,
    countWords,
    mapStepStatus,
    handleClose,
    handleSave,
    startPush,
    toggleEditorFullscreen,
    copyText,
    wechatThemeOptions,
  };
}
