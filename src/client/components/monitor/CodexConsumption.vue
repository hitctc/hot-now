<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { fetchCodexConsumption, type CodexConsumptionItem, type CodexConsumptionResponse } from "../../services/monitorApi.js";

const data = ref<CodexConsumptionResponse | null>(null);
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    data.value = await fetchCodexConsumption({ limit: 10 });
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

const items = computed(() => data.value?.items ?? []);
const pendingCount = computed(() => data.value?.pending_count ?? 0);
const nextScheduleAt = computed(() => data.value?.next_schedule_at);
const scheduleInterval = computed(() => data.value?.schedule_interval_seconds);

// 下次消费倒计时
function formatCountdown(iso: string | null): string {
  if (!iso) return "-";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "即将执行";
  if (diff < 60_000) return `${Math.round(diff / 1000)}秒后`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟后`;
  return `${Math.round(diff / 3600_000)}小时后`;
}

// 消费状态配置
const consumeConfig: Record<string, { color: string; label: string }> = {
  success:         { color: "green",  label: "已消费" },
  pending:         { color: "blue",   label: "待消费" },
  failed:          { color: "red",    label: "消费失败" },
  failed_generate: { color: "red",    label: "生图失败" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}秒前`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟前`;
  return `${Math.round(diff / 3600_000)}小时前`;
}

const emit = defineEmits<{
  openArticle: [articleId: number];
}>();

onMounted(() => { refresh(); timer = setInterval(refresh, 30_000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
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
