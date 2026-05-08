<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { message } from "ant-design-vue";

import {
  editFinishedArticle,
  readCreativeFinishedArticles,
  updateFinishedArticleStatus,
  type CreativeFinishedArticle
} from "../../services/creativeApi.js";

// ─── JSON 解析辅助 ───

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
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
const pageSize = ref(20);

// 筛选条件
const statusFilter = ref<string | undefined>(undefined);
const searchText = ref("");

// 操作锁
const actionPendingId = ref<number | null>(null);

// 编辑弹窗
const editModalOpen = ref(false);
const editPending = ref(false);
const editForm = ref<{ id: number; contentMarkdown: string; thesis: string; summary100: string }>({
  id: 0,
  contentMarkdown: "",
  thesis: "",
  summary100: ""
});

// 正文展开状态
const expandedContentIds = ref<Set<number>>(new Set());

const statusOptions = [
  { label: "全部", value: "" },
  { label: "已生成", value: "generated" },
  { label: "已编辑", value: "edited" },
  { label: "已通过", value: "approved" },
  { label: "已发布", value: "published" },
  { label: "已拒绝", value: "rejected" },
  { label: "已完成", value: "completed" }
];

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

// ─── 状态操作 ───

async function handleStatusAction(article: CreativeFinishedArticle, nextStatus: string): Promise<void> {
  actionPendingId.value = article.id;
  try {
    await updateFinishedArticleStatus(article.id, nextStatus);
    article.status = nextStatus;
  } finally {
    actionPendingId.value = null;
  }
}

function getStatusActions(status: string): { label: string; nextStatus: string; danger?: boolean }[] {
  switch (status) {
    case "generated":
      return [
        { label: "编辑", nextStatus: "edited" },
        { label: "拒绝", nextStatus: "rejected", danger: true }
      ];
    case "edited":
      return [
        { label: "通过", nextStatus: "approved" },
        { label: "拒绝", nextStatus: "rejected", danger: true }
      ];
    case "approved":
      return [
        { label: "发布", nextStatus: "published" },
        { label: "拒绝", nextStatus: "rejected", danger: true }
      ];
    case "published":
      return [{ label: "完成", nextStatus: "completed" }];
    case "rejected":
      return [{ label: "重新编辑", nextStatus: "edited" }];
    default:
      return [];
  }
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
    editModalOpen.value = false;
    await loadItems();
  } finally {
    editPending.value = false;
  }
}

// ─── 正文展开/折叠 ───

function toggleContentExpand(id: number): void {
  const s = new Set(expandedContentIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expandedContentIds.value = s;
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

function statusColor(status: string): string {
  switch (status) {
    case "generated":
      return "blue";
    case "edited":
      return "cyan";
    case "approved":
      return "green";
    case "published":
      return "orange";
    case "rejected":
      return "red";
    case "completed":
      return "purple";
    default:
      return "default";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "generated":
      return "已生成";
    case "edited":
      return "已编辑";
    case "approved":
      return "已通过";
    case "published":
      return "已发布";
    case "rejected":
      return "已拒绝";
    case "completed":
      return "已完成";
    default:
      return status;
  }
}

function getFirstTitle(titles: string | null): string {
  const parsed = parseJsonArray(titles);
  return parsed.length > 0 ? parsed[0] : "无标题";
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

// ─── 纯文本复制 ───

function markdownToPlainText(md: string): string {
  return md
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
}

async function copyPlainText(contentMarkdown: string): Promise<void> {
  const text = markdownToPlainText(contentMarkdown);
  await navigator.clipboard.writeText(text);
  message.success("已复制纯文本到剪贴板");
}

// ─── 表格列 ───

const columns = [
  { title: "标题", key: "title", ellipsis: true },
  { title: "来源素材", key: "sourceItem", width: 110 },
  { title: "模式", key: "mode", width: 72 },
  { title: "状态", key: "status", width: 90 },
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
      <a-select
        v-model:value="statusFilter"
        :options="statusOptions"
        placeholder="文章状态"
        class="!w-[140px]"
      />
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
          <!-- 标题列 -->
          <template v-if="column.key === 'title'">
            <span class="font-medium text-editorial-text-main">{{ getFirstTitle(record.titles) }}</span>
          </template>

          <!-- 来源素材列 -->
          <template v-else-if="column.key === 'sourceItem'">
            <span class="text-xs text-editorial-text-body">素材 #{{ record.sourceItemId }}</span>
          </template>

          <!-- 模式列 -->
          <template v-else-if="column.key === 'mode'">
            <span class="text-xs text-editorial-text-body">{{ record.mode || "-" }}</span>
          </template>

          <!-- 状态列 -->
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">
              {{ statusLabel(record.status) }}
            </a-tag>
          </template>

          <!-- 创建时间列 -->
          <template v-else-if="column.key === 'createdAt'">
            <span class="text-xs text-editorial-text-muted">{{ formatCreatedAt(record.createdAt) }}</span>
          </template>
        </template>

        <!-- 展开行 -->
        <template #expandedRowRender="{ record }">
          <div class="flex flex-col gap-4 rounded-editorial-md border border-editorial-border bg-editorial-panel/60 p-4">
            <!-- 核心立意 -->
            <div v-if="record.thesis">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">核心立意</p>
              <p class="m-0 text-sm leading-6 text-editorial-text-body">{{ record.thesis }}</p>
            </div>

            <!-- 正文预览 -->
            <div v-if="record.contentMarkdown">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">正文</p>
              <div class="text-sm leading-6 text-editorial-text-body whitespace-pre-wrap">
                {{ expandedContentIds.has(record.id) ? record.contentMarkdown : truncateText(record.contentMarkdown, 300) }}
              </div>
              <a-button
                v-if="record.contentMarkdown.length > 300"
                type="link"
                size="small"
                class="!p-0 mt-1"
                @click="toggleContentExpand(record.id)"
              >
                {{ expandedContentIds.has(record.id) ? "收起" : "查看完整" }}
              </a-button>
            </div>

            <!-- 百字摘要 -->
            <div v-if="record.summary100">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">百字摘要</p>
              <p class="m-0 text-sm leading-6 text-editorial-text-body">{{ record.summary100 }}</p>
            </div>

            <!-- 备选标题 -->
            <div v-if="parseJsonArray(record.titles).length > 0">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">备选标题</p>
              <ul class="m-0 list-inside list-disc pl-1">
                <li v-for="(t, idx) in parseJsonArray(record.titles)" :key="idx" class="text-sm leading-6 text-editorial-text-body">
                  {{ t }}
                </li>
              </ul>
            </div>

            <!-- 开头钩子 -->
            <div v-if="parseJsonArray(record.hooks).length > 0">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">开头钩子</p>
              <ul class="m-0 list-inside list-disc pl-1">
                <li v-for="(h, idx) in parseJsonArray(record.hooks)" :key="idx" class="text-sm leading-6 text-editorial-text-body">
                  {{ h }}
                </li>
              </ul>
            </div>

            <!-- 可摘句 -->
            <div v-if="parseJsonArray(record.quotes).length > 0">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">可摘句</p>
              <ul class="m-0 list-inside list-disc pl-1">
                <li v-for="(q, idx) in parseJsonArray(record.quotes)" :key="idx" class="text-sm leading-6 text-editorial-text-body">
                  {{ q }}
                </li>
              </ul>
            </div>

            <!-- 图片列表 -->
            <div v-if="parseJsonArray(record.imagesJson).length > 0">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">图片列表</p>
              <ul class="m-0 list-inside list-disc pl-1">
                <li v-for="(img, idx) in parseJsonArray(record.imagesJson)" :key="idx" class="truncate text-xs leading-5 text-editorial-text-muted">
                  {{ img }}
                </li>
              </ul>
            </div>

            <!-- 操作区 -->
            <div class="flex flex-wrap items-center gap-3 border-t border-editorial-border pt-3">
              <!-- 状态流转按钮 -->
              <template v-if="getStatusActions(record.status).length > 0">
                <span class="text-xs font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">状态操作：</span>
                <a-button
                  v-for="action in getStatusActions(record.status)"
                  :key="action.nextStatus"
                  size="small"
                  :type="action.danger ? 'default' : 'primary'"
                  :danger="action.danger"
                  :disabled="actionPendingId === record.id"
                  :loading="actionPendingId === record.id"
                  @click="handleStatusAction(record, action.nextStatus)"
                >
                  {{ action.label }}
                </a-button>
              </template>
              <template v-else>
                <span class="text-xs font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">状态操作：</span>
                <span class="text-xs text-editorial-text-muted">无可用操作</span>
              </template>

              <!-- 编辑按钮 -->
              <a-button
                size="small"
                class="ml-auto"
                @click="openEditModal(record)"
              >
                编辑内容
              </a-button>

              <!-- 复制纯文本按钮 -->
              <a-button
                v-if="record.contentMarkdown"
                size="small"
                @click="copyPlainText(record.contentMarkdown)"
              >
                复制纯文本
              </a-button>
            </div>
          </div>
        </template>
      </a-table>
    </a-spin>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editModalOpen"
      title="编辑成品文章"
      :confirm-loading="editPending"
      @ok="handleEditSubmit"
    >
      <a-form layout="vertical" class="mt-4">
        <a-form-item label="核心立意">
          <a-input v-model:value="editForm.thesis" placeholder="核心立意" />
        </a-form-item>
        <a-form-item label="百字摘要">
          <a-textarea v-model:value="editForm.summary100" :rows="3" placeholder="百字摘要" />
        </a-form-item>
        <a-form-item label="正文 Markdown">
          <a-textarea v-model:value="editForm.contentMarkdown" :rows="10" placeholder="正文内容" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>
