<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

import ArticleMarkdownEditor from "../ArticleMarkdownEditor.vue";
import ArticleDetailFooter from "./ArticleDetailFooter.vue";
import type { CreativeFinishedArticle } from "../../../services/creativeApi.js";

type PreviewThemeOption = { key: string; label: string };

const props = defineProps<{
  article: CreativeFinishedArticle;
  readonly?: boolean;
  isManualArticle: boolean;
  humanContent: string;
  aiDraft: string;
  previewHtml: string;
  previewEnabled?: boolean;
  previewLabel: string;
  previewThemeOptions: PreviewThemeOption[];
  activePreviewTheme: string;
  syncScrollEnabled: boolean;
  autoFocusModeEnabled: boolean;
  savedAtLabel: string;
  focusMode: boolean;
  saving: boolean;
  wechatCopying: boolean;
  canPush: boolean;
  missingConditions: string[];
  dynamicHeight: number;
  editorFullscreen: boolean;
}>();

const emit = defineEmits<{
  (event: "update:human-content", value: string): void;
  (event: "update:ai-draft", value: string): void;
  (event: "select-theme", key: string): void;
  (event: "copy-ai"): void;
  (event: "copy-plain"): void;
  (event: "toggle-sync-scroll"): void;
  (event: "toggle-auto-focus-mode"): void;
  (event: "toggle-fullscreen"): void;
  (event: "copy-format"): void;
  (event: "review"): void;
  (event: "mark-publishable"): void;
  (event: "cancel-publishable"): void;
  (event: "restore"): void;
  (event: "discard"): void;
  (event: "push"): void;
  (event: "unlock-focus-mode"): void;
  (event: "save"): void;
  (event: "preview-visibility-change", visible: boolean): void;
}>();

const focusToolsOpen = ref(false);
// 移动端独立全屏预览：与详情弹窗分离，编辑时不再同时展示预览。
const mobilePreviewOpen = ref(false);
// 父级按实际可见性计算主题预览，手机关闭预览后不继续处理隐藏 HTML。
watch(mobilePreviewOpen, visible => emit("preview-visibility-change", visible), { immediate: true });
watch(() => props.previewEnabled, enabled => { if (enabled === false) mobilePreviewOpen.value = false; });
let focusToolsCloseTimer: ReturnType<typeof setTimeout> | null = null;

/** 专注模式的工具区由悬浮区域控制，延迟收起避免鼠标移入面板时闪退。 */
function openFocusTools(): void {
  if (focusToolsCloseTimer) {
    clearTimeout(focusToolsCloseTimer);
    focusToolsCloseTimer = null;
  }
  focusToolsOpen.value = true;
}

/** 鼠标或键盘离开整个工具区后再收起，保留短暂移动缓冲。 */
function scheduleCloseFocusTools(): void {
  if (focusToolsCloseTimer) clearTimeout(focusToolsCloseTimer);
  focusToolsCloseTimer = setTimeout(() => {
    focusToolsCloseTimer = null;
    focusToolsOpen.value = false;
  }, 180);
}

onBeforeUnmount(() => {
  if (focusToolsCloseTimer) clearTimeout(focusToolsCloseTimer);
});
</script>

<template>
  <div class="article-section-heading mb-2 flex items-center justify-between" data-editor-title>
    <div class="flex items-center gap-2">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文</h3>
      <span v-if="savedAtLabel" class="text-[11px] font-medium text-green-600">{{ savedAtLabel }}</span>
    </div>
    <template v-if="!readonly">
      <!-- 窄屏允许换行：横向滚动条会被误认为弹窗布局错误，且与本弹窗只需纵向滚动不符。 -->
      <div class="article-editor-toolbar flex flex-wrap items-center gap-2">
        <div class="article-editor-themes flex flex-wrap gap-1">
          <a-button
            v-for="option in previewThemeOptions"
            :key="option.key"
            :type="activePreviewTheme === option.key ? 'primary' : 'default'"
            size="small"
            class="!text-[11px] !px-2 !py-0.5"
            @click="emit('select-theme', option.key)"
          >{{ option.label }}</a-button>
        </div>
        <div class="article-editor-actions flex flex-wrap items-center gap-2">
        <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy-ai')">复制原文</a-button>
        <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy-plain')">复制纯文本</a-button>
        <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('toggle-sync-scroll')">{{ syncScrollEnabled ? '同步滚动：开' : '同步滚动：关' }}</a-button>
        <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" data-auto-focus-mode @click="emit('toggle-auto-focus-mode')">{{ autoFocusModeEnabled ? '专注编辑：开' : '专注编辑：关' }}</a-button>
        <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('toggle-fullscreen')">{{ editorFullscreen ? '退出全屏' : '全屏' }}</a-button>
        <!-- 仅移动端显示：打开独立全屏预览，与编辑互不干扰。 -->
        <a-button
          type="link"
          size="small"
          class="article-detail-preview-button !h-auto !px-2 !py-1 !text-[11px]"
          data-mobile-preview-trigger
          @click="mobilePreviewOpen = true"
        >预览</a-button>
        </div>
      </div>
    </template>
  </div>

  <!-- 只读详情继续使用已选主题的 HTML 预览。 -->
  <div
    v-if="readonly"
    class="article-readonly-preview rounded border border-editorial-border bg-white p-4 overflow-auto"
    :style="{ height: dynamicHeight + 'px' }"
    v-html="previewHtml"
  />

  <!-- 普通编辑器用 v-show 保留实例，退出全屏时不会重挂载导致闪烁。 -->
  <div
    v-else
    v-show="!editorFullscreen"
    class="article-editor-wrapper"
    data-article-editor-wrapper
    :style="{ height: dynamicHeight + 'px' }"
  >
    <div
      v-if="focusMode"
      class="focus-tools"
      data-focus-tools
      @mouseenter="openFocusTools"
      @mouseleave="scheduleCloseFocusTools"
      @focusin="openFocusTools"
      @focusout="scheduleCloseFocusTools"
    >
      <div class="focus-tools__bar">
        <a-button
          type="primary"
          size="small"
          data-focus-save
          :loading="saving"
          @click="emit('save')"
        >保存</a-button>
        <button
          type="button"
          class="focus-tools__trigger"
          data-focus-tools-trigger
          aria-controls="focus-tools-panel"
          :aria-expanded="focusToolsOpen"
        >工具</button>
        <button
          type="button"
          data-focus-mode-lock
          aria-label="解锁并退出专注模式"
          class="focus-tools__unlock"
          @click="emit('unlock-focus-mode')"
        >
          <span aria-hidden="true">🔒</span>
          <span>解锁</span>
        </button>
      </div>

      <div
        id="focus-tools-panel"
        class="focus-tools__panel"
        :class="{ 'focus-tools__panel--hidden': !focusToolsOpen }"
        :aria-hidden="!focusToolsOpen"
        data-focus-tools-panel
      >
        <div class="focus-tools__section">
          <span class="focus-tools__label">主题</span>
          <div class="focus-tools__theme-list">
            <a-button
              v-for="option in previewThemeOptions"
              :key="option.key"
              :type="activePreviewTheme === option.key ? 'primary' : 'default'"
              size="small"
              @click="emit('select-theme', option.key)"
            >{{ option.label }}</a-button>
          </div>
        </div>

        <div class="focus-tools__section focus-tools__section--editor">
          <span class="focus-tools__label">编辑</span>
          <div class="focus-tools__action-list">
            <a-button type="link" size="small" @click="emit('copy-ai')">复制原文</a-button>
            <a-button type="link" size="small" @click="emit('copy-plain')">复制纯文本</a-button>
            <a-button type="link" size="small" @click="emit('toggle-sync-scroll')">{{ syncScrollEnabled ? '同步滚动：开' : '同步滚动：关' }}</a-button>
            <a-button type="link" size="small" @click="emit('toggle-auto-focus-mode')">{{ autoFocusModeEnabled ? '专注编辑：开' : '专注编辑：关' }}</a-button>
            <a-button type="link" size="small" @click="emit('toggle-fullscreen')">{{ editorFullscreen ? '退出全屏' : '全屏' }}</a-button>
          </div>
        </div>

        <div class="focus-tools__section focus-tools__section--flow">
          <span class="focus-tools__label" data-focus-tools-flow-label aria-hidden="true"></span>
          <ArticleDetailFooter
            :article="props.article"
            :readonly="readonly"
            hide-save
            :saving="saving"
            :wechat-copying="wechatCopying"
            :can-push="canPush"
            :missing-conditions="missingConditions"
            class="focus-tools__flow"
            @save="emit('save')"
            @copy-format="emit('copy-format')"
            @review="emit('review')"
            @mark-publishable="emit('mark-publishable')"
            @cancel-publishable="emit('cancel-publishable')"
            @restore="emit('restore')"
            @discard="emit('discard')"
            @push="emit('push')"
          />
        </div>
      </div>
    </div>
    <ArticleMarkdownEditor
      :model-value="humanContent"
      human-mode
      :ai-draft="aiDraft"
      :draft-label="isManualArticle ? '素材和草稿' : 'AI 生成的草稿'"
      :draft-placeholder="isManualArticle ? '在此收集素材和整理草稿...' : 'AI 生成的草稿（可编辑）...'"
      :preview-html="previewHtml"
      :preview-enabled="previewEnabled"
      :preview-label="previewLabel"
      :sync-scroll="syncScrollEnabled"
      :save-status="focusMode ? (savedAtLabel || '未触发保存') : ''"
      :save-status-state="savedAtLabel ? 'saved' : 'idle'"
      @update:model-value="emit('update:human-content', $event)"
      @update:ai-draft="emit('update:ai-draft', $event)"
    />
  </div>

  <!-- 移动端独立全屏预览：直接展示当前主题渲染结果，关闭后回到编辑。 -->
  <Teleport to="body">
    <div v-if="mobilePreviewOpen" class="article-mobile-preview" data-mobile-preview>
      <div class="article-mobile-preview__bar">
        <span class="article-mobile-preview__title">{{ previewLabel }}预览</span>
        <button type="button" class="article-mobile-preview__close" data-mobile-preview-close @click="mobilePreviewOpen = false">关闭</button>
      </div>
      <div class="article-mobile-preview__body" v-html="previewHtml" />
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="editorFullscreen && !readonly"
      class="fixed inset-0 z-[9999] flex flex-col"
      :style="{ background: focusMode ? '#ffffff' : 'var(--editorial-bg-page)', transition: 'background-color 0.8s ease' }"
    >
      <div class="fullscreen-toolbar flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-4 md:gap-y-2 md:px-4" style="border-color: var(--editorial-border);">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="m-0 text-sm font-semibold" style="color: var(--editorial-text-main);">正文编辑（全屏）</h3>
          <span v-if="savedAtLabel" class="text-[11px] font-medium text-green-600">{{ savedAtLabel }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 max-[768px]:flex-nowrap max-[768px]:overflow-x-auto">
          <div class="flex flex-wrap gap-1 max-[768px]:flex-nowrap">
            <a-button
              v-for="option in previewThemeOptions"
              :key="option.key"
              :type="activePreviewTheme === option.key ? 'primary' : 'default'"
              size="small"
              class="!text-[11px] !px-2 !py-0.5"
              @click="emit('select-theme', option.key)"
            >{{ option.label }}</a-button>
          </div>
          <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy-ai')">复制原文</a-button>
          <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy-plain')">复制纯文本</a-button>
          <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('toggle-sync-scroll')">{{ syncScrollEnabled ? '同步滚动：开' : '同步滚动：关' }}</a-button>
          <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('toggle-auto-focus-mode')">{{ autoFocusModeEnabled ? '专注编辑：开' : '专注编辑：关' }}</a-button>
          <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" :loading="saving" @click="emit('save')">保存</a-button>
          <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('toggle-fullscreen')">退出全屏</a-button>
        </div>
      </div>
      <div class="flex-1 overflow-hidden p-2 md:p-4">
        <ArticleMarkdownEditor
          :model-value="humanContent"
          human-mode
          :ai-draft="aiDraft"
          :draft-label="isManualArticle ? '素材和草稿' : 'AI 生成的草稿'"
          :draft-placeholder="isManualArticle ? '在此收集素材和整理草稿...' : 'AI 生成的草稿（可编辑）...'"
          :preview-html="previewHtml"
          :preview-enabled="previewEnabled"
          :preview-label="previewLabel"
          :sync-scroll="syncScrollEnabled"
          @update:model-value="emit('update:human-content', $event)"
          @update:ai-draft="emit('update:ai-draft', $event)"
        />
      </div>
    </div>
  </Teleport>
</template>
