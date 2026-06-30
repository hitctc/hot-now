<!-- 左右分屏 Markdown 编辑器：左侧 textarea 编辑，右侧实时预览 -->
<template>
  <div class="md-editor">
    <div class="md-editor__pane" :style="{ flex: `0 0 ${leftPercent}%` }">
      <div class="md-editor__label">Markdown</div>
      <textarea
        ref="textareaRef"
        class="md-editor__textarea"
        :value="modelValue"
        @input="onInput"
        @scroll="onTextareaScroll"
        @click="updateCursorHighlight"
        @keyup="updateCursorHighlight"
        placeholder="在此输入 Markdown 内容..."
        data-testid="markdown-editor-textarea"
      />
    </div>
    <div class="md-editor__divider" @mousedown="onDividerMouseDown" />
    <div class="md-editor__pane">
      <div class="md-editor__label">{{ previewLabel }}</div>
      <div v-if="previewHtml" ref="previewRef" class="md-editor__preview" v-html="previewHtml" />
      <div v-else ref="previewRef" class="md-editor__preview" v-html="renderedHtml" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
import { injectSourceLineTracking } from "../../services/mdSourceLines.js";

const props = withDefaults(defineProps<{
  modelValue: string;
  /** 外部传入的 HTML 覆盖右侧预览（如主题渲染），为空则用 Markdown 实时渲染 */
  previewHtml?: string;
  previewLabel?: string;
  /** 是否开启编辑区→预览区滚动同步 + 预览对应块高亮 */
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
  updateCursorHighlight();
}

// ─── 滚动同步（编辑区→预览区，单向）+ 预览对应块高亮 ───
// 设计原则：只让编辑区驱动预览区，反向不联动，从根上杜绝双向滚动打架。
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);
// 编辑区约定行高（font-size 14 × line-height 1.6 ≈ 22），仅用于滚动位置→行号换算，
// 预览块按源码行反查时容差大，不需要像素级精确。
const EDITOR_LINE_HEIGHT = 22;

/** 当前光标所在行（1 索引）。
 *  仅在 textarea 拥有焦点时才读 selectionStart：刚挂载的 textarea 未聚焦时，
 *  浏览器会把 selectionStart 停在 value 末尾，若当成光标位置会让预览被拉到底部。 */
function getCursorLine(): number {
  const ta = textareaRef.value;
  if (!ta || document.activeElement !== ta) return 1;
  return ta.value.substring(0, ta.selectionStart).split("\n").length;
}

/** 预览区所有带源码行号的块 */
function getPreviewBlocks(): HTMLElement[] {
  return Array.from(previewRef.value?.querySelectorAll("[data-source-line]") ?? []) as HTMLElement[];
}

/** 找源码行 line 所属的块（最后一个起始行 ≤ line 的块） */
function findBlockForLine(blocks: HTMLElement[], line: number): HTMLElement | null {
  let target: HTMLElement | null = null;
  for (const el of blocks) {
    if (Number(el.getAttribute("data-source-line")) <= line) target = el;
    else break;
  }
  return target;
}

/** 光标移动时高亮预览中对应的块；块不在视口内时瞬时滚到可见（单向写 scrollTop，不会打架） */
function updateCursorHighlight(): void {
  const preview = previewRef.value;
  if (!preview) return;
  preview.querySelectorAll(".md-editor__active-block").forEach((e) => e.classList.remove("md-editor__active-block"));
  if (!props.syncScroll) return;
  const target = findBlockForLine(getPreviewBlocks(), getCursorLine());
  if (!target) return;
  target.classList.add("md-editor__active-block");
  // 仅当块脱离预览视口时才滚动，避免每次点击都跳动
  const delta = target.getBoundingClientRect().top - preview.getBoundingClientRect().top;
  if (delta < 0 || delta + target.offsetHeight > preview.clientHeight) {
    preview.scrollTop += delta;
  }
}

/** 编辑区滚动 → 预览区滚到顶部可见行对应的块（单向，不会打架） */
function onTextareaScroll(): void {
  if (!props.syncScroll) return;
  const ta = textareaRef.value;
  const preview = previewRef.value;
  if (!ta || !preview) return;
  const topLine = Math.round(ta.scrollTop / EDITOR_LINE_HEIGHT) + 1;
  const target = findBlockForLine(getPreviewBlocks(), topLine);
  if (!target) return;
  // 用 getBoundingClientRect 算目标块相对预览区的偏移，叠加当前 scrollTop。
  // 不能用 offsetTop——它相对 offsetParent（定位祖先），详情弹窗 modal 里有定位祖先会算错。
  const delta = target.getBoundingClientRect().top - preview.getBoundingClientRect().top;
  preview.scrollTop += delta;
}

onMounted(() => { nextTick(() => updateCursorHighlight()); });

// 内容或预览变化后刷新高亮
watch(() => [props.modelValue, props.previewHtml, props.syncScroll], () => {
  nextTick(() => updateCursorHighlight());
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
