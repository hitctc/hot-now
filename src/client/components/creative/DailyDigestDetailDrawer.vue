<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";

import ArticleMarkdownEditor from "./ArticleMarkdownEditor.vue";
import type { DailyDigestRecord, DailyDigestStatus } from "../../services/dailyDigestApi.js";
import { editDailyDigest, updateDailyDigestStatus } from "../../services/dailyDigestApi.js";
import {
  wechatThemeOptions,
  type WechatThemeId,
} from "../../services/creativeApi.js";
import { renderWechatThemePreview } from "../../services/wechatRenderer.js";

const props = defineProps<{
  open: boolean;
  digest: DailyDigestRecord | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

const activeThemeId = ref<WechatThemeId>("bauhaus");
const pushing = ref(false);
const saving = ref(false);
const editContent = ref("");
const editorFullscreen = ref(false);
const lastSavedAt = ref<string | null>(null);

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

// 字数统计
function countWords(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const englishWords = text.replace(/[一-鿿]/g, " ").split(/\s+/).filter(w => w.length > 0).length;
  return chineseChars + englishWords;
}

function handleClose() {
  if (editorFullscreen.value) {
    editorFullscreen.value = false;
    document.body.style.overflow = "";
    return;
  }
  emit("update:open", false);
}

async function handleSave() {
  if (!props.digest || saving.value) return;
  saving.value = true;
  try {
    const updated = await editDailyDigest(props.digest.id, { contentMarkdown: editContent.value });
    lastSavedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    message.success("已保存");
    emit("saved");
  } catch {
    message.error("保存失败");
  } finally {
    saving.value = false;
  }
}

async function handlePushDraft() {
  if (!props.digest || pushing.value) return;
  pushing.value = true;
  try {
    await updateDailyDigestStatus(props.digest.id, "publishing");
    // TODO: 接入公众号推送流程（复用成品文章的推送逻辑）
    await updateDailyDigestStatus(props.digest.id, "published");
    emit("saved");
  } catch {
    try {
      await updateDailyDigestStatus(props.digest.id, "failed");
    } catch { /* 静默 */ }
  } finally {
    pushing.value = false;
  }
}

function toggleEditorFullscreen() {
  editorFullscreen.value = !editorFullscreen.value;
  document.body.style.overflow = editorFullscreen.value ? "hidden" : "";
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => message.success("已复制")).catch(() => message.error("复制失败"));
}

watch(() => props.open, (val) => {
  if (val) {
    activeThemeId.value = "bauhaus";
    pushing.value = false;
    saving.value = false;
    editorFullscreen.value = false;
    lastSavedAt.value = null;
    editContent.value = props.digest?.contentMarkdown ?? "";
    document.body.style.overflow = "";
  }
});

// 当 digest 数据加载完成后同步编辑内容
watch(() => props.digest?.contentMarkdown, (val) => {
  if (val && !editContent.value) {
    editContent.value = val;
  }
});
</script>

<template>
  <a-modal
    :open="open"
    :closable="true"
    :mask-closable="true"
    :destroy-on-close="true"
    width="90%"
    centered
    wrap-class-name="daily-digest-detail-modal"
    :body-style="{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }"
    @cancel="handleClose"
  >
    <template #title>
      <span v-if="digest" class="text-base font-semibold">{{ digest.title }}</span>
    </template>

    <template #footer>
      <div v-if="digest" class="daily-digest-footer">
        <div class="daily-digest-footer__left" />
        <div class="daily-digest-footer__right">
          <a-button :loading="saving" @click="handleSave">保存正文</a-button>
          <a-button
            type="primary"
            :loading="pushing"
            :disabled="digest.status === 'published'"
            @click="handlePushDraft"
          >
            {{ digest.status === 'published' ? '已推送' : '推送草稿' }}
          </a-button>
        </div>
      </div>
    </template>

    <template v-if="digest">
      <!-- 固定头部：基本信息 + 工具栏 -->
      <div class="digest-header flex-shrink-0">
        <!-- 基本信息 -->
        <div class="flex flex-wrap items-center gap-3 px-6 pt-4 pb-2">
          <span class="text-sm text-editorial-text-muted">{{ digest.date }}</span>
          <a-tag :color="statusColorMap[digest.status]" size="small">
            {{ statusLabelMap[digest.status] }}
          </a-tag>
          <span class="text-sm text-editorial-text-muted">收录 {{ digest.totalItems }} 条</span>
          <span v-if="lastSavedAt" class="text-[11px] text-editorial-text-muted">已保存 {{ lastSavedAt }}</span>
        </div>

        <!-- 分类标签 -->
        <div v-if="digest.categories.length > 0" class="flex flex-wrap gap-1.5 px-6 pb-2">
          <a-tag v-for="cat in digest.categories" :key="cat" size="small">{{ cat }}</a-tag>
        </div>

        <!-- 封面图 -->
        <div v-if="digest.coverImage" class="px-6 pb-2">
          <img
            :src="digest.coverImage"
            alt="日报封面"
            class="max-h-32 rounded-editorial-sm object-cover"
          />
        </div>

        <!-- 编辑器工具栏 -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-editorial-border px-6 py-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] text-editorial-text-muted">{{ countWords(editContent) }}字</span>
            <div class="flex gap-1">
              <a-button
                v-for="theme in wechatThemeOptions"
                :key="theme.value"
                :type="activeThemeId === theme.value ? 'primary' : 'default'"
                size="small"
                class="!text-[11px] !px-2 !py-0.5"
                @click="activeThemeId = theme.value"
              >{{ theme.label }}</a-button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(editContent)">复制原文</a-button>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="toggleEditorFullscreen">{{ editorFullscreen ? '退出全屏' : '全屏' }}</a-button>
          </div>
        </div>
      </div>

      <!-- 可滚动内容区 -->
      <div class="digest-body flex-1 overflow-hidden px-6 pb-4">
        <ArticleMarkdownEditor
          v-model="editContent"
          :preview-html="activePreviewHtml"
          :preview-label="activePreviewLabel"
        />
      </div>
    </template>

    <!-- 全屏编辑器覆盖层 -->
    <Teleport to="body">
      <div
        v-if="editorFullscreen && digest"
        class="fixed inset-0 z-[9999] flex flex-col"
        style="background: var(--editorial-bg-page);"
      >
        <div class="fullscreen-toolbar flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-4 md:gap-y-2 md:px-4" style="border-color: var(--editorial-border);">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="m-0 text-sm font-semibold" style="color: var(--editorial-text-main);">正文编辑（全屏）</h3>
            <span class="text-[11px]" style="color: var(--editorial-text-muted);">{{ countWords(editContent) }}字</span>
            <span v-if="lastSavedAt" class="text-[11px]" style="color: var(--editorial-text-muted);">{{ lastSavedAt }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div class="flex flex-wrap gap-1">
              <a-button
                v-for="theme in wechatThemeOptions"
                :key="theme.value"
                :type="activeThemeId === theme.value ? 'primary' : 'default'"
                size="small"
                class="!text-[11px] !px-2 !py-0.5"
                @click="activeThemeId = theme.value"
              >{{ theme.label }}</a-button>
            </div>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(editContent)">复制原文</a-button>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="saving" @click="handleSave">保存</a-button>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="toggleEditorFullscreen">退出全屏</a-button>
          </div>
        </div>
        <div class="flex-1 overflow-hidden p-2 md:p-4">
          <ArticleMarkdownEditor
            v-model="editContent"
            :preview-html="activePreviewHtml"
            :preview-label="activePreviewLabel"
          />
        </div>
      </div>
    </Teleport>
  </a-modal>
</template>

<style scoped>
.digest-header {
  border-bottom: 1px solid var(--editorial-border);
}

.digest-body {
  min-height: 0;
}

.daily-digest-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.daily-digest-footer__left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.daily-digest-footer__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 768px) {
  .daily-digest-detail-modal :deep(.ant-modal) {
    width: 100% !important;
    max-width: 100% !important;
    top: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  .daily-digest-detail-modal :deep(.ant-modal-content) {
    border-radius: 0;
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .daily-digest-detail-modal :deep(.ant-modal-body) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .daily-digest-footer {
    flex-direction: column;
    gap: 8px;
  }

  .daily-digest-footer__right {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
