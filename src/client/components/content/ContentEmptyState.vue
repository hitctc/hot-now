<script setup lang="ts">
import { editorialContentCardClass } from "./contentCardShared";

defineProps<{
  state: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  };
}>();
</script>

<template>
  <a-result
    :class="[editorialContentCardClass, 'rounded-editorial-xl']"
    :status="state.tone === 'degraded' ? 'warning' : 'info'"
    :title="state.title"
  >
    <template #subTitle>
      {{ state.description }}
    </template>
  </a-result>
</template>
