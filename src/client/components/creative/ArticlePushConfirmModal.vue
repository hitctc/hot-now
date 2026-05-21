<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from "@ant-design/icons-vue";
import type { CreativeFinishedArticle } from "../../services/creativeApi";
import {
  streamPushArticleToDraft,
  type PushDraftResult,
  type PushStepId,
  type PushProgressEvent,
  type WechatThemeId,
} from "../../services/creativeApi";
import { renderWechatThemePreview } from "../../services/wechatRenderer";

// 推送步骤定义：id 与后端 PushStepId 一一对应
const STEP_DEFS: { id: PushStepId; label: string }[] = [
  { id: "validate", label: "校验文章数据" },
  { id: "compat", label: "微信兼容处理" },
  { id: "token", label: "获取授权令牌" },
  { id: "cover", label: "上传封面图" },
  { id: "images", label: "上传正文图片" },
  { id: "draft", label: "创建草稿" },
  { id: "status", label: "更新文章状态" },
];

type StepState = {
  status: "pending" | "running" | "done" | "error";
  detail?: string;
};

const props = defineProps<{
  visible: boolean;
  article: CreativeFinishedArticle | null;
  themeId: WechatThemeId;
  themeLabel: string;
  defaultAccountName: string;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  success: [];
}>();

const pushState = ref<"idle" | "pushing" | "done">("idle");
const pushResult = ref<PushDraftResult | null>(null);
const stepStates = reactive<Record<string, StepState>>(
  Object.fromEntries(STEP_DEFS.map((s) => [s.id, { status: "pending" as const }]))
);

// 弹窗关闭时重置状态
watch(
  () => props.visible,
  (v) => {
    if (v) {
      pushState.value = "idle";
      pushResult.value = null;
      STEP_DEFS.forEach((s) => {
        stepStates[s.id] = { status: "pending" };
      });
    }
  }
);

function getFirstTitle(article: CreativeFinishedArticle): string {
  if (!article.titles) return "未命名文章";
  let titles: string[] = [];
  if (Array.isArray(article.titles)) {
    titles = article.titles;
  } else if (typeof article.titles === "string") {
    try {
      const parsed = JSON.parse(article.titles);
      if (Array.isArray(parsed)) titles = parsed;
    } catch {
      /* ignore */
    }
  }
  return titles.length > 0 ? titles[0] : "未命名文章";
}

function handleProgressEvent(event: PushProgressEvent): void {
  if (event.step === "complete") return;
  const state = stepStates[event.step];
  if (!state) return;
  state.status = event.status;
  if (event.detail) state.detail = event.detail;
  // 完成时清空 detail（如图片上传 "5/5" 完成后不再显示）
  if (event.status === "done") state.detail = undefined;
}

async function startPush(): Promise<void> {
  if (!props.article) return;
  pushState.value = "pushing";
  pushResult.value = null;
  STEP_DEFS.forEach((s) => {
    stepStates[s.id] = { status: "pending" };
  });

  const article = props.article;
  const html = article.contentMarkdown
    ? renderWechatThemePreview(article.contentMarkdown, props.themeId)
    : undefined;

  try {
    const result = await streamPushArticleToDraft(article.id, props.themeId, html, handleProgressEvent);
    pushResult.value = result;
    pushState.value = "done";
    if (result.ok) {
      emit("success");
    }
  } catch (err) {
    pushResult.value = { ok: false, errorCode: "fetch-error", errorMessage: (err as Error).message };
    pushState.value = "done";
  }
}

const isPushing = computed(() => pushState.value === "pushing");
const isDone = computed(() => pushState.value === "done");

// 获取失败步骤的错误信息
const failedStepError = computed(() => {
  if (!pushResult.value || pushResult.value.ok) return "";
  return pushResult.value.errorMessage || "推送失败";
});
</script>

<template>
  <a-modal
    :open="visible"
    title="推送到微信公众号草稿箱"
    :footer="null"
    :closable="!isPushing"
    :maskClosable="false"
    @cancel="$emit('update:visible', false)"
  >
    <div v-if="article" style="line-height: 2;">
      <p><strong>文章：</strong>{{ getFirstTitle(article) }}</p>
      <p><strong>目标公众号：</strong>{{ defaultAccountName || '未配置' }}</p>
      <p><strong>使用主题：</strong>{{ themeLabel }}</p>
    </div>

    <!-- 推送前：确认按钮 -->
    <div v-if="pushState === 'idle'" style="margin-top: 16px;">
      <a-typography-text type="secondary">
        推送将在草稿箱新增一篇，如有旧版本需手动在公众号后台清理。
      </a-typography-text>
      <div style="text-align: right; margin-top: 16px;">
        <a-button @click="$emit('update:visible', false)" style="margin-right: 8px;">取消</a-button>
        <a-button type="primary" @click="startPush">确认推送</a-button>
      </div>
    </div>

    <!-- 推送中/推送后：步骤进度 -->
    <div v-if="pushState !== 'idle'" class="push-steps">
      <div
        v-for="step in STEP_DEFS"
        :key="step.id"
        class="push-step"
        :class="{ 'push-step-active': stepStates[step.id]?.status === 'running' }"
      >
        <span class="step-icon">
          <CheckCircleFilled v-if="stepStates[step.id]?.status === 'done'" style="color: #52c41a" />
          <CloseCircleFilled v-else-if="stepStates[step.id]?.status === 'error'" style="color: #ff4d4f" />
          <LoadingOutlined v-else-if="stepStates[step.id]?.status === 'running'" spin style="color: #1890ff" />
          <span v-else class="step-pending-dot"></span>
        </span>
        <span class="step-label">{{ step.label }}</span>
        <span v-if="stepStates[step.id]?.detail" class="step-detail">{{ stepStates[step.id].detail }}</span>
      </div>
    </div>

    <!-- 推送结果 -->
    <div v-if="isDone" class="push-result">
      <div v-if="pushResult?.ok" class="push-result-success">
        <CheckCircleFilled style="color: #52c41a; margin-right: 6px;" />
        推送成功！草稿已添加到微信公众号
      </div>
      <div v-else class="push-result-error">
        <div class="push-result-error-header">
          <span>推送失败</span>
        </div>
        <div class="push-result-error-body">{{ failedStepError }}</div>
      </div>
      <div style="text-align: right; margin-top: 16px;">
        <a-button @click="$emit('update:visible', false)">关闭</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.push-steps {
  margin-top: 16px;
  padding: 12px 0;
}

.push-step {
  display: flex;
  align-items: center;
  padding: 6px 0;
  gap: 8px;
  font-size: 13px;
  line-height: 1.6;
}

.push-step-active {
  font-weight: 500;
}

.step-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.step-pending-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d9d9d9;
}

.step-label {
  color: rgba(0, 0, 0, 0.85);
}

.push-step:has(.step-pending-dot) .step-label {
  color: rgba(0, 0, 0, 0.45);
}

.step-detail {
  color: #1890ff;
  font-size: 12px;
  margin-left: 4px;
}

.push-result {
  margin-top: 16px;
}

.push-result-success {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  color: #389e0d;
  font-size: 13px;
  font-weight: 500;
}

.push-result-error-header {
  padding: 8px 12px;
  background: #ffccc7;
  border-radius: 6px 6px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: #a8071a;
}

.push-result-error-body {
  padding: 10px 12px;
  background: #fff2f0;
  border: 1px solid #ffa39e;
  border-top: none;
  border-radius: 0 0 6px 6px;
  font-size: 12px;
  line-height: 1.8;
  color: #5c0011;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}
</style>
