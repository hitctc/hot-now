<script setup lang="ts">
import EditablePromptRow from "../EditablePromptRow.vue";

defineProps<{
  prompts: string[];
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (event: "copy", value: string): void;
  (event: "save", index: number, value: string): void;
  (event: "dirty-change", key: string, dirty: boolean): void;
}>();
</script>

<template>
  <!-- 短内容提示词只供外部生图，保持不直接注入正文。 -->
  <section v-if="prompts.length">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">配图提示词</h3>
    </div>
    <div class="flex flex-col gap-1.5">
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
