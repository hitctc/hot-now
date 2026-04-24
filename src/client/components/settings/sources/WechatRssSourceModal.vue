<script setup lang="ts">
import SettingsFormModal from "../SettingsFormModal.vue";
import type { WechatRssFormState } from "./sourcesPageShared";

defineProps<{
  open: boolean;
  form: WechatRssFormState;
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
    title="批量新增微信公众号 RSS"
    :width="760"
    @cancel="emit('cancel')"
  >
    <div class="flex flex-col gap-4" data-wechat-rss-modal="wechat-rss">
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
        data-wechat-rss-capability
      />

      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-editorial-text-main">RSS 链接</span>
        <textarea
          v-model="form.rssUrls"
          data-wechat-rss-form="rss-urls"
          rows="8"
          class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-2 text-sm leading-6 text-editorial-text-main outline-none"
          placeholder="每行一个 RSS 链接，也可以用逗号分隔"
        />
      </label>

      <div class="flex justify-end gap-2">
        <a-button @click="emit('cancel')">取消</a-button>
        <a-button
          type="primary"
          data-wechat-rss-form="submit"
          :loading="submitting"
          @click="emit('submit')"
        >
          批量新增
        </a-button>
      </div>
    </div>
  </SettingsFormModal>
</template>
