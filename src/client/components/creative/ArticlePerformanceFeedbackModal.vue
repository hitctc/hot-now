<script setup lang="ts">

import { useArticlePerformanceFeedbackModal, type ArticlePerformanceFeedbackModalProps, type ArticlePerformanceFeedbackModalEvents } from "./useArticlePerformanceFeedbackModal.js";
const props = defineProps<ArticlePerformanceFeedbackModalProps>();
const emit = defineEmits<ArticlePerformanceFeedbackModalEvents>();
const {
  isSaving,
  deliveredUsers,
  readUsers,
  shareUsers,
  newFollowers,
  rewriteLevel,
  titleSnapshot,
  handleSave,
} = useArticlePerformanceFeedbackModal(props, emit);

</script>

<template>
  <a-modal
    :open="open"
    title="记录文章效果"
    ok-text="保存"
    cancel-text="取消"
    :confirm-loading="isSaving"
    :width="520"
    @ok="handleSave"
    @cancel="emit('update:open', false)"
  >
    <div class="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
      第一阶段只观察 10 篇。建议发布约 3 天后填写一次，目标是 1 分钟内完成；不确定的新关注人数可以留空。
    </div>

    <div class="mb-4">
      <div class="text-xs text-editorial-text-muted">自动保存的最终标题快照</div>
      <div class="mt-1 text-sm font-medium text-editorial-text-main">{{ titleSnapshot }}</div>
    </div>

    <a-form layout="vertical">
      <div class="grid grid-cols-2 gap-x-4">
        <a-form-item label="送达 / 曝光人数" required>
          <a-input-number v-model:value="deliveredUsers" :min="0" :precision="0" class="!w-full" />
        </a-form-item>
        <a-form-item label="阅读人数" required>
          <a-input-number v-model:value="readUsers" :min="0" :precision="0" class="!w-full" />
        </a-form-item>
        <a-form-item label="分享人数" required>
          <a-input-number v-model:value="shareUsers" :min="0" :precision="0" class="!w-full" />
        </a-form-item>
        <a-form-item label="新增关注人数（可选）">
          <a-input-number v-model:value="newFollowers" :min="0" :precision="0" class="!w-full" />
        </a-form-item>
      </div>

      <a-form-item label="人工复述程度" required>
        <a-radio-group v-model:value="rewriteLevel">
          <a-radio-button value="light">轻度</a-radio-button>
          <a-radio-button value="medium">中度</a-radio-button>
          <a-radio-button value="heavy">大幅</a-radio-button>
        </a-radio-group>
      </a-form-item>
    </a-form>
  </a-modal>
</template>
