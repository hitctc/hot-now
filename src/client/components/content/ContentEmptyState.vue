<script setup lang="ts">
defineProps<{
  state: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  };
}>();
</script>

<template>
  <a-result class="content-empty-state" :status="state.tone === 'degraded' ? 'warning' : 'info'" :title="state.title">
    <template #subTitle>
      {{ state.description }}
    </template>
  </a-result>
</template>

<style scoped>
.content-empty-state {
  border-radius: 18px;
}
</style>
