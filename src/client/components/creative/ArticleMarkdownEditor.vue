<!-- 左右分屏 Markdown 编辑器：左侧 textarea 编辑，右侧实时预览 -->
<template>
  <div class="md-editor" :class="{ 'md-editor--3pane': humanMode }">
    <template v-if="humanMode">
      <!-- 左栏：AI 生成的草稿（可编辑，独立滚动，不参与预览联动） -->
      <div class="md-editor__pane md-editor__pane--ai-draft">
        <div class="md-editor__label">AI 生成的草稿<span class="md-editor__word-count">{{ countWords(aiDraft) }}字</span></div>
        <div class="md-editor__textarea-wrap">
          <div ref="aiDraftHighlightRef" class="md-editor__line-highlight" />
          <textarea
            ref="aiDraftTextareaRef"
            class="md-editor__textarea"
            :value="aiDraft"
            @input="onAiDraftInput"
            @click="updateAiDraftLineHighlight"
            @keyup="updateAiDraftLineHighlight"
            @scroll="scrollAiDraftLineHighlight"
            @focus="updateAiDraftLineHighlight"
            @blur="hideLineHighlight(aiDraftHighlightRef)"
            placeholder="AI 生成的草稿（可编辑）..."
          />
        </div>
      </div>
      <div class="md-editor__divider md-editor__divider--static" />
      <!-- 中栏：人工转写（发布内容），滚动同步驱动右栏预览 -->
      <div class="md-editor__pane">
        <div class="md-editor__label md-editor__label--human">人工转写（发布内容）<span class="md-editor__word-count">{{ countWords(modelValue) }}字</span></div>
        <div class="md-editor__textarea-wrap">
          <div ref="humanHighlightRef" class="md-editor__line-highlight" />
          <textarea
            ref="textareaRef"
            class="md-editor__textarea"
            :value="modelValue"
            @input="onInput"
            @scroll="onTextareaScroll"
            @click="onHumanActivate"
            @keyup="onHumanActivate"
            @focus="updateHumanLineHighlight"
            @blur="hideLineHighlight(humanHighlightRef)"
            placeholder="在此口述/输入要发布的内容..."
            data-testid="markdown-editor-textarea"
          />
        </div>
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
        <div class="md-editor__textarea-wrap">
          <div ref="humanHighlightRef" class="md-editor__line-highlight" />
          <textarea
            ref="textareaRef"
            class="md-editor__textarea"
            :value="modelValue"
            @input="onInput"
            @scroll="onTextareaScroll"
            @click="onHumanActivate"
            @keyup="onHumanActivate"
            @focus="updateHumanLineHighlight"
            @blur="hideLineHighlight(humanHighlightRef)"
            placeholder="在此输入 Markdown 内容..."
            data-testid="markdown-editor-textarea"
          />
        </div>
      </div>
      <div class="md-editor__divider" @mousedown="onDividerMouseDown" />
      <div class="md-editor__pane">
        <div class="md-editor__label">{{ previewLabel }}</div>
        <div v-if="previewHtml" ref="previewRef" class="md-editor__preview" v-html="previewHtml" />
        <div v-else ref="previewRef" class="md-editor__preview" v-html="renderedHtml" />
      </div>
    </template>
    <div ref="mirrorRef" class="md-editor__mirror" aria-hidden="true" />
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
  onHumanActivate();
}

// 左栏 AI 草稿独立编辑（三栏模式），不参与预览联动与滚动同步
function onAiDraftInput(e: Event): void {
  emit("update:aiDraft", (e.target as HTMLTextAreaElement).value);
  updateAiDraftLineHighlight();
}

// ─── 滚动同步（编辑区→预览区，单向）+ 预览对应块高亮 + 光标行高亮 ───
// 设计原则：只让编辑区驱动预览区，反向不联动，从根上杜绝双向滚动打架。
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const aiDraftTextareaRef = ref<HTMLTextAreaElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);
// 光标行高亮条（中栏 + AI 草稿各一），层叠在 textarea 透明背景之下
const humanHighlightRef = ref<HTMLElement | null>(null);
const aiDraftHighlightRef = ref<HTMLElement | null>(null);

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

// 光标段落左边框定位用的 mirror：克隆 textarea box-model 测字符真实像素位置，
// 避免估算软换行行数的误差（textarea 无原生 API 给视觉行数）
const mirrorRef = ref<HTMLElement | null>(null);
const MIRROR_STYLE_PROPS = [
  "fontFamily", "fontSize", "lineHeight", "fontWeight", "fontStyle", "fontVariant",
  "letterSpacing", "tabSize", "textIndent", "textTransform", "wordSpacing",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "boxSizing", "whiteSpace", "wordBreak", "overflowWrap", "wordWrap",
] as const;
// mirror 宽度缓存：宽度不变则跳过样式同步，避免每次键入都全量设样式
let lastMirrorWidth = -1;

/** 把 mirror 的 box-model 同步到目标 textarea（宽度变化时才重设） */
function syncMirror(mirror: HTMLElement, ta: HTMLTextAreaElement): void {
  const scrollbarW = ta.offsetWidth - ta.clientWidth;
  const width = Math.max(0, ta.clientWidth - scrollbarW);
  if (width === lastMirrorWidth) return;
  lastMirrorWidth = width;
  const cs = getComputedStyle(ta);
  for (const p of MIRROR_STYLE_PROPS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mirror.style as any)[p] = (cs as any)[p];
  }
  mirror.style.width = `${width}px`;
}

/** 用 Range 在 mirror 里测字符偏移相对 mirror 顶的像素 top（含 mirror padding） */
function measureOffsetTop(textNode: Text, offset: number, mirrorTop: number): number {
  const range = document.createRange();
  range.setStart(textNode, Math.min(offset, textNode.length));
  range.collapse(true);
  return range.getBoundingClientRect().top - mirrorTop;
}

/** 重算当前光标所在段落的左边框位置和高度（mirror 精确测量，无估算误差）。
 *  段落顶高缓存到 hl.dataset 供滚动复用。 */
function updateLineHighlight(ta: HTMLTextAreaElement | null, hl: HTMLElement | null): void {
  if (!ta || !hl || document.activeElement !== ta) return;
  const mirror = mirrorRef.value;
  if (!mirror) return;
  syncMirror(mirror, ta);
  mirror.textContent = ta.value;
  const textNode = mirror.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
  const mirrorTop = mirror.getBoundingClientRect().top;

  // 光标所在段落（两个 \n 之间）边界
  const before = ta.value.substring(0, ta.selectionStart);
  const after = ta.value.substring(ta.selectionStart);
  const lineStart = before.lastIndexOf("\n") + 1;
  const nlAfter = after.indexOf("\n");
  const lineEnd = nlAfter === -1 ? ta.value.length : ta.selectionStart + nlAfter;
  const nextLineStart = nlAfter === -1 ? -1 : lineEnd + 1;

  const paraTop = measureOffsetTop(textNode as Text, lineStart, mirrorTop);
  let paraBottom: number;
  if (nextLineStart >= 0) {
    paraBottom = measureOffsetTop(textNode as Text, nextLineStart, mirrorTop);
  } else {
    // 最后一段没有下一段可参照，用末尾字符 top + 一个行高
    const cs = getComputedStyle(ta);
    const fontSize = parseFloat(cs.fontSize) || 14;
    let lineHeight = parseFloat(cs.lineHeight);
    if (lineHeight > 0 && lineHeight < 10) lineHeight *= fontSize;
    if (!(lineHeight > 0)) lineHeight = fontSize * 1.5;
    paraBottom = measureOffsetTop(textNode as Text, lineEnd, mirrorTop) + lineHeight;
  }

  hl.dataset.paraTop = String(paraTop);
  hl.style.height = `${Math.max(20, paraBottom - paraTop)}px`;
  hl.style.transform = `translateY(${paraTop - ta.scrollTop}px)`;
  hl.style.opacity = "1";
}

/** 滚动时只跟随 scrollTop 移动左边框（用缓存的段落顶高，不重算估算，避免长文滚动卡） */
function scrollLineHighlight(ta: HTMLTextAreaElement | null, hl: HTMLElement | null): void {
  if (!ta || !hl || hl.dataset.paraTop == null) return;
  hl.style.transform = `translateY(${parseFloat(hl.dataset.paraTop) - ta.scrollTop}px)`;
}

function hideLineHighlight(hl: HTMLElement | null): void {
  if (hl) hl.style.opacity = "0";
}

function updateHumanLineHighlight(): void {
  updateLineHighlight(textareaRef.value, humanHighlightRef.value);
}

function updateAiDraftLineHighlight(): void {
  updateLineHighlight(aiDraftTextareaRef.value, aiDraftHighlightRef.value);
}

function scrollAiDraftLineHighlight(): void {
  scrollLineHighlight(aiDraftTextareaRef.value, aiDraftHighlightRef.value);
}

/** 中栏光标活动：刷新光标行高亮 + 预览对应块高亮（click/keyup/input 共用） */
function onHumanActivate(): void {
  updateLineHighlight(textareaRef.value, humanHighlightRef.value);
  updateCursorHighlight();
}

/** 计算中文字数：中文按字数计，英文按单词计 */
function countWords(text: string): number {
  const chinese = text.match(/[一-鿿㐀-䶿]/g);
  const chineseCount = chinese ? chinese.length : 0;
  const withoutChinese = text.replace(/[一-鿿㐀-䶿]/g, " ");
  const englishWords = withoutChinese.match(/[a-zA-Z0-9]+/g);
  const englishCount = englishWords ? englishWords.length : 0;
  return chineseCount + englishCount;
}

// 滚动同步 rAF 句柄：合并高频 scroll 到下一帧
let scrollSyncRaf: number | null = null;

/** 中栏滚动 → 光标行高亮条跟随 + 预览按整体比例同步（单向，不读块位置避免每帧布局计算跳闪） */
function onTextareaScroll(): void {
  if (scrollSyncRaf != null) return;
  scrollSyncRaf = requestAnimationFrame(() => {
    scrollSyncRaf = null;
    const ta = textareaRef.value;
    const preview = previewRef.value;
    if (!ta || !preview) return;
    // 左边框随滚动跟随（用缓存的段落顶高，不重算估算，避免长文滚动卡）
    scrollLineHighlight(textareaRef.value, humanHighlightRef.value);
    if (!props.syncScroll) return;
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
  position: relative;
  display: flex;
  height: 100%;
  min-height: 400px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}

/* 三栏正文工作区用品牌紫形成完整外轮廓，避免内部栏位比整体容器更抢眼。 */
.md-editor--3pane {
  border: 2px solid var(--editorial-accent, #caa9fa);
  border-radius: var(--editorial-radius-xl, 12px);
  box-shadow: var(--editorial-shadow-accent, 0 16px 36px rgba(202, 169, 250, 0.18));
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.md-editor--3pane:focus-within {
  border-color: #8b5cf6;
  box-shadow:
    0 0 0 3px rgba(139, 92, 246, 0.2),
    0 18px 42px rgba(139, 92, 246, 0.24);
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

.md-editor__word-count {
  margin-left: 6px;
  font-weight: 400;
  color: #bbb;
  font-variant-numeric: tabular-nums;
}

/* textarea 外层：承载光标行高亮条（absolute 定位在透明 textarea 之下） */
.md-editor__textarea-wrap {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: #fff;
}

.md-editor__line-highlight {
  position: absolute;
  left: 0;
  width: 4px;
  background: #1890ff;
  box-shadow: 0 0 8px rgba(24, 144, 255, 0.55);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s;
  border-radius: 0 2px 2px 0;
}

/* mirror：克隆 textarea box-model 用于精确测字符像素位置，不可见、不占布局 */
.md-editor__mirror {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
}

.md-editor__textarea {
  position: absolute;
  inset: 0;
  padding: 12px;
  border: none;
  outline: none;
  resize: none;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 14px;
  line-height: 22px;
  color: #333;
  background: transparent;
  caret-color: #1890ff;
}

/* textarea/preview 滚到边界不冒泡到详情弹窗（配合详情弹窗的 wheel 锁，编辑区聚焦时锁住外层滚动） */
.md-editor__textarea,
.md-editor__preview {
  overscroll-behavior: contain;
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
  flex: 0 0 3px;
  background: rgba(202, 169, 250, 0.38);
  cursor: default;
}
.md-editor__divider--static:hover {
  background: rgba(202, 169, 250, 0.38);
}
.md-editor__label--human {
  background: #fff7e6;
  color: #d46b08;
  font-weight: 600;
}
.md-editor__pane--ai-draft .md-editor__textarea-wrap {
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
  .md-editor--3pane .md-editor__divider--static {
    flex-basis: 3px;
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

/* 预览区当前光标对应块的高亮：
   - background !important 压过主题注入的内联 background（标题/图片/引用等主题带底色的块），统一显眼；
   - outline 用负 offset 内嵌，不被预览面板 overflow:hidden 裁剪（之前向左的 box-shadow 溢出面板被裁，看不到）。 */
.md-editor__preview :deep(.md-editor__active-block) {
  background: rgba(24, 144, 255, 0.18) !important;
  outline: 3px solid #1890ff;
  outline-offset: -3px;
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
