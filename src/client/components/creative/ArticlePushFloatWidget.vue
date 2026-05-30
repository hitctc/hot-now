<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from "@ant-design/icons-vue";
import type { CreativeFinishedArticle } from "../../services/creativeApi";
import {
  streamPushArticleToDraft,
  readCreativeFinishedArticle,
  type PushDraftResult,
  type PushStepId,
  type PushProgressEvent,
  type WechatThemeId,
} from "../../services/creativeApi";
import { renderWechatThemePreview } from "../../services/wechatRenderer";

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

watch(
  () => props.visible,
  (v) => {
    if (v) {
      pushState.value = "idle";
      pushResult.value = null;
      STEP_DEFS.forEach((s) => { stepStates[s.id] = { status: "pending" }; });
    }
  }
);

function getPublishTitle(article: CreativeFinishedArticle): string {
  if (!article.titles) return "未命名文章";
  let titles: string[] = [];
  if (Array.isArray(article.titles)) titles = article.titles;
  else if (typeof article.titles === "string") {
    try { const p = JSON.parse(article.titles); if (Array.isArray(p)) titles = p; } catch { /* */ }
  }
  if (titles.length === 0) return "未命名文章";
  const idx = Math.min(article.titleIndex ?? 0, titles.length - 1);
  return titles[idx >= 0 ? idx : 0];
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

  let latestArticle = props.article;
  try {
    latestArticle = await readCreativeFinishedArticle(props.article.id);
  } catch { /* 拉取失败则回退到内存中的数据 */ }

  const html = latestArticle.contentMarkdown
    ? renderWechatThemePreview(latestArticle.contentMarkdown, props.themeId)
    : undefined;

  try {
    const result = await streamPushArticleToDraft(latestArticle.id, props.themeId, html, handleProgressEvent);
    pushResult.value = result;
    pushState.value = "done";
    if (result.ok) emit("success");
  } catch (err) {
    pushResult.value = { ok: false, errorCode: "fetch-error", errorMessage: (err as Error).message };
    pushState.value = "done";
  }
}

function close(): void {
  emit("update:visible", false);
}

const isPushing = computed(() => pushState.value === "pushing");
const isDone = computed(() => pushState.value === "done");
const failedStepError = computed(() => pushResult.value?.ok ? "" : (pushResult.value?.errorMessage || "推送失败"));
</script>

<template>
  <Transition name="push-float">
    <div v-if="visible" class="push-float">
      <!-- 头部 -->
      <div class="push-float-header">
        <span class="push-float-header-title">推送到草稿箱</span>
        <button v-if="!isPushing" class="push-float-close" @click="close">✕</button>
      </div>

      <!-- 文章信息 -->
      <div v-if="article" class="push-float-info">
        <div class="push-float-info-title">{{ getPublishTitle(article) }}</div>
        <div class="push-float-info-meta">{{ defaultAccountName || '未配置' }} · {{ themeLabel }}</div>
      </div>

      <!-- 推送前：确认 -->
      <div v-if="pushState === 'idle'" class="push-float-confirm">
        <div class="push-float-confirm-hint">推送将在草稿箱新增一篇，旧版本需手动清理</div>
        <div class="push-float-confirm-btns">
          <a-button size="small" @click="close">取消</a-button>
          <a-button size="small" type="primary" @click="startPush">确认推送</a-button>
        </div>
      </div>

      <!-- 推送进度 -->
      <div v-if="pushState !== 'idle'" class="push-float-steps">
        <div
          v-for="step in STEP_DEFS"
          :key="step.id"
          class="push-float-step"
          :data-status="stepStates[step.id].status"
        >
          <span class="push-float-step-icon">
            <LoadingOutlined v-if="stepStates[step.id].status === 'running'" spin />
            <CheckCircleFilled v-else-if="stepStates[step.id].status === 'done'" />
            <CloseCircleFilled v-else-if="stepStates[step.id].status === 'error'" />
            <span v-else class="push-float-dot" />
          </span>
          <span class="push-float-step-title">{{ step.title }}</span>
          <span v-if="stepStates[step.id].detail" class="push-float-step-detail">
            {{ stepStates[step.id].detail }}
          </span>
        </div>
      </div>

      <!-- 推送结果 -->
      <div v-if="isDone" class="push-float-result">
        <div v-if="pushResult?.ok" class="push-float-result-ok">
          <CheckCircleFilled /> 草稿已添加到微信公众号
        </div>
        <div v-else class="push-float-result-err">
          <CloseCircleFilled /> 推送失败：{{ failedStepError }}
        </div>
        <div class="push-float-result-actions">
          <a-button size="small" @click="close">关闭</a-button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.push-float {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 320px;
  background: var(--editorial-bg-card, #fff);
  border: 1px solid var(--editorial-border, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06);
  z-index: 2100;
  padding: 14px 16px;
  font-size: 13px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

/* 头部 */
.push-float-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.push-float-header-title {
  font-size: 13px;
  font-weight: 600;
}
.push-float-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: rgba(0, 0, 0, 0.45);
  padding: 0 2px;
  line-height: 1;
}
.push-float-close:hover {
  color: rgba(0, 0, 0, 0.75);
}

/* 文章信息 */
.push-float-info {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.push-float-info-title {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.push-float-info-meta {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  margin-top: 2px;
}

/* 确认 */
.push-float-confirm-hint {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  margin-bottom: 8px;
}
.push-float-confirm-btns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

/* 步骤列表 */
.push-float-steps {
  margin-top: 2px;
}
.push-float-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
}
.push-float-step[data-status="done"] {
  color: rgba(0, 0, 0, 0.55);
}
.push-float-step[data-status="running"] {
  color: rgba(0, 0, 0, 0.85);
  font-weight: 500;
}
.push-float-step[data-status="error"] {
  color: #ff4d4f;
}
.push-float-step-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 12px;
  flex-shrink: 0;
}
.push-float-step-icon :deep(.anticon) {
  font-size: 12px;
}
.push-float-step-title {
  flex: 1;
  line-height: 1.4;
}
.push-float-step-detail {
  font-size: 11px;
  color: #b88ef5;
  margin-left: auto;
  flex-shrink: 0;
}
.push-float-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.15);
}

/* 结果 */
.push-float-result {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.push-float-result-ok {
  font-size: 12px;
  color: #52c41a;
}
.push-float-result-err {
  font-size: 12px;
  color: #ff4d4f;
}
.push-float-result-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

/* 过渡动画 */
.push-float-enter-active,
.push-float-leave-active {
  transition: all 0.25s ease;
}
.push-float-enter-from,
.push-float-leave-to {
  opacity: 0;
  transform: translateY(16px);
}
</style>
