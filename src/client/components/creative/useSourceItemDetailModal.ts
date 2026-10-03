import { ref, watch } from "vue";
import { readCreativeSourceItem, type CreativeSourceItem } from "../../services/creativeApi.js";

export type SourceItemDetailModalProps = {
  visible: boolean;
  sourceItemId: number | null;
};

export type SourceItemDetailModalEvents = {
  "update:visible": [value: boolean];
};

/** 管理素材详情的读取与响应身份；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useSourceItemDetailModal(props: SourceItemDetailModalProps, emit: <K extends keyof SourceItemDetailModalEvents>(event: K, ...args: SourceItemDetailModalEvents[K]) => void) {


  const loading = ref(false);
  const data = ref<CreativeSourceItem | null>(null);

  /** 打开或切换平台素材编号时读取详情；过期响应不能覆盖后来选中的素材。 */
  watch([() => props.visible, () => props.sourceItemId], async ([visible, sourceItemId], _previous, onCleanup) => {
    let active = true;
    onCleanup(() => { active = false; });
    data.value = null;
    if (!visible || !sourceItemId) { loading.value = false; return; }
    loading.value = true;
    try {
      const source = await readCreativeSourceItem(sourceItemId);
      if (active) data.value = source;
    } catch {
      if (active) data.value = null;
    } finally {
      if (active) loading.value = false;
    }
  }, { immediate: true });
  /** 关闭当前界面并发送原有关闭事件，不创建新的业务任务。 */
  function close(): void {
    emit("update:visible", false);
  }
  /** 把传入时间转换成展示文本，不发起请求或修改业务状态。 */
  function formatTime(value: string | null): string {
    if (!value) return "-";
    const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
      ? value.replace(" ", "T") + "Z" : value;
    const date = new Date(fixed);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  return {
    loading,
    data,
    close,
    formatTime,
  };
}
