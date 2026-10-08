<script setup lang="ts">
import { Button, Modal, Spin } from "ant-design-vue";

// 异步组件会向占位组件透传正文参数和事件；外壳只接收显式参数，避免 Modal 重复触发关闭。
defineOptions({ inheritAttrs: false });
// 此组件必须同步加载：首次下载正文组件时就需要完整外壳，不能依赖正文组件的样式。
defineProps<{ open: boolean; kind: "article" | "source"; error?: boolean }>();
const emit = defineEmits<{ close: []; retry: [] }>();
</script>

<template>
  <Modal
    :open="open"
    :title="kind === 'source' ? '素材详情' : undefined"
    :width="kind === 'article' ? '100%' : '90%'"
    :z-index="kind === 'article' ? 1000 : 1950"
    :wrap-class-name="`detail-module-loading ${kind === 'article' ? 'article-detail-modal detail-module-loading--article' : 'source-item-detail-modal'}`"
    :footer="null"
    :body-style="{ padding: '24px', overflowY: 'auto' }"
    transition-name=""
    mask-transition-name=""
    centered
    destroy-on-close
    @cancel="emit('close')"
  >
    <div :role="error ? 'alert' : 'status'" aria-live="polite" class="flex min-h-[240px] flex-col items-center justify-center gap-3">
      <template v-if="error">
        <span class="text-sm text-editorial-text-muted">{{ kind === 'article' ? '编辑器' : '素材详情' }}加载失败</span>
        <Button @click="emit('retry')">重新加载页面后再打开</Button>
      </template>
      <template v-else>
        <Spin size="large" />
        <span class="text-sm text-editorial-text-muted">正在加载{{ kind === 'article' ? '文章详情' : '素材详情' }}…</span>
      </template>
    </div>
  </Modal>
</template>

<style>
/* 下载时也有不透明内容面板，不再直接在页面上覆盖提示文字。 */
.detail-module-loading .ant-modal-content {
  background: #fff;
}
/* 与正式文章详情一样由固定包裹层拉伸铺满视口，样式随轻量外壳同步到达。 */
.detail-module-loading--article.ant-modal-centered {
  display: flex !important;
  align-items: stretch !important;
  padding: 0 !important;
}
.detail-module-loading--article.ant-modal-centered::before {
  display: none !important;
}
.detail-module-loading--article .ant-modal {
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  top: 0 !important;
  text-align: start;
}
.detail-module-loading--article .ant-modal-content {
  position: absolute;
  inset: 0;
  border-radius: 0;
  overflow: hidden;
}
</style>
