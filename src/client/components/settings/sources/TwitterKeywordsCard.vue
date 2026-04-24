<script setup lang="ts">
import { editorialContentCardClass } from "../../content/contentCardShared";
import type { SettingsTwitterSearchKeyword } from "../../../services/settingsApi";
import {
  formatDateTime,
  formatTwitterCategoryLabel,
  twitterKeywordColumns,
  type SourcesActionPendingGetter,
  type SourcesOperations
} from "./sourcesPageShared";

defineProps<{
  keywords: SettingsTwitterSearchKeyword[];
  totalCount: number;
  collectEnabledCount: number;
  visibleEnabledCount: number;
  collectionMessage: string;
  operations: SourcesOperations;
  isActionPending: SourcesActionPendingGetter;
}>();

const emit = defineEmits<{
  add: [];
  collect: [];
  toggleCollect: [keyword: SettingsTwitterSearchKeyword];
  toggleVisible: [keyword: SettingsTwitterSearchKeyword];
  edit: [keyword: SettingsTwitterSearchKeyword];
  delete: [keyword: SettingsTwitterSearchKeyword];
}>();
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="Twitter 关键词搜索"
    size="small"
    data-sources-section="twitter-keywords"
  >
    <div class="mb-4 grid gap-3 md:grid-cols-4">
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">关键词总数</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ totalCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">采集启用</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ collectEnabledCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">展示启用</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ visibleEnabledCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ collectionMessage }}</p>
      </article>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <a-typography-paragraph class="!mb-0" type="secondary">
        关键词搜索仅支持手动执行，默认按 5 个关键词、每词最多 10 条结果控住 credits。
      </a-typography-paragraph>
      <div class="flex flex-wrap gap-2">
        <a-button data-action="add-twitter-keyword" @click="emit('add')">
          新增 Twitter 关键词
        </a-button>
        <a-button
          type="primary"
          data-action="manual-twitter-keyword-collect"
          :disabled="!operations.canTriggerManualTwitterKeywordCollect || operations.isRunning"
          :loading="isActionPending('manual:twitter-keyword-collect')"
          @click="emit('collect')"
        >
          {{ operations.isRunning ? "任务执行中..." : "手动采集 Twitter 关键词" }}
        </a-button>
      </div>
    </div>

    <a-table
      :data-source="keywords"
      :columns="twitterKeywordColumns"
      row-key="id"
      :pagination="false"
      size="small"
    >
      <template #emptyText>
        暂无 Twitter 关键词
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'keyword'">
          <a-space direction="vertical" size="small">
            <a-typography-text strong>{{ record.keyword }}</a-typography-text>
            <a-typography-text type="secondary" :data-twitter-keyword-note="record.id">
              {{ record.notes || "暂无备注" }}
            </a-typography-text>
          </a-space>
        </template>
        <template v-else-if="column.key === 'category'">
          <a-tag>{{ formatTwitterCategoryLabel(record.category) }}</a-tag>
        </template>
        <template v-else-if="column.key === 'priority'">
          {{ record.priority }}
        </template>
        <template v-else-if="column.key === 'collectEnabled'">
          <a-switch
            :checked="record.isCollectEnabled"
            :loading="isActionPending(`twitter-keyword-collect-toggle:${record.id}`)"
            :checked-children="'启用'"
            :un-checked-children="'停用'"
            :data-twitter-keyword-collect-toggle="record.id"
            @change="emit('toggleCollect', record)"
          />
        </template>
        <template v-else-if="column.key === 'visible'">
          <a-switch
            :checked="record.isVisible"
            :loading="isActionPending(`twitter-keyword-visible-toggle:${record.id}`)"
            :checked-children="'展示'"
            :un-checked-children="'隐藏'"
            :data-twitter-keyword-visible-toggle="record.id"
            @change="emit('toggleVisible', record)"
          />
        </template>
        <template v-else-if="column.key === 'lastSuccessAt'">
          {{ formatDateTime(record.lastSuccessAt) }}
        </template>
        <template v-else-if="column.key === 'lastResult'">
          <span
            class="inline-block max-w-[240px] truncate align-middle"
            :title="record.lastResult ?? '暂无结果'"
            :data-twitter-keyword-result="record.id"
          >
            {{ record.lastResult ?? "暂无结果" }}
          </span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div class="flex flex-wrap justify-center gap-2" :data-twitter-keyword-actions="record.id">
            <a-button
              type="link"
              size="small"
              :data-twitter-keyword-edit="record.id"
              @click="emit('edit', record)"
            >
              编辑
            </a-button>
            <a-popconfirm
              title="确认删除这个 Twitter 关键词吗？"
              ok-text="确认删除"
              cancel-text="取消"
              @confirm="emit('delete', record)"
            >
              <a-button
                type="link"
                size="small"
                danger
                :loading="isActionPending(`twitter-keyword-delete:${record.id}`)"
                :data-twitter-keyword-delete="record.id"
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
