<script setup lang="ts">
import { computed } from "vue";

import { editorialContentCardClass } from "./contentCardShared";

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    status?: "success" | "info" | "warning" | "error";
    compact?: boolean;
  }>(),
  {
    status: "info",
    compact: false
  }
);

const statusLabel = computed(() => {
  if (props.status === "error") {
    return "错误";
  }

  if (props.status === "warning") {
    return "提醒";
  }

  if (props.status === "success") {
    return "已就绪";
  }

  return "空状态";
});
</script>

<template>
  <section
    :class="[
      editorialContentCardClass,
      compact ? 'rounded-editorial-md px-4 py-4' : 'rounded-editorial-lg px-5 py-6'
    ]"
  >
    <div class="flex flex-col gap-2">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
        {{ statusLabel }}
      </p>
      <h3 class="m-0 text-base font-medium text-editorial-text-main">{{ title }}</h3>
      <p class="m-0 text-sm leading-6 text-editorial-text-body">{{ description }}</p>
      <slot />
    </div>
  </section>
</template>
