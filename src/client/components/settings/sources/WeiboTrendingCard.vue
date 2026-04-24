<script setup lang="ts">
import { editorialContentCardClass } from "../../content/contentCardShared";
import type { SettingsWeiboTrending } from "../../../services/settingsApi";
import {
  formatDateTime,
  type SourcesActionPendingGetter,
  type SourcesOperations
} from "./sourcesPageShared";

defineProps<{
  weiboTrending: SettingsWeiboTrending | undefined;
  fixedKeywordCount: number;
  collectionMessage: string;
  operations: SourcesOperations;
  isActionPending: SourcesActionPendingGetter;
}>();

const emit = defineEmits<{
  collect: [];
}>();
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="微博热搜榜匹配（固定 AI 关键词，只进入 AI 热点，不做微博全文搜索）"
    size="small"
    data-sources-section="weibo-trending"
  >
    <div class="mb-4 grid gap-3 md:grid-cols-4">
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">固定关键词数</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ fixedKeywordCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近成功</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">
          {{ formatDateTime(weiboTrending?.lastSuccessAt ?? null) }}
        </p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">结果去向</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">固定只进入 AI 热点，不进入 AI 新讯</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ collectionMessage }}</p>
      </article>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        <a-tag
          v-for="keyword in weiboTrending?.fixedKeywords ?? []"
          :key="keyword"
          color="default"
          :data-weibo-keyword="keyword"
        >
          {{ keyword }}
        </a-tag>
      </div>
      <a-button
        type="primary"
        data-action="manual-weibo-trending-collect"
        :disabled="!operations.canTriggerManualWeiboTrendingCollect || operations.isRunning"
        :loading="isActionPending('manual:weibo-trending-collect')"
        @click="emit('collect')"
      >
        {{ operations.isRunning ? "任务执行中..." : "手动匹配微博热搜榜" }}
      </a-button>
    </div>

    <div class="grid gap-3 md:grid-cols-3">
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近抓取</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body" data-weibo-last-fetched-at>
          {{ formatDateTime(weiboTrending?.lastFetchedAt ?? null) }}
        </p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3 md:col-span-2">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">最近结果</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body" data-weibo-last-result>
          {{ weiboTrending?.lastResult ?? "暂无结果" }}
        </p>
      </article>
    </div>
  </a-card>
</template>
