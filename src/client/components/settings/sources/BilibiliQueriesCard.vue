<script setup lang="ts">
import { editorialContentCardClass } from "../../content/contentCardShared";
import type { SettingsBilibiliQuery } from "../../../services/settingsApi";
import {
  bilibiliQueryColumns,
  formatDateTime,
  type SourcesActionPendingGetter,
  type SourcesOperations
} from "./sourcesPageShared";

defineProps<{
  queries: SettingsBilibiliQuery[];
  totalCount: number;
  enabledCount: number;
  collectionMessage: string;
  operations: SourcesOperations;
  isActionPending: SourcesActionPendingGetter;
}>();

const emit = defineEmits<{
  add: [];
  collect: [];
  toggle: [query: SettingsBilibiliQuery];
  edit: [query: SettingsBilibiliQuery];
  delete: [query: SettingsBilibiliQuery];
}>();
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="B 站搜索"
    size="small"
    data-sources-section="bilibili"
  >
    <div class="mb-4 grid gap-3 md:grid-cols-4">
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">Query 总数</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ totalCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">采集启用</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ enabledCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">搜索范围</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">固定只搜视频，结果进入 AI 新讯和 AI 热点</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ collectionMessage }}</p>
      </article>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <a-typography-paragraph class="!mb-0" type="secondary">
        第一版只做手动搜索，固定按最近发布排序、每轮最多 5 个 query、每词最多 10 条视频结果。
      </a-typography-paragraph>
      <div class="flex flex-wrap gap-2">
        <a-button data-action="add-bilibili-query" @click="emit('add')">
          新增 B 站 query
        </a-button>
        <a-button
          type="primary"
          data-action="manual-bilibili-collect"
          :disabled="!operations.canTriggerManualBilibiliCollect || operations.isRunning"
          :loading="isActionPending('manual:bilibili-collect')"
          @click="emit('collect')"
        >
          {{ operations.isRunning ? "任务执行中..." : "手动采集 B 站搜索" }}
        </a-button>
      </div>
    </div>

    <a-table
      :data-source="queries"
      :columns="bilibiliQueryColumns"
      row-key="id"
      :pagination="false"
      size="small"
    >
      <template #emptyText>
        暂无 B 站 query
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'query'">
          <a-space direction="vertical" size="small">
            <a-typography-text strong>{{ record.query }}</a-typography-text>
            <a-typography-text type="secondary" :data-bilibili-query-note="record.id">
              {{ record.notes || "暂无备注" }}
            </a-typography-text>
          </a-space>
        </template>
        <template v-else-if="column.key === 'priority'">
          {{ record.priority }}
        </template>
        <template v-else-if="column.key === 'enabled'">
          <a-switch
            :checked="record.isEnabled"
            :loading="isActionPending(`bilibili-toggle:${record.id}`)"
            :checked-children="'启用'"
            :un-checked-children="'停用'"
            :data-bilibili-query-toggle="record.id"
            @change="emit('toggle', record)"
          />
        </template>
        <template v-else-if="column.key === 'lastSuccessAt'">
          {{ formatDateTime(record.lastSuccessAt) }}
        </template>
        <template v-else-if="column.key === 'lastResult'">
          <span
            class="inline-block max-w-[240px] truncate align-middle"
            :title="record.lastResult ?? '暂无结果'"
            :data-bilibili-query-result="record.id"
          >
            {{ record.lastResult ?? "暂无结果" }}
          </span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div class="flex flex-wrap justify-center gap-2" :data-bilibili-query-actions="record.id">
            <a-button
              type="link"
              size="small"
              :data-bilibili-query-edit="record.id"
              @click="emit('edit', record)"
            >
              编辑
            </a-button>
            <a-popconfirm
              title="确认删除这个 B 站 query 吗？"
              ok-text="确认删除"
              cancel-text="取消"
              @confirm="emit('delete', record)"
            >
              <a-button
                type="link"
                size="small"
                danger
                :loading="isActionPending(`bilibili-delete:${record.id}`)"
                :data-bilibili-query-delete="record.id"
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
