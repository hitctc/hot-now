<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { message } from "ant-design-vue";

import { HttpError } from "../../services/http.js";
import { useSearchHistory } from "../../composables/useSearchHistory.js";
import ArticleDetailDrawer from "../../components/creative/LazyArticleDetailDrawer.vue";
import SourceItemsFilterBar from "../../components/creative/source-items/SourceItemsFilterBar.vue";
import SourceItemsTable from "../../components/creative/source-items/SourceItemsTable.vue";
import { useSourceItemsQuery } from "../../components/creative/source-items/useSourceItemsQuery.js";

import {
  readCreativeSourceItem,
  readCreativeFinishedArticle,
  updateSourceItemWritingStatus,
  writeSourceItemShort,
  submitManualWrite,
  traceSourceItem,
  type CreativeSourceItem,
  type CreativeFinishedArticle,
} from "../../services/creativeApi.js";

// ─── 状态 ───

const SOURCE_FILTERS_KEY = "creative-short-source-filters";
const actionPendingId = ref<number | null>(null);
const detailArticle = ref<CreativeFinishedArticle | null>(null);

const writingStatusOptions = [
  { label: "全部", value: "" },
  { label: "待写作", value: "ready" },
  { label: "不写作", value: "excluded" },
  { label: "写作中", value: "writing" },
  { label: "已写作", value: "done" },
  { label: "跳过不写", value: "skipped" }
];

const { history: searchHistory, addToHistory, removeFromHistory } = useSearchHistory("creative-short-source-search-history");
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

// ─── 素材库写短内容（支持多篇并行） ───
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
const writeModeThesis = ref("");
const writeModeConfirming = ref(false);

// ─── 手动写作弹窗 ───
const manualWriteVisible = ref(false);
const manualWriteSubmitting = ref(false);
const manualContentType = ref<"viewpoint" | "article">("viewpoint");
const manualTitle = ref("");
const manualContent = ref("");
const manualThesis = ref("");

const contentTypeOptions = [
  { value: "viewpoint" as const, label: "观点/想法", desc: "简短观点，几句话到一段话" },
  { value: "article" as const, label: "素材/文章", desc: "较长的原文或素材内容" },
];

/** 打开统一短写弹窗并清除上轮输入；素材类型不决定正文或图片规格。 */
function openManualWriteModal(): void {
  manualContentType.value = "viewpoint";
  manualTitle.value = "";
  manualContent.value = "";
  manualThesis.value = "";
  manualWriteVisible.value = true;
}

/** 将当前输入创建为短素材并提交 Hermes 短写队列；成功后刷新列表，不生成长文成品。 */
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
      direction: "short_content",
      form: "auto",
      thesis: manualThesis.value.trim() || undefined,
    });
    if (result.ok && result.sourceItemId) {
      message.success(`短内容写作已进入队列（素材#${result.sourceItemId}）`);
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

/** 打开指定素材的写作确认框；不再选择旧文体，不改变素材或自动许可。 */
function openWriteModeModal(item: CreativeSourceItem): void {
  writeModeTarget.value = item;
  writeModeThesis.value = "";
  writeModeVisible.value = true;
}

function cancelWriteMode(): void {
  writeModeVisible.value = false;
  writeModeTarget.value = null;
  writeModeConfirming.value = false;
  writeModeThesis.value = "";
}

// 写作任务只观察，不把排队时间算作模型超时。
let writingPollTimer: ReturnType<typeof setInterval> | null = null;
const writingTimers = new Set<number>();

/** 观察原素材的写作终态；离开页面停止查询，重开由素材状态恢复，不重新提交。 */
function startWritingPoll(item: CreativeSourceItem): void {
  writingTimers.add(item.id);
  if (writingPollTimer) return; // 已有全局轮询在跑

  writingPollTimer = setInterval(async () => {
    if (writingTimers.size === 0) { stopWritingPoll(); return; }
    const checkIds = [...writingTimers];
    for (const itemId of checkIds) {
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
        } else if (updated.writingStatus === "ready" || updated.writingStatus === "skipped") {
          // 取消会把素材恢复 ready；停止观察，不能无限显示写作中。
          writingTimers.delete(itemId);
          removeWritingId(itemId);
          message.info(`素材#${itemId} 任务已停止，可在队列查看保留结果`);
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

const sourceQuery = useSourceItemsQuery({
  direction: "short_content",
  storageKey: SOURCE_FILTERS_KEY,
  writingIds,
  setWritingIds,
  startWritingPoll,
});
const {
  isLoading,
  items,
  total,
  currentPage,
  pageSize,
  writingStatusFilter,
  sourceNameFilter,
  writableOnly,
  searchText,
  minTrendScore,
  expandedRowKeys,
  loadItems,
  saveSourceFilters,
  applyTrendScoreFilter,
  handleTableChange,
  toggleExpand,
  clearFilters,
} = sourceQuery;

const hasActiveFilters = computed(() => Boolean(
  writingStatusFilter.value
  || sourceNameFilter.value.trim()
  || searchText.value.trim()
  || minTrendScore.value != null
  || writableOnly.value,
));

// 搜索历史由页面保留，查询参数和网络请求由共享 composable 负责。
function handleSearch(value: string): void {
  sourceQuery.handleSearch(value, addToHistory);
}

/** 将指定素材提交统一短写队列；只观察原编号，不把受理误报为写作完成。 */
async function confirmWriteMode(): Promise<void> {
  const item = writeModeTarget.value;
  if (!item) return;
  writeModeConfirming.value = true;
  try {
    const result = await writeSourceItemShort(item.id, item.externalId ?? "", "auto");
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
    <SourceItemsFilterBar
      mode="short_content"
      :writing-status-filter="writingStatusFilter"
      :writing-status-options="writingStatusOptions"
      :source-name-filter="sourceNameFilter"
      :writable-only="writableOnly"
      :min-trend-score="minTrendScore"
      :search-text="searchText"
      :search-history="searchHistory"
      :is-loading="isLoading"
      :has-active-filters="hasActiveFilters"
      @update:writing-status-filter="writingStatusFilter = $event"
      @update:source-name-filter="sourceNameFilter = $event"
      @update:writable-only="writableOnly = $event"
      @update:min-trend-score="minTrendScore = $event"
      @update:search-text="searchText = $event"
      @search="handleSearch"
      @apply-source-name="sourceQuery.applySourceNameFilter"
      @apply-trend-score="applyTrendScoreFilter"
      @remove-history="removeFromHistory"
      @manual-write="openManualWriteModal"
      @refresh="loadItems"
      @clear-filters="clearFilters"
    />

    <!-- 素材表格：表格、展开区和展示事件由共享组件负责。 -->
    <SourceItemsTable
      mode="short_content"
      :is-loading="isLoading"
      :items="items"
      :pagination="pagination"
      :expanded-row-keys="expandedRowKeys"
      :writing-ids="writingIds"
      :tracing-ids="tracingIds"
      :action-pending-id="actionPendingId"
      @table-change="handleTableChange"
      @toggle-expand="toggleExpand"
      @open-article="openArticleModal"
      @write="openWriteModeModal"
      @trace="handleTrace"
      @writing-action="handleWritingAction"
    />

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
      title="确认短内容写作"
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
      <p class="text-sm text-editorial-text-muted">讲清事件事实，再给出有依据的判断；篇幅按素材复杂度调整，图片由独立资产流程处理。</p>
    </a-modal>

    <!-- 手动写作弹窗 -->
    <a-modal
      :open="manualWriteVisible"
      title="自定义内容写短内容"
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

        <p class="text-xs text-editorial-text-muted">统一按事实复盘与有依据的判断生成短内容，图片不决定写作类型。</p>

        <!-- 核心立意 -->
        <div>
          <div class="mb-1 text-xs font-medium text-editorial-text-muted">核心立意（可选）</div>
          <a-input
            v-model:value="manualThesis"
            placeholder="可选：指定文章的核心观点/立意"
            allow-clear
          />
          <div class="mt-0.5 text-[10px] text-editorial-text-muted">作为短内容的写作方向参考，终稿仍需经过质检与审改</div>
        </div>
      </div>
    </a-modal>
  </div>
</template>
