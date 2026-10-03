<!-- 新增/编辑公众号配置弹窗 -->
<template>
  <a-modal
    :open="open"
    :title="editing ? '编辑公众号' : '新增公众号'"
    ok-text="保存"
    cancel-text="取消"
    :confirm-loading="saving"
    @ok="handleSave"
    @cancel="$emit('update:open', false)"
  >
    <a-form layout="vertical" class="mt-4">
      <a-form-item label="公众号名称" required>
        <a-input v-model:value="form.name" placeholder="例如：AI热讯" />
      </a-form-item>
      <a-form-item label="AppID" required>
        <a-input v-model:value="form.appId" placeholder="微信公众平台的 AppID" />
      </a-form-item>
      <a-form-item :required="!editing" label="AppSecret">
        <a-input-password
          v-model:value="form.appSecret"
          :placeholder="editing ? '留空则不更新 Secret' : '微信公众平台的 AppSecret'"
        />
      </a-form-item>
      <a-form-item label="备注">
        <a-textarea v-model:value="form.notes" :rows="2" placeholder="备注信息（可选）" />
      </a-form-item>
      <a-form-item label="设为默认">
        <a-switch v-model:checked="form.isDefault" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">

import { useWechatMpAccountModal, type WechatMpAccountModalProps, type WechatMpAccountModalEvents } from "./useWechatMpAccountModal.js";
const props = defineProps<WechatMpAccountModalProps>();
const emit = defineEmits<WechatMpAccountModalEvents>();
const {
  form,
  saving,
  handleSave,
} = useWechatMpAccountModal(props, emit);

</script>
