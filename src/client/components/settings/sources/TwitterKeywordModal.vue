<script setup lang="ts">
import SettingsFormModal from "../SettingsFormModal.vue";
import {
  twitterKeywordCategoryOptions,
  type TwitterKeywordFormState,
  type TwitterKeywordModalMode
} from "./sourcesPageShared";

defineProps<{
  open: boolean;
  mode: TwitterKeywordModalMode;
  form: TwitterKeywordFormState;
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
    :title="mode === 'create' ? '新增 Twitter 关键词' : '编辑 Twitter 关键词'"
    :width="680"
    @cancel="emit('cancel')"
  >
    <div class="flex flex-col gap-4" data-twitter-keyword-modal="twitter-keyword">
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
        data-twitter-keyword-capability
      />

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">关键词</span>
        <input
          v-model="form.keyword"
          data-twitter-keyword-form="keyword"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
          placeholder="例如 OpenAI、Anthropic、Agents SDK"
        />
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">分类</span>
        <select
          v-model="form.category"
          data-twitter-keyword-form="category"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        >
          <option
            v-for="option in twitterKeywordCategoryOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">优先级</span>
        <input
          v-model.number="form.priority"
          data-twitter-keyword-form="priority"
          type="number"
          min="0"
          max="100"
          step="1"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        />
      </label>

      <label class="flex items-center gap-2 text-sm text-editorial-text-main">
        <input
          v-model="form.isCollectEnabled"
          data-twitter-keyword-form="is-collect-enabled"
          type="checkbox"
          class="h-4 w-4"
        />
        默认启用采集
      </label>

      <label class="flex items-center gap-2 text-sm text-editorial-text-main">
        <input
          v-model="form.isVisible"
          data-twitter-keyword-form="is-visible"
          type="checkbox"
          class="h-4 w-4"
        />
        默认启用展示
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">备注</span>
        <textarea
          v-model="form.notes"
          data-twitter-keyword-form="notes"
          rows="3"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        />
      </label>

      <div class="flex justify-end gap-2">
        <a-button @click="emit('cancel')">取消</a-button>
        <a-button
          type="primary"
          data-twitter-keyword-form="submit"
          :loading="submitting"
          @click="emit('submit')"
        >
          {{ mode === "create" ? "新增关键词" : "保存更新" }}
        </a-button>
      </div>
    </div>
  </SettingsFormModal>
</template>
