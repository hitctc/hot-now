<script setup lang="ts">
/** 只说明操作能力和额度边界，不参与任务提交、排队或取消。 */
defineProps<{ capability: "model" | "local" }>();
</script>

<template>
  <a-tooltip :trigger="['hover', 'click']" :title="capability === 'model' ? '消耗模型额度' : '不调用模型'">
    <span
      :data-operation-capability="capability"
      class="inline-flex cursor-help items-center rounded border border-editorial-border px-1 text-[10px] leading-4 text-editorial-text-muted"
      tabindex="0"
      :aria-label="capability === 'model' ? '模型：消耗模型额度' : '本地：不调用模型'"
    >{{ capability === 'model' ? '模型' : '本地' }}</span>
  </a-tooltip>
</template>
