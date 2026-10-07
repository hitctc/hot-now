<script setup lang="ts">
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from "@ant-design/icons-vue";
import { useArticlePushFloatWidget, type ArticlePushFloatWidgetProps, type ArticlePushFloatWidgetEvents } from "./useArticlePushFloatWidget.js";
const props = defineProps<ArticlePushFloatWidgetProps>();
const emit = defineEmits<ArticlePushFloatWidgetEvents>();
const {
  needsRiskConfirmation,
  riskReasons,
  MANUAL_FORCED_REWRITE_MARKER,
  confirmRiskAndPush,
  STEP_DEFS,
  pushState,
  pushResult,
  secondsUntilClose,
  stepStates,
  cancelAutoClose,
  resetState,
  getPublishTitle,
  startPush,
  close,
  isPushing,
  isDone,
  failedStepError,
  failedStepTitle,
} = useArticlePushFloatWidget(props, emit);
defineExpose({ isPushing, resetState, startPush });
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
        <div v-if="!isDone || !pushResult?.ok" class="push-float-info-meta">{{ defaultAccountName || '未配置' }} · {{ themeLabel }}</div>
      </div>

      <!-- 强制稿只在此浮窗确认一次；普通稿沿用点击后直接推送。 -->
      <div v-if="pushState === 'idle' && needsRiskConfirmation" class="mb-2 space-y-2 text-[11px] text-orange-700" data-forced-push-confirm>
        <strong>{{ MANUAL_FORCED_REWRITE_MARKER }}</strong>
        <p v-for="reason in riskReasons" :key="reason" class="m-0 whitespace-pre-wrap break-words">{{ reason }}</p>
        <p class="m-0">事实或质检曾未通过，请自行核实。本次仅确认推送风险，不视为审核通过。</p>
        <a-button size="small" type="primary" @click="confirmRiskAndPush">确认风险并推送</a-button>
      </div>

      <!-- 推送进度 -->
      <div v-if="pushState !== 'idle' && (!isDone || !pushResult?.ok)" class="push-float-steps">
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
          <CheckCircleFilled /> 已加入公众号草稿箱
        </div>
        <div v-else class="push-float-result-err">
          <CloseCircleFilled />
          <div>
            <div>推送失败 · {{ failedStepTitle }}<span v-if="pushResult?.errorCode"> · 错误码 {{ pushResult.errorCode }}</span></div>
            <div class="push-float-error-detail">{{ failedStepError }}</div>
          </div>
        </div>
        <div v-if="secondsUntilClose !== null" class="push-float-auto-close">
          <span>{{ secondsUntilClose }}s 后自动关闭</span>
          <button type="button" class="push-float-cancel-auto-close" @click="cancelAutoClose">取消自动关闭</button>
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
  bottom: 0;
  right: 0;
  width: 184px;
  max-width: 100vw;
  background: var(--editorial-bg-card, #fff);
  border: 1px solid var(--editorial-border, #e5e7eb);
  border-radius: 10px 0 0 0;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06);
  z-index: 2100;
  padding: 10px;
  font-size: 13px;
  max-height: 100vh;
  overflow-y: auto;
}

/* 头部 */
.push-float-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
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
  margin-bottom: 6px;
  padding-bottom: 6px;
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

/* 步骤列表 */
.push-float-steps {
  margin-top: 2px;
}
.push-float-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
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
  margin-top: 6px;
  padding-top: 6px;
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
.push-float-error-detail {
  margin-top: 4px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #8c1d18;
}
.push-float-auto-close {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
}
.push-float-cancel-auto-close {
  border: 0;
  background: none;
  padding: 0;
  color: #6750a4;
  cursor: pointer;
}
.push-float-result-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
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
