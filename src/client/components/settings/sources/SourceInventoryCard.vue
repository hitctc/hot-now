<script setup lang="ts">
import { editorialContentCardClass } from "../../content/contentCardShared";
import type { SettingsSourceItem } from "../../../services/settingsApi";
import {
  formatCollectionStatus,
  formatDateTime,
  formatNextCollectionText,
  formatViewShare,
  formatViewStats,
  inventoryColumns,
  type SourcesActionPendingGetter,
  type SourcesOperations
} from "./sourcesPageShared";

defineProps<{
  sources: SettingsSourceItem[];
  operations: SourcesOperations;
  now: number;
  isActionPending: SourcesActionPendingGetter;
}>();

const emit = defineEmits<{
  add: [];
  collect: [];
  edit: [source: SettingsSourceItem];
  delete: [source: SettingsSourceItem];
  toggle: [source: SettingsSourceItem];
  toggleDisplayMode: [source: SettingsSourceItem];
}>();
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="来源库存与统计"
    size="small"
    data-sources-section="inventory"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <a-typography-paragraph class="!mb-1" type="secondary">
          管理 RSS 来源与现有来源状态，并在同一张表里查看核心库存统计。
        </a-typography-paragraph>
        <p class="m-0 text-xs leading-5 text-editorial-text-muted">
          手动采集会处理所有已启用 source；展开来源可查看 AI 新讯 / AI 热点细分统计与链接。下一次自动采集：{{ formatNextCollectionText(operations.nextCollectionRunAt, now) }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a-button data-action="add-source" @click="emit('add')">
          新增来源
        </a-button>
        <a-button
          type="primary"
          data-action="manual-collect"
          :disabled="!operations.canTriggerManualCollect || operations.isRunning"
          :loading="isActionPending('manual:collect')"
          @click="emit('collect')"
        >
          {{ operations.isRunning ? "采集中..." : "手动执行采集" }}
        </a-button>
      </div>
    </div>

    <a-table
      :data-source="sources"
      :columns="inventoryColumns"
      row-key="kind"
      :pagination="false"
      size="small"
      :scroll="{ x: 1080 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <div
            :data-source-cell="record.kind"
            class="flex flex-col items-center gap-1"
          >
            <a-space
              direction="vertical"
              size="small"
              :data-source-meta="record.kind"
            >
              <a-typography-text strong>{{ record.name }}</a-typography-text>
              <a-typography-text type="secondary">{{ record.kind }}</a-typography-text>
            </a-space>
          </div>
        </template>
        <template v-else-if="column.key === 'sourceType'">
          <a-tag
            :color="record.sourceType === 'wechat_bridge' ? 'blue' : 'default'"
            :data-source-badges="record.kind"
          >
            {{ record.sourceType === "wechat_bridge" ? "公众号" : "RSS" }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div
            v-if="!record.isBuiltIn"
            :data-source-actions="record.kind"
            class="flex flex-wrap justify-center gap-2"
          >
            <a-button
              v-if="record.sourceType === 'rss'"
              type="link"
              size="small"
              :data-source-edit="record.kind"
              @click="emit('edit', record)"
            >
              编辑
            </a-button>
            <a-popconfirm
              title="确认删除这个自定义来源吗？"
              ok-text="确认删除"
              cancel-text="取消"
              @confirm="emit('delete', record)"
            >
              <a-button
                type="link"
                size="small"
                danger
                :loading="isActionPending(`delete:${record.kind}`)"
                :data-source-delete="record.kind"
              >
                删除
              </a-button>
            </a-popconfirm>
          </div>
          <span v-else class="text-editorial-text-muted">-</span>
        </template>
        <template v-else-if="column.key === 'enabled'">
          <a-switch
            :checked="record.isEnabled"
            :loading="isActionPending(`toggle:${record.kind}`)"
            :checked-children="'启用'"
            :un-checked-children="'停用'"
            :data-source-toggle="record.kind"
            @change="emit('toggle', record)"
          />
        </template>
        <template v-else-if="column.key === 'displayMode'">
          <a-switch
            :checked="record.showAllWhenSelected"
            :loading="isActionPending(`display-mode:${record.kind}`)"
            :checked-children="'全量'"
            :un-checked-children="'截断'"
            :data-source-display-mode="record.kind"
            @change="emit('toggleDisplayMode', record)"
          />
        </template>
        <template v-else-if="column.key === 'totalCount'">
          {{ record.totalCount ?? 0 }}
        </template>
        <template v-else-if="column.key === 'publishedTodayCount'">
          {{ record.publishedTodayCount ?? 0 }}
        </template>
        <template v-else-if="column.key === 'collectedTodayCount'">
          {{ record.collectedTodayCount ?? 0 }}
        </template>
        <template v-else-if="column.key === 'lastCollectedAt'">
          {{ formatDateTime(record.lastCollectedAt) }}
        </template>
        <template v-else-if="column.key === 'lastCollectionStatus'">
          <a-tag :color="record.lastCollectionStatus === 'completed' ? 'green' : 'gold'">
            {{ formatCollectionStatus(record.lastCollectionStatus) }}
          </a-tag>
        </template>
      </template>
      <template #expandedRowRender="{ record }">
        <div
          class="grid gap-3 px-2 py-1 md:grid-cols-2 xl:grid-cols-4"
          :data-source-detail="record.kind"
        >
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
              AI 新讯
            </p>
            <p class="mt-2 mb-0 text-sm text-editorial-text-main">
              {{ formatViewStats(record.viewStats?.ai) }}
            </p>
            <p class="mt-1 mb-0 text-xs text-editorial-text-muted">
              独立展示占比：{{ formatViewShare(record.viewStats?.ai) }}
            </p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
              AI 热点
            </p>
            <p class="mt-2 mb-0 text-sm text-editorial-text-main">
              {{ formatViewStats(record.viewStats?.hot) }}
            </p>
            <p class="mt-1 mb-0 text-xs text-editorial-text-muted">
              独立展示占比：{{ formatViewShare(record.viewStats?.hot) }}
            </p>
          </article>
          <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3 xl:col-span-2">
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
              链接
            </p>
            <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">
              RSS：
              <a
                v-if="record.rssUrl"
                :href="record.rssUrl"
                :title="record.rssUrl"
                target="_blank"
                rel="noreferrer"
                :data-source-rss-link="record.kind"
                class="break-all"
              >
                {{ record.rssUrl }}
              </a>
              <span v-else>未配置</span>
            </p>
            <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-body">
              主页：
              <a
                v-if="record.siteUrl"
                :href="record.siteUrl"
                :title="record.siteUrl"
                target="_blank"
                rel="noreferrer"
                class="break-all"
              >
                {{ record.siteUrl }}
              </a>
              <span v-else>未配置</span>
            </p>
          </article>
        </div>
      </template>
    </a-table>
  </a-card>
</template>
