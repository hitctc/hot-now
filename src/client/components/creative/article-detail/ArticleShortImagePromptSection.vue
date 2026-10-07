<script setup lang="ts">
import EditablePromptRow from "../EditablePromptRow.vue";
import { useArticleDetailSectionCollapse } from "./useArticleDetailSectionCollapse.js";

const props = defineProps<{
  prompts: string[];
  direction?: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (event: "copy", value: string): void;
  (event: "save", index: number, value: string): void;
  (event: "dirty-change", key: string, dirty: boolean): void;
}>();

// 复用详情区块偏好，提示词按内容类型分别记忆；隐藏不销毁未保存的编辑状态。
const promptsCollapse = useArticleDetailSectionCollapse("image-prompts", () => props.direction);
</script>

<template>
  <!-- 短内容提示词只供外部生图，保持不直接注入正文。 -->
  <section v-if="prompts.length">
    <div class="article-section-heading mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">配图提示词</h3>
      <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" :aria-expanded="!promptsCollapse.collapsed.value" data-image-prompts-collapse @click="promptsCollapse.collapsed.value = !promptsCollapse.collapsed.value">{{ promptsCollapse.collapsed.value ? '展开' : '折叠' }}</a-button>
    </div>
    <div v-show="!promptsCollapse.collapsed.value" data-image-prompts-content class="flex flex-col gap-1.5">
      <EditablePromptRow
        v-for="(prompt, index) in prompts"
        :key="index"
        :label="`短内容配图${index + 1}`"
        :value="prompt"
        :readonly="readonly"
        :regeneratable="false"
        @copy="emit('copy', $event)"
        @save="emit('save', index, $event)"
        @dirty-change="emit('dirty-change', `short-${index}`, $event)"
      />
    </div>
  </section>
</template>
