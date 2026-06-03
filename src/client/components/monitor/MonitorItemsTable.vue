<script setup lang="ts">
import { ref, onMounted } from "vue";
import { fetchMonitorItems, type MonitorItem } from "../../services/monitorApi.js";

const items = ref<MonitorItem[]>([]);
const loading = ref(false);
const statusFilter = ref("all");
const currentPage = ref(1);
const pageSize = 50;

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "待评分", value: "pending_score" },
  { label: "待趋势评分", value: "pending_trend" },
  { label: "待写作", value: "pending_write" },
  { label: "已写作", value: "written" },
  { label: "已推送", value: "drafted" },
];

const agentLabels: Record<string, string> = {
  "rss-feed": "RSS",
  aihot: "AIHot",
  twitter: "Twitter",
  hackernews: "HN",
  bilibili: "B站",
  "wechat-rss": "WX",
  weibo: "微博",
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await fetchMonitorItems({
      status: statusFilter.value,
      limit: pageSize,
      offset: (currentPage.value - 1) * pageSize,
    });
    items.value = res.items;
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

function handleTableChange(pagination: { current?: number }): void {
  if (pagination.current) currentPage.value = pagination.current;
  load();
}

onMounted(() => load());
</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">素材列表</h3>
      <div class="flex items-center gap-2">
        <a-select v-model:value="statusFilter" :options="statusOptions" size="small" class="!w-[120px]" @change="currentPage = 1; load()" />
        <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="load">刷新</a-button>
      </div>
    </div>

    <a-table
      :columns="[
        { title: 'ID', dataIndex: 'id', width: 50 },
        { title: '标题', dataIndex: 'title', ellipsis: true },
        { title: '来源', dataIndex: 'source_name', width: 100, ellipsis: true },
        { title: 'Agent', dataIndex: 'collector_agent', width: 60 },
        { title: '评分', dataIndex: 'score', width: 48 },
        { title: '趋势分', dataIndex: 'trend_score', width: 56 },
        { title: '写作', dataIndex: 'writing_status', width: 56 },
        { title: '采集时间', dataIndex: 'collected_at', width: 110 },
      ]"
      :data-source="items"
      :loading="loading"
      :pagination="{ current: currentPage, pageSize, showTotal: (t: number) => `共 ${t} 条`, size: 'small' }"
      row-key="id"
      size="small"
      :scroll="{ x: 800 }"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'title'">
          <a v-if="record.url" :href="record.url" target="_blank" rel="noopener" class="text-editorial-link-active hover:underline text-[13px] line-clamp-2">{{ record.title }}</a>
          <span v-else class="text-[13px]">{{ record.title }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'source_name'">
          <span class="text-xs text-editorial-text-body">{{ (record.source_name || '-').replace('微信公众号', 'WX') }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'collector_agent'">
          <span class="text-xs">{{ agentLabels[record.collector_agent] || record.collector_agent }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'score'">
          <span v-if="record.score != null" class="text-xs font-medium">{{ record.score }}</span>
          <span v-else class="text-[11px] text-editorial-text-muted">-</span>
        </template>
        <template v-else-if="column.dataIndex === 'trend_score'">
          <span v-if="record.trend_score != null" class="text-xs font-bold" :class="record.trend_score >= 90 ? 'text-purple-600' : record.trend_score >= 80 ? 'text-red-500' : 'text-orange-600'">{{ record.trend_score }}</span>
          <span v-else class="text-[11px] text-editorial-text-muted">-</span>
        </template>
        <template v-else-if="column.dataIndex === 'writing_status'">
          <a-tag :color="record.writing_status === 'done' ? 'green' : record.writing_status === 'writing' ? 'blue' : record.writing_status === 'failed' ? 'red' : 'default'" class="!m-0 !text-[11px] !py-0">{{ record.writing_status }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'collected_at'">
          <span class="text-xs text-editorial-text-muted">{{ record.collected_at }}</span>
        </template>
      </template>
    </a-table>
  </section>
</template>
