<!-- 左右分屏 Markdown 编辑器：左侧 textarea 编辑，右侧实时预览 -->
<template>
  <div class="md-editor" :class="{ 'md-editor--3pane': humanMode }">
    <template v-if="humanMode">
      <!-- 左栏：AI 生成的草稿（可编辑，独立滚动，不参与预览联动） -->
      <div class="md-editor__pane md-editor__pane--ai-draft">
        <div class="md-editor__label">AI 生成的草稿</div>
        <textarea
          ref="aiDraftTextareaRef"
          class="md-editor__textarea"
          :value="aiDraft"
          @input="onAiDraftInput"
          placeholder="AI 生成的草稿（可编辑）..."
        />
      </div>
      <div class="md-editor__divider md-editor__divider--static" />
      <!-- 中栏：人工转写（发布内容），滚动同步驱动右栏预览 -->
      <div class="md-editor__pane">
        <div class="md-editor__label md-editor__label--human">人工转写（发布内容）</div>
        <textarea
          ref="textareaRef"
          class="md-editor__textarea"
          :value="modelValue"
          @input="onInput"
          @scroll="onTextareaScroll"
          @click="updateCursorHighlight"
          @keyup="updateCursorHighlight"
          placeholder="在此口述/输入要发布的内容..."
          data-testid="markdown-editor-textarea"
        />
      </div>
      <div class="md-editor__divider md-editor__divider--static" />
      <!-- 右栏：预览（联动中栏） -->
      <div class="md-editor__pane">
        <div class="md-editor__label">{{ previewLabel }}</div>
        <div v-if="previewHtml" ref="previewRef" class="md-editor__preview" v-html="previewHtml" />
        <div v-else ref="previewRef" class="md-editor__preview" v-html="renderedHtml" />
      </div>
    </template>
    <template v-else>
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
    </template>
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
  /** 三栏模式：左 AI 草稿 + 中 人工转写 + 右 预览。false 时保持两栏（Markdown + 预览） */
  humanMode?: boolean;
  /** 三栏模式下的左栏 AI 草稿内容（content_markdown），独立编辑、不联动预览 */
  aiDraft?: string;
}>(), {
  previewHtml: "",
  previewLabel: "预览",
  syncScroll: true,
  humanMode: false,
  aiDraft: "",
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:aiDraft": [value: string];
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

// 左栏 AI 草稿独立编辑（三栏模式），不参与预览联动与滚动同步
function onAiDraftInput(e: Event): void {
  emit("update:aiDraft", (e.target as HTMLTextAreaElement).value);
}

// ─── 滚动同步（编辑区→预览区，单向）+ 预览对应块高亮 ───
// 设计原则：只让编辑区驱动预览区，反向不联动，从根上杜绝双向滚动打架。
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const aiDraftTextareaRef = ref<HTMLTextAreaElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);

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

/** 光标移动时高亮预览中对应的块；不自动滚动预览，滚动统一交给中栏滚动同步，避免两套目标打架跳闪 */
function updateCursorHighlight(): void {
  const preview = previewRef.value;
  if (!preview) return;
  preview.querySelectorAll(".md-editor__active-block").forEach((e) => e.classList.remove("md-editor__active-block"));
  if (!props.syncScroll) return;
  const target = findBlockForLine(getPreviewBlocks(), getCursorLine());
  if (!target) return;
  target.classList.add("md-editor__active-block");
}

// 滚动同步 rAF 句柄：合并高频 scroll 到下一帧
let scrollSyncRaf: number | null = null;

/** 中栏滚动 → 预览按整体比例同步（单向）：纯比例连续跟随，不读块位置，避免每帧布局计算造成跳闪 */
function onTextareaScroll(): void {
  if (!props.syncScroll) return;
  if (scrollSyncRaf != null) return;
  scrollSyncRaf = requestAnimationFrame(() => {
    scrollSyncRaf = null;
    const ta = textareaRef.value;
    const preview = previewRef.value;
    if (!ta || !preview) return;
    const taMax = ta.scrollHeight - ta.clientHeight;
    const pvMax = preview.scrollHeight - preview.clientHeight;
    if (taMax <= 0 || pvMax <= 0) return;
    preview.scrollTop = (ta.scrollTop / taMax) * pvMax;
  });
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

/* 三栏模式：左栏静态分隔条（不拖拽）+ 中栏标签高亮（发布内容）+ 左栏灰底（AI 草稿） */
.md-editor__divider--static {
  cursor: default;
}
.md-editor__divider--static:hover {
  background: #e8e8e8;
}
.md-editor__label--human {
  background: #fff7e6;
  color: #d46b08;
  font-weight: 600;
}
.md-editor__pane--ai-draft .md-editor__textarea {
  background: #fafafa;
}

/* 移动端上下分屏 */
@media (max-width: 768px) {
  .md-editor {
    flex-direction: column;
    min-height: 500px;
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
  background: rgba(24, 144, 255, 0.16);
  box-shadow: -3px 0 0 #1890ff;
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
