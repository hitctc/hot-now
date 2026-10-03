import { ref, watch } from "vue";
import { message } from "ant-design-vue";
import { saveWechatMpAccount, type WechatMpAccountSummary } from "../../../services/settingsApi.js";

export type WechatMpAccountModalProps = {
  open: boolean;
  editing: WechatMpAccountSummary | null;
};

export type WechatMpAccountModalEvents = {
  "update:open": [value: boolean];
  saved: [];
};

/** 管理公众号账号的表单校验与保存；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useWechatMpAccountModal(props: WechatMpAccountModalProps, emit: <K extends keyof WechatMpAccountModalEvents>(event: K, ...args: WechatMpAccountModalEvents[K]) => void) {


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
  /** 校验并保存当前表单/编辑稿，按现役返回值更新保存状态和事件。 */
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

  return {
    form,
    saving,
    handleSave,
  };
}
