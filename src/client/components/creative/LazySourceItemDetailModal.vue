<script setup lang="ts">
import { defineAsyncComponent, defineComponent, h, ref, watch } from "vue";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ visible: boolean; sourceItemId: number | null }>();
const emit = defineEmits<{ "update:visible": [value: boolean] }>();
const activated = ref(false);
watch(() => props.visible, visible => { if (visible) activated.value = true; }, { immediate: true });

/** 首次打开才下载素材弹窗；关闭后保留原组件，迟到读取沿用其身份保护。 */
const modal = defineAsyncComponent({
    loader: () => import("./SourceItemDetailModal.vue"),
    delay: 0,
    loadingComponent: defineComponent({ setup: () => () => props.visible ? h("div", { role: "status", class: "fixed inset-0 z-[1100] grid place-items-center bg-black/30 text-white" }, ["正在加载素材详情…", h("button", { onClick: () => emit("update:visible", false) }, "关闭")]) : null }),
    errorComponent: defineComponent({ setup: () => () => props.visible ? h("div", { role: "alert", class: "fixed inset-0 z-[1100] grid place-items-center bg-black/30" }, [
      h("button", { class: "rounded bg-white px-4 py-3", onClick: retryModal }, "素材详情加载失败，重新加载页面后再打开"),
      h("button", { class: "rounded bg-white px-4 py-3", onClick: () => emit("update:visible", false) }, "关闭"),
    ]) : null }),
});

/** 动态导入失败可能留在浏览器模块缓存；确认后重载页面，不自动重放任何业务动作。 */
function retryModal(): void {
  if (window.confirm("重新加载会丢弃当前页面尚未保存的内容。确认重新加载并重试？")) window.location.reload();
}
</script>

<template>
  <component :is="modal" v-if="activated" v-bind="$attrs" :visible="visible" :source-item-id="sourceItemId" @update:visible="emit('update:visible', $event)" />
</template>
