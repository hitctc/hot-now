<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

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
  previewLabel: string;
  previewThemeOptions: PreviewThemeOption[];
  activePreviewTheme: string;
  syncScrollEnabled: boolean;
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
}>();

const focusToolsOpen = ref(false);
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
  <div class="mb-2 flex items-center justify-between" data-editor-title>
    <div class="flex items-center gap-2">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文</h3>
      <span v-if="savedAtLabel" class="text-[11px] font-medium text-green-600">{{ savedAtLabel }}</span>
    </div>
    <template v-if="!readonly">
      <div class="flex flex-wrap items-center gap-2 max-[768px]:flex-nowrap max-[768px]:overflow-x-auto">
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
        <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('toggle-fullscreen')">{{ editorFullscreen ? '退出全屏' : '全屏' }}</a-button>
      </div>
    </template>
  </div>

  <!-- 只读详情继续使用已选主题的 HTML 预览。 -->
  <div
    v-if="readonly"
    class="rounded border border-editorial-border bg-white p-4 overflow-auto"
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

      <div id="focus-tools-panel" v-show="focusToolsOpen" class="focus-tools__panel" data-focus-tools-panel>
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
            <a-button type="link" size="small" @click="emit('toggle-fullscreen')">{{ editorFullscreen ? '退出全屏' : '全屏' }}</a-button>
          </div>
        </div>

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
    <ArticleMarkdownEditor
      :model-value="humanContent"
      human-mode
      :ai-draft="aiDraft"
      :draft-label="isManualArticle ? '素材和草稿' : 'AI 生成的草稿'"
      :draft-placeholder="isManualArticle ? '在此收集素材和整理草稿...' : 'AI 生成的草稿（可编辑）...'"
      :preview-html="previewHtml"
      :preview-label="previewLabel"
      :sync-scroll="syncScrollEnabled"
      :save-status="focusMode ? (savedAtLabel || '未触发保存') : ''"
      :save-status-state="savedAtLabel ? 'saved' : 'idle'"
      @update:model-value="emit('update:human-content', $event)"
      @update:ai-draft="emit('update:ai-draft', $event)"
    />
  </div>

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
          :preview-label="previewLabel"
          :sync-scroll="syncScrollEnabled"
          @update:model-value="emit('update:human-content', $event)"
          @update:ai-draft="emit('update:ai-draft', $event)"
        />
      </div>
    </div>
  </Teleport>
</template>
