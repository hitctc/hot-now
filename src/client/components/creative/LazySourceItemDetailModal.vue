<script setup lang="ts">
import { defineAsyncComponent, defineComponent, h, ref, watch } from "vue";
import DetailModuleLoading from "./DetailModuleLoading.vue";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ visible: boolean; sourceItemId: number | null }>();
const emit = defineEmits<{ "update:visible": [value: boolean] }>();
const activated = ref(false);
watch(() => props.visible, visible => { if (visible) activated.value = true; }, { immediate: true });

/** 首次打开才下载素材弹窗；关闭后保留原组件，迟到读取沿用其身份保护。 */
const modal = defineAsyncComponent({
    loader: () => import("./SourceItemDetailModal.vue"),
    delay: 0,
    loadingComponent: defineComponent({
      /** 下载期间沿用素材弹窗尺寸与层级，避免文章内打开时被文章弹窗遮住。 */
      setup: () => () => h(DetailModuleLoading, { open: props.visible, kind: "source", onClose: () => emit("update:visible", false) }),
    }),
    errorComponent: defineComponent({
      /** 下载失败仍保留可关闭的外壳，重载继续由确认流程处理。 */
      setup: () => () => h(DetailModuleLoading, { open: props.visible, kind: "source", error: true, onClose: () => emit("update:visible", false), onRetry: retryModal }),
    }),
});

/** 动态导入失败可能留在浏览器模块缓存；确认后重载页面，不自动重放任何业务动作。 */
function retryModal(): void {
  if (window.confirm("重新加载会丢弃当前页面尚未保存的内容。确认重新加载并重试？")) window.location.reload();
}
</script>

<template>
  <component :is="modal" v-if="activated" v-bind="$attrs" :visible="visible" :source-item-id="sourceItemId" @update:visible="emit('update:visible', $event)" />
</template>
