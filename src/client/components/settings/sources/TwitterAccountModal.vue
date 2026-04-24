<script setup lang="ts">
import SettingsFormModal from "../SettingsFormModal.vue";
import {
  twitterAccountCategoryOptions,
  type TwitterAccountFormState,
  type TwitterAccountModalMode
} from "./sourcesPageShared";

defineProps<{
  open: boolean;
  mode: TwitterAccountModalMode;
  form: TwitterAccountFormState;
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
    :title="mode === 'create' ? '新增 Twitter 账号' : '编辑 Twitter 账号'"
    :width="680"
    @cancel="emit('cancel')"
  >
    <div class="flex flex-col gap-4" data-twitter-account-modal="twitter-account">
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
        data-twitter-account-capability
      />

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">Username</span>
        <input
          v-model="form.username"
          data-twitter-account-form="username"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
          placeholder="例如 openai，不需要填写 @"
        />
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">展示名称</span>
        <input
          v-model="form.displayName"
          data-twitter-account-form="display-name"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        />
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">分类</span>
        <select
          v-model="form.category"
          data-twitter-account-form="category"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        >
          <option
            v-for="option in twitterAccountCategoryOptions"
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
          data-twitter-account-form="priority"
          type="number"
          min="0"
          max="100"
          step="1"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        />
      </label>

      <label class="flex items-center gap-2 text-sm text-editorial-text-main">
        <input
          v-model="form.includeReplies"
          data-twitter-account-form="include-replies"
          type="checkbox"
          class="h-4 w-4"
        />
        采集回复
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">备注</span>
        <textarea
          v-model="form.notes"
          data-twitter-account-form="notes"
          rows="3"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
        />
      </label>

      <div class="flex justify-end gap-2">
        <a-button @click="emit('cancel')">取消</a-button>
        <a-button
          type="primary"
          data-twitter-account-form="submit"
          :loading="submitting"
          @click="emit('submit')"
        >
          {{ mode === "create" ? "新增账号" : "保存更新" }}
        </a-button>
      </div>
    </div>
  </SettingsFormModal>
</template>
