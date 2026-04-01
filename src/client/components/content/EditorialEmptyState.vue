<script setup lang="ts">
import { editorialContentCardClass } from "./contentCardShared";

withDefaults(
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
</script>

<template>
  <div :class="[editorialContentCardClass, 'rounded-editorial-xl']">
    <a-result
      :status="status"
      :title="title"
      :class="
        compact
          ? '!bg-transparent !px-3 !py-6 sm:!px-4 sm:!py-7'
          : '!bg-transparent !px-4 !py-10 sm:!px-6 sm:!py-14'
      "
    >
      <template #subTitle>
        {{ description }}
      </template>
    </a-result>
  </div>
</template>
