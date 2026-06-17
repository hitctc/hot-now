<!-- 左右分屏 Markdown 编辑器：左侧 textarea 编辑，右侧实时预览 -->
<template>
  <div class="md-editor">
    <div class="md-editor__pane" :style="{ flex: `0 0 ${leftPercent}%` }">
      <div class="md-editor__label">Markdown</div>
      <div class="md-editor__textarea-wrap">
        <div v-if="syncScroll" class="md-editor__line-highlight" :style="{ top: lineHighlightTop + 'px' }" />
        <textarea
          ref="textareaRef"
          class="md-editor__textarea"
          :value="modelValue"
          @input="onInput"
          @scroll="onTextareaScroll"
          @click="updateCursorLine"
          @keyup="updateCursorLine"
          @select="updateCursorLine"
          placeholder="在此输入 Markdown 内容..."
          data-testid="markdown-editor-textarea"
        />
      </div>
    </div>
    <div class="md-editor__divider" @mousedown="onDividerMouseDown" />
    <div class="md-editor__pane">
      <div class="md-editor__label">{{ previewLabel }}</div>
      <div v-if="previewHtml" ref="previewRef" class="md-editor__preview" @scroll="onPreviewScroll" v-html="previewHtml" />
      <div v-else ref="previewRef" class="md-editor__preview" @scroll="onPreviewScroll" v-html="renderedHtml" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
import { injectSourceLineTracking } from "../../services/mdSourceLines.js";

const props = withDefaults(defineProps<{
  modelValue: string;
  /** 外部传入的 HTML 覆盖右侧预览（如主题渲染），为空则用 Markdown 实时渲染 */
  previewHtml?: string;
  previewLabel?: string;
  /** 是否开启编辑区与预览区双向同步滚动 + 光标行/对应块高亮 */
  syncScroll?: boolean;
}>(), {
  previewHtml: "",
  previewLabel: "预览",
  syncScroll: true,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });

// 所有链接在新标签打开
md.core.ruler.push("external_links", (state) => {
  for (const token of state.tokens) {
    if (!token.children) continue;
    for (const child of token.children) {
      if (child.type === "link_open") {
        child.attrSet("target", "_blank");
        child.attrSet("rel", "noopener noreferrer");
      }
    }
  }
});

// 注入源码行号标记，预览每个块都能反查到源码行
injectSourceLineTracking(md);

const renderedHtml = computed(() => md.render(props.modelValue || ""));

function onInput(e: Event): void {
  emit("update:modelValue", (e.target as HTMLTextAreaElement).value);
  updateCursorLine();
}

// ─── 按行映射的双向同步 + 光标高亮 ───
// textarea 行高（与 CSS line-height 一致，改 CSS 时同步改这里）
const LINE_HEIGHT = 22;
const TEXTAREA_PADDING_TOP = 12;

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);
const lineHighlightTop = ref(0);
// syncing 标志位防止两侧 scroll 事件互相触发形成死循环
let syncing = false;

/** 当前光标所在行（1 索引） */
function getCursorLine(): number {
  const ta = textareaRef.value;
  if (!ta) return 1;
  return ta.value.substring(0, ta.selectionStart).split("\n").length;
}

/** 编辑区顶部可见的源码行（1 索引） */
function getTopLine(): number {
  const ta = textareaRef.value;
  if (!ta) return 1;
  return Math.round(ta.scrollTop / LINE_HEIGHT) + 1;
}

/** 更新光标行高亮条位置 + 预览对应块高亮 */
function updateCursorLine(): void {
  const ta = textareaRef.value;
  if (!ta) return;
  const line = getCursorLine();
  lineHighlightTop.value = TEXTAREA_PADDING_TOP + (line - 1) * LINE_HEIGHT - ta.scrollTop;
  if (props.syncScroll) highlightPreviewBlock(line);
}

/** 在预览区找到源码行 line 对应的块，高亮并居中滚动 */
function highlightPreviewBlock(line: number): void {
  const preview = previewRef.value;
  if (!preview) return;
  const blocks = Array.from(preview.querySelectorAll("[data-source-line]")) as HTMLElement[];
  if (blocks.length === 0) return;
  // 找最后一个起始行 <= line 的块（即包含或最近位于 line 之前的块）
  let target: HTMLElement | null = null;
  for (const el of blocks) {
    const start = Number(el.getAttribute("data-source-line"));
    if (start <= line) target = el;
    else break;
  }
  // 清除旧高亮
  preview.querySelectorAll(".md-editor__active-block").forEach((e) => e.classList.remove("md-editor__active-block"));
  if (target) {
    target.classList.add("md-editor__active-block");
    syncing = true;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    requestAnimationFrame(() => { syncing = false; });
  }
}

/** 编辑区滚动 → 预览区滚动到顶部可见行对应的块顶部 */
function onTextareaScroll(): void {
  const ta = textareaRef.value;
  if (!ta) return;
  // 同步刷新光标高亮条纵向位置（跟随滚动）
  lineHighlightTop.value = TEXTAREA_PADDING_TOP + (getCursorLine() - 1) * LINE_HEIGHT - ta.scrollTop;
  if (!props.syncScroll || syncing) return;
  syncPreviewToLine(getTopLine());
}

/** 预览区滚动 → 编辑区滚动到顶部可见块对应的源码行 */
function onPreviewScroll(): void {
  if (!props.syncScroll || syncing) return;
  const preview = previewRef.value;
  if (!preview) return;
  const blocks = Array.from(preview.querySelectorAll("[data-source-line]")) as HTMLElement[];
  if (blocks.length === 0) return;
  // 找预览区顶部第一个可见块
  let topLine = 1;
  for (const el of blocks) {
    if (el.offsetTop - preview.scrollTop >= 0) { topLine = Number(el.getAttribute("data-source-line")); break; }
  }
  syncing = true;
  if (textareaRef.value) textareaRef.value.scrollTop = (topLine - 1) * LINE_HEIGHT;
  requestAnimationFrame(() => { syncing = false; });
}

/** 把预览区滚动到源码行 line 对应块的顶部 */
function syncPreviewToLine(line: number): void {
  const preview = previewRef.value;
  if (!preview) return;
  const blocks = Array.from(preview.querySelectorAll("[data-source-line]")) as HTMLElement[];
  if (blocks.length === 0) return;
  let target: HTMLElement | null = null;
  for (const el of blocks) {
    if (Number(el.getAttribute("data-source-line")) <= line) target = el;
    else break;
  }
  if (target) {
    syncing = true;
    preview.scrollTop = target.offsetTop;
    requestAnimationFrame(() => { syncing = false; });
  }
}

// 内容或预览变化后，重新刷新高亮位置（等 DOM 更新）
watch(() => [props.modelValue, props.previewHtml, props.syncScroll], () => {
  nextTick(() => updateCursorLine());
});

// 拖拽分割线调整左右比例，持久化到 localStorage
const STORAGE_KEY = "md-editor-left-percent";

function loadSavedPercent(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : 50;
  } catch {
    return 50;
  }
}

const leftPercent = ref(loadSavedPercent());

function persistLeftPercent(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(leftPercent.value));
  } catch { /* quota 超限等忽略 */ }
}

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
    persistLeftPercent();
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
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.md-editor__label {
  padding: 6px 12px;
  font-size: 12px;
  color: #999;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  user-select: none;
}

.md-editor__textarea-wrap {
  position: relative;
  flex: 1;
  overflow: hidden;
}

/* 当前光标行高亮条：绝对定位在 textarea 后面，textarea 透明背景透出 */
.md-editor__line-highlight {
  position: absolute;
  left: 0;
  right: 0;
  height: 22px;
  background: rgba(24, 144, 255, 0.08);
  border-left: 2px solid #1890ff;
  pointer-events: none;
  z-index: 0;
  transition: top 0.05s linear;
}

.md-editor__textarea {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  padding: 12px;
  border: none;
  outline: none;
  resize: none;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 14px;
  /* 行高固定为 22px，与 JS 中 LINE_HEIGHT 常量保持一致 */
  line-height: 22px;
  color: #333;
  background: transparent;
}

.md-editor__divider {
  flex: 0 0 6px;
  background: #e8e8e8;
  cursor: col-resize;
  transition: background 0.15s;
}

.md-editor__divider:hover {
  background: #1890ff;
}

/* 移动端上下分屏 */
@media (max-width: 768px) {
  .md-editor {
    flex-direction: column;
    min-height: 300px;
  }
  .md-editor__pane:first-child {
    flex: 0 0 50% !important;
  }
  .md-editor__divider {
    flex: 0 0 4px;
    cursor: row-resize;
  }
}

.md-editor__preview {
  flex: 1;
  padding: 0;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.7;
  color: #333;
  background: #fff;
}

/* 预览区当前光标对应块的高亮 */
.md-editor__preview :deep(.md-editor__active-block) {
  background: rgba(24, 144, 255, 0.08);
  box-shadow: -2px 0 0 #1890ff;
  border-radius: 2px;
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
