<script setup lang="ts">
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from "@ant-design/icons-vue";
import { useArticlePushConfirmModal, type ArticlePushConfirmModalProps, type ArticlePushConfirmModalEvents } from "./useArticlePushConfirmModal.js";
const props = defineProps<ArticlePushConfirmModalProps>();
const emit = defineEmits<ArticlePushConfirmModalEvents>();
const {
  STEP_DEFS,
  pushState,
  pushResult,
  stepStates,
  getPublishTitle,
  mapStepStatus,
  startPush,
  isPushing,
  isDone,
  failedStepError,
  failedStepTitle,
} = useArticlePushConfirmModal(props, emit);

</script>

<template>
  <a-modal
    :open="visible"
    title="推送到微信公众号草稿箱"
    :footer="null"
    :closable="!isPushing"
    :maskClosable="false"
    width="520px"
    centered
    :body-style="{ padding: '24px' }"
    :destroy-on-close="true"
    :z-index="2000"
    @cancel="$emit('update:visible', false)"
  >
    <!-- 文章信息 -->
    <div v-if="article" class="push-info">
      <div class="push-info-row"><strong>文章：</strong>{{ getPublishTitle(article) }}</div>
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
      >
        <template #description>
          <div class="push-error-meta">
            失败步骤：{{ failedStepTitle }}<span v-if="pushResult?.errorCode"> · 错误码 {{ pushResult.errorCode }}</span>
          </div>
          <div class="push-error-detail">{{ failedStepError }}</div>
        </template>
      </a-alert>
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
  color: #b88ef5;
  font-size: 12px;
}
.push-error-meta {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}
.push-error-detail {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
