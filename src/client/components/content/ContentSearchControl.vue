<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  keyword: string;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  search: [keyword: string];
  clear: [];
}>();

const draftKeyword = ref(props.keyword);

watch(
  () => props.keyword,
  (nextKeyword) => {
    draftKeyword.value = nextKeyword;
  }
);

// 统一把关键词裁掉首尾空白后再抛给页面层，保证后续 header 与持久化口径一致。
function submitSearch(): void {
  emit("search", draftKeyword.value.trim());
}

// 清空时同步重置草稿输入，并显式通知页面层做后续状态处理。
function clearSearch(): void {
  draftKeyword.value = "";
  emit("clear");
}
</script>

<template>
  <div class="flex items-center gap-2" data-content-search-control>
    <a-input
      v-model:value="draftKeyword"
      allow-clear
      size="small"
      placeholder="搜索标题"
      data-content-search-input
      @pressEnter="submitSearch"
      @clear="clearSearch"
    />
    <a-button
      size="small"
      :loading="isLoading"
      data-content-search-submit
      @click="submitSearch"
    >
      搜索
    </a-button>
  </div>
</template>
