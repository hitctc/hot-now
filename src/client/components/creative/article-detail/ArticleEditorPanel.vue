<script setup lang="ts">
import ArticleMarkdownEditor from "../ArticleMarkdownEditor.vue";

type PreviewThemeOption = { key: string; label: string };

defineProps<{
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
  (event: "save"): void;
}>();
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
