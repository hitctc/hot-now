<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message, Modal } from "ant-design-vue";
import type { TableProps } from "ant-design-vue";

import DailyDigestDetailDrawer from "../../components/creative/DailyDigestDetailDrawer.vue";
import {
  readDailyDigests,
  triggerGenerateDigest,
  type DailyDigestListItem,
  type DailyDigestRecord,
  type DailyDigestStatus,
} from "../../services/dailyDigestApi.js";

// ── 状态 ──

const isLoading = ref(false);
const items = ref<DailyDigestListItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const statusFilter = ref<string | undefined>(undefined);

const generating = ref(false);

// 详情弹窗
const detailOpen = ref(false);
const detailDigest = ref<DailyDigestRecord | null>(null);
const detailLoading = ref(false);

// ── 状态映射 ──

const statusLabelMap: Record<DailyDigestStatus, string> = {
  generated: "已生成",
  publishing: "推送中",
  published: "已推送",
  failed: "推送失败",
};

const statusColorMap: Record<DailyDigestStatus, string> = {
  generated: "blue",
  publishing: "orange",
  published: "green",
  failed: "red",
};

// ── 数据加载 ──

async function loadItems(): Promise<void> {
  isLoading.value = true;
  try {
    const res = await readDailyDigests({
      page: currentPage.value,
      pageSize: pageSize.value,
      status: statusFilter.value || undefined,
    });
    items.value = res.items;
    total.value = res.total;
  } catch (err) {
    message.error("加载日报列表失败");
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadItems);

// ── 生成日报 ──

function handleGenerate(): void {
  Modal.confirm({
    title: "生成日报",
    content: "确认触发 Hermes 生成日报？生成过程可能需要 1-2 分钟。",
    okText: "确认生成",
    cancelText: "取消",
    onOk: async () => {
      generating.value = true;
      try {
        const result = await triggerGenerateDigest();
        if (result.ok) {
          message.success(result.detail ?? "生成请求已发送，请稍后刷新查看");
          // 延迟刷新，给 Hermes 时间推送
          setTimeout(loadItems, 5000);
        } else {
          message.error(result.reason ?? "生成失败");
        }
      } catch (err) {
        message.error("生成请求失败，请检查 Hermes 配置");
      } finally {
        generating.value = false;
      }
    },
  });
}

// ── 查看详情 ──

async function openDetail(item: DailyDigestListItem): Promise<void> {
  detailOpen.value = true;
  detailLoading.value = true;

  try {
    const { readDailyDigest } = await import("../../services/dailyDigestApi.js");
    detailDigest.value = await readDailyDigest(item.id);
  } catch {
    message.error("加载日报详情失败");
    detailOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail(): void {
  detailOpen.value = false;
  detailDigest.value = null;
}

// ── 表格分页 ──

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: false,
  showTotal: (t: number) => `共 ${t} 条`,
  onChange: (page: number) => {
    currentPage.value = page;
    loadItems();
  },
}));

// ── 表格列定义 ──

const columns: TableProps["columns"] = [
  {
    title: "日期",
    key: "date",
    width: 120,
    sorter: (a: DailyDigestListItem, b: DailyDigestListItem) => a.date.localeCompare(b.date),
    defaultSortOrder: "descend",
  },
  {
    title: "标题",
    key: "title",
    width: 240,
  },
  {
    title: "收录",
    key: "totalItems",
    width: 70,
    align: "center",
  },
  {
    title: "分类",
    key: "categories",
    width: 200,
  },
  {
    title: "状态",
    key: "status",
    width: 90,
  },
  {
    title: "操作",
    key: "actions",
    width: 80,
    fixed: "right",
  },
];
</script>

<template>
  <div class="daily-digest-page">
    <!-- 顶部操作栏 -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <a-select
          v-model:value="statusFilter"
          placeholder="全部状态"
          allow-clear
          style="width: 130px"
          @change="() => { currentPage = 1; loadItems(); }"
        >
          <a-select-option value="generated">已生成</a-select-option>
          <a-select-option value="publishing">推送中</a-select-option>
          <a-select-option value="published">已推送</a-select-option>
          <a-select-option value="failed">推送失败</a-select-option>
        </a-select>
      </div>

      <a-button
        type="primary"
        :loading="generating"
        @click="handleGenerate"
      >
        {{ generating ? "正在生成..." : "生成日报" }}
      </a-button>
    </div>

    <!-- 列表 -->
    <a-table
      :columns="columns"
      :data-source="items"
      :loading="isLoading"
      :pagination="pagination"
      :scroll="{ x: 800 }"
      row-key="id"
      size="small"
    >
      <!-- 日期 -->
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'date'">
          <span class="text-[13px] text-editorial-text-main font-medium">{{ record.date }}</span>
        </template>

        <!-- 标题 -->
        <template v-else-if="column.key === 'title'">
          <button
            class="line-clamp-2 text-left text-[13px] leading-tight text-editorial-text-main hover:text-editorial-link transition"
            @click="openDetail(record)"
          >
            {{ record.title }}
          </button>
        </template>

        <!-- 收录条数 -->
        <template v-else-if="column.key === 'totalItems'">
          <span class="text-[13px]">{{ record.totalItems }}</span>
        </template>

        <!-- 分类 -->
        <template v-else-if="column.key === 'categories'">
          <div class="flex flex-wrap gap-1">
            <a-tag
              v-for="cat in record.categories.slice(0, 3)"
              :key="cat"
              size="small"
              class="!text-[11px] !py-0"
            >
              {{ cat }}
            </a-tag>
            <span v-if="record.categories.length > 3" class="text-[11px] text-editorial-text-muted">
              +{{ record.categories.length - 3 }}
            </span>
          </div>
        </template>

        <!-- 状态 -->
        <template v-else-if="column.key === 'status'">
          <div class="flex flex-col items-start gap-0.5 leading-tight">
            <a-tag
              :color="statusColorMap[record.status as DailyDigestStatus]"
              size="small"
              class="!text-[11px] !py-0"
            >
              {{ statusLabelMap[record.status as DailyDigestStatus] }}
            </a-tag>
          </div>
        </template>

        <!-- 操作 -->
        <template v-else-if="column.key === 'actions'">
          <a-button
            type="link"
            size="small"
            @click="openDetail(record)"
          >
            查看
          </a-button>
        </template>
      </template>
    </a-table>

    <!-- 详情弹窗 -->
    <DailyDigestDetailDrawer
      :open="detailOpen"
      :digest="detailDigest"
      @update:open="(val) => { if (!val) closeDetail(); }"
      @saved="loadItems"
    />
  </div>
</template>

<style scoped>
.daily-digest-page {
  width: 100%;
}
</style>
