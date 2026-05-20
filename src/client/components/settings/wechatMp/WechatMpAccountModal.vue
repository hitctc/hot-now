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
import { ref, watch } from "vue";
import { message } from "ant-design-vue";
import { saveWechatMpAccount, type WechatMpAccountSummary } from "../../../services/settingsApi.js";

const props = defineProps<{
  open: boolean;
  editing: WechatMpAccountSummary | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

const form = ref({
  name: "",
  appId: "",
  appSecret: "",
  notes: "",
  isDefault: false,
});
const saving = ref(false);

watch(() => props.open, (val) => {
  if (val) {
    if (props.editing) {
      form.value = {
        name: props.editing.name,
        appId: props.editing.appId,
        appSecret: "",
        notes: props.editing.notes ?? "",
        isDefault: props.editing.isDefault,
      };
    } else {
      form.value = { name: "", appId: "", appSecret: "", notes: "", isDefault: false };
    }
  }
});

async function handleSave(): Promise<void> {
  if (!form.value.name.trim()) {
    message.warning("请输入公众号名称");
    return;
  }
  if (!form.value.appId.trim()) {
    message.warning("请输入 AppID");
    return;
  }
  if (!props.editing && !form.value.appSecret) {
    message.warning("新增公众号时必须提供 AppSecret");
    return;
  }

  saving.value = true;
  try {
    await saveWechatMpAccount({
      id: props.editing?.id,
      name: form.value.name.trim(),
      appId: form.value.appId.trim(),
      appSecret: form.value.appSecret || undefined,
      notes: form.value.notes || undefined,
      isDefault: form.value.isDefault,
    });
    message.success(props.editing ? "更新成功" : "新增成功");
    emit("update:open", false);
    emit("saved");
  } catch {
    message.error("保存失败");
  } finally {
    saving.value = false;
  }
}
</script>
