<script setup lang="ts">
import SettingsFormModal from "../SettingsFormModal.vue";
import type { SourceFormState, SourceModalMode } from "./sourcesPageShared";

defineProps<{
  open: boolean;
  mode: SourceModalMode;
  form: SourceFormState;
  error: string | null;
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
    :title="mode === 'create' ? '新增来源' : '编辑来源'"
    :width="760"
    @cancel="emit('cancel')"
  >
    <div class="flex flex-col gap-4" data-source-modal="source">
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
        message="这里只新增 RSS 来源，填写可公开访问的 RSS 链接即可。"
        data-source-modal-intro
      />

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">RSS 地址</span>
        <input
          v-model="form.rssUrl"
          data-source-form="rss-url"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm text-editorial-text-main outline-none"
          placeholder="https://example.com/feed.xml"
        />
      </label>

      <div class="flex justify-end gap-2">
        <a-button @click="emit('cancel')">取消</a-button>
        <a-button
          type="primary"
          data-source-form="submit"
          :loading="submitting"
          @click="emit('submit')"
        >
          {{ mode === "create" ? "新增来源" : "保存更新" }}
        </a-button>
      </div>
    </div>
  </SettingsFormModal>
</template>
