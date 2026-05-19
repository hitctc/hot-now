<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { message } from "ant-design-vue";
import MarkdownIt from "markdown-it";

import {
  editFinishedArticle,
  readCreativeFinishedArticles,
  readCreativeSourceItem,
  renderWechatFormat,
  wechatThemeOptions,
  parseArticleImages,
  extractImageUrl,
  type ArticleImageEntry,
  type CreativeFinishedArticle,
  type CreativeSourceItem,
  type TrendBreakdown,
  type WechatThemeId
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

// ─── JSON 解析辅助 ───

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

// ─── 状态 ───

const isLoading = ref(false);
const items = ref<CreativeFinishedArticle[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(50);

// 筛选条件缓存 key
const FINISHED_FILTERS_KEY = "creative-finished-filters";

// 筛选条件（从 localStorage 恢复）
const savedFinished = (() => {
  try {
    const raw = localStorage.getItem(FINISHED_FILTERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
})();
const searchText = ref(savedFinished.search || "");
const statusFilter = ref<string | undefined>(savedFinished.status || undefined);

// 筛选条件变更时持久化
function saveFinishedFilters(): void {
  try {
    localStorage.setItem(FINISHED_FILTERS_KEY, JSON.stringify({
      search: searchText.value,
      status: statusFilter.value || ""
    }));
  } catch { /* quota 超限等忽略 */ }
}

const statusOptions = [
  { label: "全部状态", value: "" },
  { label: "已生成", value: "generated" },
  { label: "已推送草稿", value: "wechat_draft" },
  { label: "异常", value: "anomaly" }
];

// 文章详情全屏弹窗
const detailArticle = ref<CreativeFinishedArticle | null>(null);

// 素材详情弹窗
const sourceItemModalOpen = ref(false);
const sourceItemModalLoading = ref(false);
const sourceItemModalData = ref<CreativeSourceItem | null>(null);

// 编辑弹窗
const editModalOpen = ref(false);
const editPending = ref(false);
const editForm = ref<{ id: number; contentMarkdown: string; thesis: string; summary100: string }>({
  id: 0,
  contentMarkdown: "",
  thesis: "",
  summary100: ""
});

// 微信公众号格式复制
const wechatTheme = ref<WechatThemeId>("pure-white");
const wechatCopying = ref(false);

// 主题渲染切换（包豪斯 / 落日胶片 / 购物小票）
type ThemeHtmlKey = "bauhaus" | "sunsetFilm" | "receipt";
const themeOptions: { key: ThemeHtmlKey; label: string }[] = [
  { key: "bauhaus", label: "包豪斯" },
  { key: "sunsetFilm", label: "落日胶片" },
  { key: "receipt", label: "购物小票" }
];
const activeTheme = ref<ThemeHtmlKey>("bauhaus");

// 根据当前选中的主题返回渲染 HTML，为空则返回 null
function getThemeHtml(article: CreativeFinishedArticle | null): string | null {
  if (!article) return null;
  const map: Record<ThemeHtmlKey, string | null> = {
    bauhaus: article.contentHtmlBauhaus,
    sunsetFilm: article.contentHtmlSunsetFilm,
    receipt: article.contentHtmlReceipt
  };
  return map[activeTheme.value] ?? null;
}

// ─── 数据加载 ───

async function loadItems(): Promise<void> {
  isLoading.value = true;
  try {
    const res = await readCreativeFinishedArticles({
      page: currentPage.value,
      pageSize: pageSize.value,
      status: statusFilter.value || undefined,
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

watch(statusFilter, () => {
  currentPage.value = 1;
  saveFinishedFilters();
  void loadItems();
});

function handleSearch(value: string): void {
  searchText.value = value;
  currentPage.value = 1;
  saveFinishedFilters();
  void loadItems();
}

function handleTableChange(pagination: { current?: number; pageSize?: number }): void {
  if (pagination.current) currentPage.value = pagination.current;
  if (pagination.pageSize) pageSize.value = pagination.pageSize;
  void loadItems();
}

// ─── 文章详情弹窗 ───

function openDetail(article: CreativeFinishedArticle): void {
  detailArticle.value = article;
}

function closeDetail(): void {
  detailArticle.value = null;
}

// ─── 素材详情弹窗 ───

async function openSourceItemModal(sourceItemId: number): Promise<void> {
  sourceItemModalLoading.value = true;
  sourceItemModalOpen.value = true;
  try {
    const item = await readCreativeSourceItem(sourceItemId);
    sourceItemModalData.value = item;
  } finally {
    sourceItemModalLoading.value = false;
  }
}

function closeSourceItemModal(): void {
  sourceItemModalOpen.value = false;
  sourceItemModalData.value = null;
}

// ─── 编辑弹窗 ───

function openEditModal(article: CreativeFinishedArticle): void {
  editForm.value = {
    id: article.id,
    contentMarkdown: article.contentMarkdown ?? "",
    thesis: article.thesis ?? "",
    summary100: article.summary100 ?? ""
  };
  editModalOpen.value = true;
}

async function handleEditSubmit(): Promise<void> {
  editPending.value = true;
  try {
    await editFinishedArticle(editForm.value.id, {
      contentMarkdown: editForm.value.contentMarkdown,
      thesis: editForm.value.thesis,
      summary100: editForm.value.summary100
    });
    message.success("保存成功");
    editModalOpen.value = false;
    await loadItems();
    if (detailArticle.value && detailArticle.value.id === editForm.value.id) {
      const updated = items.value.find(item => item.id === editForm.value.id);
      if (updated) detailArticle.value = updated;
    }
  } catch {
    message.error("保存失败，请重试");
  } finally {
    editPending.value = false;
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

// 返回排序后的柱状图段数据
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

// SQLite CURRENT_TIMESTAMP 输出 UTC 但不带后缀，补 Z 让 JS 正确解析
function formatLocalTime(value: string): string {
  const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(fixed);
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

function getFirstTitle(titles: string | null): string {
  const parsed = parseJsonArray(titles);
  return parsed.length > 0 ? parsed[0] : "无标题";
}

function formatPublishedAt(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ─── 纯文本复制 ───

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  message.success("已复制到剪贴板");
}

// 重写文章 prompt：使用关联素材的 ID 和标题，与素材库"写文章"按钮内容一致
function buildFinishedArticlePrompt(article: CreativeFinishedArticle): string {
  return [
    "请使用「单条写文章」工作流处理以下素材，完成从素材读取到推送公众号草稿箱的完整流程：",
    "",
    `- 素材 ID：${article.sourceItemId}`,
    `- 素材标题：${(article as any).sourceTitle ?? "无标题"}`
  ].join("\n");
}

async function copyFinishedArticlePrompt(article: CreativeFinishedArticle): Promise<void> {
  await copyText(buildFinishedArticlePrompt(article));
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

// ─── 微信公众号格式复制 ───

async function copyAsWechatFormat(): Promise<void> {
  if (!detailArticle.value?.contentMarkdown) {
    message.warning("文章无正文内容");
    return;
  }
  wechatCopying.value = true;
  try {
    const res = await renderWechatFormat(detailArticle.value.id, wechatTheme.value);
    if (!res.ok || !res.html) {
      message.error("渲染失败，请重试");
      return;
    }
    const htmlBlob = new Blob([res.html], { type: "text/html" });
    const textBlob = new Blob([detailArticle.value.contentMarkdown], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })
    ]);
    message.success("已复制公众号格式，可直接粘贴到编辑器");
  } catch {
    message.error("复制失败，请检查浏览器剪贴板权限");
  } finally {
    wechatCopying.value = false;
  }
}

// ─── 状态字典 ───

const statusMap: Record<string, { label: string; color: string }> = {
  generated: { label: "已生成", color: "blue" },
  wechat_draft: { label: "已推送草稿", color: "green" },
  anomaly: { label: "异常", color: "red" }
};

function getStatusInfo(status: string): { label: string; color: string } {
  return statusMap[status] ?? { label: status, color: "default" };
}

// ─── 表格列 ───

const columns = [
  { title: "标题", key: "title", width: 200, ellipsis: true },
  { title: "封面图", key: "coverImage", width: 80, ellipsis: true },
  { title: "状态", key: "status", width: 100, ellipsis: true },
  { title: "来源素材", key: "sourceItem", width: 110, ellipsis: true },
  { title: "爆文分", key: "trendScore", width: 72, ellipsis: true },
  { title: "爆文维度", key: "trendBreakdown", width: 160, ellipsis: true },
  { title: "模式", key: "mode", width: 72, ellipsis: true },
  { title: "发布时间", key: "publishedAt", width: 130, ellipsis: true },
  { title: "创建时间", key: "createdAt", width: 140, ellipsis: true },
  { title: "异常说明", key: "anomalyReason", width: 150, ellipsis: true },
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
  <div class="flex w-full flex-col gap-2" data-page="creative-finished-articles">
    <!-- 筛选栏 -->
    <div class="flex flex-wrap items-center gap-3">
      <a-select
        v-model:value="statusFilter"
        :options="statusOptions"
        placeholder="文章状态"
        class="!w-[140px]"
      />
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索标题"
        class="!w-[240px]"
        allow-clear
        @search="handleSearch"
        @change="(val: string) => { if (!val) handleSearch(''); }"
      />
    </div>

    <!-- 表格 -->
    <a-spin :spinning="isLoading">
      <a-table
        :columns="columns"
        :data-source="items"
        :pagination="pagination"
        :scroll="{ x: 900 }"
        row-key="id"
        data-article-table
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <!-- 标题列：点击打开详情弹窗 -->
          <template v-if="column.key === 'title'">
            <span
              class="cursor-pointer font-medium text-editorial-text-main transition-colors hover:text-editorial-link-active"
              @click="openDetail(record)"
            >
              {{ getFirstTitle(record.titles) }}
            </span>
          </template>

          <!-- 封面图列 -->
          <template v-else-if="column.key === 'coverImage'">
            <a-image
              v-if="record.coverImage"
              :src="record.coverImage"
              :width="36"
              :height="36"
              class="!rounded !border !border-editorial-border"
              style="object-fit:cover;"
            />
            <span v-else class="text-xs text-editorial-text-muted">无</span>
          </template>

          <!-- 状态列 -->
          <template v-else-if="column.key === 'status'">
            <a-tag :color="getStatusInfo(record.status).color" class="!m-0">{{ getStatusInfo(record.status).label }}</a-tag>
          </template>

          <!-- 异常说明列 -->
          <template v-else-if="column.key === 'anomalyReason'">
            <template v-if="record.anomalyReason">
              <a-tooltip :mouse-enter-delay="0.3">
                <template #title>{{ record.anomalyReason }}</template>
                <span class="block truncate text-xs text-editorial-text-body">{{ record.anomalyReason }}</span>
              </a-tooltip>
            </template>
            <span v-else class="text-xs text-editorial-text-muted">-</span>
          </template>

          <!-- 快捷复制列：生成重写文章 prompt -->
          <template v-else-if="column.key === 'quickCopy'">
            <a
              class="cursor-pointer text-xs text-editorial-link-active hover:underline"
              @click.prevent="copyFinishedArticlePrompt(record)"
            >重写</a>
          </template>

          <!-- 来源素材列 -->
          <template v-else-if="column.key === 'sourceItem'">
            <a
              class="cursor-pointer text-xs text-editorial-link-active hover:underline"
              @click.prevent="openSourceItemModal(record.sourceItemId)"
            >素材 #{{ record.sourceItemId }}</a>
          </template>

          <!-- 传播分列 -->
          <template v-else-if="column.key === 'trendScore'">
            <span v-if="record.trendScore != null" class="inline-flex items-center rounded-editorial-pill border px-2 py-0.5 text-[11px] font-bold" :class="record.trendScore >= 90 ? 'border-red-500 bg-red-500 text-white shadow-sm' : 'border-orange-300 bg-orange-50 text-orange-700'">{{ record.trendScore }}</span>
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

          <!-- 模式列 -->
          <template v-else-if="column.key === 'mode'">
            <span class="text-xs text-editorial-text-body">{{ record.mode || "-" }}</span>
          </template>

          <!-- 发布时间列 -->
          <template v-else-if="column.key === 'publishedAt'">
            <span class="text-xs text-editorial-text-muted">{{ formatLocalTime(record.publishedAt) }}</span>
          </template>

          <!-- 创建时间列 -->
          <template v-else-if="column.key === 'createdAt'">
            <span class="text-xs text-editorial-text-muted">{{ formatLocalTime(record.createdAt) }}</span>
          </template>
        </template>
      </a-table>
    </a-spin>

    <!-- 文章详情全屏弹窗 -->
    <a-modal
      :open="detailArticle !== null"
      :footer="null"
      :closable="true"
      :mask-closable="true"
      width="100%"
      wrap-class-name="article-detail-fullscreen"
      :body-style="{ padding: 0, background: '#ffffff' }"
      :style="{ top: 0, maxWidth: '100vw', paddingBottom: 0 }"
      destroy-on-close
      @cancel="closeDetail"
    >
      <template v-if="detailArticle">
        <div class="mx-auto flex max-w-[860px] flex-col gap-6 px-8 py-6">
          <!-- 顶部元信息 -->
          <div class="flex items-center gap-3">
            <span class="text-xs text-editorial-text-muted">模式 {{ detailArticle.mode || "-" }}</span>
            <span class="text-xs text-editorial-text-muted">{{ formatLocalTime(detailArticle.createdAt) }}</span>
            <a
              class="cursor-pointer text-xs text-editorial-link-active hover:underline"
              @click.prevent="openSourceItemModal(detailArticle.sourceItemId)"
            >素材 #{{ detailArticle.sourceItemId }}</a>
          </div>

          <!-- 备选标题 -->
          <section v-if="parseJsonArray(detailArticle.titles).length > 0">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">备选标题</h3>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(detailArticle.titles).join('\n'))">复制全部</a-button>
            </div>
            <ul class="m-0 list-none space-y-1 pl-0">
              <li
                v-for="(t, idx) in parseJsonArray(detailArticle.titles)"
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
          <section v-if="detailArticle.thesis">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">核心立意</h3>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(detailArticle.thesis!)">复制</a-button>
            </div>
            <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ detailArticle.thesis }}</p>
          </section>

          <!-- 百字摘要 -->
          <section v-if="detailArticle.summary100">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">百字摘要</h3>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(detailArticle.summary100!)">复制</a-button>
            </div>
            <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ detailArticle.summary100 }}</p>
          </section>

          <!-- 开头钩子 -->
          <section v-if="parseJsonArray(detailArticle.hooks).length > 0">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">开头钩子</h3>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(detailArticle.hooks).join('\n'))">复制全部</a-button>
            </div>
            <ul class="m-0 list-none space-y-1 pl-0">
              <li
                v-for="(h, idx) in parseJsonArray(detailArticle.hooks)"
                :key="idx"
                class="group flex items-start gap-3 rounded-editorial-sm bg-editorial-panel/40 px-3 py-2"
              >
                <span class="flex-1 text-sm leading-6 text-editorial-text-body">{{ h }}</span>
                <a-button type="link" size="small" class="!p-0 !text-[11px] opacity-0 group-hover:opacity-100" @click="copyText(h)">复制</a-button>
              </li>
            </ul>
          </section>

          <!-- 可摘句 -->
          <section v-if="parseJsonArray(detailArticle.quotes).length > 0">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">可摘句</h3>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(detailArticle.quotes).join('\n'))">复制全部</a-button>
            </div>
            <ul class="m-0 list-inside list-disc pl-1">
              <li v-for="(q, idx) in parseJsonArray(detailArticle.quotes)" :key="idx" class="text-sm leading-6 text-editorial-text-body">{{ q }}</li>
            </ul>
          </section>

          <!-- 正文（主题渲染 / Markdown 降级） -->
          <section v-if="detailArticle.contentMarkdown">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文</h3>
              <div class="flex items-center gap-2">
                <div v-if="getThemeHtml(detailArticle)" class="flex gap-1">
                  <a-button
                    v-for="opt in themeOptions"
                    :key="opt.key"
                    :type="activeTheme === opt.key ? 'primary' : 'default'"
                    size="small"
                    class="!text-[11px] !px-2 !py-0.5"
                    @click="activeTheme = opt.key"
                  >{{ opt.label }}</a-button>
                </div>
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(detailArticle.contentMarkdown)">复制原文</a-button>
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyMarkdownAsPlainText(detailArticle.contentMarkdown)">复制纯文本</a-button>
              </div>
            </div>
            <!-- 有主题 HTML 时渲染主题，否则降级到 Markdown -->
            <div
              v-if="getThemeHtml(detailArticle)"
              class="rounded-editorial-md border border-editorial-border overflow-hidden"
              v-html="getThemeHtml(detailArticle)"
            ></div>
            <div
              v-else
              class="article-markdown-body rounded-editorial-md border border-editorial-border bg-editorial-panel/30 px-4 py-3"
              v-html="renderMarkdown(detailArticle.contentMarkdown)"
            ></div>
          </section>

          <!-- 图片列表 -->
          <section v-if="parseArticleImages(detailArticle.imagesJson).length > 0">
            <h3 class="m-0 mb-2 text-sm font-semibold text-editorial-text-muted">图片列表</h3>
            <a-image-preview-group>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div
                  v-for="(img, idx) in parseArticleImages(detailArticle.imagesJson)"
                  :key="idx"
                  class="group relative overflow-hidden rounded-editorial-md border border-editorial-border"
                >
                  <a-image
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
            </a-image-preview-group>
          </section>

          <!-- 底部悬浮操作栏 -->
          <div class="!fixed !bottom-6 !right-6 !z-50 flex items-center gap-2">
            <a-select
              v-model:value="wechatTheme"
              :options="wechatThemeOptions"
              size="small"
              class="!w-[120px]"
            />
            <a-button
              :loading="wechatCopying"
              class="!shadow-lg"
              @click="copyAsWechatFormat"
            >复制公众号格式</a-button>
            <a-button
              type="primary"
              class="!shadow-lg"
              @click="openEditModal(detailArticle)"
            >编辑内容</a-button>
          </div>
        </div>
      </template>
    </a-modal>

    <!-- 素材详情弹窗 -->
    <a-modal
      :open="sourceItemModalOpen"
      :footer="null"
      :closable="true"
      :mask-closable="true"
      width="860px"
      centered
      wrap-class-name="source-item-detail-modal"
      destroy-on-close
      @cancel="closeSourceItemModal"
    >
      <a-spin :spinning="sourceItemModalLoading">
        <template v-if="sourceItemModalData">
          <div class="flex flex-col gap-5 py-2">
            <!-- 标题 -->
            <h2 class="m-0 text-base font-semibold text-editorial-text-main">{{ sourceItemModalData.title }}</h2>

            <!-- 元信息 -->
            <a-descriptions :column="{ xs: 1, sm: 2, md: 3 }" size="small" bordered>
              <a-descriptions-item label="来源">
                {{ sourceItemModalData.sourceName || "-" }}
              </a-descriptions-item>
              <a-descriptions-item label="作者">
                {{ sourceItemModalData.author || "-" }}
              </a-descriptions-item>
              <a-descriptions-item label="Agent">
                {{ sourceItemModalData.collectorAgent }}
              </a-descriptions-item>
              <a-descriptions-item label="评分">
                <span v-if="sourceItemModalData.score != null" class="font-semibold">{{ sourceItemModalData.score }}</span>
                <span v-else class="text-editorial-text-muted">-</span>
              </a-descriptions-item>
              <a-descriptions-item label="爆文分">
                <span v-if="sourceItemModalData.trendScore != null" class="font-semibold" :class="sourceItemModalData.trendScore >= 90 ? 'text-red-500' : 'text-orange-600'">{{ sourceItemModalData.trendScore }}</span>
                <span v-else class="text-editorial-text-muted">未评分</span>
              </a-descriptions-item>
              <a-descriptions-item label="爆文维度">
                <template v-if="sourceItemModalData.trendBreakdown">
                  <span class="text-xs">{{ formatBreakdown(sourceItemModalData.trendBreakdown) }}</span>
                </template>
                <span v-else class="text-editorial-text-muted">-</span>
              </a-descriptions-item>
              <a-descriptions-item label="字数">
                {{ sourceItemModalData.wordCount ?? "-" }}
              </a-descriptions-item>
              <a-descriptions-item label="语言">
                {{ sourceItemModalData.language }}
              </a-descriptions-item>
              <a-descriptions-item label="发布时间">
                {{ formatPublishedAt(sourceItemModalData.publishedAt) }}
              </a-descriptions-item>
              <a-descriptions-item label="采集时间">
                {{ formatPublishedAt(sourceItemModalData.collectorTimestamp) }}
              </a-descriptions-item>
              <a-descriptions-item label="写作状态">
                {{ sourceItemModalData.writingStatus }}
              </a-descriptions-item>
              <a-descriptions-item label="标签">
                <template v-if="sourceItemModalData.tags">
                  <a-tag v-for="tag in sourceItemModalData.tags.split(',').map((t: string) => t.trim()).filter(Boolean)" :key="tag" size="small">{{ tag }}</a-tag>
                </template>
                <span v-else class="text-editorial-text-muted">-</span>
              </a-descriptions-item>
              <a-descriptions-item label="原文链接" :span="3">
                <a
                  v-if="sourceItemModalData.url"
                  :href="sourceItemModalData.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-editorial-link-active underline"
                >{{ sourceItemModalData.url }}</a>
                <span v-else class="text-editorial-text-muted">无</span>
              </a-descriptions-item>
            </a-descriptions>

            <!-- 摘要 -->
            <section v-if="sourceItemModalData.summary">
              <h3 class="m-0 mb-2 text-sm font-semibold text-editorial-text-muted">摘要</h3>
              <p class="m-0 text-sm leading-6 text-editorial-text-body">{{ sourceItemModalData.summary }}</p>
            </section>

            <!-- 原文内容 -->
            <section>
              <h3 class="m-0 mb-2 text-sm font-semibold text-editorial-text-muted">原文内容</h3>
              <div
                v-if="sourceItemModalData.fullContent"
                class="whitespace-pre-wrap rounded-editorial-md border border-editorial-border bg-editorial-page px-4 py-3 text-sm leading-6 text-editorial-text-body"
              >
                {{ sourceItemModalData.fullContent }}
              </div>
              <p v-else class="m-0 text-sm italic text-editorial-text-muted">采集未提供原文</p>
            </section>
          </div>
        </template>
      </a-spin>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editModalOpen"
      title="编辑成品文章"
      :confirm-loading="editPending"
      ok-text="确认"
      cancel-text="取消"
      width="900px"
      centered
      @ok="handleEditSubmit"
    >
      <a-form layout="vertical" class="mt-4">
        <a-form-item label="核心立意">
          <a-input v-model:value="editForm.thesis" placeholder="核心立意" />
        </a-form-item>
        <a-form-item label="百字摘要">
          <a-textarea v-model:value="editForm.summary100" :rows="4" placeholder="百字摘要" />
        </a-form-item>
        <a-form-item label="正文 Markdown">
          <a-textarea v-model:value="editForm.contentMarkdown" :rows="25" placeholder="正文内容" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style>
.article-detail-fullscreen {
  /* 弹窗打开时锁定背景滚动 */
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
.source-item-detail-modal .ant-modal {
  top: 0;
  padding-bottom: 0;
}
.source-item-detail-modal .ant-modal-content {
  background: #ffffff !important;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
}
.source-item-detail-modal .ant-modal-header {
  flex-shrink: 0;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
}
.source-item-detail-modal .ant-modal-body {
  background: #ffffff !important;
  flex: 1;
  overflow-y: auto;
  padding: 24px;
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
