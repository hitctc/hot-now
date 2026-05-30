<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { message } from "ant-design-vue";

import { useSearchHistory } from "../../composables/useSearchHistory.js";
import ArticleDetailDrawer from "../../components/creative/ArticleDetailDrawer.vue";

import {
  readCreativeSourceItems,
  readCreativeSourceItem,
  readCreativeFinishedArticle,
  updateSourceItemWritingStatus,
  writeSourceItemArticle,
  type CreativeSourceItem,
  type CreativeFinishedArticle,
  type TrendBreakdown
} from "../../services/creativeApi.js";

// ─── 状态 ───

const isLoading = ref(false);
const items = ref<CreativeSourceItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(50);

// 筛选条件缓存 key
const SOURCE_FILTERS_KEY = "creative-source-filters";

// 筛选条件（从 localStorage 恢复）
const saved = (() => {
  try {
    const raw = localStorage.getItem(SOURCE_FILTERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
})();
const writingStatusFilter = ref<string | undefined>(saved.writingStatus || undefined);
const searchText = ref(saved.search || "");

// 搜索历史
const { history: searchHistory, addToHistory, removeFromHistory } = useSearchHistory("creative-source-search-history");
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
      search: searchText.value
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
      page: currentPage.value,
      pageSize: pageSize.value,
      writingStatus: writingStatusFilter.value || undefined,
      search: searchText.value || undefined
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
  const idx = expandedRowKeys.value.indexOf(id);
  if (idx >= 0) {
    expandedRowKeys.value.splice(idx, 1);
  } else {
    expandedRowKeys.value.push(id);
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
const writeModeConfirming = ref(false);

const writeModeOptions = [
  { value: null, label: "自动判断（LLM 选择最合适的模式）" },
  { value: "A", label: "短篇观点文（A）— 600~1500 字" },
  { value: "B", label: "短篇随笔（B）— 600~1500 字" },
  { value: "C", label: "长篇观点文（C）— 3000~6000 字" },
];

function openWriteModeModal(item: CreativeSourceItem): void {
  writeModeTarget.value = item;
  writeModeValue.value = null;
  writeModeVisible.value = true;
}

function cancelWriteMode(): void {
  writeModeVisible.value = false;
  writeModeTarget.value = null;
  writeModeConfirming.value = false;
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

onBeforeUnmount(() => stopWritingPoll());

async function confirmWriteMode(): Promise<void> {
  const item = writeModeTarget.value;
  if (!item) return;
  writeModeConfirming.value = true;
  try {
    const result = await writeSourceItemArticle(item.id, writeModeValue.value ?? undefined);
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
  } catch {
    message.error("写文章请求失败");
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

const columns = [
  { title: "ID", dataIndex: "id", key: "id", width: 60 },
  { title: "标题", dataIndex: "title", key: "title", width: 280 },
  { title: "成品", key: "linkedArticle", width: 100, align: "center" as const },
  { title: "来源", dataIndex: "sourceName", key: "sourceName", width: 170 },
  { title: "状态", dataIndex: "writingStatus", key: "writingStatus", width: 90, ellipsis: true },
  { title: "评分", dataIndex: "score", key: "score", width: 72, ellipsis: true },
  { title: "爆文分", key: "trendScore", width: 72, ellipsis: true },
  { title: "爆文维度", key: "trendBreakdown", width: 120, ellipsis: true },
  { title: "Agent", dataIndex: "collectorAgent", key: "collectorAgent", width: 60, align: "center" as const, ellipsis: true },
  { title: "发布时间", dataIndex: "publishedAt", key: "publishedAt", width: 130, ellipsis: true },
  { title: "成品创建时间", key: "linkedArticleCreatedAt", width: 140, ellipsis: true },
  { title: "写文章", key: "quickCopy", width: 80, ellipsis: true }
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
      <div ref="searchDropdownRef" class="relative">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索标题"
          class="!w-[360px]"
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
              <a-tooltip :title="record.title" placement="topLeft" :mouse-enter-delay="0.3">
                <span
                  class="line-clamp-2 cursor-pointer text-[13px] leading-tight font-medium text-editorial-text-main hover:text-editorial-link-active"
                  @click="toggleExpand(record.id)"
                >
                  {{ record.title }}
                </span>
              </a-tooltip>
            </div>
          </template>

          <!-- 成品列 -->
          <template v-else-if="column.key === 'linkedArticle'">
            <div v-if="record.linkedArticleId != null" class="flex flex-wrap items-center justify-center gap-1 leading-tight">
              <a
                class="inline-flex cursor-pointer items-center gap-1 rounded-editorial-pill bg-editorial-link-active/30 px-2 py-0.5 text-[11px] font-semibold text-editorial-link-active hover:bg-editorial-link-active/50"
                @click.prevent="openArticleModal(record.linkedArticleId!)"
              >
                #{{ record.linkedArticleId }}
              </a>
              <span
                v-if="(record as any).linkedArticlePublished"
                class="inline-flex items-center rounded-editorial-pill bg-green-100 px-1.5 py-0.5 text-[10px] leading-none text-green-700"
              >已发布</span>
            </div>
            <span v-else class="text-xs text-editorial-text-muted">-</span>
          </template>

          <!-- 来源列 -->
          <template v-else-if="column.key === 'sourceName'">
            <a-tooltip :title="(record.sourceName || '').replace('微信公众号', 'WX')" placement="topLeft" :mouse-enter-delay="0.3">
              <span class="line-clamp-2 text-[13px] leading-tight text-editorial-text-body">{{ (record.sourceName || "-").replace("微信公众号", "WX") }}</span>
            </a-tooltip>
          </template>

          <!-- 评分列 -->
          <template v-else-if="column.key === 'score'">
            <span
              v-if="record.score != null"
              class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-link-active px-2 py-0.5 text-[11px] font-semibold text-editorial-text-main"
            >
              {{ record.score }}
            </span>
            <span v-else class="text-editorial-text-muted">-</span>
          </template>

          <!-- 传播分列 -->
          <template v-else-if="column.key === 'trendScore'">
            <span v-if="record.trendScore != null" class="inline-flex items-center rounded-editorial-pill border px-2 py-0.5 text-[11px] font-bold" :class="record.trendScore >= 80 ? 'border-red-500 bg-red-500 text-white shadow-sm' : 'border-orange-300 bg-orange-50 text-orange-700'">{{ record.trendScore }}</span>
            <span v-else class="text-xs text-editorial-text-muted">未评分</span>
          </template>

          <!-- 评分维度列 -->
          <template v-else-if="column.key === 'trendBreakdown'">
            <template v-if="record.trendBreakdown && getBreakdownBars(record.trendBreakdown).length > 0">
              <a-tooltip :mouse-enter-delay="0.3">
                <template #title>
                  <div class="text-xs leading-5">{{ formatBreakdown(record.trendBreakdown) }}</div>
                </template>
                <div class="flex h-3 w-full min-w-[80px] overflow-hidden rounded-sm">
                  <div
                    v-for="(bar, idx) in getBreakdownBars(record.trendBreakdown)"
                    :key="idx"
                    :style="{ width: bar.width, backgroundColor: bar.color }"
                    :title="bar.label"
                  />
                </div>
              </a-tooltip>
            </template>
            <span v-else class="text-xs text-editorial-text-muted">-</span>
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

          <!-- 发布时间列 -->
          <template v-else-if="column.key === 'publishedAt'">
            <span class="text-xs text-editorial-text-muted">{{ formatPublishedAt(record.publishedAt) }}</span>
          </template>

          <!-- 成品创建时间列 -->
          <template v-else-if="column.key === 'linkedArticleCreatedAt'">
            <span v-if="record.linkedArticleCreatedAt" class="text-xs text-editorial-text-muted">{{ formatPublishedAt(record.linkedArticleCreatedAt) }}</span>
            <span v-else class="text-xs text-editorial-text-muted">-</span>
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
            <a-button
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
              <p class="m-0 text-sm leading-6 text-editorial-text-body">{{ record.summary }}</p>
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
    </a-modal>
  </div>
</template>
