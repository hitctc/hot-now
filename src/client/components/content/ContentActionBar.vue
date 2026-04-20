<script setup lang="ts">
import {
  editorialContentControlButtonActiveClass,
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
  <div class="flex flex-col items-start gap-2 lg:items-end">
    <div class="flex flex-wrap gap-2 lg:justify-end">
      <a-button
        data-content-action="feedback-panel-toggle"
        size="small"
        :class="[
          editorialContentControlButtonClass,
          feedbackOpen ? editorialContentControlButtonActiveClass : editorialContentControlButtonIdleClass
        ]"
        :loading="isBusy"
        @click="emit('toggleFeedback')"
      >
        补充反馈
      </a-button>
    </div>

    <p v-if="statusText" class="m-0 max-w-[13rem] text-[11px] leading-5 text-editorial-text-muted lg:text-right">
      {{ statusText }}
    </p>
  </div>
</template>
