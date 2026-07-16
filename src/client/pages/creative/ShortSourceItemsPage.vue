<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import { message } from "ant-design-vue";

import { HttpError } from "../../services/http.js";
import { usePipelineStatus } from "../../composables/usePipelineStatus.js";
import { useSearchHistory } from "../../composables/useSearchHistory.js";
import ArticleDetailDrawer from "../../components/creative/ArticleDetailDrawer.vue";

import {
  readCreativeSourceItems,
  readCreativeSourceItem,
  readCreativeFinishedArticle,
  updateSourceItemWritingStatus,
  writeSourceItemArticle,
  submitManualWrite,
  traceSourceItem,
  type CreativeSourceItem,
  type CreativeFinishedArticle,
  type TrendBreakdown,
  type TracedSource
} from "../../services/creativeApi.js";

// ─── 状态 ───

const isLoading = ref(false);
const items = ref<CreativeSourceItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(50);

// 筛选条件缓存 key
const SOURCE_FILTERS_KEY = "creative-short-source-filters";

// 筛选条件（从 localStorage 恢复）
const saved = (() => {
  try {
    const raw = localStorage.getItem(SOURCE_FILTERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
})();
const writingStatusFilter = ref<string | undefined>(saved.writingStatus || undefined);
const sourceNameFilter = ref(saved.sourceName || "");
const writableOnly = ref(false);
const searchText = ref(saved.search || "");
// 爆文分下限：短内容线默认不按反转分过滤（多数素材尚未评分），用户主动设置才生效
const minTrendScore = ref<number | null>(
  "minTrendScore" in saved ? (saved.minTrendScore ?? null) : null
);

// 搜索历史
const { history: searchHistory, addToHistory, removeFromHistory } = useSearchHistory("creative-short-source-search-history");
const { pipelineOn } = usePipelineStatus();
const searchDropdownRef = ref<HTMLElement | null>(null);
const showSearchDropdown = ref(false);

// 点击下拉区域外关闭
function onDocClick(e: MouseEvent): void {
  if (searchDropdownRef.value && !searchDropdownRef.value.contains(e.target as Node)) {
    showSearchDropdown.value = false;
  }
}
onMounted(() => document.addEventListener("click", onDocClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));

// 筛选条件变更时持久化
function saveSourceFilters(): void {
  try {
    localStorage.setItem(SOURCE_FILTERS_KEY, JSON.stringify({
      writingStatus: writingStatusFilter.value || "",
      sourceName: sourceNameFilter.value || "",
      search: searchText.value,
      minTrendScore: minTrendScore.value
    }));
  } catch { /* quota 超限等忽略 */ }
}

// 操作锁
const actionPendingId = ref<number | null>(null);

// 手动控制展开行
const expandedRowKeys = ref<number[]>([]);

// 成品文章详情弹窗
const detailArticle = ref<CreativeFinishedArticle | null>(null);

const writingStatusOptions = [
  { label: "全部", value: "" },
  { label: "待写作", value: "ready" },
  { label: "不写作", value: "excluded" },
  { label: "写作中", value: "writing" },
  { label: "已写作", value: "done" },
  { label: "跳过不写", value: "skipped" }
];

// ─── 数据加载 ───

async function loadItems(): Promise<void> {
  isLoading.value = true;
  try {
    const res = await readCreativeSourceItems({
      direction: "short_content",
      page: currentPage.value,
      pageSize: pageSize.value,
      writingStatus: writingStatusFilter.value || undefined,
      sourceName: sourceNameFilter.value.trim() || undefined,
      writable: writableOnly.value || undefined,
      search: searchText.value || undefined,
      minTrendScore: minTrendScore.value ?? undefined
    });
    items.value = res.items;
    total.value = res.total;
    // 页面切回时自动恢复处于 writing 状态的轮询
    const writingItems = res.items.filter(i => i.writingStatus === "writing" && !writingIds.value.has(i.id));
    if (writingItems.length > 0) {
      setWritingIds(new Set([...writingIds.value, ...writingItems.map(wi => wi.id)]));
      for (const wi of writingItems) startWritingPoll(wi);
    }
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void loadItems();
});

watch(writingStatusFilter, () => {
  currentPage.value = 1;
  saveSourceFilters();
  void loadItems();
});

watch(writableOnly, () => {
  currentPage.value = 1;
  void loadItems();
});

// 爆文分筛选：输入时不触发，仅在回车或点击搜索图标时应用，与搜索来源/标题交互一致
function applyTrendScoreFilter(): void {
  currentPage.value = 1;
  saveSourceFilters();
  void loadItems();
}

function handleSearch(value: string): void {
  searchText.value = value;
  currentPage.value = 1;
  saveSourceFilters();
  if (value.trim()) addToHistory(value.trim());
  showSearchDropdown.value = false;
  void loadItems();
}

function handleTableChange(pagination: { current?: number; pageSize?: number }): void {
  if (pagination.current) currentPage.value = pagination.current;
  if (pagination.pageSize) pageSize.value = pagination.pageSize;
  void loadItems();
}

// ─── 展开控制 ───

function toggleExpand(id: number): void {
  // 锚定被点击行：记录其视口纵坐标，展开/折叠后拉回原位。
  // 这样长内容展开/折叠导致页面高度变化时，用户正在看的那行不会跑偏，无需重新找位置。
  const rowEl = document.querySelector(`tr.ant-table-row[data-row-key="${id}"]`) as HTMLElement | null;
  const anchorTop = rowEl?.getBoundingClientRect().top ?? null;

  const idx = expandedRowKeys.value.indexOf(id);
  if (idx >= 0) {
    expandedRowKeys.value.splice(idx, 1);
  } else {
    expandedRowKeys.value.push(id);
  }

  if (anchorTop != null && rowEl) {
    nextTick(() => {
      // 父行 TR 在折叠后仍然存在（只移除了展开子行），测量新坐标并补偿滚动差值
      const delta = rowEl.getBoundingClientRect().top - anchorTop;
      if (delta !== 0) window.scrollBy(0, delta);
    });
  }
}

// ─── 成品文章弹窗 ───

async function openArticleModal(articleId: number): Promise<void> {
  try {
    const article = await readCreativeFinishedArticle(articleId);
    detailArticle.value = article;
  } catch {
    message.error("加载文章详情失败");
  }
}

function closeDetailDrawer(): void {
  detailArticle.value = null;
}

// ─── 质量状态操作 ───

async function handleWritingAction(
  item: CreativeSourceItem,
  nextStatus: "ready" | "writing" | "done" | "skipped"
): Promise<void> {
  actionPendingId.value = item.id;
  try {
    await updateSourceItemWritingStatus(item.id, nextStatus);
    item.writingStatus = nextStatus;
  } finally {
    actionPendingId.value = null;
  }
}

// ─── 格式化辅助 ───

const breakdownLabels: Record<keyof TrendBreakdown, string> = {
  topicPower: "话题",
  emotionResonance: "情绪",
  infoGap: "信息差",
  socialCurrency: "社交",
  timingWindow: "时效",
  audienceBreadth: "受众"
};

function formatBreakdown(b: TrendBreakdown): string {
  return (Object.entries(b) as [keyof TrendBreakdown, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([key, val]) => `${breakdownLabels[key]}${val}`)
    .join(" | ");
}

// 爆文维度柱状图配色
const breakdownColors: Record<keyof TrendBreakdown, string> = {
  topicPower: "#3b82f6",
  emotionResonance: "#ef4444",
  infoGap: "#f59e0b",
  socialCurrency: "#10b981",
  timingWindow: "#8b5cf6",
  audienceBreadth: "#6366f1"
};

// 固定维度顺序，柱状图每段颜色位置一致便于横向对比
const breakdownDimensionOrder: Array<keyof TrendBreakdown> = [
  "topicPower", "infoGap", "emotionResonance", "socialCurrency", "timingWindow", "audienceBreadth"
];

function getBreakdownBars(b: TrendBreakdown): Array<{ label: string; value: number; color: string; width: string }> {
  const total = Object.values(b).reduce((s, v) => s + v, 0);
  if (total === 0) return [];
  return breakdownDimensionOrder
    .filter(key => (b[key] ?? 0) > 0)
    .map(key => {
      const val = b[key];
      return {
        label: `${breakdownLabels[key]}${val}`,
        value: val,
        color: breakdownColors[key],
        width: `${Math.round((val / total) * 100)}%`
      };
    });
}

function formatPublishedAt(value: string | null): string {
  if (!value) return "-";
  // SQLite CURRENT_TIMESTAMP 输出 UTC 但不带后缀，补 Z 让 JS 正确解析
  const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(fixed);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function writingStatusColor(status: string): string {
  switch (status) {
    case "ready":
      return "blue";
    case "excluded":
      return "default";
    case "writing":
      return "orange";
    case "done":
      return "green";
    case "skipped":
      return "default";
    default:
      return "blue";
  }
}

function writingStatusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "待写作";
    case "excluded":
      return "不写作";
    case "writing":
      return "写作中";
    case "done":
      return "已写作";
    case "skipped":
      return "跳过不写";
    default:
      return status;
  }
}

// ─── 素材库写文章（支持多篇并行） ───
const writingIds = ref<Set<number>>(new Set());

// Vue 3 ref<Set> 的 delete 不自动触发响应式，需要替换整个 Set
function removeWritingId(id: number): void {
  writingIds.value = new Set([...writingIds.value].filter(i => i !== id));
}
function addWritingId(id: number): void {
  writingIds.value = new Set([...writingIds.value, id]);
}
function setWritingIds(ids: Set<number>): void {
  writingIds.value = ids;
}
const writeModeVisible = ref(false);
const writeModeTarget = ref<CreativeSourceItem | null>(null);
const writeModeValue = ref<string | null>(null);
const writeModeThesis = ref("");
const writeModeConfirming = ref(false);

const writeModeOptions = [
  { value: null, label: "自动判断（LLM 选择最合适的模式）" },
  { value: "A", label: "短篇观点文（A）— 600~1500 字" },
  { value: "B", label: "短篇随笔（B）— 600~1500 字" },
  { value: "C", label: "长篇观点文（C）— 3000~6000 字" },
];

// ─── 手动写作弹窗 ───
const manualWriteVisible = ref(false);
const manualWriteSubmitting = ref(false);
const manualContentType = ref<"viewpoint" | "article">("viewpoint");
const manualTitle = ref("");
const manualContent = ref("");
const manualMode = ref<string | null>(null);
const manualThesis = ref("");

const contentTypeOptions = [
  { value: "viewpoint" as const, label: "观点/想法", desc: "简短观点，几句话到一段话" },
  { value: "article" as const, label: "素材/文章", desc: "较长的原文或素材内容" },
];

function openManualWriteModal(): void {
  manualContentType.value = "viewpoint";
  manualTitle.value = "";
  manualContent.value = "";
  manualMode.value = null;
  manualThesis.value = "";
  manualWriteVisible.value = true;
}

async function confirmManualWrite(): Promise<void> {
  if (!manualContent.value.trim()) {
    message.warning("请输入内容");
    return;
  }
  manualWriteSubmitting.value = true;
  try {
    const result = await submitManualWrite({
      title: manualTitle.value.trim() || undefined,
      content: manualContent.value.trim(),
      contentType: manualContentType.value,
      mode: (manualMode.value as "A" | "B" | "C") ?? undefined,
      thesis: manualThesis.value.trim() || undefined,
    });
    if (result.ok && result.sourceItemId) {
      message.success(`已提交写作（素材#${result.sourceItemId}）`);
      manualWriteVisible.value = false;
      loadItems();
    } else {
      message.error(result.reason ?? "提交失败");
    }
  } catch {
    message.error("提交写作请求失败");
  } finally {
    manualWriteSubmitting.value = false;
  }
}

// ─── 素材溯源 ───
const tracingIds = ref<Set<number>>(new Set());
// 溯源轮询定时器
let tracePollTimer: ReturnType<typeof setInterval> | null = null;
const tracePollItems = new Map<number, number>(); // itemId -> startTime

async function handleTrace(item: CreativeSourceItem): Promise<void> {
  tracingIds.value = new Set([...tracingIds.value, item.id]);
  try {
    const result = await traceSourceItem(item.id);
    if (result.ok) {
      message.info("溯源已提交，正在搜索原始来源…");
      // 加入轮询队列，10 秒后开始检查结果
      tracePollItems.set(item.id, Date.now());
      startTracePoll();
    } else {
      message.error(result.reason ?? "溯源失败");
      tracingIds.value = new Set([...tracingIds.value].filter(id => id !== item.id));
    }
  } catch {
    message.error("溯源请求失败");
    tracingIds.value = new Set([...tracingIds.value].filter(id => id !== item.id));
  }
}

/** 轮询溯源结果，每 10 秒检查一次，90 秒超时 */
function startTracePoll(): void {
  if (tracePollTimer) return;
  tracePollTimer = setInterval(async () => {
    if (tracePollItems.size === 0) { stopTracePoll(); return; }
    const now = Date.now();
    const entries = [...tracePollItems.entries()];
    for (const [itemId, startTime] of entries) {
      if (now - startTime > 90_000) {
        tracePollItems.delete(itemId);
        tracingIds.value = new Set([...tracingIds.value].filter(id => id !== itemId));
        message.info(`素材#${itemId} 溯源超时，请稍后手动刷新查看`);
        continue;
      }
      try {
        const updated = await readCreativeSourceItem(itemId);
        if (updated.tracedSources !== null) {
          tracePollItems.delete(itemId);
          tracingIds.value = new Set([...tracingIds.value].filter(id => id !== itemId));
          const local = items.value.find(i => i.id === itemId);
          if (local) local.tracedSources = updated.tracedSources;
          if (updated.tracedSources.length > 0) {
            message.success(`素材#${itemId} 溯源完成，找到 ${updated.tracedSources.length} 条原始来源`);
          } else {
            message.info(`素材#${itemId} 溯源完成，未找到可靠原始来源`);
          }
        }
      } catch { /* 单次轮询失败不中断 */ }
    }
    if (tracePollItems.size === 0) stopTracePoll();
  }, 10_000);
}

function stopTracePoll(): void {
  if (tracePollTimer) { clearInterval(tracePollTimer); tracePollTimer = null; }
}

function openWriteModeModal(item: CreativeSourceItem): void {
  writeModeTarget.value = item;
  writeModeValue.value = null;
  writeModeThesis.value = "";
  writeModeVisible.value = true;
}

function cancelWriteMode(): void {
  writeModeVisible.value = false;
  writeModeTarget.value = null;
  writeModeConfirming.value = false;
  writeModeThesis.value = "";
}

// 写作状态轮询：10 秒间隔，10 分钟超时
let writingPollTimer: ReturnType<typeof setInterval> | null = null;
const writingTimers = new Map<number, number>(); // itemId -> startTime

function startWritingPoll(item: CreativeSourceItem): void {
  writingTimers.set(item.id, Date.now());
  if (writingPollTimer) return; // 已有全局轮询在跑
  const TIMEOUT_MS = 10 * 60 * 1000;

  writingPollTimer = setInterval(async () => {
    if (writingTimers.size === 0) { stopWritingPoll(); return; }
    const now = Date.now();
    const checkIds = [...writingTimers.entries()];
    for (const [itemId, startTime] of checkIds) {
      if (now - startTime > TIMEOUT_MS) {
        writingTimers.delete(itemId);
        removeWritingId(itemId);
        message.info(`素材#${itemId} 写作超时（>10分钟），请稍后查看成品列表`);
        continue;
      }
      try {
        const updated = await readCreativeSourceItem(itemId);
        if (updated.writingStatus === "done") {
          writingTimers.delete(itemId);
          removeWritingId(itemId);
          message.success(`素材#${itemId} 文章写作完成`);
          loadItems();
        } else if (updated.writingStatus === "failed") {
          writingTimers.delete(itemId);
          removeWritingId(itemId);
          message.error(`素材#${itemId} 写作失败，请重试`);
        }
      } catch {
        // 单次轮询失败不中断
      }
    }
    // 全部完成则停止轮询
    if (writingTimers.size === 0) stopWritingPoll();
  }, 10_000);
}

function stopWritingPoll(): void {
  if (writingPollTimer) {
    clearInterval(writingPollTimer);
    writingPollTimer = null;
  }
}

onBeforeUnmount(() => { stopWritingPoll(); stopTracePoll(); });

async function confirmWriteMode(): Promise<void> {
  const item = writeModeTarget.value;
  if (!item) return;
  writeModeConfirming.value = true;
  try {
    const result = await writeSourceItemArticle(item.id, writeModeValue.value ?? undefined, writeModeThesis.value.trim() || undefined);
    if (result.ok) {
      writeModeVisible.value = false;
      addWritingId(item.id);
      // 更新本地状态为 writing
      const local = items.value.find(i => i.id === item.id);
      if (local) local.writingStatus = "writing";
      startWritingPoll(item);
    } else {
      message.error(result.reason ?? "文章生成失败");
    }
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      const detail = (err.body as { error?: string })?.error ?? "该素材正在写作中";
      message.warning(detail);
      writeModeVisible.value = false;
    } else {
      message.error("写文章请求失败");
    }
  } finally {
    writeModeConfirming.value = false;
  }
}

// ─── 表格列 ───

function copyId(id: number): void {
  navigator.clipboard.writeText(`【素材id: ${id}】`).then(() => {
    message.success("已复制");
  });
}

// ─── 文本截断时才显示 tooltip ───
// 标题/来源等 line-clamp-2 单元格：鼠标进入时检测 scrollHeight 是否超出 clientHeight，
// 仅当实际溢出截断时才延迟 300ms 弹 tooltip，避免短文本也弹出无意义的悬浮提示。
// 两列共用一份状态，以 `${col}-${id}` 作为 key 区分。
const overflowHover = ref<{ key: string } | null>(null);
let overflowHoverTimer: ReturnType<typeof setTimeout> | null = null;

function onOverflowCellEnter(key: string, e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement;
  // +1 像素容差，规避亚像素渲染导致 scrollHeight 略大于 clientHeight 的误判
  const isOverflowing = el.scrollHeight > el.clientHeight + 1;
  if (overflowHoverTimer) clearTimeout(overflowHoverTimer);
  if (!isOverflowing) return; // 未截断：不弹 tooltip
  overflowHoverTimer = setTimeout(() => {
    overflowHover.value = { key };
  }, 300);
}

function onOverflowCellLeave(key: string): void {
  if (overflowHoverTimer) { clearTimeout(overflowHoverTimer); overflowHoverTimer = null; }
  if (overflowHover.value?.key === key) overflowHover.value = null;
}

const columns = [
  { title: "ID", dataIndex: "id", key: "id", width: 40, fixed: "left" as const },
  { title: "标题", dataIndex: "title", key: "title", width: 300 },
  { title: "来源", dataIndex: "sourceName", key: "sourceName", width: 115 },
  { title: "状态", dataIndex: "writingStatus", key: "writingStatus", width: 72, ellipsis: true },
  { title: "评分", key: "score", width: 90 },
  { title: "Agent", dataIndex: "collectorAgent", key: "collectorAgent", width: 44, align: "center" as const, ellipsis: true },
  { title: "耗时/时间", key: "timeInfo", width: 84 },
  { title: "写文章", key: "quickCopy", width: 64, ellipsis: true, fixed: "right" as const }
];

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  showTotal: (tot: number) => `共 ${tot} 条`
}));
</script>

<template>
  <div class="flex w-full flex-col gap-2" data-page="creative-source-items">
    <!-- 筛选栏 -->
    <div class="flex flex-wrap items-center gap-3">
      <a-select
        v-model:value="writingStatusFilter"
        :options="writingStatusOptions"
        placeholder="写作状态"
        class="!w-[140px]"
      />
      <a-input-search
        v-model:value="sourceNameFilter"
        placeholder="搜索来源"
        class="!w-[160px]"
        allow-clear
        @search="() => { currentPage = 1; saveSourceFilters(); void loadItems(); }"
        @change="(val: string) => { if (!val) { currentPage = 1; saveSourceFilters(); void loadItems(); } }"
      />
      <a-checkbox v-model:checked="writableOnly">只看可写</a-checkbox>
      <div class="flex items-center gap-1.5">
        <span class="whitespace-nowrap text-xs text-editorial-text-muted">爆文分≥</span>
        <a-input-number
          v-model:value="minTrendScore"
          :min="0"
          :max="100"
          :step="1"
          :precision="0"
          placeholder="不限"
          class="!w-[96px]"
          @press-enter="applyTrendScoreFilter"
        />
        <a-button type="primary" size="small" @click="applyTrendScoreFilter">搜索</a-button>
      </div>
      <div ref="searchDropdownRef" class="relative">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索标题"
          class="!w-[280px]"
          allow-clear
          @search="handleSearch"
          @change="(val: string) => { if (!val) handleSearch(''); }"
          @focus="showSearchDropdown = searchHistory.length > 0"
        />
        <div
          v-if="showSearchDropdown && searchHistory.length > 0"
          class="absolute left-0 top-full z-50 mt-1 min-w-[280px] rounded-md border border-editorial-border bg-white shadow-lg"
        >
          <div
            v-for="item in searchHistory"
            :key="item"
            class="group flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
            @click="handleSearch(item)"
          >
            <span class="truncate text-editorial-text-body">{{ item }}</span>
            <span
              class="ml-2 flex-shrink-0 text-xs text-editorial-text-muted opacity-0 hover:text-red-500 group-hover:opacity-100"
              @click.stop="removeFromHistory(item)"
            >✕</span>
          </div>
        </div>
      </div>
      <a-button type="primary" size="small" @click="openManualWriteModal">
        <span class="mr-1">✏️</span>自定义写作
      </a-button>
    </div>

    <!-- 表格 -->
    <a-spin :spinning="isLoading">
      <a-table
        :columns="columns"
        :data-source="items"
        :pagination="pagination"
        :scroll="{ x: 1200 }"
        :expanded-row-keys="expandedRowKeys"
        row-key="id"
        data-source-item-table
        size="small"
        @change="handleTableChange"
        @expand="(expanded: boolean, record: CreativeSourceItem) => toggleExpand(record.id)"
      >
        <!-- 标题列：点击展开/折叠 -->
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'id'">
            <span class="cursor-pointer text-editorial-link-active hover:underline" @click="copyId(record.id)"> {{ record.id }} </span>
          </template>
          <template v-if="column.key === 'title'">
            <div class="flex items-center gap-2 min-w-0">
              <a-tooltip
                :open="overflowHover?.key === 'title-' + record.id"
                :title="record.title"
                placement="topLeft"
              >
                <span
                  class="line-clamp-2 cursor-pointer text-[13px] leading-tight font-medium text-editorial-text-main hover:text-editorial-link-active"
                  @click="toggleExpand(record.id)"
                  @mouseenter="onOverflowCellEnter('title-' + record.id, $event)"
                  @mouseleave="onOverflowCellLeave('title-' + record.id)"
                >
                  {{ record.title }}
                </span>
              </a-tooltip>
            </div>
            <div v-if="record.linkedArticleId != null" class="mt-0.5 flex flex-wrap items-center gap-1 leading-none">
              <a
                class="inline-flex cursor-pointer items-center gap-1 rounded-editorial-pill bg-editorial-link-active/30 px-1.5 py-0 text-[10px] font-semibold text-editorial-link-active hover:bg-editorial-link-active/50"
                @click.prevent="openArticleModal(record.linkedArticleId!)"
              >
                成品 #{{ record.linkedArticleId }}
              </a>
              <span
                v-if="(record as any).linkedArticlePublished"
                class="inline-flex items-center rounded-editorial-pill bg-green-100 px-1.5 py-0 text-[10px] leading-none text-green-700"
              >已发布</span>
            </div>
          </template>

          <!-- 来源列 -->
          <template v-else-if="column.key === 'sourceName'">
            <a-tooltip
              :open="overflowHover?.key === 'sourceName-' + record.id"
              :title="(record.sourceName || '').replace('微信公众号', 'WX')"
              placement="topLeft"
            >
              <span
                class="line-clamp-3 text-[10px] leading-tight text-editorial-text-body"
                @mouseenter="onOverflowCellEnter('sourceName-' + record.id, $event)"
                @mouseleave="onOverflowCellLeave('sourceName-' + record.id)"
              >{{ (record.sourceName || "-").replace("微信公众号", "WX") }}</span>
            </a-tooltip>
          </template>

          <!-- 评分列：评分 + 爆文分 + 爆文维度柱状图 三行紧凑展示 -->
          <template v-else-if="column.key === 'score'">
            <div class="flex flex-col gap-0.5 leading-tight">
              <div class="flex items-center gap-1">
                <span
                  v-if="record.score != null"
                  class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-link-active px-1.5 py-0 text-[10px] font-semibold text-editorial-text-main"
                >{{ record.score }}</span>
                <span
                  v-if="record.trendScore != null"
                  class="inline-flex items-center rounded-editorial-pill border px-1.5 py-0 text-[10px] font-bold"
                  :class="record.trendScore >= 90 ? 'border-purple-600 bg-purple-600 text-white shadow-sm' : record.trendScore >= 80 ? 'border-red-500 bg-red-500 text-white shadow-sm' : 'border-orange-300 bg-orange-50 text-orange-700'"
                >{{ record.trendScore }}</span>
              </div>
              <a-tooltip v-if="record.trendBreakdown && getBreakdownBars(record.trendBreakdown).length > 0" :mouse-enter-delay="0.3">
                <template #title>
                  <div class="text-xs leading-5">{{ formatBreakdown(record.trendBreakdown) }}</div>
                </template>
                <div class="flex h-2.5 w-full min-w-[80px] overflow-hidden rounded-sm">
                  <div
                    v-for="(bar, idx) in getBreakdownBars(record.trendBreakdown)"
                    :key="idx"
                    :style="{ width: bar.width, backgroundColor: bar.color }"
                    :title="bar.label"
                  />
                </div>
              </a-tooltip>
            </div>
          </template>

          <!-- Agent 列 -->
          <template v-else-if="column.key === 'collectorAgent'">
            <a-tooltip :mouse-enter-delay="0.3" :title="record.collectorAgent">
              <span class="inline-flex items-center gap-1 text-xs text-editorial-text-body">
                <template v-if="record.collectorAgent === 'manual'">👤</template>
                <template v-else>🤖</template>
                <span class="sr-only">{{ record.collectorAgent }}</span>
              </span>
            </a-tooltip>
          </template>

          <!-- 耗时/时间列：发布时间 + 成品创建时间 两行紧凑展示 -->
          <template v-else-if="column.key === 'timeInfo'">
            <div class="flex flex-col gap-0 leading-tight">
              <span class="text-[10px] text-editorial-text-muted">发 {{ formatPublishedAt(record.publishedAt) }}</span>
              <span class="text-[10px] text-editorial-text-muted">建 {{ record.linkedArticleCreatedAt ? formatPublishedAt(record.linkedArticleCreatedAt) : '-' }}</span>
            </div>
          </template>

          <!-- 写作状态列 -->
          <template v-else-if="column.key === 'writingStatus'">
            <div class="flex flex-col items-start gap-0.5 leading-tight">
              <a-tag :color="writingStatusColor(record.writingStatus)">
                {{ writingStatusLabel(record.writingStatus) }}
              </a-tag>
              <a-tag v-if="record.writeCount > 0" color="green" class="!m-0 !text-[11px] !py-0">{{ record.writeCount }}次</a-tag>
            </div>
          </template>

          <!-- 写文章列 -->
          <template v-else-if="column.key === 'quickCopy'">
            <a-tooltip v-if="!pipelineOn" title="管线已紧急制动，请先恢复管线">
              <a-button type="link" size="small" class="!p-0 !text-[11px]" disabled>写文章</a-button>
            </a-tooltip>
            <a-button
              v-else
              type="link"
              size="small"
              class="!p-0 !text-[11px]"
              :disabled="writingIds.has(record.id)"
              @click="openWriteModeModal(record)"
            >{{ writingIds.has(record.id) ? '写作中...' : '写文章' }}</a-button>
          </template>
        </template>

        <!-- 展开行 -->
        <template #expandedRowRender="{ record }">
          <div class="flex flex-col gap-4 rounded-editorial-md border border-editorial-border bg-editorial-panel/60 p-4">
            <!-- 摘要 -->
            <div v-if="record.summary">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">摘要 <span class="font-normal opacity-70">{{ record.summary.length }} 字</span></p>
              <div class="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-editorial-md bg-editorial-page p-3 text-sm leading-6 text-editorial-text-body">
                {{ record.summary }}
              </div>
            </div>

            <!-- 原文内容 -->
            <div>
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">原文内容 <span v-if="record.fullContent" class="font-normal opacity-70">{{ record.fullContent.length }} 字</span></p>
              <div
                v-if="record.fullContent"
                class="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-editorial-md bg-editorial-page p-3 text-sm leading-6 text-editorial-text-body"
              >
                {{ record.fullContent }}
              </div>
              <p v-else class="m-0 text-sm italic text-editorial-text-muted">采集未提供原文</p>
            </div>

            <!-- 元信息 -->
            <a-descriptions :column="{ xs: 1, sm: 2, md: 3 }" size="small" bordered>
              <a-descriptions-item label="原文链接">
                <a
                  v-if="record.url"
                  :href="record.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-editorial-text-main underline"
                >
                  {{ record.url.length > 60 ? record.url.slice(0, 60) + "..." : record.url }}
                </a>
                <span v-else class="text-editorial-text-muted">无</span>
              </a-descriptions-item>
              <a-descriptions-item label="作者">
                {{ record.author || "-" }}
              </a-descriptions-item>
              <a-descriptions-item label="字数">
                {{ record.wordCount ?? "-" }}
              </a-descriptions-item>
              <a-descriptions-item label="语言">
                {{ record.language }}
              </a-descriptions-item>
              <a-descriptions-item label="标签">
                <template v-if="record.tags">
                  <a-tag v-for="tag in record.tags.split(',').map((t: string) => t.trim()).filter(Boolean)" :key="tag" size="small">
                    {{ tag }}
                  </a-tag>
                </template>
                <span v-else class="text-editorial-text-muted">-</span>
              </a-descriptions-item>
            </a-descriptions>

            <!-- 溯源：搜索原始来源 -->
            <div class="border-t border-editorial-border pt-3">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">素材溯源</span>
                <a-button
                  size="small"
                  :loading="tracingIds.has(record.id)"
                  @click="handleTrace(record)"
                >
                  {{ record.tracedSources ? '重新溯源' : '🔍 溯源' }}
                </a-button>
              </div>
              <!-- 已有溯源结果 -->
              <div v-if="record.tracedSources && record.tracedSources.length > 0" class="space-y-1.5">
                <div
                  v-for="(src, idx) in record.tracedSources"
                  :key="idx"
                  class="flex items-start gap-2 rounded border border-editorial-border bg-editorial-page px-3 py-2"
                >
                  <span class="shrink-0 text-[10px] font-bold text-editorial-text-muted">{{ idx + 1 }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <a :href="src.url" target="_blank" rel="noopener noreferrer" class="truncate text-[12px] font-medium text-editorial-link-active hover:underline">{{ src.title }}</a>
                      <span v-if="src.relevance_score" class="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">{{ Math.round(src.relevance_score * 100) }}%</span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-2 text-[10px] text-editorial-text-muted">
                      <span>{{ src.source_name }}</span>
                      <span v-if="src.published_at">{{ src.published_at }}</span>
                    </div>
                    <p v-if="src.reason" class="m-0 mt-0.5 text-[10px] text-editorial-text-muted/70">{{ src.reason }}</p>
                  </div>
                </div>
              </div>
              <!-- 溯源进行中 -->
              <div v-else-if="tracingIds.has(record.id)" class="flex items-center gap-2 py-2">
                <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                <span class="text-[11px] text-blue-500">正在搜索原始来源…预计 30~60 秒</span>
              </div>
              <p v-else-if="record.tracedSources && record.tracedSources.length === 0" class="text-[11px] italic text-editorial-text-muted">已溯源，未找到可靠原始来源</p>
              <p v-else class="text-[11px] text-editorial-text-muted/50">点击「溯源」搜索该素材的原始官方来源</p>
            </div>

            <!-- 写作状态操作 -->
            <div class="flex items-center gap-3 border-t border-editorial-border pt-3">
              <span class="text-xs font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">写作状态：</span>
              <a-button
                size="small"
                type="primary"
                :disabled="record.writingStatus === 'done' || actionPendingId === record.id"
                :loading="actionPendingId === record.id"
                @click="handleWritingAction(record, 'done')"
              >
                标记完成
              </a-button>
              <a-button
                size="small"
                danger
                :disabled="record.writingStatus === 'skipped' || actionPendingId === record.id"
                :loading="actionPendingId === record.id"
                @click="handleWritingAction(record, 'skipped')"
              >
                跳过不写
              </a-button>
            </div>

            <!-- rawPayloadJson 调试区 -->
            <a-collapse v-if="record.rawPayloadJson" :bordered="false" class="!bg-transparent">
              <a-collapse-panel key="rawPayload" header="Raw Payload (调试)">
                <pre class="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-editorial-md bg-editorial-page p-3 text-xs text-editorial-text-muted">{{ record.rawPayloadJson }}</pre>
              </a-collapse-panel>
            </a-collapse>
          </div>
        </template>
      </a-table>
    </a-spin>

    <!-- 成品文章详情弹窗 -->
    <ArticleDetailDrawer
      :open="detailArticle !== null"
      :article="detailArticle"
      @update:open="(val) => { if (!val) closeDetailDrawer(); }"
      @saved="loadItems"
    />

    <!-- 写文章模式选择弹窗 -->
    <a-modal
      :open="writeModeVisible"
      title="选择写作模式"
      :confirm-loading="writeModeConfirming"
      ok-text="开始写作"
      cancel-text="取消"
      :destroy-on-close="true"
      width="480px"
      centered
      @ok="confirmWriteMode"
      @cancel="cancelWriteMode"
    >
      <div v-if="writeModeTarget" class="mb-3 text-sm text-gray-500">
        素材：{{ writeModeTarget.title.slice(0, 60) }}{{ writeModeTarget.title.length > 60 ? '...' : '' }}
      </div>
      <a-radio-group v-model:value="writeModeValue" class="flex flex-col gap-3">
        <a-radio v-for="opt in writeModeOptions" :key="String(opt.value)" :value="opt.value">
          {{ opt.label }}
        </a-radio>
      </a-radio-group>
      <div class="mt-4">
        <div class="mb-1 text-xs font-medium text-editorial-text-muted">核心立意（可选）</div>
        <a-input
          v-model:value="writeModeThesis"
          placeholder="可选：指定文章的核心观点/立意"
          allow-clear
        />
        <div class="mt-0.5 text-[10px] text-editorial-text-muted">指定后系统会锁定这个观点，不会被自动替换或反转</div>
      </div>
    </a-modal>

    <!-- 手动写作弹窗 -->
    <a-modal
      :open="manualWriteVisible"
      title="自定义内容写文章"
      :confirm-loading="manualWriteSubmitting"
      ok-text="开始写作"
      cancel-text="取消"
      :destroy-on-close="true"
      width="560px"
      centered
      @ok="confirmManualWrite"
      @cancel="manualWriteVisible = false"
    >
      <div class="space-y-4">
        <!-- 内容类型 -->
        <div>
          <div class="mb-1 text-xs font-medium text-editorial-text-muted">内容类型</div>
          <a-radio-group v-model:value="manualContentType" size="small">
            <a-radio-button v-for="opt in contentTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-radio-button>
          </a-radio-group>
        </div>

        <!-- 标题 -->
        <div>
          <div class="mb-1 text-xs font-medium text-editorial-text-muted">标题（可选）</div>
          <a-input
            v-model:value="manualTitle"
            placeholder="不填则自动取内容前 50 字"
            allow-clear
          />
        </div>

        <!-- 内容 -->
        <div>
          <div class="mb-1 text-xs font-medium text-editorial-text-muted">内容</div>
          <a-textarea
            v-model:value="manualContent"
            :placeholder="manualContentType === 'viewpoint' ? '输入你的观点、想法或简短评论…' : '粘贴文章全文或素材内容…'"
            :rows="8"
            allow-clear
          />
        </div>

        <!-- 写作模式 -->
        <div>
          <div class="mb-1 text-xs font-medium text-editorial-text-muted">写作模式</div>
          <a-radio-group v-model:value="manualMode" class="flex flex-col gap-1">
            <a-radio :value="null">自动判断（观点默认随笔 B，文章默认观点文 A）</a-radio>
            <a-radio value="A">短篇观点文（A）— 600~1500 字</a-radio>
            <a-radio value="B">短篇随笔（B）— 600~1500 字</a-radio>
            <a-radio value="C">长篇观点文（C）— 3000~6000 字</a-radio>
          </a-radio-group>
        </div>

        <!-- 核心立意 -->
        <div>
          <div class="mb-1 text-xs font-medium text-editorial-text-muted">核心立意（可选）</div>
          <a-input
            v-model:value="manualThesis"
            placeholder="可选：指定文章的核心观点/立意"
            allow-clear
          />
          <div class="mt-0.5 text-[10px] text-editorial-text-muted">指定后系统会锁定这个观点，不会被自动替换或反转</div>
        </div>
      </div>
    </a-modal>
  </div>
</template>
