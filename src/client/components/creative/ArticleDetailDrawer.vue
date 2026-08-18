<!-- 文章详情弹窗：展示标题/立意/摘要 + 正文编辑器（左编辑右预览），底部悬浮工具栏 -->
<template>
  <a-modal
    :open="open"
    :closable="true"
    :mask-closable="true"
    :destroy-on-close="true"
    width="90%"
    centered
    :wrap-class-name="articleDetailWrapClass"
    :mask-style="articleDetailMaskStyle"
    :body-style="{ padding: '24px', overflowY: 'auto' }"
    :z-index="1000"
    @cancel="handleClose"
  >
    <template #title>
      <ArticleDetailHeader
        v-if="article"
        :article="article"
        @copy-id="copyArticleId"
        @open-source="$emit('openSourceItem', $event)"
      />
    </template>

    <template #footer>
      <ArticleDetailFooter
        v-if="article"
        :article="article"
        :readonly="props.readonly"
        :saving="saving"
        :wechat-copying="wechatCopying"
        :can-push="canPush"
        :missing-conditions="missingConditions"
        @save="handleSave"
        @copy-format="copyAsWechatFormat"
        @review="reviewModalVisible = true"
        @mark-publishable="handleDetailMarkPublishable"
        @cancel-publishable="handleDetailCancelPublishable"
        @restore="handleDetailRestore"
        @discard="handleDetailDiscard"
        @push="saveAndPush"
      />
    </template>

    <template v-if="article">
      <div class="article-detail-content flex flex-col gap-6">
        <ArticlePlanningSections
          :article="article"
          :readonly="props.readonly"
          :is-manual-article="isManualArticle"
          :manual-title="manualTitle"
          :display-titles="displayTitles"
          :active-title-index="activeTitleIndex"
          :editing-title-index="editingTitleIdx"
          :editing-title-value="editingTitleValue"
          :regen-title-loading="regenTitleLoading"
          :display-intros="displayIntros"
          :active-intro-index="activeIntroIndex"
          :regen-intro-loading="regenIntroLoading"
          :display-summaries="displaySummaries"
          :title-candidate-at="titleCandidateAt"
          @update:manual-title="manualTitle = $event"
          @save-manual-title="saveManualTitle"
          @regenerate-title="handleRegenTitle"
          @copy="copyText"
          @select-title="selectTitle"
          @start-title-edit="startEditTitle"
          @save-title-edit="saveTitleEdit"
          @cancel-title-edit="cancelEditTitle"
          @update:editing-title-value="editingTitleValue = $event"
          @regenerate-intro="handleRegenIntro"
          @select-intro="selectIntro"
        />

        <ArticleSimilaritySection
          :is-manual-article="isManualArticle"
          :article-id="article.id"
          :similarity-check="article.similarityCheck"
        />

        <!-- 写作流程时间线 -->
        <StepTraceTimeline
          v-if="!isManualArticle"
          :step-trace="article?.stepTrace ?? null"
          :stop-step="article?.stopStep"
          :reason-text="article?.reasonText"
        />

        <ArticleSupplementalSections
          :article="article"
          :readonly="props.readonly"
          :is-manual-article="isManualArticle"
          :source-cover-url="sourceCoverUrl"
          :generating-comments="generatingComments"
          :generating-author-extensions="generatingAuthorExtensions"
          @copy="copyText"
          @generate-comments="handleGenerateComments"
          @generate-author-extensions="handleGenerateAuthorExtensions"
        />

        <ArticleShortImagePromptSection
          :prompts="article.imagePrompts ?? []"
          :readonly="props.readonly"
          @copy="copyPrompt"
          @save="saveLegacyShortPrompt"
          @dirty-change="setPromptDirty"
        />

        <ArticleImageWorkflowSections
          :article="article"
          :readonly="props.readonly"
          :article-images="articleImages"
          :display-cover-images="displayCoverImages"
          :active-cover-index="activeCoverIndex"
          :inline-image-slot-count="inlineImageSlotCount"
          :total-image-slot-count="totalImageSlotCount"
          :cover-prompt-generating="coverPromptGenerating"
          :inline-prompts-generating="inlinePromptsGenerating"
          :inline-prompt-generating-index="inlinePromptGeneratingIndex"
          :uploading-cover="uploadingCover"
          :uploading-inline="uploadingInline"
          :luna-image-eligible="lunaImageEligible"
          :luna-image-jobs="lunaImageJobs"
          @copy-prompt="copyPrompt"
          @prompt-dirty="setPromptDirty"
          @generate-cover-prompt="handleGenerateCoverPrompt"
          @upload-cover="handleUploadCover"
          @select-cover="selectCoverImage"
          @save-cover-prompt="saveCoverPrompt"
          @generate-inline-prompts="handleGenerateInlinePrompts"
          @upload-inline="handleUploadInlineImage"
          @save-inline-prompt="saveInlinePrompt"
          @generate-luna-image="handleGenerateLunaImage"
        />

        <!-- 正文编辑器：普通态与全屏态共用同一份编辑状态。 -->
        <section v-if="article.contentMarkdown || article.humanMarkdown || isManualArticle" ref="editorSectionRef" class="editor-section">
          <ArticleEditorPanel
            :readonly="props.readonly"
            :is-manual-article="isManualArticle"
            :human-content="humanContent"
            :ai-draft="editContent"
            :preview-html="activePreviewHtml"
            :preview-label="activePreviewLabel"
            :preview-theme-options="previewThemeOptions"
            :active-preview-theme="activePreviewTheme"
            :sync-scroll-enabled="syncScrollEnabled"
            :saved-at-label="savedAtLabel"
            :focus-mode="focusMode"
            :saving="saving"
            :dynamic-height="dynamicEditorHeight"
            :editor-fullscreen="editorFullscreen"
            @update:human-content="humanContent = $event"
            @update:ai-draft="editContent = $event"
            @select-theme="handlePreviewThemeSelection"
            @copy-ai="copyAiDraft"
            @copy-plain="copyAiDraftAsPlainText"
            @toggle-sync-scroll="toggleSyncScroll"
            @toggle-fullscreen="toggleEditorFullscreen"
            @unlock-focus-mode="unlockFocusMode"
            @save="handleSave"
          />
        </section>
      </div>
    </template>

  </a-modal>

  <!-- 审核弹窗（独立于详情弹窗，z-index 更高） -->
  <Teleport to="body">
    <ArticleReviewModal
      v-model:visible="reviewModalVisible"
      :article="article"
      @reviewed="handleReviewDone"
    />
  </Teleport>

  <!-- 手动生图弹窗 -->
  <ImageActionModal
    v-model:open="imageActionVisible"
    :article="article"
    @done="handleImageActionDone"
  />
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount } from "vue";
import { message } from "ant-design-vue";

import ArticleEditorPanel from "./article-detail/ArticleEditorPanel.vue";
import ArticlePlanningSections from "./article-detail/ArticlePlanningSections.vue";
import ArticleSimilaritySection from "./article-detail/ArticleSimilaritySection.vue";
import ArticleSupplementalSections from "./article-detail/ArticleSupplementalSections.vue";
import { useArticleEditorViewport } from "./article-detail/useArticleEditorViewport.js";
import { useArticleAutosave } from "./article-detail/useArticleAutosave.js";
import { useArticleImageWorkflow } from "./article-detail/useArticleImageWorkflow.js";
import { useArticlePlanningActions, type PreviewThemeKey } from "./article-detail/useArticlePlanningActions.js";
import ArticleImageWorkflowSections from "./article-detail/ArticleImageWorkflowSections.vue";
import ArticleShortImagePromptSection from "./article-detail/ArticleShortImagePromptSection.vue";
import ArticleDetailFooter from "./article-detail/ArticleDetailFooter.vue";
import ArticleDetailHeader from "./article-detail/ArticleDetailHeader.vue";
import StepTraceTimeline from "./StepTraceTimeline.vue";
import ArticleReviewModal from "./ArticleReviewModal.vue";
import ImageActionModal from "./ImageActionModal.vue";
import { checkPublishConditions } from "./articleStatusShared.js";
import {
  editFinishedArticle,
  readCreativeSourceItem,
  deleteFinishedArticle,
  restoreFinishedArticle,
  generateComments,
  generateAuthorExtensions,
  type CreativeFinishedArticle,
  type WechatThemeId,
} from "../../services/creativeApi.js";
import { renderWechatThemePreview } from "../../services/wechatRenderer.js";
import { formatRelativeTime, parseJsonArray } from "./article-detail/articleDetailPresentation.js";
import { readFirstH1 } from "./article-detail/articleTitleSync.js";

const props = defineProps<{
  open: boolean;
  article: CreativeFinishedArticle | null;
  readonly?: boolean;
}>();

const isManualArticle = computed(() => props.article?.originType === "manual");

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
  openSourceItem: [sourceItemId: number];
  openPush: [article: CreativeFinishedArticle, themeId: WechatThemeId];
}>();

// 深层文章对象修改不会触发响应式，图片和保存组合式逻辑通过这个计数器通知发布条件重新计算。
const articleChangeTick = ref(0);
function tickArticleChange(): void { articleChangeTick.value++; }

const previewThemeOptions: { key: PreviewThemeKey; label: string }[] = [
  { key: "classic", label: "默认" },
  { key: "bauhaus", label: "包豪斯" },
  { key: "sunsetFilm", label: "落日胶片" },
  { key: "receipt", label: "购物小票" },
  { key: "blackGold", label: "黑金主题" },
  { key: "live", label: "实时预览" },
];

const activePreviewTheme = ref<PreviewThemeKey>("sunsetFilm");

const themeIdMap: Record<Exclude<PreviewThemeKey, "live">, WechatThemeId> = {
  classic: "classic",
  bauhaus: "bauhaus",
  sunsetFilm: "sunset-film",
  receipt: "receipt",
  blackGold: "black-gold",
};

const reverseThemeIdMap: Record<string, Exclude<PreviewThemeKey, "live">> = {
  classic: "classic",
  bauhaus: "bauhaus",
  "sunset-film": "sunsetFilm",
  receipt: "receipt",
  "black-gold": "blackGold",
};

/** 图片操作使用当前预览主题；实时预览没有固定主题时沿用原来的 classic 兜底。 */
function getImagePreviewThemeId(): WechatThemeId {
  if (activePreviewTheme.value !== "live") return themeIdMap[activePreviewTheme.value];
  return "classic";
}

// 编辑器可视区由组合式逻辑管理，抽屉只负责在打开/关闭时调用其生命周期方法。
const {
  articleDetailMaskStyle,
  articleDetailWrapClass,
  dynamicEditorHeight,
  editorFullscreen,
  editorSectionRef,
  focusMode,
  handleFullscreenEsc,
  resetEditorFullscreen,
  setupEditorResize,
  syncScrollEnabled,
  teardownEditorResize,
  toggleEditorFullscreen,
  toggleSyncScroll,
  unlockFocusMode,
} = useArticleEditorViewport();

function copyArticleId(id: number): void {
  navigator.clipboard.writeText(`【成品文章id: ${id}】`).then(() => {
    message.success("已复制");
  });
}

function copyPrompt(text: string): void {
  navigator.clipboard.writeText(text).then(() => {
    message.success("已复制");
  });
}

// 提示词编辑使用显式保存；关闭弹窗前统一检查仍未保存的行。
const promptDirtyKeys = ref<Set<string>>(new Set());
function setPromptDirty(key: string, dirty: boolean): void {
  const next = new Set(promptDirtyKeys.value);
  if (dirty) next.add(key);
  else next.delete(key);
  promptDirtyKeys.value = next;
}

// ─── 正文编辑 ───

const editContent = ref("");
// 人工转写内容（中栏 = 发布内容）：注入真人 token 过朱雀；打开时初始预填 AI 草稿副本
const humanContent = ref("");
// 相对时间展示需要每秒刷新，用 tick 驱动 computed 重算
const relativeTick = ref(0);
let relativeTimer: ReturnType<typeof setInterval> | null = null;
// 记住打开时的原始内容，用于判断是否真正发生变化
let lastSavedContent = "";
let lastSavedHuman = "";

const {
  saving,
  lastSavedAt,
  clearAutosaveTimers,
  prepareExplicitContentSave,
  enqueueDraftAutosave,
  enqueueHumanAutosave,
} = useArticleAutosave({
  getArticle: () => props.article,
  editContent,
  humanContent,
  getLastSavedContent: () => lastSavedContent,
  setLastSavedContent: (content) => { lastSavedContent = content; },
  getLastSavedHuman: () => lastSavedHuman,
  setLastSavedHuman: (content) => { lastSavedHuman = content; },
  isOpen: () => props.open,
  isReadonly: () => Boolean(props.readonly),
  onSaved: () => emit("saved"),
});

const {
  articleImages,
  displayCoverImages,
  activeCoverIndex,
  inlineImageSlotCount,
  totalImageSlotCount,
  coverPromptGenerating,
  inlinePromptsGenerating,
  inlinePromptGeneratingIndex,
  uploadingCover,
  uploadingInline,
  lunaImageEligible,
  lunaImageJobs,
  handleGenerateCoverPrompt,
  handleUploadCover,
  selectCoverImage,
  saveCoverPrompt,
  handleGenerateInlinePrompts,
  handleUploadInlineImage,
  saveInlinePrompt,
  saveLegacyShortPrompt,
  handleGenerateLunaImage,
  loadLunaImageJobs,
  stopLunaImageJobsPolling,
  resetImageState,
} = useArticleImageWorkflow({
  getArticle: () => props.article,
  isOpen: () => props.open,
  editContent,
  humanContent,
  getLastSavedContent: () => lastSavedContent,
  setLastSavedContent: (content) => { lastSavedContent = content; },
  getLastSavedHuman: () => lastSavedHuman,
  setLastSavedHuman: (content) => { lastSavedHuman = content; },
  setPromptDirty,
  isLivePreview: () => activePreviewTheme.value === "live",
  getPreviewThemeId: getImagePreviewThemeId,
  tickArticleChange,
  onSaved: () => emit("saved"),
});

const savedAtLabel = computed(() => {
  // 依赖 relativeTick 触发重算
  void relativeTick.value;
  if (lastSavedAt.value == null) return "";
  return `保存成功 · ${formatRelativeTime(lastSavedAt.value)}`;
});

const {
  manualTitle,
  regenTitleLoading,
  activeTitleIndex,
  localTitles,
  editingTitleIdx,
  editingTitleValue,
  displayTitles,
  titleCandidateAt,
  handleRegenTitle,
  buildTitleSync,
  applyTitleSync,
  saveManualTitle,
  selectTitle,
  startEditTitle,
  cancelEditTitle,
  saveTitleEdit,
  regenIntroLoading,
  activeIntroIndex,
  localIntros,
  displayIntros,
  displaySummaries,
  handleRegenIntro,
  selectIntro,
} = useArticlePlanningActions({
  getArticle: () => props.article,
  isManualArticle,
  editContent,
  humanContent,
  activePreviewTheme,
  themeIdMap,
  prepareExplicitContentSave,
  getLastSavedContent: () => lastSavedContent,
  setLastSavedContent: (content) => { lastSavedContent = content; },
  getLastSavedHuman: () => lastSavedHuman,
  setLastSavedHuman: (content) => { lastSavedHuman = content; },
  onSaved: () => emit("saved"),
});

// 审核弹窗
const reviewModalVisible = ref(false);

// 手动生图弹窗
const imageActionVisible = ref(false);

function handleReviewDone(): void {
  emit("saved");
}

function handleImageActionDone(): void {
  tickArticleChange();
  emit("saved");
}

// 按需生成评论：调后端代理拉取 Hermes 结果并注入当前文章。
const generatingComments = ref(false);
async function handleGenerateComments(): Promise<void> {
  if (!props.article || generatingComments.value) return;
  generatingComments.value = true;
  try {
    const result = await generateComments(props.article.id);
    if (result.ok && result.comments) {
      props.article.comments = result.comments;
      message.success(`已生成 ${result.comments.length} 对评论`);
      tickArticleChange();
    } else {
      message.error(result.reason ?? "评论生成失败");
    }
  } catch {
    message.error("评论生成请求失败");
  } finally {
    generatingComments.value = false;
  }
}

// 按需补作者拓展：调后端代理拉取 5 条作者视角拓展并注入当前文章。
const generatingAuthorExtensions = ref(false);
async function handleGenerateAuthorExtensions(): Promise<void> {
  if (!props.article || generatingAuthorExtensions.value) return;
  generatingAuthorExtensions.value = true;
  try {
    const result = await generateAuthorExtensions(props.article.id);
    if (result.ok && result.extensions) {
      props.article.authorExtensions = result.extensions;
      message.success(`已生成 ${result.extensions.length} 条作者拓展`);
      tickArticleChange();
    } else {
      message.error(result.reason ?? "作者拓展生成失败");
    }
  } catch {
    message.error("作者拓展生成请求失败");
  } finally {
    generatingAuthorExtensions.value = false;
  }
}

// ─── 素材原图：按 sourceItemId 取素材 cover 外链展示（不转存，no-referrer 绕防盗链）───
const sourceCoverUrl = ref<string | null>(null);
watch(() => props.article?.sourceItemId, (sid) => {
  if (!sid) { sourceCoverUrl.value = null; return; }
  readCreativeSourceItem(sid)
    .then(s => { sourceCoverUrl.value = s.coverImageUrl ?? null; })
    .catch(() => { sourceCoverUrl.value = null; });
});

watch(() => props.open, (val) => {
  if (val && props.article) {
    const md = props.article.contentMarkdown || "";
    editContent.value = md;
    lastSavedContent = md;
    // 人工转写：优先用已保存的 human_markdown，为空则预填 AI 草稿副本（用户在此基础上改）
    const hm = props.article.humanMarkdown ?? "";
    humanContent.value = hm || md;
    lastSavedHuman = humanContent.value;
    // 重置保存时间，避免上一篇的相对时间残留到当前文章
    lastSavedAt.value = null;
    // 重置本地缓存状态
    resetImageState(props.article);
    localTitles.value = [];
    manualTitle.value = parseJsonArray(props.article.titles)[0] ?? readFirstH1(hm || md);
    promptDirtyKeys.value = new Set();
    localIntros.value = [];
    activeTitleIndex.value = props.article.titleIndex ?? 0;
    activeIntroIndex.value = props.article.introIndex ?? 0;
    // 重置标题编辑态，避免上一篇的编辑下标残留到当前文章
    editingTitleIdx.value = null;
    editingTitleValue.value = "";
    clearAutosaveTimers();
    resetEditorFullscreen();
    document.addEventListener("keydown", handleFullscreenEsc);
    // 恢复文章保存的主题偏好，无记录时默认使用落日胶片。
    const saved = props.article.wechatThemeId;
    const previewKey = saved ? reverseThemeIdMap[saved] : undefined;
    activePreviewTheme.value = previewKey ?? "sunsetFilm";
    // 弹窗打开后测量编辑器可用高度
    nextTick(() => setupEditorResize());
    void loadLunaImageJobs();
  } else {
    stopLunaImageJobsPolling();
    teardownEditorResize();
    // 关闭弹窗时如果有未保存的内容，立即保存一次，避免防抖定时器还没触发就丢失
    clearAutosaveTimers();
    if (props.article && editContent.value !== lastSavedContent) {
      enqueueDraftAutosave(editContent.value);
    }
    if (props.article && humanContent.value !== lastSavedHuman) {
      enqueueHumanAutosave(humanContent.value);
    }
  }
});

/** 手动保存等待自动队列收口后，再执行双栏正文和标题的完整同步。 */
async function handleSave(): Promise<boolean> {
  if (!props.article) return false;
  saving.value = true;
  try {
    await prepareExplicitContentSave();
    if (!props.article) return false;
    const sync = buildTitleSync(humanContent.value);
    // 手动保存同时落盘左栏 AI 草稿（content_markdown）和中栏人工转写（human_markdown）
    await editFinishedArticle(props.article.id, {
      contentMarkdown: editContent.value,
      ...sync.fields,
    });
    applyTitleSync(sync);
    lastSavedContent = sync.contentMarkdown ?? editContent.value;
    lastSavedHuman = sync.humanMarkdown;
    tickArticleChange();
    lastSavedAt.value = Date.now();
    emit("saved");
    return true;
  } catch {
    message.error("保存失败");
    return false;
  } finally {
    saving.value = false;
  }
}

// 推送前先保存正文，确保 DB 中是最新内容
async function saveAndPush(): Promise<void> {
  if (!props.article) return;
  // 中栏（发布内容）为空则阻止发布
  if (!humanContent.value.trim()) {
    message.warning("请先在中间栏输入或转写发布内容");
    return;
  }
  // 软提示：中栏内容与 AI 草稿一致（未实际改动），发布将是纯 AI（0% 人工），可能被限流
  if (humanContent.value === editContent.value) {
    const { Modal } = await import("ant-design-vue");
    const confirmed = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        bodyStyle: { padding: '24px' },
        title: "内容未改动",
        content: "中间栏内容与 AI 草稿一致，发布出去将是纯 AI（0% 人工），可能被限流。确认发布？",
        okText: "确认发布",
        cancelText: "再改改",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }
  if (!await handleSave()) return;
  emit("openPush", props.article, currentWechatThemeId.value);
}

async function handleClose(): Promise<void> {
  // 全屏状态下 ESC/关闭只退出全屏，不连带关闭详情弹窗
  if (editorFullscreen.value) {
    resetEditorFullscreen();
    return;
  }
  if (promptDirtyKeys.value.size > 0) {
    const { Modal } = await import("ant-design-vue");
    const confirmed = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: "提示词尚未保存",
        content: "关闭后会丢失正在编辑的提示词，确认关闭？",
        okText: "放弃修改",
        cancelText: "继续编辑",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
    promptDirtyKeys.value = new Set();
  }
  document.removeEventListener("keydown", handleFullscreenEsc);
  emit("update:open", false);
}

// ─── 预览主题切换 ───

// 切换预览主题：客户端即时渲染（基于人工转写内容 = 发布内容）
function switchPreviewTheme(key: PreviewThemeKey): void {
  activePreviewTheme.value = key;
  if (key === "live" || !humanContent.value) return;

  const themeId = themeIdMap[key];
  const html = renderWechatThemePreview(humanContent.value, themeId);

  // 首次选中该主题时保存偏好和渲染结果
  if (props.article && (props.article.wechatThemeId !== themeId || props.article.wechatHtml !== html)) {
    props.article.wechatThemeId = themeId;
    props.article.wechatHtml = html;
    editFinishedArticle(props.article.id, { wechatThemeId: themeId, wechatHtml: html }).catch(() => {});
  }
}

// 根据当前选中的预览主题返回 HTML（联动中栏人工转写内容）
const activePreviewHtml = computed(() => {
  if (activePreviewTheme.value === "live") return "";
  const themeId = themeIdMap[activePreviewTheme.value];
  if (!humanContent.value) return "";
  return renderWechatThemePreview(humanContent.value, themeId);
});

const activePreviewLabel = computed(() => {
  const opt = previewThemeOptions.find(o => o.key === activePreviewTheme.value);
  return opt?.label ?? "预览";
});

/** 编辑器面板传回字符串键；父抽屉保留主题枚举约束。 */
function handlePreviewThemeSelection(key: string): void {
  if (previewThemeOptions.some((option) => option.key === key)) {
    switchPreviewTheme(key as PreviewThemeKey);
  }
}

// 当前主题对应的 WechatThemeId（用于复制公众号格式和推送）
const currentWechatThemeId = computed<WechatThemeId>(() => {
  if (activePreviewTheme.value !== "live") {
    return themeIdMap[activePreviewTheme.value as Exclude<PreviewThemeKey, "live">];
  }
  // 实时预览模式下回退到文章保存的主题
  return (props.article?.wechatThemeId as WechatThemeId) ?? "sunset-film";
});

// ─── 微信公众号格式复制 ───

const wechatCopying = ref(false);

async function copyAsWechatFormat(): Promise<void> {
  if (!humanContent.value) {
    message.warning("文章无正文内容");
    return;
  }
  if (!props.article) return;
  wechatCopying.value = true;
  try {
    const html = renderWechatThemePreview(humanContent.value, currentWechatThemeId.value);
    const htmlBlob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([humanContent.value], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })
    ]);
    message.success("已复制公众号格式，可直接粘贴到编辑器");
  } catch {
    message.error("复制失败，请检查浏览器剪贴板权限");
  } finally {
    wechatCopying.value = false;
  }
}

// ─── 纯文本复制 ───

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  message.success("已复制到剪贴板");
}

/** 编辑器操作区复制 AI 草稿，避免子组件了解父级文本状态。 */
function copyAiDraft(): void {
  void copyText(editContent.value);
}

/** 编辑器操作区复制清洗后的 AI 草稿。 */
function copyAiDraftAsPlainText(): void {
  void copyMarkdownAsPlainText(editContent.value);
}

async function copyMarkdownAsPlainText(mdText: string): Promise<void> {
  const text = mdText
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/---+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  await navigator.clipboard.writeText(text);
  message.success("已复制纯文本到剪贴板");
}

// ─── 推送条件检查（复用共享模块） ───
// props.article 深层属性修改不会触发响应式，用一个计数器手动刷新
const canPush = computed(() => {
  void articleChangeTick.value;
  const article = props.article;
  if (!article) return false;
  const allowed = article.originType === "manual"
    ? article.status === "manual_draft" || article.status === "wechat_draft"
    : article.status === "ready_for_publish" || article.status === "wechat_draft";
  if (!allowed) return false;
  return checkPublishConditions(article).qualified;
});

const missingConditions = computed(() => {
  void articleChangeTick.value;
  const article = props.article;
  if (!article) return [];
  const missing: string[] = [];
  const allowed = article.originType === "manual"
    ? article.status === "manual_draft" || article.status === "wechat_draft"
    : article.status === "ready_for_publish" || article.status === "wechat_draft";
  if (!allowed) missing.push("状态不允许推送");
  missing.push(...checkPublishConditions(article).missing);
  return missing;
});

// ─── 状态操作（标记可推送 / 取消推送标记） ───

async function handleDetailMarkPublishable(): Promise<void> {
  if (!props.article) return;
  const { Modal } = await import("ant-design-vue");
  const confirmed = await new Promise<boolean>(resolve => {
    Modal.confirm({
      bodyStyle: { padding: '24px' },
      title: "标记可推送",
      content: "确认标记该文章为可推送？后续可在平台手动推送到微信公众号草稿箱。",
      okText: "确认", cancelText: "取消",
      onOk: () => resolve(true), onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    const res = await editFinishedArticle(props.article.id, { status: "ready_for_publish" } as any);
    if (res.ok) {
      message.success("已标记为可推送");
      emit("saved");
    } else {
      message.error("操作失败");
    }
  } catch (err: unknown) {
    const httpErr = err as { body?: { reason?: string } };
    message.error(httpErr?.body?.reason ?? "操作失败");
  }
}

async function handleDetailCancelPublishable(): Promise<void> {
  if (!props.article) return;
  const { Modal } = await import("ant-design-vue");
  const confirmed = await new Promise<boolean>(resolve => {
    Modal.confirm({
      bodyStyle: { padding: '24px' },
      title: "取消推送标记",
      content: "确认取消推送标记？文章将回到已生成状态。",
      okText: "确认", cancelText: "取消",
      onOk: () => resolve(true), onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    const res = await editFinishedArticle(props.article.id, { status: "generated" } as any);
    if (res.ok) {
      message.success("已取消推送标记");
      emit("saved");
    } else {
      message.error("操作失败");
    }
  } catch (err: unknown) {
    const httpErr = err as { body?: { reason?: string } };
    message.error(httpErr?.body?.reason ?? "操作失败");
  }
}

async function handleDetailDiscard(): Promise<void> {
  if (!props.article) return;
  const { Modal } = await import("ant-design-vue");
  const confirmed = await new Promise<boolean>(resolve => {
    Modal.confirm({
      bodyStyle: { padding: '24px' },
      title: "废弃文章",
      content: "废弃后文章不再走自动生图和发布流程，但保留记录可随时查看。确认废弃？",
      okText: "确认废弃", cancelText: "取消",
      onOk: () => resolve(true), onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    const res = await deleteFinishedArticle(props.article.id);
    if (res.ok) {
      message.success("已废弃");
      emit("saved");
    } else {
      message.error("废弃失败");
    }
  } catch {
    message.error("废弃失败");
  }
}

async function handleDetailRestore(): Promise<void> {
  if (!props.article) return;
  try {
    const res = await restoreFinishedArticle(props.article.id);
    if (res.ok) {
      message.success("已恢复");
      emit("saved");
    } else {
      message.error("恢复失败");
    }
  } catch {
    message.error("恢复失败");
  }
}

// 有保存时间后启动每秒刷新，让相对时间持续更新
watch(lastSavedAt, (ts) => {
  if (ts != null && !relativeTimer) {
    relativeTimer = setInterval(() => { relativeTick.value++; }, 5000);
  }
});

onBeforeUnmount(() => {
  teardownEditorResize();
  clearAutosaveTimers();
  stopLunaImageJobsPolling();
  if (relativeTimer) { clearInterval(relativeTimer); relativeTimer = null; }
});
</script>

<style src="./article-detail/articleDetailDrawer.css"></style>
