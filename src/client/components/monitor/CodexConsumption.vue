<script setup lang="ts">

import { useCodexConsumption, type CodexConsumptionEvents } from "./useCodexConsumption.js";
const emit = defineEmits<CodexConsumptionEvents>();
const {
  loading,
  refresh,
  items,
  pendingCount,
  nextScheduleAt,
  scheduleInterval,
  formatCountdown,
  consumeConfig,
  timeAgo,
} = useCodexConsumption();

</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">Codex 结果消费</h3>
      <div class="flex items-center gap-3">
        <!-- 调度信息 -->
        <div class="flex items-center gap-2 text-[10px]">
          <span v-if="pendingCount > 0" class="text-orange-500 font-medium">● 待消费 {{ pendingCount }}</span>
          <span v-if="nextScheduleAt" class="text-editorial-text-muted">
            下次调度 {{ formatCountdown(nextScheduleAt) }}
            <span v-if="scheduleInterval">（每{{ Math.round(scheduleInterval / 60) }}分钟）</span>
          </span>
        </div>
        <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="refresh">刷新</a-button>
      </div>
    </div>

    <a-spin :spinning="loading && items.length === 0">
      <div v-if="items.length === 0" class="text-xs text-editorial-text-muted py-2">暂无消费记录</div>
      <div v-else class="space-y-1.5">
        <div
          v-for="item in items"
          :key="item.task_id"
          class="flex items-center gap-2 rounded border px-3 py-1.5 text-[11px]"
          :class="{
            'border-blue-100 bg-blue-50/50': !item.consumed,
            'border-green-100 bg-green-50/50': item.consumed && item.consume_status === 'success',
            'border-red-100 bg-red-50/50': item.consume_status === 'failed' || item.consume_status === 'failed_generate',
          }"
        >
          <!-- 图片类型 -->
          <span class="shrink-0 rounded px-1 text-[9px] font-medium" :class="item.image_type === 'cover' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'">
            {{ item.image_type === 'cover' ? '封面' : `配图${item.image_index}` }}
          </span>

          <!-- 文章 ID（可点击） -->
          <span
            class="shrink-0 cursor-pointer text-[11px] font-semibold text-blue-600 hover:underline"
            @click="emit('openArticle', item.article_id)"
          >#{{ item.article_id }}</span>

          <!-- 文章标题 -->
          <span class="min-w-0 flex-1 truncate text-editorial-text-body" :title="item.article_title ?? ''">
            {{ item.article_title || `文章 #${item.article_id}` }}
          </span>

          <!-- 缩略图 -->
          <a v-if="item.result_url" :href="item.result_url" target="_blank" class="shrink-0">
            <img :src="item.result_url" class="h-6 w-9 rounded object-cover border border-gray-200" />
          </a>

          <!-- 消费状态 -->
          <a-tag :color="consumeConfig[item.consume_status ?? '']?.color ?? 'default'" class="!m-0 !text-[10px] !py-0 !px-1">
            {{ consumeConfig[item.consume_status ?? '']?.label ?? item.consume_status ?? '-' }}
          </a-tag>

          <!-- 消费时间 / 下次重试 -->
          <span class="shrink-0 text-[10px] text-editorial-text-muted">
            <template v-if="item.consumed_at">{{ timeAgo(item.consumed_at) }}</template>
            <template v-else-if="item.next_consume_at">{{ formatCountdown(item.next_consume_at) }}</template>
            <template v-else>-</template>
          </span>

          <!-- 失败原因 -->
          <span v-if="item.consume_error" class="shrink-0 max-w-[120px] truncate text-[10px] text-red-400" :title="item.consume_error">
            {{ item.consume_error }}
          </span>
        </div>
      </div>
    </a-spin>
  </section>
</template>
