<script setup lang="ts">
import { editorialContentCardClass } from "../../content/contentCardShared";
import type { SettingsTwitterAccount } from "../../../services/settingsApi";
import {
  formatDateTime,
  formatTwitterCategoryLabel,
  twitterAccountColumns,
  type SourcesActionPendingGetter,
  type SourcesOperations
} from "./sourcesPageShared";

defineProps<{
  accounts: SettingsTwitterAccount[];
  totalCount: number;
  enabledCount: number;
  collectionMessage: string;
  operations: SourcesOperations;
  isActionPending: SourcesActionPendingGetter;
}>();

const emit = defineEmits<{
  add: [];
  collect: [];
  toggle: [account: SettingsTwitterAccount];
  edit: [account: SettingsTwitterAccount];
  delete: [account: SettingsTwitterAccount];
}>();
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="Twitter 账号"
    size="small"
    data-sources-section="twitter-accounts"
  >
    <div class="mb-4 grid gap-3 md:grid-cols-3">
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">账号总数</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ totalCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">已启用</p>
        <p class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ enabledCount }}</p>
      </article>
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel/70 px-4 py-3">
        <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">API 状态</p>
        <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-body">{{ collectionMessage }}</p>
      </article>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <a-typography-paragraph class="!mb-0" type="secondary">
        Twitter 账号采集已从默认定时采集里拆出，只会在这里手动执行。
      </a-typography-paragraph>
      <div class="flex flex-wrap gap-2">
        <a-button data-action="add-twitter-account" @click="emit('add')">
          新增 Twitter 账号
        </a-button>
        <a-button
          type="primary"
          data-action="manual-twitter-collect"
          :disabled="!operations.canTriggerManualTwitterCollect || operations.isRunning"
          :loading="isActionPending('manual:twitter-collect')"
          @click="emit('collect')"
        >
          {{ operations.isRunning ? "任务执行中..." : "手动采集 Twitter 账号" }}
        </a-button>
      </div>
    </div>

    <a-table
      :data-source="accounts"
      :columns="twitterAccountColumns"
      row-key="id"
      :pagination="false"
      size="small"
    >
      <template #emptyText>
        暂无 Twitter 账号
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'account'">
          <a-space direction="vertical" size="small">
            <a-typography-text strong>{{ record.displayName }}</a-typography-text>
            <a-typography-text type="secondary" :data-twitter-account-username="record.id">@{{ record.username }}</a-typography-text>
          </a-space>
        </template>
        <template v-else-if="column.key === 'category'">
          <a-tag>{{ formatTwitterCategoryLabel(record.category) }}</a-tag>
        </template>
        <template v-else-if="column.key === 'priority'">
          {{ record.priority }}
        </template>
        <template v-else-if="column.key === 'enabled'">
          <a-switch
            :checked="record.isEnabled"
            :loading="isActionPending(`twitter-toggle:${record.id}`)"
            :checked-children="'启用'"
            :un-checked-children="'停用'"
            :data-twitter-account-toggle="record.id"
            @change="emit('toggle', record)"
          />
        </template>
        <template v-else-if="column.key === 'lastSuccessAt'">
          {{ formatDateTime(record.lastSuccessAt) }}
        </template>
        <template v-else-if="column.key === 'lastError'">
          <span
            class="inline-block max-w-[220px] truncate align-middle"
            :title="record.lastError ?? '暂无结果'"
            :data-twitter-account-error="record.id"
          >
            {{ record.lastError ?? "暂无结果" }}
          </span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div class="flex flex-wrap justify-center gap-2" :data-twitter-account-actions="record.id">
            <a-button
              type="link"
              size="small"
              :data-twitter-account-edit="record.id"
              @click="emit('edit', record)"
            >
              编辑
            </a-button>
            <a-popconfirm
              title="确认删除这个 Twitter 账号吗？"
              ok-text="确认删除"
              cancel-text="取消"
              @confirm="emit('delete', record)"
            >
              <a-button
                type="link"
                size="small"
                danger
                :loading="isActionPending(`twitter-delete:${record.id}`)"
                :data-twitter-account-delete="record.id"
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
