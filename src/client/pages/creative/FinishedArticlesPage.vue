<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { message } from "ant-design-vue";

import { useSearchHistory } from "../../composables/useSearchHistory.js";

import {
  readCreativeFinishedArticles,
  readCreativeSourceItem,
  toggleFinishedArticlePublished,
  toggleFinishedArticlePublishable,
  wechatThemeOptions,
  type CreativeFinishedArticle,
  type CreativeSourceItem,
  type TrendBreakdown,
  type WechatThemeId,
  type PushLogEntry
} from "../../services/creativeApi.js";
import { readWechatMpAccounts, type WechatMpAccountSummary } from "../../services/settingsApi.js";
import ArticlePushConfirmModal from "../../components/creative/ArticlePushConfirmModal.vue";
import ArticleDetailDrawer from "../../components/creative/ArticleDetailDrawer.vue";

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
const publishableOnly = ref(false);

// 筛选条件变更时持久化
function saveFinishedFilters(): void {
  try {
    localStorage.setItem(FINISHED_FILTERS_KEY, JSON.stringify({
      search: searchText.value,
      status: statusFilter.value || ""
    }));
  } catch { /* quota 超限等忽略 */ }
}

// 搜索历史
const { history: searchHistory, addToHistory, removeFromHistory } = useSearchHistory("creative-finished-search-history");
const searchDropdownRef = ref<HTMLElement | null>(null);
const showSearchDropdown = ref(false);

function onDocClick(e: MouseEvent): void {
  if (searchDropdownRef.value && !searchDropdownRef.value.contains(e.target as Node)) {
    showSearchDropdown.value = false;
  }
}
onMounted(() => document.addEventListener("click", onDocClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));

const statusOptions = [
  { label: "全部状态", value: "" },
  { label: "已生成", value: "generated" },
  { label: "可推送", value: "ready_for_publish" },
  { label: "已推送草稿", value: "wechat_draft" },
  { label: "异常", value: "anomaly" }
];

// 发布状态切换操作锁
const publishPendingId = ref<number | null>(null);

async function handleTogglePublished(article: CreativeFinishedArticle): Promise<void> {
  publishPendingId.value = article.id;
  try {
    const res = await toggleFinishedArticlePublished(article.id);
    article.wechatPublished = res.wechatPublished;
  } finally {
    publishPendingId.value = null;
  }
}

// 文章详情全屏弹窗
const detailArticle = ref<CreativeFinishedArticle | null>(null);

// 素材详情弹窗
const sourceItemModalOpen = ref(false);
const sourceItemModalLoading = ref(false);
const sourceItemModalData = ref<CreativeSourceItem | null>(null);

// ─── 推送到草稿箱 ───

const pushConfirmVisible = ref(false);
const pushConfirmArticle = ref<CreativeFinishedArticle | null>(null);
const wechatTheme = ref<WechatThemeId>("bauhaus");
const wechatMpAccounts = ref<WechatMpAccountSummary[]>([]);
const defaultAccountName = computed(() => {
  const def = wechatMpAccounts.value.find(a => a.isDefault && a.isEnabled);
  return def?.name ?? '';
});

// 推送前置条件检查：文章必须标题、封面图、Markdown 正文齐全
function canPush(article: CreativeFinishedArticle | null): boolean {
  if (!article) return false;
  if (article.status !== 'ready_for_publish' && article.status !== 'wechat_draft') return false;
  const parsedTitles = parseJsonArray(article.titles);
  if (parsedTitles.length === 0) return false;
  if (article.coverImage.length === 0) return false;
  if (!article.contentMarkdown) return false;
  return true;
}

// 返回不满足推送条件的原因列表，用于 hover 提示
function getMissingConditions(article: CreativeFinishedArticle | null): string[] {
  if (!article) return ['文章不存在'];
  const missing: string[] = [];
  if (article.status !== 'ready_for_publish' && article.status !== 'wechat_draft') missing.push('状态不允许推送');
  const parsedTitles = parseJsonArray(article.titles);
  if (parsedTitles.length === 0) missing.push('缺少标题');
  if (article.coverImage.length === 0) missing.push('缺少封面图');
  if (!article.contentMarkdown) missing.push('缺少 Markdown 内容');
  return missing;
}

function openPushConfirm(article: CreativeFinishedArticle, themeId?: WechatThemeId): void {
  wechatTheme.value = themeId ?? (article.wechatThemeId as WechatThemeId) ?? "bauhaus";
  pushConfirmArticle.value = article;
  pushConfirmVisible.value = true;
  loadWechatMpAccounts();
}

async function loadWechatMpAccounts(): Promise<void> {
  try {
    const res = await readWechatMpAccounts();
    if (res.ok) wechatMpAccounts.value = res.accounts;
  } catch { /* ignore */ }
}

// 推送成功回调：刷新列表
function handlePushSuccess(): void {
  loadItems();
}

// ─── 数据加载 ───

async function loadItems(): Promise<void> {
  isLoading.value = true;
  try {
    const res = await readCreativeFinishedArticles({
      page: currentPage.value,
      pageSize: pageSize.value,
      status: statusFilter.value || undefined,
      search: searchText.value || undefined,
      publishable: publishableOnly.value ? "1" : undefined
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

watch(publishableOnly, () => {
  currentPage.value = 1;
  void loadItems();
});

async function handleTogglePublishable(article: CreativeFinishedArticle): Promise<void> {
  try {
    const res = await toggleFinishedArticlePublishable(article.id);
    if (res.ok) {
      article.publishable = res.publishable;
    }
  } catch {
    // ignore
  }
}

function handleSearch(value: string): void {
  searchText.value = value;
  currentPage.value = 1;
  saveFinishedFilters();
  if (value.trim()) addToHistory(value.trim());
  showSearchDropdown.value = false;
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

// 详情弹窗保存后刷新列表
function onDetailSaved(): void {
  loadItems();
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



// ─── 状态字典 ───

const statusMap: Record<string, { label: string; color: string }> = {
  generated: { label: "已生成", color: "blue" },
  ready_for_publish: { label: "可推送", color: "cyan" },
  wechat_draft: { label: "已推送草稿", color: "green" },
  anomaly: { label: "异常", color: "red" }
};

function getStatusInfo(status: string): { label: string; color: string } {
  return statusMap[status] ?? { label: status, color: "default" };
}

// ─── 表格列 ───

const columns = [
  { title: "标题", key: "title", width: 280 },
  { title: "封面图", key: "coverImage", width: 80, ellipsis: true },
  { title: "状态", key: "status", width: 100 },
  { title: "来源素材", key: "sourceItem", width: 110, ellipsis: true },
  { title: "爆文分", key: "trendScore", width: 72, ellipsis: true },
  { title: "爆文维度", key: "trendBreakdown", width: 160, ellipsis: true },
  { title: "模式", key: "mode", width: 72, ellipsis: true },
  { title: "发布时间", key: "publishedAt", width: 130, ellipsis: true },
  { title: "创建时间", key: "createdAt", width: 140, ellipsis: true },
  { title: "公众号", key: "wechatPublished", width: 80, ellipsis: true },
  { title: "可发", key: "publishable", width: 60, ellipsis: true },
  { title: "推送", key: "pushDraft", width: 72, ellipsis: true },

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
      <a-checkbox v-model:checked="publishableOnly">只看可发</a-checkbox>
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
              class="line-clamp-2 cursor-pointer text-[13px] leading-tight font-medium text-editorial-text-main transition-colors hover:text-editorial-link-active"
              @click="openDetail(record)"
            >
              {{ getFirstTitle(record.titles) }}
            </span>
          </template>

          <!-- 封面图列 -->
          <template v-else-if="column.key === 'coverImage'">
            <a-image
              v-if="record.coverImage && record.coverImage.length > 0"
              :src="record.coverImage[0]"
              :width="36"
              :height="36"
              class="!rounded !border !border-editorial-border"
              style="object-fit:cover;"
            />
            <span v-else class="text-xs text-editorial-text-muted">无</span>
          </template>

          <!-- 状态列 -->
          <template v-else-if="column.key === 'status'">
            <div class="flex flex-col items-start gap-0.5 leading-tight">
              <a-tag :color="getStatusInfo(record.status).color" class="!m-0 !text-[11px] !py-0">{{ getStatusInfo(record.status).label }}</a-tag>
              <a-tag v-if="record.pushCount > 0" color="green" class="!m-0 !text-[11px] !py-0">{{ record.pushCount }}次</a-tag>
            </div>
          </template>

          <!-- 公众号发布状态列 -->
          <template v-else-if="column.key === 'wechatPublished'">
            <a-button
              size="small"
              :type="record.wechatPublished ? 'primary' : 'default'"
              :loading="publishPendingId === record.id"
              class="!text-[11px] !px-2 !py-0.5"
              @click="handleTogglePublished(record)"
            >{{ record.wechatPublished ? '已发布' : '未发布' }}</a-button>
          </template>

          <template v-else-if="column.key === 'publishable'">
            <a-button
              size="small"
              :type="record.publishable ? 'primary' : 'default'"
              class="!text-[11px] !px-2 !py-0.5"
              @click="handleTogglePublishable(record)"
            >{{ record.publishable ? '可发' : '-' }}</a-button>
          </template>

          <!-- 推送到草稿箱列 -->
          <template v-else-if="column.key === 'pushDraft'">
            <a-button
              v-if="canPush(record)"
              size="small"
              type="primary"
              class="!text-[11px] !px-2 !py-0.5"
              @click="openPushConfirm(record)"
            >推送</a-button>
            <a-tooltip v-else :mouse-enter-delay="0.3">
              <template #title>{{ getMissingConditions(record).join('；') }}</template>
              <a-button size="small" disabled class="!text-[11px] !px-2 !py-0.5">推送</a-button>
            </a-tooltip>
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

    <!-- 文章详情弹窗 -->
    <ArticleDetailDrawer
      :open="detailArticle !== null"
      :article="detailArticle"
      @update:open="(val) => { if (!val) closeDetail(); }"
      @saved="onDetailSaved"
      @open-source-item="openSourceItemModal"
      @open-push="openPushConfirm"
    />

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
                <span v-if="sourceItemModalData.trendScore != null" class="font-semibold" :class="sourceItemModalData.trendScore >= 80 ? 'text-red-500' : 'text-orange-600'">{{ sourceItemModalData.trendScore }}</span>
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

    <!-- 推送确认弹窗 -->
    <ArticlePushConfirmModal
      v-model:visible="pushConfirmVisible"
      :article="pushConfirmArticle"
      :theme-id="wechatTheme"
      :theme-label="wechatThemeOptions.find(o => o.value === wechatTheme)?.label ?? ''"
      :default-account-name="defaultAccountName"
      @success="handlePushSuccess"
    />
  </div>
</template>

<style>
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
</style>
