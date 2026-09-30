<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { message, Modal } from "ant-design-vue";
import type { TableProps } from "ant-design-vue";

import DailyDigestDetailDrawer from "../../components/creative/DailyDigestDetailDrawer.vue";
import {
  readDailyDigest,
  readDailyDigests,
  triggerGenerateDigest,
  readGenerateDigestTask,
  type DailyDigestListItem,
  type DailyDigestRecord,
  type DailyDigestStatus,
} from "../../services/dailyDigestApi.js";

import { clearDailyDigestRequest } from "../../services/modelTaskRequest.js";
import { HttpError } from "../../services/http.js";

// ── 状态 ──

const isLoading = ref(false);
const items = ref<DailyDigestListItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const statusFilter = ref<string | undefined>(undefined);

const generating = ref(false);
const activeDigestTask = ref<string | null>(null);
let digestObservation = 0;
let pageClosed = false;
const DIGEST_TASK_KEY = "hotnow:daily-digest-task";

/** 保存或清理日报任务编号；不保存正文、凭据或生成参数。 */
function rememberDigestTask(taskId: string | null): void {
  activeDigestTask.value = taskId;
  try {
    if (taskId) localStorage.setItem(DIGEST_TASK_KEY, taskId);
    else localStorage.removeItem(DIGEST_TASK_KEY);
  } catch { /* 浏览器存储不可用时仍观察当前内存任务。 */ }
}

/** 观察原任务到终态；离开页面停止查询，网络故障退避，不重复提交生成。 */
async function observeDigestTask(taskId: string): Promise<void> {
  // 提交响应可能晚于页面卸载；编号仍保存供重开恢复，但旧页面不能重新启动轮询。
  if (pageClosed) return;
  const observation = ++digestObservation;
  generating.value = true;
  let delay = 3000;
  while (observation === digestObservation) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    if (observation !== digestObservation) return;
    try {
      const result = await readGenerateDigestTask(taskId);
      if (observation !== digestObservation) return;
      delay = 3000;
      if (["done", "failed", "stopped"].includes(result.status || "")) {
        rememberDigestTask(null);
        clearDailyDigestRequest();
        generating.value = false;
        if (result.status === "done") { message.success("日报生成完成"); await loadItems(); }
        else if (result.status === "stopped") message.warning("日报任务已取消");
        else message.error(result.reason || "日报生成失败");
        return;
      }
    } catch (error) {
      if (error instanceof HttpError && [401, 403, 404].includes(error.status)) {
        generating.value = false;
        if (error.status === 404) rememberDigestTask(null);
        message.warning("日报任务状态暂不可确认，请查看队列；未重新提交生成");
        return;
      }
      delay = Math.min(delay * 2, 30_000);
    }
  }
}

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

// 重开页面只恢复已有日报编号的观察，不自动提交新生成请求。
onMounted(() => {
  void loadItems();
  try {
    const taskId = localStorage.getItem(DIGEST_TASK_KEY);
    if (taskId) { activeDigestTask.value = taskId; void observeDigestTask(taskId); }
  } catch { /* 不把浏览器存储限制当作后台任务失败。 */ }
});
onBeforeUnmount(() => { pageClosed = true; digestObservation += 1; });

// ── 生成日报 ──

/** 确认后只提交一次日报；队列编号持久化，完成与取消由状态观察确认。 */
function handleGenerate(): void {
  Modal.confirm({
    bodyStyle: { padding: '24px' },
    title: "生成日报",
    content: "确认将日报加入 Hermes 队列？等待时长取决于模型资源与冷却状态，可在队列查看进度或取消。",
    okText: "确认生成",
    cancelText: "取消",
    onOk: async () => {
      generating.value = true;
      try {
        const result = await triggerGenerateDigest();
        if (result.ok && result.taskId) {
          rememberDigestTask(result.taskId);
          message.info(result.detail ?? "日报任务已受理，请查看队列进度");
          void observeDigestTask(result.taskId);
        } else if (result.ok) {
          // 滚动发布期间保留旧同步响应的兼容，不将新异步受理当成生成完成。
          message.success(result.detail ?? "日报生成完成");
          await loadItems();
        } else {
          message.error(result.reason ?? "生成失败");
        }
      } catch (err) {
        message.error("生成请求失败，请检查 Hermes 配置");
      } finally {
        if (!activeDigestTask.value) generating.value = false;
      }
    },
  });
}

// ── 查看详情 ──

async function openDetail(item: DailyDigestListItem): Promise<void> {
  detailOpen.value = true;
  detailLoading.value = true;

  try {
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
