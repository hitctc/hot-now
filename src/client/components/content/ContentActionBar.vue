<script setup lang="ts">
import {
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass
} from "./contentCardShared";

const props = defineProps<{
  isBusy?: boolean;
  feedbackOpen: boolean;
  statusText?: string | null;
}>();

const emit = defineEmits<{
  toggleFeedback: [];
}>();
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-2">
      <a-button
        data-content-action="feedback-panel-toggle"
        size="small"
        :class="[
          editorialContentControlButtonClass,
          editorialContentControlButtonIdleClass
        ]"
        :loading="isBusy"
        @click="emit('toggleFeedback')"
      >
        {{ feedbackOpen ? "收起反馈" : "补充反馈" }}
      </a-button>
    </div>

    <p v-if="statusText" class="m-0 text-[11px] leading-5 text-editorial-text-muted">
      {{ statusText }}
    </p>
  </div>
</template>
