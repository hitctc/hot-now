<script setup lang="ts">
import SettingsFormModal from "../SettingsFormModal.vue";
import type { HackerNewsQueryFormState, HackerNewsQueryModalMode } from "./sourcesPageShared";

defineProps<{
  open: boolean;
  mode: HackerNewsQueryModalMode;
  form: HackerNewsQueryFormState;
  error: string | null;
  capabilityMessage: string;
  submitting: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [];
}>();
</script>

<template>
  <SettingsFormModal
    :open="open"
    :title="mode === 'create' ? '新增 Hacker News query' : '编辑 Hacker News query'"
    :width="680"
    @cancel="emit('cancel')"
  >
    <div class="flex flex-col gap-4" data-hackernews-query-modal="hackernews-query">
      <a-alert
        v-if="error"
        class="editorial-inline-alert editorial-inline-alert--error"
        type="error"
        show-icon
        :message="error"
      />

      <a-alert
        class="editorial-inline-alert editorial-inline-alert--info"
        type="info"
        show-icon
        :message="capabilityMessage"
        data-hackernews-query-capability
      />

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">查询词</span>
        <input
          v-model="form.query"
          data-hackernews-query-form="query"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
          placeholder="例如 openai、anthropic、cursor、ai agents"
        />
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">优先级</span>
        <input
          v-model.number="form.priority"
          data-hackernews-query-form="priority"
          type="number"
          min="0"
          max="100"
          step="1"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        />
      </label>

      <label class="flex items-center gap-2 text-sm text-editorial-text-main">
        <input
          v-model="form.isEnabled"
          data-hackernews-query-form="is-enabled"
          type="checkbox"
          class="h-4 w-4"
        />
        默认启用采集
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">备注</span>
        <textarea
          v-model="form.notes"
          data-hackernews-query-form="notes"
          rows="3"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        />
      </label>

      <div class="flex justify-end gap-2">
        <a-button @click="emit('cancel')">取消</a-button>
        <a-button
          type="primary"
          data-hackernews-query-form="submit"
          :loading="submitting"
          @click="emit('submit')"
        >
          {{ mode === "create" ? "新增 query" : "保存更新" }}
        </a-button>
      </div>
    </div>
  </SettingsFormModal>
</template>
