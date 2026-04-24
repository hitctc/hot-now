<script setup lang="ts">
import { editorialContentCardClass } from "../../content/contentCardShared";
import type { SettingsWechatRssSource } from "../../../services/settingsApi";
import {
  formatDateTime,
  type SourcesActionPendingGetter,
  type SourcesOperations,
  wechatRssSourceColumns
} from "./sourcesPageShared";

defineProps<{
  sources: SettingsWechatRssSource[];
  totalCount: number;
  enabledCount: number;
  collectionMessage: string;
  operations: SourcesOperations;
  isActionPending: SourcesActionPendingGetter;
}>();

const emit = defineEmits<{
  add: [];
  collect: [];
  edit: [source: SettingsWechatRssSource];
  delete: [source: SettingsWechatRssSource];
}>();
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="微信公众号 RSS"
    size="small"
    data-sources-section="wechat-rss"
  >
    <div class="mb-4 grid gap-3 md:grid-cols-4">
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">RSS 总数</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ totalCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">采集启用</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ enabledCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">展示范围</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">进入 AI 新讯和 AI 热点，并在内容页提供子筛选</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">RSS 状态</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ collectionMessage }}</p>
      </article>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <a-typography-paragraph class="!mb-0" type="secondary">
        这里单独维护微信公众号 RSS 链接，支持批量新增和单条编辑；采集只在点击按钮时执行。
      </a-typography-paragraph>
      <div class="flex flex-wrap gap-2">
        <a-button data-action="add-wechat-rss-source" @click="emit('add')">
          批量新增公众号 RSS
        </a-button>
        <a-button
          type="primary"
          data-action="manual-wechat-rss-collect"
          :disabled="!operations.canTriggerManualWechatRssCollect || operations.isRunning"
          :loading="isActionPending('manual:wechat-rss-collect')"
          @click="emit('collect')"
        >
          {{ operations.isRunning ? "任务执行中..." : "手动采集公众号 RSS" }}
        </a-button>
      </div>
    </div>

    <a-table
      :data-source="sources"
      :columns="wechatRssSourceColumns"
      row-key="id"
      :pagination="false"
      size="small"
      table-layout="fixed"
      :scroll="{ x: 980 }"
    >
      <template #emptyText>
        暂无微信公众号 RSS
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'displayName'">
          <a-tooltip :title="record.displayName || `公众号 RSS #${record.id}`">
            <a-typography-text
              strong
              class="inline-block max-w-[190px] truncate align-middle"
              :data-wechat-rss-name="record.id"
            >
              {{ record.displayName || `公众号 RSS #${record.id}` }}
            </a-typography-text>
          </a-tooltip>
        </template>
        <template v-else-if="column.key === 'rssUrl'">
          <a-tooltip :title="record.rssUrl">
            <a-typography-text
              type="secondary"
              class="inline-block w-full max-w-[320px] truncate align-middle"
              :data-wechat-rss-url="record.id"
            >
              {{ record.rssUrl }}
            </a-typography-text>
          </a-tooltip>
        </template>
        <template v-else-if="column.key === 'lastSuccessAt'">
          {{ formatDateTime(record.lastSuccessAt) }}
        </template>
        <template v-else-if="column.key === 'lastResult'">
          <span
            class="inline-block max-w-[260px] truncate align-middle"
            :title="record.lastResult ?? '暂无结果'"
            :data-wechat-rss-result="record.id"
          >
            {{ record.lastResult ?? "暂无结果" }}
          </span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div class="flex flex-wrap justify-center gap-2" :data-wechat-rss-actions="record.id">
            <a-button
              type="link"
              size="small"
              :data-wechat-rss-edit="record.id"
              @click="emit('edit', record)"
            >
              编辑
            </a-button>
            <a-popconfirm
              title="确认删除这个公众号 RSS 吗？历史已入库内容不会被删除。"
              ok-text="确认删除"
              cancel-text="取消"
              @confirm="emit('delete', record)"
            >
              <a-button
                type="link"
                size="small"
                danger
                :loading="isActionPending(`wechat-rss-delete:${record.id}`)"
                :data-wechat-rss-delete="record.id"
              >
                删除
              </a-button>
            </a-popconfirm>
          </div>
        </template>
      </template>
    </a-table>
  </a-card>
</template>
