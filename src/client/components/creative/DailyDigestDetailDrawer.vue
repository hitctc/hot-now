<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { DailyDigestRecord, DailyDigestStatus } from "../../services/dailyDigestApi.js";
import { updateDailyDigestStatus } from "../../services/dailyDigestApi.js";
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

const themePreviewHtml = computed(() => {
  if (!props.digest?.contentMarkdown) return "";
  return renderWechatThemePreview(props.digest.contentMarkdown, activeThemeId.value);
});

// 状态文案映射
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

function handleClose() {
  emit("update:open", false);
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
    } catch { /* 状态更新失败静默 */ }
  } finally {
    pushing.value = false;
  }
}

watch(() => props.open, (val) => {
  if (val) {
    activeThemeId.value = "bauhaus";
    pushing.value = false;
  }
});
</script>

<template>
  <a-modal
    :open="open"
    :title="digest?.title ?? 'AI日报详情'"
    :width="960"
    :footer="null"
    :destroy-on-close="true"
    class="daily-digest-detail-modal"
    @cancel="handleClose"
  >
    <template v-if="digest">
      <!-- 基本信息 -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <span class="text-sm text-editorial-text-muted">{{ digest.date }}</span>
        <a-tag :color="statusColorMap[digest.status]" size="small">
          {{ statusLabelMap[digest.status] }}
        </a-tag>
        <span class="text-sm text-editorial-text-muted">收录 {{ digest.totalItems }} 条</span>
        <span class="text-sm text-editorial-text-muted">{{ digest.collectorAgent }}</span>
      </div>

      <!-- 分类标签 -->
      <div v-if="digest.categories.length > 0" class="flex flex-wrap gap-1.5 mb-4">
        <a-tag v-for="cat in digest.categories" :key="cat" size="small">{{ cat }}</a-tag>
      </div>

      <!-- 封面图 -->
      <div v-if="digest.coverImage" class="mb-4">
        <img
          :src="digest.coverImage"
          alt="日报封面"
          class="max-h-40 rounded-editorial-sm object-cover"
        />
      </div>

      <!-- 主题切换 -->
      <div class="flex items-center gap-2 mb-3 border-b border-editorial-border pb-3">
        <span class="text-sm font-medium text-editorial-text-main">排版预览</span>
        <div class="flex gap-1">
          <button
            v-for="theme in wechatThemeOptions"
            :key="theme.value"
            :class="[
              'rounded-editorial-sm px-3 py-1 text-xs font-medium transition',
              activeThemeId === theme.value
                ? 'bg-editorial-link-active text-editorial-text-main'
                : 'text-editorial-text-body hover:bg-editorial-link-active'
            ]"
            @click="activeThemeId = theme.value"
          >
            {{ theme.label }}
          </button>
        </div>
      </div>

      <!-- Markdown 渲染预览 -->
      <div class="overflow-y-auto" style="max-height: calc(100dvh - 360px);">
        <div class="daily-digest-preview" v-html="themePreviewHtml" />
      </div>

      <!-- 底部操作 -->
      <div class="daily-digest-footer">
        <div />
        <div class="daily-digest-footer__right">
          <a-button @click="handleClose">关闭</a-button>
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
  </a-modal>
</template>

<style scoped>
.daily-digest-preview {
  padding: 8px 0;
}

.daily-digest-preview :deep(img) {
  max-width: 100%;
  height: auto;
}

.daily-digest-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--editorial-border);
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
    overflow-y: auto;
    padding: 12px;
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
