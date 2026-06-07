<script setup lang="ts">
import { computed, ref } from "vue";
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

// 从 stepTrace 计算总写作耗时：首步 startedAt → 末步 finishedAt
const totalDuration = computed((): number | null => {
  const trace = props.stepTrace;
  if (!trace || trace.length === 0) return null;
  const withStarted = trace.filter(s => s.startedAt);
  const withFinished = trace.filter(s => s.finishedAt);
  if (withStarted.length === 0 || withFinished.length === 0) return null;
  const firstStart = new Date(withStarted[0].startedAt!).getTime();
  const lastFinish = new Date(withFinished[withFinished.length - 1].finishedAt!).getTime();
  if (Number.isNaN(firstStart) || Number.isNaN(lastFinish)) return null;
  return lastFinish - firstStart;
});

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
    .filter(([k]) => k !== "substepTraces")
    .map(([k, v]) => ({
      key: k,
      value: typeof v === "object" ? JSON.stringify(v, null, 2) : String(v),
    }));
}

// 搜索结果类型标签
const TYPE_LABELS: Record<string, string> = {
  official: "官方",
  media: "媒体",
  blog: "博客",
  report: "报告",
  reference: "参考",
  original_source: "原文",
};
function resultTypeLabel(type?: string): string {
  return TYPE_LABELS[type ?? ""] ?? type ?? "其他";
}

// 搜索结果类型样式
function resultTypeStyle(type?: string): string {
  const map: Record<string, string> = {
    official: "bg-blue-100 text-blue-700",
    media: "bg-purple-100 text-purple-700",
    blog: "bg-green-100 text-green-700",
    report: "bg-orange-100 text-orange-700",
    reference: "bg-gray-100 text-gray-700",
    original_source: "bg-teal-100 text-teal-700",
  };
  return map[type ?? ""] ?? "bg-gray-100 text-gray-600";
}

// 置信度颜色
function confidenceColor(level: string): string {
  if (level === "high") return "text-green-600";
  if (level === "medium") return "text-yellow-600";
  return "text-red-500";
}

// 风险等级颜色
function riskColor(level: string): string {
  if (level === "high") return "text-red-600 font-medium";
  if (level === "medium") return "text-orange-600";
  return "text-green-600";
}
</script>

<template>
  <section v-if="stepTrace && stepTrace.length > 0">
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">写作流程</h3>
        <span v-if="totalDuration != null" class="text-[11px] text-editorial-text-muted">总耗时 {{ formatDuration(totalDuration) }}</span>
      </div>
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
            <div v-if="entry.startedAt" class="text-[11px] text-editorial-text-muted">
              {{ entry.startedAt }} → {{ entry.finishedAt ?? '...' }}
            </div>

            <!-- Step1: 素材来源 -->
            <template v-if="entry.step === 1 && entry.meta?.source_title">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1 text-[11px] space-y-0.5">
                <div v-if="entry.meta.source_url" class="truncate">
                  <a :href="String(entry.meta.source_url)" target="_blank" class="text-editorial-link-active hover:underline">{{ entry.meta.source_title }}</a>
                </div>
                <div v-else class="text-editorial-text-body">{{ entry.meta.source_title }}</div>
                <div v-if="entry.meta.source_name" class="text-editorial-text-muted">{{ entry.meta.source_name }}</div>
              </div>
            </template>

            <!-- Step2: 搜索 query 列表 -->
            <template v-else-if="entry.step === 2 && entry.meta?.queries">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1">
                <div class="text-[10px] text-editorial-text-muted">搜索意图 · {{ (entry.meta.queries as string[]).length }} 条</div>
                <div v-for="(q, i) in (entry.meta.queries as string[])" :key="i" class="text-[11px] text-editorial-text-body truncate">· {{ q }}</div>
              </div>
            </template>

            <!-- Step3: 搜索结果（P0） -->
            <template v-else-if="entry.step === 3 && entry.meta?.results">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1 space-y-1.5">
                <div class="flex items-center gap-2 text-[10px]">
                  <span class="text-editorial-text-muted">搜索结果</span>
                  <span v-if="entry.meta.stats" class="text-editorial-text-muted">
                    官方 {{ (entry.meta.stats as any).official ?? 0 }} · 媒体 {{ (entry.meta.stats as any).report ?? 0 }} · 共 {{ (entry.meta.stats as any).total ?? (entry.meta.results as any[]).length }}
                  </span>
                  <span v-if="entry.meta.confidence" :class="confidenceColor(String(entry.meta.confidence))">置信度 {{ entry.meta.confidence }}</span>
                </div>
                <div v-for="(r, i) in (entry.meta.results as Array<{title?: string; url?: string; type?: string}>)" :key="i" class="flex items-start gap-1 text-[11px]">
                  <span class="shrink-0 rounded px-1 text-[9px] font-medium" :class="resultTypeStyle(r.type)">{{ resultTypeLabel(r.type) }}</span>
                  <a v-if="r.url" :href="r.url" target="_blank" class="truncate text-editorial-link-active hover:underline" :title="r.title">{{ r.title || r.url }}</a>
                  <span v-else class="truncate text-editorial-text-body">{{ r.title || '-' }}</span>
                </div>
              </div>
            </template>

            <!-- Step4: 写作策略 -->
            <template v-else-if="entry.step === 4 && entry.meta?.angle">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1 text-[11px] space-y-0.5">
                <div class="flex items-center gap-2">
                  <span class="rounded bg-blue-100 px-1 text-[9px] font-medium text-blue-700">{{ entry.meta.final_mode ?? '-' }} 模式</span>
                  <span class="text-editorial-text-muted">{{ entry.meta.archetype }}</span>
                  <span v-if="entry.meta.confidence" :class="confidenceColor(String(entry.meta.confidence))">{{ entry.meta.confidence }}</span>
                </div>
                <div class="font-medium text-editorial-text-body">{{ entry.meta.angle }}</div>
                <div class="text-editorial-text-muted">方向：{{ entry.meta.writing_direction ?? '-' }} · 风险：{{ entry.meta.dependency_risk ?? '-' }} · 厚度：{{ entry.meta.material_thickness ?? '-' }}</div>
              </div>
            </template>

            <!-- Step7/9: 导语/摘要文本 -->
            <template v-else-if="(entry.step === 7 || entry.step === 9) && entry.meta?.text">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1">
                <div class="text-[10px] text-editorial-text-muted">{{ entry.step === 7 ? '导语' : '摘要' }} · {{ entry.meta.word_count ?? '?' }}字</div>
                <div class="text-[11px] leading-5 text-editorial-text-body">{{ entry.meta.text }}</div>
              </div>
            </template>

            <!-- Step10: 质量自检 -->
            <template v-else-if="entry.step === 10 && entry.meta?.issues">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1 text-[11px] space-y-0.5">
                <div class="flex items-center gap-2">
                  <span :class="entry.meta.pass ? 'text-green-600' : 'text-orange-600'">{{ entry.meta.pass ? '✓ 通过' : '✗ 未通过' }}</span>
                  <span v-if="entry.meta.severity" :class="entry.meta.severity === 'critical' ? 'text-red-600' : 'text-orange-500'">{{ entry.meta.severity }}</span>
                  <span v-if="entry.meta.revised" class="text-editorial-text-muted">已修订</span>
                </div>
                <div v-for="(issue, i) in (entry.meta.issues as string[])" :key="i" class="text-editorial-text-body">· {{ issue }}</div>
              </div>
            </template>

            <!-- Step11: 原创风险 -->
            <template v-else-if="entry.step === 11 && (entry.meta?.llm_risk_points || entry.meta?.overall_risk)">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1 text-[11px] space-y-0.5">
                <div class="flex items-center gap-2">
                  <span :class="riskColor(String(entry.meta.overall_risk))">风险 {{ entry.meta.overall_risk }}</span>
                  <span class="text-editorial-text-muted">规则 {{ entry.meta.rule_based_risk ?? '-' }} · LLM {{ entry.meta.llm_risk ?? '-' }}</span>
                  <span v-if="entry.meta.high_risk_segments_count" class="text-editorial-text-muted">高风险片段 {{ entry.meta.high_risk_segments_count }}</span>
                </div>
                <div v-for="(pt, i) in ((entry.meta.llm_risk_points as string[]) ?? [])" :key="i" class="text-orange-700">⚠ {{ pt }}</div>
              </div>
            </template>

            <!-- Step14: 引用来源（P0） -->
            <template v-else-if="entry.step === 14 && entry.meta?.references">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1 space-y-0.5">
                <div class="text-[10px] text-editorial-text-muted">引用来源 · {{ (entry.meta.references as any[]).length }} 条</div>
                <div v-for="(ref, i) in (entry.meta.references as Array<{url?: string; name?: string; type?: string}>)" :key="i" class="flex items-start gap-1 text-[11px]">
                  <span class="shrink-0 rounded px-1 text-[9px] font-medium" :class="resultTypeStyle(ref.type)">{{ resultTypeLabel(ref.type) }}</span>
                  <a v-if="ref.url" :href="ref.url" target="_blank" class="truncate text-editorial-link-active hover:underline" :title="ref.name">{{ ref.name || ref.url }}</a>
                  <span v-else class="truncate text-editorial-text-body">{{ ref.name || '-' }}</span>
                </div>
              </div>
            </template>

            <!-- 兜底: 通用 meta 平铺 -->
            <template v-else-if="formatMeta(entry.meta).length > 0">
              <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1">
                <div v-for="row in formatMeta(entry.meta)" :key="row.key" class="flex gap-2 text-[11px] leading-5">
                  <span class="shrink-0 text-editorial-text-muted">{{ row.key }}</span>
                  <span class="break-all text-editorial-text-body">{{ row.value }}</span>
                </div>
              </div>
            </template>

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
