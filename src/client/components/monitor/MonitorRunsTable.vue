<script setup lang="ts">
import { ref, onMounted } from "vue";
import { fetchRunsWithSteps, type PipelineRun, type StepLog } from "../../services/monitorApi.js";

const runs = ref<PipelineRun[]>([]);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const selectedDate = ref<string>("");
const offset = ref(0);
const PAGE_SIZE = 20;

// 展开的运行 ID 集合
const expandedRunIds = ref<Set<number>>(new Set());

async function load(append = false): Promise<void> {
  loading.value = true;
  try {
    const params: { limit: number; offset: number; date?: string } = {
      limit: PAGE_SIZE,
      offset: append ? offset.value : 0,
    };
    if (selectedDate.value) params.date = selectedDate.value;
    const res = await fetchRunsWithSteps(params);
    if (append) {
      runs.value = [...runs.value, ...res.runs];
    } else {
      runs.value = res.runs;
      offset.value = 0;
    }
    total.value = res.total;
    hasMore.value = res.has_more;
    offset.value += res.runs.length;
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

function toggleRun(id: number): void {
  const next = new Set(expandedRunIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  expandedRunIds.value = next;
}

function loadMore(): void {
  load(true);
}

function onDateChange(): void {
  load();
}

// 步骤耗时
function stepDuration(started: string, finished: string | null): string {
  if (!finished) return "-";
  const ms = new Date(finished + "Z").getTime() - new Date(started + "Z").getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

function runDuration(run: PipelineRun): string {
  return stepDuration(run.started_at, run.finished_at);
}

// 解析 detail JSON
function parseDetail(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(obj, null, 2);
  } catch {
    return raw;
  }
}

const statusColorMap: Record<string, string> = {
  done: "green",
  error: "red",
  running: "blue",
  skipped: "default",
};

onMounted(() => load());
</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">流水线运行记录</h3>
      <div class="flex items-center gap-2">
        <a-date-picker
          v-model:value="selectedDate"
          size="small"
          class="!w-[140px]"
          placeholder="选择日期"
          value-format="YYYY-MM-DD"
          @change="onDateChange"
        />
        <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="load()">刷新</a-button>
      </div>
    </div>

    <div class="text-xs text-editorial-text-muted mb-2">共 {{ total }} 条</div>

    <div class="space-y-2">
      <div
        v-for="run in runs"
        :key="run.id"
        class="rounded border border-editorial-border"
      >
        <!-- 运行摘要行 -->
        <button class="flex w-full items-center gap-3 px-3 py-2 text-left" @click="toggleRun(run.id)">
          <span class="text-xs font-medium text-editorial-text-muted">#{{ run.id }}</span>
          <a-tag :color="statusColorMap[run.status] ?? 'default'" class="!m-0 !text-[11px] !py-0">{{ run.status }}</a-tag>
          <span class="text-xs text-editorial-text-body">{{ run.started_at }}</span>
          <span class="text-xs text-editorial-text-muted">{{ runDuration(run) }}</span>
          <span v-if="run.error" class="flex-1 truncate text-xs text-red-500">{{ run.error }}</span>
          <span v-else class="flex-1" />
          <span class="text-[11px] text-editorial-text-muted">{{ expandedRunIds.has(run.id) ? "▲" : "▼" }}</span>
        </button>

        <!-- 展开的步骤详情 -->
        <div v-if="expandedRunIds.has(run.id) && run.steps" class="border-t border-editorial-border px-3 py-2">
          <div class="space-y-1">
            <div v-for="step in run.steps" :key="step.id" class="flex items-start gap-3 py-1">
              <span class="shrink-0 text-[11px] font-bold text-editorial-text-muted w-6 text-right">{{ step.step_order }}</span>
              <span class="shrink-0 text-xs text-editorial-text-body w-20">{{ step.step_name }}</span>
              <a-tag :color="statusColorMap[step.status] ?? 'default'" class="!m-0 !text-[11px] !py-0 shrink-0">{{ step.status }}</a-tag>
              <span class="shrink-0 text-[11px] text-editorial-text-muted w-12">{{ stepDuration(step.started_at, step.finished_at) }}</span>
              <div v-if="step.detail" class="min-w-0 flex-1">
                <details>
                  <summary class="cursor-pointer text-[11px] text-editorial-link-active">详情</summary>
                  <pre class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-editorial-text-muted">{{ parseDetail(step.detail) }}</pre>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载更多 -->
    <div v-if="hasMore" class="mt-3 text-center">
      <a-button size="small" :loading="loading" @click="loadMore">加载更多</a-button>
    </div>
  </section>
</template>
