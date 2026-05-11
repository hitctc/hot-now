<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import {
  readCreativeSourceItems,
  updateSourceItemQualityStatus,
  type CreativeSourceItem
} from "../../services/creativeApi.js";

const router = useRouter();

// ─── 状态 ───

const isLoading = ref(false);
const items = ref<CreativeSourceItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

// 筛选条件
const qualityStatusFilter = ref<string | undefined>(undefined);
const searchText = ref("");

// 操作锁
const actionPendingId = ref<number | null>(null);

// 手动控制展开行
const expandedRowKeys = ref<number[]>([]);

const qualityStatusOptions = [
  { label: "全部", value: "" },
  { label: "待审", value: "pending" },
  { label: "已采纳", value: "accepted" },
  { label: "已拒绝", value: "rejected" }
];

// ─── 数据加载 ───

async function loadItems(): Promise<void> {
  isLoading.value = true;
  try {
    const res = await readCreativeSourceItems({
      page: currentPage.value,
      pageSize: pageSize.value,
      qualityStatus: qualityStatusFilter.value || undefined,
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

watch(qualityStatusFilter, () => {
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

// ─── 展开控制 ───

function toggleExpand(id: number): void {
  const idx = expandedRowKeys.value.indexOf(id);
  if (idx >= 0) {
    expandedRowKeys.value.splice(idx, 1);
  } else {
    expandedRowKeys.value.push(id);
  }
}

function goToFinishedArticle(articleId: number): void {
  router.push({ path: "/creative/finished-articles", query: { expand: String(articleId) } });
}

// ─── 质量状态操作 ───

async function handleQualityAction(
  item: CreativeSourceItem,
  nextStatus: "accepted" | "rejected"
): Promise<void> {
  actionPendingId.value = item.id;
  try {
    await updateSourceItemQualityStatus(item.id, nextStatus);
    item.qualityStatus = nextStatus;
  } finally {
    actionPendingId.value = null;
  }
}

// ─── 格式化辅助 ───

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

function qualityStatusColor(status: string): string {
  switch (status) {
    case "accepted":
      return "green";
    case "rejected":
      return "red";
    default:
      return "blue";
  }
}

function qualityStatusLabel(status: string): string {
  switch (status) {
    case "accepted":
      return "已采纳";
    case "rejected":
      return "已拒绝";
    default:
      return "待审";
  }
}

// ─── 表格列 ───

const columns = [
  { title: "标题", dataIndex: "title", key: "title", ellipsis: true },
  { title: "成品", key: "linkedArticle", width: 80 },
  { title: "来源", dataIndex: "sourceName", key: "sourceName", width: 120 },
  { title: "评分", dataIndex: "score", key: "score", width: 72 },
  { title: "Agent", dataIndex: "collectorAgent", key: "collectorAgent", width: 110 },
  { title: "发布时间", dataIndex: "publishedAt", key: "publishedAt", width: 120 },
  { title: "状态", dataIndex: "qualityStatus", key: "qualityStatus", width: 80 }
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
  <div class="flex w-full flex-col gap-5" data-page="creative-source-items">
    <!-- 筛选栏 -->
    <div class="flex flex-wrap items-center gap-3">
      <a-select
        v-model:value="qualityStatusFilter"
        :options="qualityStatusOptions"
        placeholder="质量状态"
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
        :scroll="{ x: 900 }"
        :expanded-row-keys="expandedRowKeys"
        row-key="id"
        data-source-item-table
        size="middle"
        @change="handleTableChange"
        @expand="(expanded: boolean, record: CreativeSourceItem) => toggleExpand(record.id)"
      >
        <!-- 标题列：点击展开/折叠 -->
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <span
              class="cursor-pointer font-medium text-editorial-text-main hover:text-editorial-link-active"
              @click="toggleExpand(record.id)"
            >
              {{ record.title }}
            </span>
          </template>

          <!-- 成品列：直接显示关联链接 -->
          <template v-else-if="column.key === 'linkedArticle'">
            <a
              v-if="record.linkedArticleId != null"
              class="cursor-pointer text-xs font-medium text-editorial-link-active hover:underline"
              @click.prevent="goToFinishedArticle(record.linkedArticleId)"
            >
              #{{ record.linkedArticleId }}
            </a>
            <span v-else class="text-xs text-editorial-text-muted">-</span>
          </template>

          <!-- 来源列 -->
          <template v-else-if="column.key === 'sourceName'">
            <span class="text-editorial-text-body">{{ record.sourceName || "-" }}</span>
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

          <!-- Agent 列 -->
          <template v-else-if="column.key === 'collectorAgent'">
            <span class="text-xs text-editorial-text-body">{{ record.collectorAgent }}</span>
          </template>

          <!-- 发布时间列 -->
          <template v-else-if="column.key === 'publishedAt'">
            <span class="text-xs text-editorial-text-muted">{{ formatPublishedAt(record.publishedAt) }}</span>
          </template>

          <!-- 质量状态列 -->
          <template v-else-if="column.key === 'qualityStatus'">
            <a-tag :color="qualityStatusColor(record.qualityStatus)">
              {{ qualityStatusLabel(record.qualityStatus) }}
            </a-tag>
          </template>
        </template>

        <!-- 展开行 -->
        <template #expandedRowRender="{ record }">
          <div class="flex flex-col gap-4 rounded-editorial-md border border-editorial-border bg-editorial-panel/60 p-4">
            <!-- 关联成品（最前面） -->
            <div v-if="record.linkedArticleId != null" class="flex items-center gap-2 rounded-editorial-md bg-editorial-link-active/30 px-3 py-2">
              <span class="text-xs font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">关联成品</span>
              <a
                class="cursor-pointer text-sm font-medium text-editorial-link-active hover:underline"
                @click.prevent="goToFinishedArticle(record.linkedArticleId!)"
              >
                成品文章 #{{ record.linkedArticleId }}
              </a>
            </div>

            <!-- 摘要 -->
            <div v-if="record.summary">
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">摘要</p>
              <p class="m-0 text-sm leading-6 text-editorial-text-body">{{ record.summary }}</p>
            </div>

            <!-- 原文内容 -->
            <div>
              <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">原文内容</p>
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

            <!-- 质量操作 -->
            <div class="flex items-center gap-3 border-t border-editorial-border pt-3">
              <span class="text-xs font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">质量判定：</span>
              <a-button
                size="small"
                type="primary"
                :disabled="record.qualityStatus === 'accepted' || actionPendingId === record.id"
                :loading="actionPendingId === record.id"
                @click="handleQualityAction(record, 'accepted')"
              >
                采纳
              </a-button>
              <a-button
                size="small"
                danger
                :disabled="record.qualityStatus === 'rejected' || actionPendingId === record.id"
                :loading="actionPendingId === record.id"
                @click="handleQualityAction(record, 'rejected')"
              >
                拒绝
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
  </div>
</template>
