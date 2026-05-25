<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from "@ant-design/icons-vue";

import ArticleMarkdownEditor from "./ArticleMarkdownEditor.vue";
import type { DailyDigestRecord, DailyDigestStatus } from "../../services/dailyDigestApi.js";
import { editDailyDigest, streamPushDigestToDraft, type DigestPushStepId, type DigestPushProgressEvent } from "../../services/dailyDigestApi.js";
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

function countWords(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const englishWords = text.replace(/[一-鿿]/g, " ").split(/\s+/).filter(w => w.length > 0).length;
  return chineseChars + englishWords;
}

function mapStepStatus(state: StepStatus): "wait" | "process" | "finish" | "error" {
  if (state === "pending") return "wait";
  if (state === "running") return "process";
  if (state === "done") return "finish";
  return "error";
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

function resetPushState() {
  pushState.value = "idle";
  pushResult.value = null;
  STEP_DEFS.forEach(s => { stepStates.value[s.id] = { status: "pending" }; });
}

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
    const { updateDailyDigestStatus } = await import("../../services/dailyDigestApi.js");
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
            :disabled="digest.status === 'published'"
            @click="startPush"
          >
            {{ digest.status === 'published' ? '已推送' : '推送草稿' }}
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
            :message="pushResult.errorMessage ?? '推送失败'"
          />
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
  max-height: 90vh;
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
