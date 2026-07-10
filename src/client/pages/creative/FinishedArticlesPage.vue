<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { message } from "ant-design-vue";

import { useSearchHistory } from "../../composables/useSearchHistory.js";

import {
  readCreativeFinishedArticles,
  editFinishedArticle,
  deleteFinishedArticle,
  restoreFinishedArticle,
  parseArticleImages,
  wechatThemeOptions,
  type CreativeFinishedArticle,
  type TrendBreakdown,
  type WechatThemeId,
  type PushLogEntry
} from "../../services/creativeApi.js";
import { readWechatMpAccounts, type WechatMpAccountSummary } from "../../services/settingsApi.js";
import ArticlePushFloatWidget from "../../components/creative/ArticlePushFloatWidget.vue";
import ArticleDetailDrawer from "../../components/creative/ArticleDetailDrawer.vue";
import SourceItemDetailModal from "../../components/creative/SourceItemDetailModal.vue";
import { getStatusLabel, getAvailableActions, checkPublishConditions, type ArticleAction } from "../../components/creative/articleStatusShared.js";

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
const publishableOnly = ref(savedFinished.publishableOnly || false);
const showDeleted = ref(savedFinished.showDeleted || false);

// 筛选条件变更时持久化
function saveFinishedFilters(): void {
  try {
    localStorage.setItem(FINISHED_FILTERS_KEY, JSON.stringify({
      search: searchText.value,
      status: statusFilter.value || "",
      publishableOnly: publishableOnly.value,
      showDeleted: showDeleted.value
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
  { label: "排队中", value: "queued" },
  { label: "写作中", value: "writing" },
  { label: "已生成", value: "generated" },
  { label: "待审核", value: "needs_review" },
  { label: "可推送", value: "ready_for_publish" },
  { label: "已推送草稿", value: "wechat_draft" },
  { label: "审核不通过", value: "review_rejected" },
  { label: "异常", value: "anomaly" },
  { label: "已中止", value: "stopped" },
  { label: "已失败", value: "failed" },
  { label: "已删除", value: "soft_deleted" },
];

// 文章详情全屏弹窗
const detailArticle = ref<CreativeFinishedArticle | null>(null);

// 素材详情弹窗
const sourceItemModalOpen = ref(false);
const sourceItemModalId = ref<number | null>(null);

// ─── 推送到草稿箱 ───

const pushConfirmVisible = ref(false);
const pushConfirmArticle = ref<CreativeFinishedArticle | null>(null);
// 推送浮窗实例引用，用于判断是否正在推送、切换文章时重置状态
const pushWidgetRef = ref<{ isPushing: boolean; resetState: () => void } | null>(null);
const wechatTheme = ref<WechatThemeId>("bauhaus");
const wechatMpAccounts = ref<WechatMpAccountSummary[]>([]);
const defaultAccountName = computed(() => {
  const def = wechatMpAccounts.value.find(a => a.isDefault && a.isEnabled);
  return def?.name ?? '';
});

// 推送前置条件检查：文章必须标题、封面图、正文齐全 + 处于可推送/已推送状态
function canPush(article: CreativeFinishedArticle | null): boolean {
  if (!article) return false;
  if (article.status !== 'ready_for_publish' && article.status !== 'wechat_draft') return false;
  return checkPublishConditions(article).qualified;
}

// 返回不满足推送条件的原因列表，用于 hover 提示
function getMissingConditions(article: CreativeFinishedArticle | null): string[] {
  if (!article) return ['文章不存在'];
  const missing: string[] = [];
  if (article.status !== 'ready_for_publish' && article.status !== 'wechat_draft') missing.push('状态不允许推送');
  missing.push(...checkPublishConditions(article).missing);
  return missing;
}

function openPushConfirm(article: CreativeFinishedArticle, themeId?: WechatThemeId): void {
  // 正在推送时禁止切换到新文章，避免并发推送和状态混乱
  if (pushWidgetRef.value?.isPushing) {
    message.warning("当前有正在推送的文章，请等待上一篇推送完成后再推送新文章");
    return;
  }
  wechatTheme.value = themeId ?? (article.wechatThemeId as WechatThemeId) ?? "bauhaus";
  pushConfirmArticle.value = article;
  pushConfirmVisible.value = true;
  // 浮窗已打开时切换文章：重置状态回确认态（visible 未变化不会触发组件内 watch）
  pushWidgetRef.value?.resetState();
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
      publishable: publishableOnly.value ? "1" : undefined,
      includeDeleted: showDeleted.value ? "1" : undefined
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
  saveFinishedFilters();
  void loadItems();
});

watch(showDeleted, () => {
  currentPage.value = 1;
  saveFinishedFilters();
  void loadItems();
});

// 审核通过：走转换 #4，标注来源为审核入口
async function handleApproveArticle(article: CreativeFinishedArticle): Promise<void> {
  try {
    const res = await editFinishedArticle(article.id, { status: "ready_for_publish", _source: "review" } as any);
    if (res.ok) {
      message.success("已通过审核");
      loadItems();
    }
  } catch {
    message.error("操作失败");
  }
}

// 标记可推送（转换 #1 / #6）
async function handleMarkPublishable(article: CreativeFinishedArticle): Promise<void> {
  const { Modal } = await import("ant-design-vue");
  const confirmed = await new Promise<boolean>(resolve => {
    Modal.confirm({
      title: "标记可推送",
      content: "确认标记该文章为可推送？后续可在平台手动推送到微信公众号草稿箱。",
      okText: "确认", cancelText: "取消",
      onOk: () => resolve(true), onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    const res = await editFinishedArticle(article.id, { status: "ready_for_publish" } as any);
    if (res.ok) {
      message.success("已标记为可推送");
      loadItems();
    } else {
      message.error("操作失败");
    }
  } catch (err: unknown) {
    const httpErr = err as { body?: { reason?: string } };
    message.error(httpErr?.body?.reason ?? "操作失败");
  }
}

// 取消推送标记（转换 #2）
async function handleCancelPublishable(article: CreativeFinishedArticle): Promise<void> {
  const { Modal } = await import("ant-design-vue");
  const confirmed = await new Promise<boolean>(resolve => {
    Modal.confirm({
      title: "取消推送标记",
      content: "确认取消推送标记？文章将回到已生成状态。",
      okText: "确认", cancelText: "取消",
      onOk: () => resolve(true), onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    const res = await editFinishedArticle(article.id, { status: "generated" } as any);
    if (res.ok) {
      message.success("已取消推送标记");
      loadItems();
    } else {
      message.error("操作失败");
    }
  } catch (err: unknown) {
    const httpErr = err as { body?: { reason?: string } };
    message.error(httpErr?.body?.reason ?? "操作失败");
  }
}

// 废弃文章（软删除）：留痕但不再生图和发布
async function handleDiscardArticle(article: CreativeFinishedArticle): Promise<void> {
  try {
    const res = await deleteFinishedArticle(article.id);
    if (res.ok) {
      message.success("已废弃，文章不再走自动生图和发布流程，但保留记录可随时恢复");
      loadItems();
    }
  } catch {
    message.error("废弃失败");
  }
}

// 恢复已废弃的文章
async function handleRestoreArticle(article: CreativeFinishedArticle): Promise<void> {
  try {
    const res = await restoreFinishedArticle(article.id);
    if (res.ok) {
      message.success("已恢复");
      loadItems();
    }
  } catch {
    message.error("恢复失败");
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
  sourceItemModalId.value = sourceItemId;
  sourceItemModalOpen.value = true;
}

function closeSourceItemModal(): void {
  sourceItemModalOpen.value = false;
  sourceItemModalId.value = null;
}

// 详情弹窗保存后刷新列表，同步更新 detailArticle 以反映 DB 最新数据
async function onDetailSaved(): Promise<void> {
  await loadItems();
  if (detailArticle.value) {
    const updated = items.value.find(a => a.id === detailArticle.value!.id);
    if (updated) detailArticle.value = updated;
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

/** 从 stepTrace 计算总写作耗时（ms），返回 null 表示无数据 */
function calcWritingDuration(stepTrace: Array<{ startedAt?: string; finishedAt?: string }> | null): number | null {
  if (!stepTrace || stepTrace.length === 0) return null;
  const withStarted = stepTrace.filter(s => s.startedAt);
  const withFinished = stepTrace.filter(s => s.finishedAt);
  if (withStarted.length === 0 || withFinished.length === 0) return null;
  const firstStart = new Date(withStarted[0].startedAt!).getTime();
  const lastFinish = new Date(withFinished[withFinished.length - 1].finishedAt!).getTime();
  if (Number.isNaN(firstStart) || Number.isNaN(lastFinish)) return null;
  return lastFinish - firstStart;
}

/** 格式化毫秒为人类可读耗时 */
function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  if (min < 60) return `${min}m${String(remainSec).padStart(2, "0")}s`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr}h${String(remainMin).padStart(2, "0")}m`;
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



// ─── 状态标签（统一由 articleStatusShared 管理） ───

// 状态标签渲染函数，直接转发到共享模块
function getStatusInfo(status: string): { label: string; color: string } {
  return getStatusLabel(status);
}

// ─── 表格列 ───

function copyId(id: number): void {
  navigator.clipboard.writeText(`【成品文章id: ${id}】`).then(() => {
    message.success("已复制");
  });
}

const columns = [
  { title: "ID", dataIndex: "id", key: "id", width: 60, fixed: "left" as const },
  { title: "标题", key: "title", width: 300 },
  { title: "封面图", key: "coverImage", width: 70, ellipsis: true },
  { title: "状态", key: "status", width: 100 },
  { title: "来源", key: "sourceName", width: 115 },
  { title: "爆文", key: "trend", width: 120, ellipsis: true },
  { title: "相似度", key: "similarity", width: 56, ellipsis: true },
  { title: "模式", key: "mode", width: 48, ellipsis: true },
  { title: "耗时/时间", key: "timeInfo", width: 130, ellipsis: true },
  { title: "操作", key: "actions", width: 60, fixed: "right" as const },
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
      <a-checkbox v-model:checked="showDeleted">显示已废弃</a-checkbox>
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
        :row-class-name="(record: CreativeFinishedArticle) => record.deletedAt ? 'discarded-row' : (record.status === 'needs_review' || record.status === 'ready_for_publish') ? 'review-highlight' : record.status === 'wechat_draft' ? 'completed-row' : ''"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <!-- ID 列：点击复制 -->
          <template v-if="column.key === 'id'">
            <span class="cursor-pointer text-editorial-link-active hover:underline" @click="copyId(record.id)"> {{ record.id }} </span>
          </template>
          <!-- 标题列：点击标题打开详情，点击素材链接打开来源素材弹窗，互不影响 -->
          <template v-if="column.key === 'title'">
            <span
              class="line-clamp-2 cursor-pointer text-[13px] leading-tight font-medium text-editorial-text-main transition-colors hover:text-editorial-link-active"
              @click="openDetail(record)"
            >
              {{ getFirstTitle(record.titles) }}
            </span>
            <a
              v-if="record.sourceItemId"
              class="mt-0.5 inline-block cursor-pointer text-[10px] text-editorial-link-active hover:underline"
              @click.prevent="openSourceItemModal(record.sourceItemId)"
            >素材 #{{ record.sourceItemId }}</a>
          </template>

          <!-- 封面图列 -->
          <template v-else-if="column.key === 'coverImage'">
            <div class="flex items-center gap-1">
              <a-tooltip v-if="record.coverImage && record.coverImage.length > 0" :title="record.coverImagePrompt ? `Prompt: ${record.coverImagePrompt}` : '无 Prompt'" placement="topLeft">
                <a-image
                  :src="record.coverImage[0]"
                  :width="44"
                  class="!rounded !border !border-editorial-border !object-contain"
                  style="max-height:44px;"
                />
              </a-tooltip>
              <span v-else class="text-xs text-editorial-text-muted">无</span>
            </div>
          </template>

          <!-- 状态列 -->
          <template v-else-if="column.key === 'status'">
            <div class="flex flex-col items-start gap-0.5 leading-tight">
              <a-tag
                :color="getStatusInfo(record.status).color"
                :class="['!m-0 !text-[11px] !py-0', record.status === 'soft_deleted' ? 'line-through' : '']"
              >{{ getStatusInfo(record.status).label }}</a-tag>
              <a-tag v-if="record.pushCount > 0" color="green" class="!m-0 !text-[11px] !py-0">{{ record.pushCount }}次</a-tag>
              <!-- 标记可推送 -->
              <button
                v-if="getAvailableActions(record).some(a => a.type === 'mark_publishable')"
                class="text-[10px] text-editorial-link-active hover:underline"
                @click="handleMarkPublishable(record)"
              >标记可推送</button>
              <!-- 不可推送（条件不满足，禁用态） -->
              <a-tooltip v-else-if="getAvailableActions(record).some(a => a.type === 'mark_publishable_disabled')" :title="getAvailableActions(record).find(a => a.type === 'mark_publishable_disabled')!.missing.join('、')" placement="topLeft">
                <span class="text-[10px] text-gray-400 cursor-not-allowed">不可推送</span>
              </a-tooltip>
              <!-- 取消推送标记 -->
              <button
                v-if="getAvailableActions(record).some(a => a.type === 'cancel_publishable')"
                class="text-[10px] text-editorial-text-muted hover:underline"
                @click="handleCancelPublishable(record)"
              >取消推送标记</button>
              <!-- 审核 -->
              <button
                v-if="getAvailableActions(record).some(a => a.type === 'review')"
                class="text-[10px] text-editorial-link-active hover:underline"
                @click="openDetail(record)"
              >去审核</button>
              <div v-if="record.status === 'needs_review' && record.anomalyReason" class="text-[10px] text-orange-600 line-clamp-1 max-w-[80px]">
                <a-tooltip :title="record.anomalyReason" placement="topLeft">{{ record.anomalyReason }}</a-tooltip>
              </div>
            </div>
          </template>

          <!-- 操作列：废弃/恢复 -->
          <template v-else-if="column.key === 'actions'">
            <a-button
              v-if="!record.deletedAt"
              size="small"
              danger
              ghost
              class="!text-[10px] !px-1.5 !py-0"
              @click="handleDiscardArticle(record)"
            >废弃</a-button>
            <a-button
              v-else
              size="small"
              type="link"
              class="!text-[10px] !px-1.5 !py-0"
              @click="handleRestoreArticle(record)"
            >恢复</a-button>
          </template>



          <!-- 来源列 -->
          <template v-else-if="column.key === 'sourceName'">
            <a-tooltip :title="(record.sourceName || '').replace('微信公众号', 'WX')" placement="topLeft" :mouse-enter-delay="0.3">
              <span class="line-clamp-3 text-[10px] leading-tight text-editorial-text-body">{{ (record.sourceName || "-").replace("微信公众号", "WX") }}</span>
            </a-tooltip>
          </template>

          <!-- 爆文列：分数 + 维度柱状图 两行紧凑展示 -->
          <template v-else-if="column.key === 'trend'">
            <div class="flex flex-col gap-0.5 leading-tight">
              <span v-if="record.trendScore != null" class="inline-flex items-center self-start rounded-editorial-pill border px-1.5 py-0 text-[10px] font-bold" :class="record.trendScore >= 90 ? 'border-purple-600 bg-purple-600 text-white shadow-sm' : record.trendScore >= 80 ? 'border-red-500 bg-red-500 text-white shadow-sm' : 'border-orange-300 bg-orange-50 text-orange-700'">{{ record.trendScore }}</span>
              <span v-else class="text-[10px] text-editorial-text-muted">未评分</span>
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

          <!-- 相似度列 -->
          <template v-else-if="column.key === 'similarity'">
            <template v-if="record.similarityCheck && (record.similarityCheck as any).literal_similarity != null">
              <a-tooltip placement="topLeft">
                <template #title>
                  <div class="text-xs leading-5">
                    <div>风险等级：{{ (record.similarityCheck as any).risk_level ?? '未知' }}</div>
                    <div>字面重复率：{{ Math.round((record.similarityCheck as any).literal_similarity * 100) }}%</div>
                    <template v-if="(record.similarityCheck as any).rule_based">
                      <div>结构相似度：{{ Math.round(((record.similarityCheck as any).rule_based.literal_structure_similarity ?? 0) * 100) }}%</div>
                      <div>最长重叠：{{ (record.similarityCheck as any).rule_based.max_continuous_overlap_chars ?? 0 }} 字</div>
                    </template>
                    <template v-if="(record.similarityCheck as any).llm_review?.status === 'success'">
                      <div>LLM 综合风险：{{ (record.similarityCheck as any).llm_review.overall_risk }}</div>
                      <div>建议操作：{{ (record.similarityCheck as any).llm_review.suggested_action }}</div>
                    </template>
                    <div v-if="(record.similarityCheck as any).llm_review?.status === 'failed'">LLM 审查失败</div>
                  </div>
                </template>
                <span
                  class="inline-flex items-center rounded-editorial-pill border px-2 py-0.5 text-[11px] font-bold"
                  :class="(record.similarityCheck as any).risk_level === 'high' ? 'border-red-500 bg-red-500 text-white' : (record.similarityCheck as any).risk_level === 'medium' ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-green-500 bg-green-50 text-green-700'"
                >{{ Math.round((record.similarityCheck as any).literal_similarity * 100) }}%</span>
              </a-tooltip>
            </template>
            <span v-else class="text-xs text-editorial-text-muted">未检测</span>
          </template>

          <!-- 模式列 -->
          <template v-else-if="column.key === 'mode'">
            <span class="text-xs text-editorial-text-body">{{ record.mode || "-" }}</span>
          </template>

          <!-- 耗时/时间列：写作耗时 + 发布时间 + 创建时间 三行紧凑展示 -->
          <template v-else-if="column.key === 'timeInfo'">
            <div class="flex flex-col gap-0 leading-tight">
              <span class="text-[10px] text-editorial-text-body">耗时 {{ formatDuration(calcWritingDuration(record.stepTrace)) }}</span>
              <span class="text-[10px] text-editorial-text-muted">发 {{ formatLocalTime(record.publishedAt) }}</span>
              <span class="text-[10px] text-editorial-text-muted">建 {{ formatLocalTime(record.createdAt) }}</span>
            </div>
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
    <SourceItemDetailModal v-model:visible="sourceItemModalOpen" :source-item-id="sourceItemModalId" />

    <!-- 推送悬浮组件（teleport 到 body，避免被 modal 层叠上下文遮挡） -->
    <Teleport to="body">
      <ArticlePushFloatWidget
        ref="pushWidgetRef"
        v-model:visible="pushConfirmVisible"
        :article="pushConfirmArticle"
        :theme-id="wechatTheme"
        :theme-label="wechatThemeOptions.find(o => o.value === wechatTheme)?.label ?? ''"
        :default-account-name="defaultAccountName"
        @success="handlePushSuccess"
      />
    </Teleport>
  </div>
</template>

<style>
/* needs_review 行高亮 */
.review-highlight td {
  background-color: #fffbe6 !important;
}
/* 固定列 cell 自带白底，高亮行里要跟随行背景，避免横向滚动时出现白底割裂 */
.review-highlight .ant-table-cell-fix-left,
.review-highlight .ant-table-cell-fix-right {
  background-color: #fffbe6 !important;
}
/* 已推送草稿箱行弱化：文章周期已结束，极浅绿色表示正常完成 */
.completed-row td {
  background-color: #f6fbed !important;
}
.completed-row .ant-table-cell-fix-left,
.completed-row .ant-table-cell-fix-right {
  background-color: #f6fbed !important;
}
/* 已废弃行置灰（优先级最高，覆盖 review-highlight 等） */
.discarded-row td {
  background-color: #f0f0f0 !important;
  opacity: 0.45;
}
.discarded-row .ant-table-cell-fix-left,
.discarded-row .ant-table-cell-fix-right {
  background-color: #f0f0f0 !important;
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
</style>
