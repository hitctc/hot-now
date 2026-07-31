<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  label: string;
  value: string;
  readonly?: boolean;
  regenerating?: boolean;
  regeneratable?: boolean;
}>();

const emit = defineEmits<{
  save: [value: string];
  copy: [value: string];
  regenerate: [];
  dirtyChange: [dirty: boolean];
}>();

const editing = ref(false);
const draft = ref(props.value);

watch(() => props.value, (value) => {
  draft.value = value;
  editing.value = false;
  emit("dirtyChange", false);
});

watch(draft, (value) => {
  if (editing.value) emit("dirtyChange", value !== props.value);
});

/** 进入编辑时始终从已保存值开始，取消不会污染父组件状态。 */
function startEditing(): void {
  draft.value = props.value;
  editing.value = true;
}

function cancelEditing(): void {
  draft.value = props.value;
  editing.value = false;
  emit("dirtyChange", false);
}

function saveEditing(): void {
  const value = draft.value.trim();
  if (value === props.value) {
    cancelEditing();
    return;
  }
  emit("save", value);
}
</script>

<template>
  <div class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1.5">
    <div v-if="editing" class="space-y-1.5">
      <a-textarea v-model:value="draft" :auto-size="{ minRows: 3, maxRows: 8 }" />
      <div class="flex justify-end gap-2">
        <a-button size="small" @click="cancelEditing">取消</a-button>
        <a-button size="small" type="primary" @click="saveEditing">保存</a-button>
      </div>
    </div>
    <div v-else class="flex items-start gap-1.5">
      <span class="flex-1 whitespace-pre-wrap text-[11px] leading-relaxed text-editorial-text-muted">
        <strong class="font-medium text-editorial-text-body">{{ label }}：</strong>{{ value || "尚未生成" }}
      </span>
      <button v-if="!readonly" class="shrink-0 text-[11px] text-editorial-link-active hover:underline" @click="startEditing">编辑</button>
      <button v-if="value" class="shrink-0 text-[11px] text-editorial-link-active hover:underline" @click="emit('copy', value)">复制</button>
      <button
        v-if="!readonly && regeneratable !== false"
        class="shrink-0 text-[11px] text-editorial-link-active hover:underline disabled:opacity-50"
        :disabled="regenerating"
        @click="emit('regenerate')"
      >{{ regenerating ? "生成中..." : "单独生成" }}</button>
    </div>
  </div>
</template>
