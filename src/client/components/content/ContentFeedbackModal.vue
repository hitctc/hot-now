<script setup lang="ts">
import ContentFeedbackPanel from "./ContentFeedbackPanel.vue";

import type { ContentFeedbackEntry, SaveFeedbackPoolEntryPayload } from "../../services/contentApi";

defineProps<{
  open: boolean;
  modelValue?: ContentFeedbackEntry;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: SaveFeedbackPoolEntryPayload];
}>();

function handleSubmit(payload: SaveFeedbackPoolEntryPayload): void {
  emit("submit", payload);
}
</script>

<template>
  <a-modal
    :open="open"
    :footer="null"
    :destroy-on-close="true"
    class="editorial-feedback-modal"
    centered
    title="补充反馈"
    width="640px"
    data-content-feedback-modal
    @cancel="emit('close')"
  >
    <p class="mb-0 text-sm leading-6 text-editorial-text-body">
      把这条内容的判断、关键词和处理建议写入反馈池，后续筛选和回看都会复用这份信息。
    </p>

    <ContentFeedbackPanel
      :model-value="modelValue"
      :submitting="submitting"
      @submit="handleSubmit"
    />
  </a-modal>
</template>
