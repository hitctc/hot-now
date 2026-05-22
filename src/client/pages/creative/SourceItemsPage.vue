<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { message } from "ant-design-vue";
import MarkdownIt from "markdown-it";

import { useSearchHistory } from "../../composables/useSearchHistory.js";

import {
  readCreativeSourceItems,
  readCreativeFinishedArticle,
  updateSourceItemWritingStatus,
  parseArticleImages,
  extractImageUrl,
  type CreativeSourceItem,
  type CreativeFinishedArticle,
  type TrendBreakdown
} from "../../services/creativeApi.js";

// ─── Markdown 渲染器 ───

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

function renderMarkdown(text: string): string {
  return md.render(text);
}

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
const articleModalOpen = ref(false);
const articleModalLoading = ref(false);
const articleModalData = ref<CreativeFinishedArticle | null>(null);

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

function parseJsonArray(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function openArticleModal(articleId: number): Promise<void> {
  articleModalLoading.value = true;
  articleModalOpen.value = true;
  try {
    const article = await readCreativeFinishedArticle(articleId);
    articleModalData.value = article;
  } finally {
    articleModalLoading.value = false;
  }
}

function closeArticleModal(): void {
  articleModalOpen.value = false;
  articleModalData.value = null;
}

function formatArticleCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
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

// ─── 复制辅助 ───

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  message.success("已复制到剪贴板");
}

// 素材库 prompt：指示爱马仕智能体对指定素材执行完整的单条写文章工作流
function buildSourceItemPrompt(item: CreativeSourceItem): string {
  return [
    "请使用「单条写文章」工作流处理以下素材，完成从素材读取到推送公众号草稿箱的完整流程：",
    "",
    `- 素材 ID：${item.id}`,
    `- 素材标题：${item.title}`
  ].join("\n");
}

async function copySourceItemPrompt(item: CreativeSourceItem): Promise<void> {
  await copyText(buildSourceItemPrompt(item));
}

async function copyMarkdownAsPlainText(md: string): Promise<void> {
  const text = md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/---+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  await navigator.clipboard.writeText(text);
  message.success("已复制纯文本到剪贴板");
}

// ─── 表格列 ───

const columns = [
  { title: "标题", dataIndex: "title", key: "title", width: 280, ellipsis: true },
  { title: "成品", key: "linkedArticle", width: 100, align: "center" as const, ellipsis: true },
  { title: "来源", dataIndex: "sourceName", key: "sourceName", width: 170, ellipsis: true },
  { title: "状态", dataIndex: "writingStatus", key: "writingStatus", width: 90, ellipsis: true },
  { title: "评分", dataIndex: "score", key: "score", width: 72, ellipsis: true },
  { title: "爆文分", key: "trendScore", width: 72, ellipsis: true },
  { title: "爆文维度", key: "trendBreakdown", width: 120, ellipsis: true },
  { title: "Agent", dataIndex: "collectorAgent", key: "collectorAgent", width: 60, align: "center" as const, ellipsis: true },
  { title: "发布时间", dataIndex: "publishedAt", key: "publishedAt", width: 130, ellipsis: true },
  { title: "成品创建时间", key: "linkedArticleCreatedAt", width: 140, ellipsis: true },
  { title: "重写文章", key: "quickCopy", width: 64, ellipsis: true }
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
          <template v-if="column.key === 'title'">
            <div class="flex items-center gap-2 min-w-0">
              <a-tooltip :title="record.title" placement="topLeft" :mouse-enter-delay="0.3">
                <span
                  class="cursor-pointer truncate font-medium text-editorial-text-main hover:text-editorial-link-active"
                  @click="toggleExpand(record.id)"
                >
                  {{ record.title }}
                </span>
              </a-tooltip>
            </div>
          </template>

          <!-- 成品列 -->
          <template v-else-if="column.key === 'linkedArticle'">
            <div v-if="record.linkedArticleId != null" class="flex items-center gap-1.5">
              <a
                class="inline-flex cursor-pointer items-center gap-1 rounded-editorial-pill bg-editorial-link-active/30 px-2.5 py-1 text-[11px] font-semibold text-editorial-link-active hover:bg-editorial-link-active/50"
                @click.prevent="openArticleModal(record.linkedArticleId!)"
              >
                #{{ record.linkedArticleId }}
                <span class="text-[10px] opacity-70">→</span>
              </a>
              <span
                v-if="(record as any).linkedArticlePublished"
                class="inline-flex items-center rounded-editorial-pill bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700"
              >已发布</span>
            </div>
            <span v-else class="text-xs text-editorial-text-muted">-</span>
          </template>

          <!-- 来源列 -->
          <template v-else-if="column.key === 'sourceName'">
            <a-tooltip :title="(record.sourceName || '').replace('微信公众号', 'WX')" placement="topLeft" :mouse-enter-delay="0.3">
              <span class="block truncate text-editorial-text-body">{{ (record.sourceName || "-").replace("微信公众号", "WX") }}</span>
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
            <a-tag :color="writingStatusColor(record.writingStatus)">
              {{ writingStatusLabel(record.writingStatus) }}
            </a-tag>
          </template>

          <!-- 快捷复制列：生成写文章 prompt -->
          <template v-else-if="column.key === 'quickCopy'">
            <a
              class="cursor-pointer text-xs text-editorial-link-active hover:underline"
              @click.prevent="copySourceItemPrompt(record)"
            >写文章</a>
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

    <!-- 成品文章详情弹窗（全屏，与成品文章列表页一致） -->
    <a-modal
      :open="articleModalOpen"
      :footer="null"
      :closable="true"
      :mask-closable="true"
      width="100%"
      wrap-class-name="article-detail-fullscreen"
      :body-style="{ padding: 0, background: '#ffffff' }"
      :style="{ top: 0, maxWidth: '100vw', paddingBottom: 0 }"
      destroy-on-close
      @cancel="closeArticleModal"
    >
      <a-spin :spinning="articleModalLoading">
        <template v-if="articleModalData">
          <div class="mx-auto flex max-w-[860px] flex-col gap-6 px-8 py-6">
            <!-- 顶部元信息 -->
            <div class="flex items-center gap-3">
              <span class="text-xs text-editorial-text-muted">模式 {{ articleModalData.mode || "-" }}</span>
              <span class="text-xs text-editorial-text-muted">{{ formatArticleCreatedAt(articleModalData.createdAt) }}</span>
            </div>

            <!-- 备选标题 -->
            <section v-if="parseJsonArray(articleModalData.titles).length > 0">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">备选标题</h3>
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(articleModalData.titles).join('\n'))">复制全部</a-button>
              </div>
              <ul class="m-0 list-none space-y-1 pl-0">
                <li
                  v-for="(t, idx) in parseJsonArray(articleModalData.titles)"
                  :key="idx"
                  class="group flex items-start gap-3 rounded-editorial-sm border border-editorial-border px-3 py-2 transition-colors hover:border-editorial-link-active/40"
                >
                  <span class="flex-shrink-0 text-[11px] font-bold tabular-nums text-editorial-text-muted">{{ idx + 1 }}</span>
                  <span class="flex-1 text-sm leading-6 text-editorial-text-main">{{ t }}</span>
                  <a-button type="link" size="small" class="!p-0 !text-[11px] opacity-0 group-hover:opacity-100" @click="copyText(t)">复制</a-button>
                </li>
              </ul>
            </section>

            <!-- 核心立意 -->
            <section v-if="articleModalData.thesis">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">核心立意</h3>
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(articleModalData.thesis!)">复制</a-button>
              </div>
              <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ articleModalData.thesis }}</p>
            </section>

            <!-- 百字摘要 -->
            <section v-if="articleModalData.summary100 && articleModalData.summary100.length > 0">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">百字摘要</h3>
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(articleModalData.summary100![0])">复制</a-button>
              </div>
              <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ articleModalData.summary100![0] }}</p>
            </section>

            <!-- 开头钩子 -->
            <section v-if="parseJsonArray(articleModalData.hooks).length > 0">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">开头钩子</h3>
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(articleModalData.hooks).join('\n'))">复制全部</a-button>
              </div>
              <ul class="m-0 list-none space-y-1 pl-0">
                <li
                  v-for="(h, idx) in parseJsonArray(articleModalData.hooks)"
                  :key="idx"
                  class="group flex items-start gap-3 rounded-editorial-sm bg-editorial-panel px-3 py-2"
                >
                  <span class="flex-1 text-sm leading-6 text-editorial-text-body">{{ h }}</span>
                  <a-button type="link" size="small" class="!p-0 !text-[11px] opacity-0 group-hover:opacity-100" @click="copyText(h)">复制</a-button>
                </li>
              </ul>
            </section>

            <!-- 可摘句 -->
            <section v-if="parseJsonArray(articleModalData.quotes).length > 0">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">可摘句</h3>
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(articleModalData.quotes).join('\n'))">复制全部</a-button>
              </div>
              <ul class="m-0 list-inside list-disc pl-1">
                <li v-for="(q, idx) in parseJsonArray(articleModalData.quotes)" :key="idx" class="text-sm leading-6 text-editorial-text-body">{{ q }}</li>
              </ul>
            </section>

            <!-- 正文（Markdown 渲染） -->
            <section v-if="articleModalData.contentMarkdown">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文</h3>
                <div class="flex gap-2">
                  <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(articleModalData.contentMarkdown)">复制原文</a-button>
                  <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyMarkdownAsPlainText(articleModalData.contentMarkdown)">复制纯文本</a-button>
                </div>
              </div>
              <div
                class="article-markdown-body rounded-editorial-md border border-editorial-border bg-editorial-page px-4 py-3"
                v-html="renderMarkdown(articleModalData.contentMarkdown)"
              ></div>
            </section>

            <!-- 图片列表 -->
            <section v-if="parseArticleImages(articleModalData.imagesJson).length > 0">
              <h3 class="m-0 mb-2 text-sm font-semibold text-editorial-text-muted">图片列表</h3>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div
                  v-for="(img, idx) in parseArticleImages(articleModalData.imagesJson)"
                  :key="idx"
                  class="group relative overflow-hidden rounded-editorial-md border border-editorial-border"
                >
                  <img
                    :src="extractImageUrl(img)"
                    :alt="typeof img === 'object' && img.alt ? img.alt : `图片 ${idx + 1}`"
                    class="block w-full object-cover"
                    loading="lazy"
                  />
                  <div v-if="typeof img === 'object' && img.purpose" class="absolute right-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                    {{ img.purpose }}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </template>
      </a-spin>
    </a-modal>
  </div>
</template>

<style>
.article-detail-fullscreen {
  overflow: hidden !important;
}
.article-detail-fullscreen .ant-modal {
  top: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  max-width: 100vw !important;
  width: 100vw !important;
}
.article-detail-fullscreen .ant-modal-content {
  background: #ffffff !important;
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-radius: 0 !important;
  padding: 0 !important;
}
.article-detail-fullscreen .ant-modal-header {
  background: #ffffff !important;
  flex-shrink: 0;
  border-bottom: 1px solid #e5e7eb;
  border-radius: 0 !important;
  padding: 12px 24px;
}
.article-detail-fullscreen .ant-modal-body {
  background: #ffffff !important;
  flex: 1;
  overflow-y: auto;
  padding: 0;
}
.article-detail-fullscreen .ant-modal-close {
  top: 8px !important;
}

/* Markdown 渲染样式 */
.article-markdown-body {
  font-size: 14px;
  line-height: 1.75;
  color: #374151;
}
.article-markdown-body h1,
.article-markdown-body h2,
.article-markdown-body h3,
.article-markdown-body h4 {
  margin: 1em 0 0.5em;
  font-weight: 600;
  color: #111827;
}
.article-markdown-body h1 { font-size: 1.25em; }
.article-markdown-body h2 { font-size: 1.15em; }
.article-markdown-body h3 { font-size: 1.05em; }
.article-markdown-body p { margin: 0.5em 0; }
.article-markdown-body ul,
.article-markdown-body ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.article-markdown-body li { margin: 0.25em 0; }
.article-markdown-body blockquote {
  margin: 0.75em 0;
  padding: 0.5em 1em;
  border-left: 3px solid #d1d5db;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 0 4px 4px 0;
}
.article-markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 0.75em 0;
}
.article-markdown-body a {
  color: #2563eb;
  text-decoration: underline;
}
.article-markdown-body strong { font-weight: 600; }
.article-markdown-body code {
  background: #f3f4f6;
  padding: 0.15em 0.35em;
  border-radius: 3px;
  font-size: 0.9em;
}
.article-markdown-body hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 1em 0;
}
</style>
