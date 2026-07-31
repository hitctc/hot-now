<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { buildCreativeImageThumbnailUrl } from "../../utils/creativeImageThumbnail.js";

const props = withDefaults(defineProps<{
  originalUrl: string;
  width?: number;
}>(), {
  width: 44
});

const failed = ref(false);
const previewVisible = ref(false);
const thumbnailUrl = computed(() => buildCreativeImageThumbnailUrl(props.originalUrl));
const preview = computed(() => ({
  // 预览弹窗真正打开前只引用缩略图，避免隐藏的预览节点提前下载原图。
  src: previewVisible.value ? props.originalUrl : thumbnailUrl.value ?? undefined,
  visible: previewVisible.value,
  onVisibleChange: (visible: boolean) => {
    previewVisible.value = visible;
  }
}));

/** 原图变化时允许新的缩略图重新进入加载流程。 */
watch(() => props.originalUrl, () => {
  failed.value = false;
  previewVisible.value = false;
});

/** 缩略图失败后只显示占位，禁止自动回退下载大尺寸原图。 */
function handleThumbnailError(): void {
  failed.value = true;
}

/** 用户点击缩略图后才允许预览节点引用并下载原图。 */
function openOriginalPreview(): void {
  previewVisible.value = true;
}
</script>

<template>
  <a-image
    v-if="thumbnailUrl && !failed"
    :src="thumbnailUrl"
    :preview="preview"
    :width="width"
    :height="width"
    loading="lazy"
    decoding="async"
    fetchpriority="low"
    class="!rounded !border !border-editorial-border !object-contain"
    @click="openOriginalPreview"
    @error="handleThumbnailError"
  />
  <span
    v-else-if="!thumbnailUrl"
    class="inline-flex h-11 min-w-11 items-center justify-center rounded border border-editorial-border bg-editorial-surface-soft px-1 text-[10px] text-editorial-text-muted"
  >有封面</span>
  <template v-else>
    <button
      type="button"
      class="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded border border-editorial-border bg-editorial-surface-soft px-1 text-[10px] text-editorial-text-muted hover:border-editorial-primary"
      title="缩略图加载失败，点击查看原图"
      @click="openOriginalPreview"
    >查看封面</button>
    <a-image
      v-if="previewVisible"
      :src="originalUrl"
      :preview="preview"
      class="!hidden"
    />
  </template>
</template>
