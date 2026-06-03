<script setup lang="ts">
import { ref } from "vue";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  MinusCircleFilled,
  StopFilled,
} from "@ant-design/icons-vue";
import type { StepTraceEntry } from "../../services/creativeApi";

const props = defineProps<{
  stepTrace: StepTraceEntry[] | null;
  stopStep?: number | null;
  reasonText?: string | null;
}>();

const expandedSteps = ref<Set<number>>(new Set());

function toggleStep(step: number): void {
  const next = new Set(expandedSteps.value);
  if (next.has(step)) {
    next.delete(step);
  } else {
    next.add(step);
  }
  expandedSteps.value = next;
}

// 步骤状态 → 图标和颜色
const statusConfig: Record<string, { color: string; bg: string }> = {
  success: { color: "text-green-500", bg: "bg-green-500" },
  failed: { color: "text-red-500", bg: "bg-red-500" },
  running: { color: "text-blue-500", bg: "bg-blue-500" },
  pending: { color: "text-gray-400", bg: "bg-gray-300" },
  skipped: { color: "text-gray-300", bg: "bg-gray-200" },
  stopped: { color: "text-orange-500", bg: "bg-orange-500" },
};

function getStatusStyle(status: string) {
  return statusConfig[status] ?? statusConfig.pending;
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  return `${min}m${remainSec}s`;
}

// 格式化 meta 为 key-value 对
function formatMeta(meta: Record<string, unknown> | undefined): Array<{ key: string; value: string }> {
  if (!meta) return [];
  return Object.entries(meta)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({
      key: k,
      value: typeof v === "object" ? JSON.stringify(v, null, 2) : String(v),
    }));
}
</script>

<template>
  <section v-if="stepTrace && stepTrace.length > 0">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">写作流程</h3>
      <span v-if="stepTrace.filter(s => s.status === 'success').length === stepTrace.length" class="text-[11px] text-green-500">
        全部完成
      </span>
    </div>

    <!-- 中止信息 -->
    <div v-if="stopStep && reasonText" class="mb-2 rounded border border-orange-400 bg-orange-50 px-3 py-2 text-xs text-orange-800">
      ⏹ 流程中止于 Step {{ stopStep }}：{{ reasonText }}
    </div>

    <!-- 时间线 -->
    <div class="space-y-0">
      <div
        v-for="(entry, idx) in stepTrace"
        :key="entry.step"
        class="flex gap-3"
      >
        <!-- 左侧：竖线 + 节点 -->
        <div class="flex flex-col items-center">
          <div
            class="flex h-6 w-6 items-center justify-center rounded-full text-xs"
            :class="[
              entry.status === 'running' ? 'animate-pulse bg-blue-100' : 'bg-gray-100',
              getStatusStyle(entry.status).color
            ]"
          >
            <CheckCircleFilled v-if="entry.status === 'success'" />
            <CloseCircleFilled v-else-if="entry.status === 'failed'" />
            <LoadingOutlined v-else-if="entry.status === 'running'" spin />
            <StopFilled v-else-if="entry.status === 'stopped'" />
            <MinusCircleFilled v-else-if="entry.status === 'skipped'" />
            <span v-else class="text-[10px] font-bold text-gray-400">{{ entry.step }}</span>
          </div>
          <div
            v-if="idx < stepTrace.length - 1"
            class="w-px flex-1"
            :class="entry.status === 'success' ? 'bg-green-300' : 'bg-gray-200'"
          />
        </div>

        <!-- 右侧：步骤内容 -->
        <div class="flex-1 pb-3">
          <button
            class="flex w-full items-center gap-2 text-left"
            @click="toggleStep(entry.step)"
          >
            <span class="text-xs font-medium text-editorial-text-body">
              Step{{ entry.step }} {{ entry.stepName }}
            </span>
            <span class="text-[11px]" :class="getStatusStyle(entry.status).color">
              {{ entry.status }}
            </span>
            <span v-if="entry.durationMs" class="ml-auto text-[11px] text-editorial-text-muted">
              {{ formatDuration(entry.durationMs) }}
            </span>
            <span class="text-[11px] text-editorial-text-muted">{{ expandedSteps.has(entry.step) ? '▲' : '▼' }}</span>
          </button>

          <!-- 错误信息 -->
          <div v-if="entry.error" class="mt-1 text-[11px] text-red-500">
            {{ entry.error }}
          </div>

          <!-- 展开详情 -->
          <div v-if="expandedSteps.has(entry.step)" class="mt-1 space-y-1">
            <div v-if="entry.summary" class="text-[11px] text-editorial-text-muted">
              {{ entry.summary }}
            </div>
            <div v-if="entry.startedAt" class="text-[11px] text-editorial-text-muted">
              {{ entry.startedAt }} → {{ entry.finishedAt ?? '...' }}
            </div>
            <!-- meta 格式化展示 -->
            <div v-if="formatMeta(entry.meta).length > 0" class="mt-1 rounded border border-editorial-border bg-editorial-bg-page px-2 py-1">
              <div v-for="row in formatMeta(entry.meta)" :key="row.key" class="flex gap-2 text-[11px] leading-5">
                <span class="shrink-0 text-editorial-text-muted">{{ row.key }}</span>
                <span class="break-all text-editorial-text-body">{{ row.value }}</span>
              </div>
            </div>
            <!-- Step 12 图片子步骤 -->
            <template v-if="entry.step === 12 && entry.meta?.substepTraces">
              <div class="mt-1 text-[11px] font-medium text-editorial-text-muted">图片生成子步骤</div>
              <div
                v-for="sub in (entry.meta.substepTraces as Array<Record<string, unknown>>)"
                :key="String(sub.step)"
                class="mt-1 rounded border border-editorial-border bg-editorial-bg-page px-2 py-1"
              >
                <div class="flex items-center gap-2 text-[11px]">
                  <span class="font-medium">{{ sub.step }}</span>
                  <span :class="String(sub.status) === 'completed' || String(sub.status) === 'passed' ? 'text-green-500' : 'text-orange-500'">
                    {{ String(sub.status) }}
                  </span>
                  <span v-if="sub.model" class="text-editorial-text-muted">({{ String(sub.model) }})</span>
                  <span class="ml-auto text-editorial-text-muted">{{ formatDuration(Number(sub.durationMs)) }}</span>
                </div>
                <div v-if="sub.warnings && (sub.warnings as string[]).length > 0" class="mt-0.5 text-[11px] text-yellow-600">
                  ⚠ {{ (sub.warnings as string[]).join('; ') }}
                </div>
                <div v-if="sub.errors && (sub.errors as string[]).length > 0" class="mt-0.5 text-[11px] text-red-500">
                  ✗ {{ (sub.errors as string[]).join('; ') }}
                </div>
                <div v-if="sub.meta && typeof sub.meta === 'object'" class="mt-0.5">
                  <div v-for="row in formatMeta(sub.meta as Record<string, unknown>)" :key="row.key" class="flex gap-2 text-[11px] leading-5">
                    <span class="shrink-0 text-editorial-text-muted">{{ row.key }}</span>
                    <span class="break-all text-editorial-text-body">{{ row.value }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
