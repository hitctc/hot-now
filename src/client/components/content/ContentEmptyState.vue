<script setup lang="ts">
import EditorialEmptyState from "./EditorialEmptyState.vue";

defineProps<{
  state: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  };
}>();
</script>

<template>
  <EditorialEmptyState
    :status="state.tone === 'degraded' ? 'warning' : 'info'"
    :title="state.title"
    :description="state.description"
  />
</template>
