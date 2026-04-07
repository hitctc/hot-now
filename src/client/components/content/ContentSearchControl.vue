<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    keyword: string;
    isLoading?: boolean;
    compact?: boolean;
  }>(),
  {
    isLoading: false,
    compact: false
  }
);

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

const hasDraftKeyword = computed(() => draftKeyword.value.trim().length > 0);
const rootClass = computed(() => (props.compact ? "flex w-full items-center gap-2" : "flex items-center gap-2"));
const inputClass = computed(() => (props.compact ? "min-w-0 flex-1" : undefined));

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
  <div :class="rootClass" data-content-search-control>
    <a-input
      v-model:value="draftKeyword"
      size="small"
      :class="inputClass"
      placeholder="搜索标题"
      data-content-search-input
      @pressEnter="submitSearch"
    >
      <template #suffix>
        <button
          v-if="hasDraftKeyword"
          type="button"
          class="inline-flex h-4 w-4 items-center justify-center rounded-full border-0 bg-transparent p-0 text-editorial-text-muted transition hover:text-editorial-text-main"
          data-content-search-clear
          aria-label="清空搜索词"
          @click="clearSearch"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </template>
    </a-input>
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
