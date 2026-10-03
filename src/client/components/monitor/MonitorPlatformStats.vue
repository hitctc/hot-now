<script setup lang="ts">

import { useMonitorPlatformStats } from "./useMonitorPlatformStats.js";
const {
  data,
  loading,
  error,
  refresh,
} = useMonitorPlatformStats();

</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">平台待处理</h3>
      <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="refresh">刷新</a-button>
    </div>
    <a-spin :spinning="loading && !data">
      <template v-if="error && !data">
        <a-alert type="warning" :message="error" show-icon class="!text-xs" />
      </template>
      <template v-else-if="data">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div v-for="item in [
            { label: '总素材', value: data.total, highlight: false },
            { label: '总文章', value: data.total_articles, highlight: false },
            { label: '待评分', value: data.pending_score, highlight: true },
            { label: '待趋势', value: data.pending_trend, highlight: true },
            { label: '待写作', value: data.pending_write, highlight: true },
          ]" :key="item.label" class="rounded border px-3 py-2 text-center" :class="item.highlight ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-gray-50'">
            <div class="text-lg font-bold" :class="item.highlight ? 'text-orange-600' : 'text-editorial-text-main'">{{ item.value }}</div>
            <div class="text-[11px] text-editorial-text-muted">{{ item.label }}</div>
          </div>
        </div>
      </template>
    </a-spin>
  </section>
</template>
