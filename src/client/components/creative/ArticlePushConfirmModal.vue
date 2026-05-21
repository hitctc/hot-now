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
const STEP_DEFS: { id: PushStepId; title: string }[] = [
  { id: "validate", title: "校验文章数据" },
  { id: "compat", title: "微信兼容处理" },
  { id: "token", title: "获取授权令牌" },
  { id: "cover", title: "上传封面图" },
  { id: "images", title: "上传正文图片" },
  { id: "draft", title: "创建草稿" },
  { id: "status", title: "更新文章状态" },
];

type StepStatus = "pending" | "running" | "done" | "error";

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
const stepStates = reactive<Record<string, { status: StepStatus; detail?: string }>>(
  Object.fromEntries(STEP_DEFS.map((s) => [s.id, { status: "pending" as StepStatus }]))
);

// 弹窗打开时重置状态
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
  if (Array.isArray(article.titles)) titles = article.titles;
  else if (typeof article.titles === "string") {
    try { const p = JSON.parse(article.titles); if (Array.isArray(p)) titles = p; } catch { /* */ }
  }
  return titles.length > 0 ? titles[0] : "未命名文章";
}

// 将自定义状态映射为 Ant Steps 的 status
function mapStepStatus(state: StepStatus): "wait" | "process" | "finish" | "error" {
  if (state === "pending") return "wait";
  if (state === "running") return "process";
  if (state === "done") return "finish";
  return "error";
}

function handleProgressEvent(event: PushProgressEvent): void {
  if (event.step === "complete") return;
  const state = stepStates[event.step];
  if (!state) return;
  state.status = event.status;
  if (event.detail) state.detail = event.detail;
  if (event.status === "done") state.detail = undefined;
}

async function startPush(): Promise<void> {
  if (!props.article) return;
  pushState.value = "pushing";
  pushResult.value = null;
  STEP_DEFS.forEach((s) => { stepStates[s.id] = { status: "pending" }; });

  const html = props.article.contentMarkdown
    ? renderWechatThemePreview(props.article.contentMarkdown, props.themeId)
    : undefined;

  try {
    const result = await streamPushArticleToDraft(props.article.id, props.themeId, html, handleProgressEvent);
    pushResult.value = result;
    pushState.value = "done";
    if (result.ok) emit("success");
  } catch (err) {
    pushResult.value = { ok: false, errorCode: "fetch-error", errorMessage: (err as Error).message };
    pushState.value = "done";
  }
}

const isPushing = computed(() => pushState.value === "pushing");
const isDone = computed(() => pushState.value === "done");
const failedStepError = computed(() => pushResult.value?.ok ? "" : (pushResult.value?.errorMessage || "推送失败"));
</script>

<template>
  <a-modal
    :open="visible"
    title="推送到微信公众号草稿箱"
    :footer="null"
    :closable="!isPushing"
    :maskClosable="false"
    width="520px"
    @cancel="$emit('update:visible', false)"
  >
    <!-- 文章信息 -->
    <div v-if="article" class="push-info">
      <div class="push-info-row"><strong>文章：</strong>{{ getFirstTitle(article) }}</div>
      <div class="push-info-row"><strong>目标公众号：</strong>{{ defaultAccountName || '未配置' }}</div>
      <div class="push-info-row"><strong>使用主题：</strong>{{ themeLabel }}</div>
    </div>

    <!-- 推送前：确认按钮 -->
    <div v-if="pushState === 'idle'" class="push-idle">
      <a-typography-text type="secondary">
        推送将在草稿箱新增一篇，如有旧版本需手动在公众号后台清理。
      </a-typography-text>
      <div class="push-idle-actions">
        <a-button @click="$emit('update:visible', false)">取消</a-button>
        <a-button type="primary" @click="startPush">确认推送</a-button>
      </div>
    </div>

    <!-- 推送中/推送后：Ant Steps 组件 -->
    <a-steps
      v-if="pushState !== 'idle'"
      direction="vertical"
      size="small"
      class="push-progress"
    >
      <a-step
        v-for="(step, idx) in STEP_DEFS"
        :key="step.id"
        :title="step.title"
        :status="mapStepStatus(stepStates[step.id].status)"
      >
        <template #icon>
          <LoadingOutlined v-if="stepStates[step.id].status === 'running'" spin />
          <CheckCircleFilled v-else-if="stepStates[step.id].status === 'done'" style="color: #52c41a" />
          <CloseCircleFilled v-else-if="stepStates[step.id].status === 'error'" style="color: #ff4d4f" />
          <span v-else class="push-step-num">{{ idx + 1 }}</span>
        </template>
        <template #description>
          <span v-if="stepStates[step.id].detail" class="push-detail">{{ stepStates[step.id].detail }}</span>
        </template>
      </a-step>
    </a-steps>

    <!-- 推送结果 -->
    <div v-if="isDone" class="push-result">
      <a-alert
        v-if="pushResult?.ok"
        type="success"
        show-icon
        message="推送成功！草稿已添加到微信公众号"
      />
      <a-alert
        v-else
        type="error"
        show-icon
        message="推送失败"
        :description="failedStepError"
      />
      <div class="push-result-actions">
        <a-button @click="$emit('update:visible', false)">关闭</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.push-info {
  line-height: 2;
  margin-bottom: 8px;
}
.push-info-row {
  font-size: 13px;
}
.push-idle {
  margin-top: 16px;
}
.push-idle-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.push-progress {
  margin-top: 16px;
}
.push-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.45);
}
.push-detail {
  color: #1890ff;
  font-size: 12px;
}
.push-result {
  margin-top: 16px;
}
.push-result-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
