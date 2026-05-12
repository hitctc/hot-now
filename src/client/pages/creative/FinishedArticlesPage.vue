<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { useRoute } from "vue-router";

import {
  editFinishedArticle,
  readCreativeFinishedArticles,
  type CreativeFinishedArticle
} from "../../services/creativeApi.js";

const route = useRoute();

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

// 筛选条件
const searchText = ref("");

// 文章详情全屏弹窗
const detailArticle = ref<CreativeFinishedArticle | null>(null);

// 编辑弹窗
const editModalOpen = ref(false);
const editPending = ref(false);
const editForm = ref<{ id: number; contentMarkdown: string; thesis: string; summary100: string }>({
  id: 0,
  contentMarkdown: "",
  thesis: "",
  summary100: ""
});

// ─── 数据加载 ───

async function loadItems(): Promise<void> {
  isLoading.value = true;
  try {
    const res = await readCreativeFinishedArticles({
      page: currentPage.value,
      pageSize: pageSize.value,
      search: searchText.value || undefined
    });
    items.value = res.items;
    total.value = res.total;

    // 处理 ?expand=文章ID query param，自动打开详情弹窗
    const expandId = route.query.expand;
    if (expandId) {
      const id = Number(expandId);
      const found = res.items.find(item => item.id === id);
      if (found) detailArticle.value = found;
      history.replaceState(null, "", location.pathname);
    }
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void loadItems();
});

function handleSearch(value: string): void {
  searchText.value = value;
  currentPage.value = 1;
  void loadItems();
}

function handleTableChange(pagination: { current?: number; pageSize?: number }): void {
  if (pagination.current) currentPage.value = pagination.current;
  if (pagination.pageSize) pageSize.value = pagination.pageSize;
  void loadItems();
}

// ─── 详情弹窗 ───

function openDetail(article: CreativeFinishedArticle): void {
  detailArticle.value = article;
}

function closeDetail(): void {
  detailArticle.value = null;
}

function goToSourceItem(sourceItemId: number): void {
  window.open(`/creative/source-items?expand=${sourceItemId}`, "_blank");
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

function formatCreatedAt(value: string): string {
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

function getFirstTitle(titles: string | null): string {
  const parsed = parseJsonArray(titles);
  return parsed.length > 0 ? parsed[0] : "无标题";
}

// ─── 纯文本复制 ───

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  message.success("已复制到剪贴板");
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
  { title: "标题", key: "title", ellipsis: true },
  { title: "来源素材", key: "sourceItem", width: 110 },
  { title: "传播趋势", key: "trend", width: 130 },
  { title: "模式", key: "mode", width: 72 },
  { title: "创建时间", key: "createdAt", width: 140 }
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
  <div class="flex w-full flex-col gap-5" data-page="creative-finished-articles">
    <!-- 筛选栏 -->
    <div class="flex flex-wrap items-center gap-3">
      <a-input-search
        placeholder="搜索标题"
        class="!w-[240px]"
        allow-clear
        @search="handleSearch"
      />
    </div>

    <!-- 表格 -->
    <a-spin :spinning="isLoading">
      <a-table
        :columns="columns"
        :data-source="items"
        :pagination="pagination"
        :scroll="{ x: 800 }"
        row-key="id"
        data-article-table
        size="middle"
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

          <!-- 来源素材列 -->
          <template v-else-if="column.key === 'sourceItem'">
            <a
              class="cursor-pointer text-xs text-editorial-link-active hover:underline"
              @click.prevent="goToSourceItem(record.sourceItemId)"
            >素材 #{{ record.sourceItemId }}</a>
          </template>

          <!-- 传播趋势列 -->
          <template v-else-if="column.key === 'trend'">
            <template v-if="record.trendScore != null">
              <a-tooltip :mouse-enter-delay="0.3">
                <template #title>
                  <div class="text-xs leading-5">
                    话题{{ record.trendBreakdown?.topicPower ?? '-' }} | 情绪{{ record.trendBreakdown?.emotionResonance ?? '-' }} | 信息差{{ record.trendBreakdown?.infoGap ?? '-' }} | 社交{{ record.trendBreakdown?.socialCurrency ?? '-' }} | 时效{{ record.trendBreakdown?.timingWindow ?? '-' }} | 受众{{ record.trendBreakdown?.audienceBreadth ?? '-' }}
                  </div>
                </template>
                <span class="inline-flex items-center rounded-editorial-pill border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                  {{ record.trendScore }}
                </span>
              </a-tooltip>
            </template>
            <span v-else class="text-xs text-editorial-text-muted">未评分</span>
          </template>

          <!-- 模式列 -->
          <template v-else-if="column.key === 'mode'">
            <span class="text-xs text-editorial-text-body">{{ record.mode || "-" }}</span>
          </template>

          <!-- 创建时间列 -->
          <template v-else-if="column.key === 'createdAt'">
            <span class="text-xs text-editorial-text-muted">{{ formatCreatedAt(record.createdAt) }}</span>
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
            <span class="text-xs text-editorial-text-muted">{{ formatCreatedAt(detailArticle.createdAt) }}</span>
            <a
              class="cursor-pointer text-xs text-editorial-link-active hover:underline"
              @click.prevent="goToSourceItem(detailArticle.sourceItemId); closeDetail()"
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

          <!-- 正文 -->
          <section v-if="detailArticle.contentMarkdown">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文</h3>
              <div class="flex gap-2">
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(detailArticle.contentMarkdown)">复制原文</a-button>
                <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyMarkdownAsPlainText(detailArticle.contentMarkdown)">复制纯文本</a-button>
              </div>
            </div>
            <div class="whitespace-pre-wrap rounded-editorial-md border border-editorial-border bg-editorial-panel/30 px-4 py-3 text-sm leading-7 text-editorial-text-body">
              {{ detailArticle.contentMarkdown }}
            </div>
          </section>

          <!-- 图片列表 -->
          <section v-if="parseJsonArray(detailArticle.imagesJson).length > 0">
            <h3 class="m-0 mb-2 text-sm font-semibold text-editorial-text-muted">图片列表</h3>
            <ul class="m-0 list-inside list-disc pl-1">
              <li v-for="(img, idx) in parseJsonArray(detailArticle.imagesJson)" :key="idx" class="truncate text-xs leading-5 text-editorial-text-muted">{{ img }}</li>
            </ul>
          </section>

          <!-- 编辑按钮：悬浮固定右下角 -->
          <a-button
            type="primary"
            class="!fixed !bottom-6 !right-6 !z-50 !shadow-lg"
            @click="openEditModal(detailArticle)"
          >编辑内容</a-button>
        </div>
      </template>
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
}
.article-detail-fullscreen .ant-modal-content {
  background: #ffffff !important;
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-radius: 0 !important;
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
</style>