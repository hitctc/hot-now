import { ref, computed } from "vue";
import { message } from "ant-design-vue";
import { providerGenerateImage, codexGenerateImage, fetchMissingImages, type ImageGenAction, type ImageGenResponse, type MissingImagesResponse, type CreativeFinishedArticle } from "../../services/creativeApi.js";

export type ImageActionModalProps = {
  open: boolean;
  article: CreativeFinishedArticle | null;
};

export type ImageActionModalEvents = {
  "update:open": [value: boolean];
  done: [];
};

/** 管理人工图片操作的选择、提交和结果；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useImageActionModal(props: ImageActionModalProps, emit: <K extends keyof ImageActionModalEvents>(event: K, ...args: ImageActionModalEvents[K]) => void) {


  // 安全解析 titles 字段（可能是 JSON 字符串、已解析数组或 null）
  function parseFirstTitle(raw: string | null): string {
    if (!raw) return "";
    if (Array.isArray(raw)) return raw[0] ?? "";
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed[0] ?? "" : "";
    } catch { return ""; }
  }

  const firstTitle = computed(() => parseFirstTitle(props.article?.titles ?? null));

  // ─── 流程选择 ───

  type Flow = "provider" | "codex";
  const selectedFlow = ref<Flow>("provider");

  // ─── action 分组 ───

  type ActionDef = { value: ImageGenAction; label: string; desc: string; needIndex: boolean };

  const actionGroups: { title: string; actions: ActionDef[] }[] = [
    {
      title: "全部",
      actions: [
        { value: "fill-all", label: "补全缺图", desc: "缺图才补、有则跳过", needIndex: false },
        { value: "replace-all", label: "替换全部", desc: "强制重新生成所有图", needIndex: false },
      ],
    },
    {
      title: "封面",
      actions: [
        { value: "fill-cover", label: "补封面", desc: "无封面才生成", needIndex: false },
        { value: "replace-cover", label: "替换封面", desc: "重新生成封面", needIndex: false },
      ],
    },
    {
      title: "正文",
      actions: [
        { value: "fill-inline-all", label: "补全正文图", desc: "缺的正文图才补", needIndex: false },
        { value: "replace-inline-all", label: "替换正文图", desc: "重新生成所有正文图", needIndex: false },
        { value: "fill-inline", label: "补指定正文图", desc: "指定 slot 补图", needIndex: true },
        { value: "replace-inline", label: "替换指定正文图", desc: "指定 slot 替换", needIndex: true },
      ],
    },
  ];

  const allActions = actionGroups.flatMap(g => g.actions);

  const selectedAction = ref<ImageGenAction | null>(null);
  const inlineIndex = ref<number | null>(null);

  // 当前选中的 action 定义
  const selectedDef = computed(() => allActions.find(a => a.value === selectedAction.value));

  // 需要 imageIndex 但未填
  const indexMissing = computed(() => selectedDef.value?.needIndex && inlineIndex.value == null);

  // ─── 缺图信息 ───

  const missingInfo = ref<MissingImagesResponse | null>(null);
  const missingLoading = ref(false);
  /** 读取当前文章缺失图片的信息，不隐式启动模型或图片生成。 */
  async function loadMissingInfo(): Promise<void> {
    if (!props.article) return;
    missingLoading.value = true;
    try {
      missingInfo.value = await fetchMissingImages(props.article.id);
    } catch { /* 静默 */ }
    finally { missingLoading.value = false; }
  }

  // ─── 执行 ───

  const submitting = ref(false);
  const lastResult = ref<ImageGenResponse | null>(null);
  /** 提交用户选定的图片操作，更新结果、忙碌状态和原有完成事件。 */
  async function handleSubmit(): Promise<void> {
    if (!props.article || !selectedAction.value || indexMissing.value) return;

    submitting.value = true;
    lastResult.value = null;
    try {
      const fn = selectedFlow.value === "provider" ? providerGenerateImage : codexGenerateImage;
      const result = await fn(props.article.id, selectedAction.value, inlineIndex.value ?? undefined);
      lastResult.value = result;

      if (result.success) {
        const s = result.summary;
        if (s && s.failed > 0) {
          message.warning(`完成 ${s.success} 张，失败 ${s.failed} 张，跳过 ${s.skipped} 张`);
        } else {
          message.success("生图完成");
        }
        emit("done");
      } else {
        message.error(result.error ?? "生图失败");
      }
    } catch (err: unknown) {
      const httpErr = err as { body?: { error?: string } };
      message.error(httpErr?.body?.error ?? "生图请求失败");
    } finally {
      submitting.value = false;
    }
  }

  // ─── 打开/关闭 ───

  function handleOpen(): void {
    selectedAction.value = null;
    inlineIndex.value = null;
    lastResult.value = null;
    missingInfo.value = null;
    selectedFlow.value = "provider";
    loadMissingInfo();
  }
  /** 通知父组件关闭图片操作框，不取消或重放已经提交的图片任务。 */
  function handleClose(): void {
    emit("update:open", false);
  }

  const flowOptions = [
    { value: "provider" as Flow, label: "服务商生图" },
    { value: "codex" as Flow, label: "Codex 生图" },
  ];

  return {
    firstTitle,
    selectedFlow,
    actionGroups,
    selectedAction,
    inlineIndex,
    selectedDef,
    indexMissing,
    missingInfo,
    missingLoading,
    submitting,
    lastResult,
    handleSubmit,
    handleOpen,
    handleClose,
    flowOptions,
  };
}
