<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";

const props = defineProps<{
  pipelineAt: string | null;
  codexGenerateAt: string | null;
  codexConsumeAt: string | null;
}>();

// 每秒刷新的当前时间，驱动所有倒计时重算
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

function formatCountdown(iso: string | null): string {
  if (!iso) return "-";
  const target = new Date(iso).getTime();
  const diff = target - now.value;
  if (diff <= 0) return "即将执行";
  const totalSec = Math.floor(diff / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}分${sec}秒后`;
  return `${sec}秒后`;
}

// 是否有任何有效倒计时值（决定是否显示整个区域）
const hasAnyCountdown = computed(() =>
  !!props.pipelineAt || !!props.codexGenerateAt || !!props.codexConsumeAt
);

const items = computed(() => [
  { label: "管线运行", at: props.pipelineAt },
  { label: "Codex 生成", at: props.codexGenerateAt },
  { label: "Codex 消费", at: props.codexConsumeAt },
]);
</script>

<template>
  <div v-if="hasAnyCountdown" class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-editorial-border bg-editorial-bg-page px-3 py-1.5">
    <div
      v-for="item in items"
      :key="item.label"
      class="flex items-center gap-1 text-[11px]"
    >
      <span class="text-editorial-text-muted">{{ item.label }}</span>
      <span class="font-medium tabular-nums" :class="item.at ? 'text-editorial-text-body' : 'text-editorial-text-muted/50'">
        {{ formatCountdown(item.at) }}
      </span>
    </div>
  </div>
</template>
