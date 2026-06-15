<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { editorialContentCardClass } from "../../content/contentCardShared";
import type { SettingsSourceItem } from "../../../services/settingsApi";
import {
  formatDateTime,
  type SourcesActionPendingGetter,
  type SourcesOperations
} from "./sourcesPageShared";

const props = defineProps<{
  source: SettingsSourceItem | null;
  operations: SourcesOperations;
  isActionPending: SourcesActionPendingGetter;
}>();

const emit = defineEmits<{
  toggle: [enable: boolean];
  save: [rssUrl: string];
  collect: [];
}>();

// ─── 编辑弹窗 ───
const editVisible = ref(false);
const editUrl = ref("");
const editSaving = ref(false);

const currentUrl = computed(() => props.source?.rssUrl ?? "未配置");
const isEnabled = computed(() => props.source?.isEnabled ?? false);
const lastCollectedAt = computed(() => props.source?.lastCollectedAt ?? null);

function openEdit(): void {
  editUrl.value = props.source?.rssUrl ?? "";
  editVisible.value = true;
}

async function handleSave(): Promise<void> {
  const url = editUrl.value.trim();
  if (!url) {
    message.warning("请输入 RSS 地址");
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    message.warning("RSS 地址需以 http:// 或 https:// 开头");
    return;
  }
  editSaving.value = true;
  emit("save", url);
}

// 父组件完成保存后关闭弹窗（通过 isActionPending 状态判断）
watch(
  () => props.isActionPending("juya:save"),
  (pending, prev) => {
    if (prev && !pending) {
      editSaving.value = false;
      editVisible.value = false;
    }
  }
);
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="素材库 · Juya RSS"
    size="small"
    data-sources-section="juya-rss"
  >
    <a-typography-paragraph class="!mb-4" type="secondary">
      素材库内置的 Juya AI Daily RSS 来源，每轮自动采集并写入素材库。这里可修改 RSS 地址、启停采集和手动触发。
    </a-typography-paragraph>

    <div class="space-y-3">
      <!-- 状态行 -->
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div class="flex items-center gap-2">
          <span class="text-editorial-text-muted">采集状态</span>
          <a-tag :color="isEnabled ? 'green' : 'default'" class="!m-0">{{ isEnabled ? '已启用' : '已停用' }}</a-tag>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-editorial-text-muted">最后采集</span>
          <span class="text-editorial-text-body">{{ lastCollectedAt ? formatDateTime(lastCollectedAt) : '—' }}</span>
        </div>
      </div>

      <!-- RSS 地址 -->
      <div class="flex items-start gap-2">
        <span class="mt-1 shrink-0 text-sm text-editorial-text-muted">RSS 地址</span>
        <div class="min-w-0 flex-1">
          <a-typography-text class="block break-all text-sm text-editorial-text-body" :copyable="{ tooltip: '复制地址' }">
            {{ currentUrl }}
          </a-typography-text>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <a-switch
          :checked="isEnabled"
          :loading="isActionPending('juya:toggle')"
          checked-children="启用"
          un-checked-children="停用"
          @change="(val: boolean) => emit('toggle', val)"
        />
        <a-button data-action="edit-juya-rss" @click="openEdit">编辑地址</a-button>
        <a-button
          type="primary"
          data-action="manual-juya-collect"
          :disabled="!operations.canTriggerManualJuyaCollect || !isEnabled || operations.isRunning"
          :loading="isActionPending('manual:juya-collect')"
          @click="emit('collect')"
        >
          {{ operations.isRunning ? '任务执行中...' : '手动采集' }}
        </a-button>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <a-modal
      :open="editVisible"
      title="编辑 Juya RSS 地址"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="editSaving"
      :width="520"
      centered
      @ok="handleSave"
      @cancel="editVisible = false"
    >
      <a-alert
        class="!mb-3"
        type="info"
        show-icon
        message="保存后立即生效，下一轮自动采集使用新地址。"
      />
      <a-input
        v-model:value="editUrl"
        placeholder="https://daily.juya.uk/rss.xml"
        allow-clear
      />
    </a-modal>
  </a-card>
</template>
