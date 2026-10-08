<script setup lang="ts">
import { defineAsyncComponent, defineComponent, h, ref, watch } from "vue";
import type { CreativeFinishedArticle, WechatThemeId } from "../../services/creativeApi.js";
import DetailModuleLoading from "./DetailModuleLoading.vue";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ open: boolean; article: CreativeFinishedArticle | null; readonly?: boolean; loading?: boolean }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
  openSourceItem: [sourceItemId: number];
  openPush: [article: CreativeFinishedArticle, themeId: WechatThemeId];
}>();
const activated = ref(false);
watch(() => props.open, open => { if (open) activated.value = true; }, { immediate: true });

/** 首次需要详情时才下载编辑器；关闭后保留组件，让原关闭保存与任务观察生命周期完成。 */
const drawer = defineAsyncComponent({
    loader: () => import("./ArticleDetailDrawer.vue"),
    delay: 0,
    loadingComponent: defineComponent({
      /** 下载期间沿用全屏文章外壳；关闭只通知父页，不触发正文操作。 */
      setup: () => () => h(DetailModuleLoading, { open: props.open, kind: "article", onClose: () => emit("update:open", false) }),
    }),
    errorComponent: defineComponent({
      /** 下载失败仍保留可关闭的外壳，重载继续由确认流程处理。 */
      setup: () => () => h(DetailModuleLoading, { open: props.open, kind: "article", error: true, onClose: () => emit("update:open", false), onRetry: retryDrawer }),
    }),
});

/** 动态导入失败可能留在浏览器模块缓存；确认后重载页面，不自动重放任何业务动作。 */
function retryDrawer(): void {
  if (window.confirm("重新加载会丢弃当前页面尚未保存的内容。确认重新加载并重试？")) window.location.reload();
}
</script>

<template>
  <component
    :is="drawer"
    v-if="activated"
    v-bind="$attrs"
    :open="open"
    :article="article"
    :readonly="readonly"
    :loading="loading"
    @update:open="emit('update:open', $event)"
    @saved="emit('saved')"
    @open-source-item="emit('openSourceItem', $event)"
    @open-push="(article, themeId) => emit('openPush', article, themeId)"
  />
</template>
