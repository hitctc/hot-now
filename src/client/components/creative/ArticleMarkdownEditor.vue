<!-- 左右分屏 Markdown 编辑器：左侧 textarea 编辑，右侧实时预览 -->
<template>
  <div class="md-editor">
    <div class="md-editor__pane" :style="{ flex: `0 0 ${leftPercent}%` }">
      <div class="md-editor__label">Markdown</div>
      <textarea
        class="md-editor__textarea"
        :value="modelValue"
        @input="onInput"
        placeholder="在此输入 Markdown 内容..."
        data-testid="markdown-editor-textarea"
      />
    </div>
    <div class="md-editor__divider" @mousedown="onDividerMouseDown" />
    <div class="md-editor__pane" :style="{ flex: `0 0 ${100 - leftPercent}%` }">
      <div class="md-editor__label">{{ previewLabel }}</div>
      <div v-if="previewHtml" class="md-editor__preview" v-html="previewHtml" />
      <div v-else class="md-editor__preview" v-html="renderedHtml" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import MarkdownIt from "markdown-it";

const props = withDefaults(defineProps<{
  modelValue: string;
  /** 外部传入的 HTML 覆盖右侧预览（如主题渲染），为空则用 Markdown 实时渲染 */
  previewHtml?: string;
  previewLabel?: string;
}>(), {
  previewHtml: "",
  previewLabel: "预览",
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });
const renderedHtml = computed(() => md.render(props.modelValue || ""));

function onInput(e: Event): void {
  emit("update:modelValue", (e.target as HTMLTextAreaElement).value);
}

// 拖拽分割线调整左右比例
const leftPercent = ref(50);

function onDividerMouseDown(e: MouseEvent): void {
  e.preventDefault();
  const container = (e.target as HTMLElement).parentElement;
  if (!container) return;
  const startX = e.clientX;
  const startLeft = leftPercent.value;
  const width = container.offsetWidth;

  function onMouseMove(moveE: MouseEvent): void {
    const delta = moveE.clientX - startX;
    const newLeft = Math.min(75, Math.max(25, startLeft + (delta / width) * 100));
    leftPercent.value = newLeft;
  }

  function onMouseUp(): void {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}
</script>

<style scoped>
.md-editor {
  display: flex;
  height: 100%;
  min-height: 400px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}

.md-editor__pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.md-editor__label {
  padding: 6px 12px;
  font-size: 12px;
  color: #999;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  user-select: none;
}

.md-editor__textarea {
  flex: 1;
  padding: 12px;
  border: none;
  outline: none;
  resize: none;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  background: #fff;
}

.md-editor__divider {
  width: 4px;
  background: #e8e8e8;
  cursor: col-resize;
  transition: background 0.15s;
}

.md-editor__divider:hover {
  background: #1890ff;
}

.md-editor__preview {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.7;
  color: #333;
  background: #fff;
}

.md-editor__preview :deep(img) {
  max-width: 100%;
  height: auto;
}

.md-editor__preview :deep(h1),
.md-editor__preview :deep(h2),
.md-editor__preview :deep(h3) {
  margin: 16px 0 8px;
}

.md-editor__preview :deep(blockquote) {
  margin: 8px 0;
  padding: 8px 16px;
  border-left: 3px solid #ddd;
  background: #f9f9f9;
}
</style>
