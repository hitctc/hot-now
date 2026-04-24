<script setup lang="ts">
import { editorialContentCardClass } from "../../content/contentCardShared";
import type { SourcesActionPendingGetter, SourcesOperations } from "./sourcesPageShared";

defineProps<{
  operations: SourcesOperations;
  isActionPending: SourcesActionPendingGetter;
}>();

const emit = defineEmits<{
  send: [];
}>();
</script>

<template>
  <section>
    <a-card
      :class="editorialContentCardClass"
      title="发送最新报告"
      size="small"
      data-sources-section="manual-send-latest-email"
    >
      <template #extra>
        <a-button
          type="primary"
          data-action="manual-send-latest-email"
          :disabled="!operations.canTriggerManualSendLatestEmail || operations.isRunning"
          :loading="isActionPending('manual:send-latest-email')"
          @click="emit('send')"
        >
          {{ operations.isRunning ? "任务执行中..." : "发送最新报告" }}
        </a-button>
      </template>
      <div class="flex w-full flex-col gap-4">
        <a-typography-paragraph type="secondary">
          直接读取最新一份报告并尝试发信，适合采集完成后的人工重试。
        </a-typography-paragraph>
      </div>
    </a-card>
  </section>
</template>
