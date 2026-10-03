<script setup lang="ts">
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from "@ant-design/icons-vue";
import ArticleMarkdownEditor from "./ArticleMarkdownEditor.vue";
import { useDailyDigestDetailDrawer, type DailyDigestDetailDrawerProps, type DailyDigestDetailDrawerEvents } from "./useDailyDigestDetailDrawer.js";
const props = defineProps<DailyDigestDetailDrawerProps>();
const emit = defineEmits<DailyDigestDetailDrawerEvents>();
const {
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
} = useDailyDigestDetailDrawer(props, emit);

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
    :body-style="{ padding: '24px' }"
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
            v-if="pushState === 'idle' || pushState === 'done'"
            type="primary"
            @click="startPush"
          >
            {{ digest.status === 'published' ? '重新推送草稿' : '推送草稿' }}
          </a-button>
        </div>
      </div>
    </template>

    <template v-if="digest">
      <!-- 基本信息 -->
      <div class="flex flex-wrap items-center gap-3 mb-3">
        <span class="text-sm text-editorial-text-muted">{{ digest.date }}</span>
        <a-tag :color="statusColorMap[digest.status]" size="small">
          {{ statusLabelMap[digest.status] }}
        </a-tag>
        <span class="text-sm text-editorial-text-muted">收录 {{ digest.totalItems }} 条</span>
        <span v-if="lastSavedAt" class="text-[11px] text-editorial-text-muted">已保存 {{ lastSavedAt }}</span>
      </div>

      <!-- 分类标签 -->
      <div v-if="digest.categories.length > 0" class="flex flex-wrap gap-1.5 mb-3">
        <a-tag v-for="cat in digest.categories" :key="cat" size="small">{{ cat }}</a-tag>
      </div>

      <!-- 封面图 -->
      <div v-if="digest.coverImage" class="mb-3">
        <img :src="digest.coverImage" alt="日报封面" class="max-h-32 rounded-editorial-sm object-cover" />
      </div>

      <!-- 推送进度弹窗（内联在详情中） -->
      <div v-if="pushState !== 'idle'" class="digest-push-progress mb-3">
        <a-steps :current="STEP_DEFS.findIndex(s => stepStates[s.id]?.status === 'running' || stepStates[s.id]?.status === 'pending')" size="small">
          <a-step v-for="step in STEP_DEFS" :key="step.id" :status="mapStepStatus(stepStates[step.id]?.status ?? 'pending')">
            <template #title>{{ step.title }}</template>
            <template v-if="stepStates[step.id]?.detail" #description>
              <span class="text-[11px]">{{ stepStates[step.id].detail }}</span>
            </template>
            <template v-if="stepStates[step.id]?.status === 'running'" #icon>
              <LoadingOutlined />
            </template>
            <template v-else-if="stepStates[step.id]?.status === 'done'" #icon>
              <CheckCircleFilled style="color: #52c41a" />
            </template>
            <template v-else-if="stepStates[step.id]?.status === 'error'" #icon>
              <CloseCircleFilled style="color: #ff4d4f" />
            </template>
          </a-step>
        </a-steps>
        <div v-if="pushState === 'done' && pushResult" class="mt-2 text-sm">
          <a-alert
            v-if="pushResult.ok"
            type="success"
            show-icon
            message="推送成功"
          />
          <a-alert
            v-else
            type="error"
            show-icon
            message="推送失败"
          >
            <template #description>
              <div>
                失败步骤：{{ failedStepTitle }}<span v-if="pushResult.errorCode"> · 错误码 {{ pushResult.errorCode }}</span>
              </div>
              <div class="whitespace-pre-wrap break-words">{{ pushResult.errorMessage ?? "推送失败" }}</div>
            </template>
          </a-alert>
        </div>
      </div>

      <!-- 编辑器工具栏 -->
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2 border-t border-editorial-border pt-2">
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

      <!-- 编辑器 -->
      <div class="article-editor-wrapper">
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

<style>
/* 弹窗打开时禁止蒙层滚动，modal content 固定 90vh，body 内部滚动 */
.daily-digest-detail-modal {
  overflow: hidden !important;
}
.daily-digest-detail-modal .ant-modal-content {
  max-height: 100vh;
  display: flex;
  flex-direction: column;
}
.daily-digest-detail-modal .ant-modal-header {
  flex-shrink: 0;
}
.daily-digest-detail-modal .ant-modal-body {
  background: #ffffff;
  flex: 1;
  overflow-y: auto;
}
.daily-digest-detail-modal .ant-modal-footer {
  flex-shrink: 0;
  border-top: 1px solid #f0f0f0;
  padding: 12px 24px;
}

/* 推送进度 */
.digest-push-progress {
  padding: 12px 16px;
  border: 1px solid var(--editorial-border);
  border-radius: 8px;
  background: var(--editorial-panel);
}

/* 编辑器容器 */
.daily-digest-detail-modal .article-editor-wrapper {
  min-height: 300px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .daily-digest-detail-modal .ant-modal-wrap {
    align-items: flex-start !important;
    padding: 0 !important;
  }
  .daily-digest-detail-modal .ant-modal {
    max-width: 100% !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    top: 0 !important;
  }
  .daily-digest-detail-modal .ant-modal-content {
    max-height: 100dvh;
    border-radius: 0;
  }
  .daily-digest-detail-modal .ant-modal-body {
    padding: 12px !important;
  }
  .daily-digest-detail-modal .ant-modal-header {
    padding: 12px 16px !important;
  }
  .daily-digest-detail-modal .ant-modal-footer {
    padding: 8px 12px !important;
  }
  .daily-digest-footer {
    flex-direction: column !important;
    gap: 8px !important;
  }
  .daily-digest-footer__right {
    flex-wrap: wrap;
    gap: 4px !important;
  }
  .daily-digest-footer .ant-btn {
    font-size: 12px !important;
    padding: 0 8px !important;
    height: 28px !important;
  }
}
</style>
