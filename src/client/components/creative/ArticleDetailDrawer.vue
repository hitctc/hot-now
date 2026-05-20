<!-- 文章详情弹窗：展示标题/立意/摘要 + 正文编辑器（左编辑右预览），底部工具栏 -->
<template>
  <a-modal
    :open="open"
    :footer="null"
    :closable="true"
    :mask-closable="true"
    :destroy-on-close="true"
    width="90%"
    centered
    wrap-class-name="article-detail-modal"
    :body-style="{ maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', padding: '24px' }"
    @cancel="handleClose"
  >
    <template #title>
      <span v-if="article" class="text-base font-semibold">
        {{ getFirstTitle(article.titles) }}
      </span>
    </template>

    <template v-if="article">
      <div class="flex flex-col gap-6">
        <!-- 顶部元信息 -->
        <div class="flex items-center gap-3">
          <span class="text-xs text-editorial-text-muted">模式 {{ article.mode || "-" }}</span>
          <span class="text-xs text-editorial-text-muted">{{ formatLocalTime(article.createdAt) }}</span>
          <a
            class="cursor-pointer text-xs text-editorial-link-active hover:underline"
            @click.prevent="$emit('openSourceItem', article.sourceItemId)"
          >素材 #{{ article.sourceItemId }}</a>
        </div>

        <!-- 备选标题（只读） -->
        <section v-if="parseJsonArray(article.titles).length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">备选标题</h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(article.titles).join('\n'))">复制全部</a-button>
          </div>
          <ul class="m-0 list-none space-y-1 pl-0">
            <li
              v-for="(t, idx) in parseJsonArray(article.titles)"
              :key="idx"
              class="group flex items-start gap-3 rounded-editorial-sm border border-editorial-border px-3 py-2 transition-colors hover:border-editorial-link-active/40"
            >
              <span class="flex-shrink-0 text-[11px] font-bold tabular-nums text-editorial-text-muted">{{ idx + 1 }}</span>
              <span class="flex-1 text-sm leading-6 text-editorial-text-main">{{ t }}</span>
              <a-button type="link" size="small" class="!p-0 !text-[11px] opacity-0 group-hover:opacity-100" @click="copyText(t)">复制</a-button>
            </li>
          </ul>
        </section>

        <!-- 核心立意（只读） -->
        <section v-if="article.thesis">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">核心立意</h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(article.thesis!)">复制</a-button>
          </div>
          <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ article.thesis }}</p>
        </section>

        <!-- 百字摘要（只读） -->
        <section v-if="article.summary100">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">百字摘要</h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(article.summary100!)">复制</a-button>
          </div>
          <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ article.summary100 }}</p>
        </section>

        <!-- 开头钩子（只读） -->
        <section v-if="parseJsonArray(article.hooks).length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">开头钩子</h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(article.hooks).join('\n'))">复制全部</a-button>
          </div>
          <ul class="m-0 list-none space-y-1 pl-0">
            <li
              v-for="(h, idx) in parseJsonArray(article.hooks)"
              :key="idx"
              class="group flex items-start gap-3 rounded-editorial-sm bg-editorial-panel/40 px-3 py-2"
            >
              <span class="flex-1 text-sm leading-6 text-editorial-text-body">{{ h }}</span>
              <a-button type="link" size="small" class="!p-0 !text-[11px] opacity-0 group-hover:opacity-100" @click="copyText(h)">复制</a-button>
            </li>
          </ul>
        </section>

        <!-- 可摘句（只读） -->
        <section v-if="parseJsonArray(article.quotes).length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">可摘句</h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(article.quotes).join('\n'))">复制全部</a-button>
          </div>
          <ul class="m-0 list-inside list-disc pl-1">
            <li v-for="(q, idx) in parseJsonArray(article.quotes)" :key="idx" class="text-sm leading-6 text-editorial-text-body">{{ q }}</li>
          </ul>
        </section>

        <!-- 正文：左右分屏编辑器（左 Markdown 编辑，右实时预览） -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文</h3>
            <div class="flex items-center gap-2">
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(editContent)">复制原文</a-button>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyMarkdownAsPlainText(editContent)">复制纯文本</a-button>
            </div>
          </div>
          <div class="article-editor-wrapper">
            <ArticleMarkdownEditor v-model="editContent" />
          </div>
        </section>

        <!-- 图片列表（只读） -->
        <section v-if="parseArticleImages(article.imagesJson).length > 0">
          <h3 class="m-0 mb-2 text-sm font-semibold text-editorial-text-muted">图片列表</h3>
          <a-image-preview-group>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div
                v-for="(img, idx) in parseArticleImages(article.imagesJson)"
                :key="idx"
                class="group relative overflow-hidden rounded-editorial-md border border-editorial-border"
              >
                <a-image
                  :src="extractImageUrl(img)"
                  :alt="typeof img === 'object' && img.alt ? img.alt : `图片 ${idx + 1}`"
                  class="block w-full object-cover"
                  loading="lazy"
                />
                <div v-if="typeof img === 'object' && img.purpose" class="absolute right-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                  {{ img.purpose }}
                </div>
              </div>
            </div>
          </a-image-preview-group>
        </section>
      </div>
    </template>

    <!-- 底部操作栏 -->
    <div v-if="article" class="flex items-center gap-2 border-t border-editorial-border pt-4 mt-6">
      <div class="flex flex-1 items-center gap-2">
        <a-select
          v-model:value="wechatTheme"
          :options="wechatThemeOptions"
          size="small"
          class="!w-[120px]"
        />
        <a-button
          :loading="wechatCopying"
          @click="copyAsWechatFormat"
        >复制公众号格式</a-button>
        <a-button
          v-if="canPush(article)"
          type="primary"
          @click="$emit('openPush', article)"
        >推送到草稿箱</a-button>
        <a-tooltip v-else :mouse-enter-delay="0.3">
          <template #title>{{ getMissingConditions(article).join('；') }}</template>
          <a-button type="primary" disabled>推送到草稿箱</a-button>
        </a-tooltip>
      </div>
      <a-button
        type="primary"
        :loading="saving"
        @click="handleSave"
      >保存正文</a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { message } from "ant-design-vue";

import ArticleMarkdownEditor from "./ArticleMarkdownEditor.vue";
import {
  editFinishedArticle,
  renderWechatFormat,
  wechatThemeOptions,
  parseArticleImages,
  extractImageUrl,
  type CreativeFinishedArticle,
  type WechatThemeId,
} from "../../services/creativeApi.js";

const props = defineProps<{
  open: boolean;
  article: CreativeFinishedArticle | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
  openSourceItem: [sourceItemId: number];
  openPush: [article: CreativeFinishedArticle];
}>();

// ─── 正文编辑 ───

const editContent = ref("");
const saving = ref(false);

// 打开时从 article 初始化编辑内容
watch(() => props.open, (val) => {
  if (val && props.article) {
    editContent.value = props.article.contentMarkdown || "";
  }
});

async function handleSave(): Promise<void> {
  if (!props.article) return;
  saving.value = true;
  try {
    await editFinishedArticle(props.article.id, {
      contentMarkdown: editContent.value,
    });
    message.success("保存成功");
    emit("saved");
  } catch {
    message.error("保存失败");
  } finally {
    saving.value = false;
  }
}

function handleClose(): void {
  // 关闭前如果有未保存的修改不自动保存，直接关闭
  emit("update:open", false);
}

// ─── 辅助函数 ───

function parseJsonArray(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getFirstTitle(titles: string | null): string {
  const parsed = parseJsonArray(titles);
  return parsed.length > 0 ? parsed[0] : "无标题";
}

function formatLocalTime(value: string): string {
  const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(fixed);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ─── 微信公众号格式复制 ───

const wechatTheme = ref<WechatThemeId>("bauhaus");
const wechatCopying = ref(false);

async function copyAsWechatFormat(): Promise<void> {
  if (!editContent.value) {
    message.warning("文章无正文内容");
    return;
  }
  if (!props.article) return;
  wechatCopying.value = true;
  try {
    const res = await renderWechatFormat(props.article.id, wechatTheme.value);
    if (!res.ok || !res.html) {
      message.error("渲染失败，请重试");
      return;
    }
    const htmlBlob = new Blob([res.html], { type: "text/html" });
    const textBlob = new Blob([editContent.value], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })
    ]);
    message.success("已复制公众号格式，可直接粘贴到编辑器");
  } catch {
    message.error("复制失败，请检查浏览器剪贴板权限");
  } finally {
    wechatCopying.value = false;
  }
}

// ─── 纯文本复制 ───

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  message.success("已复制到剪贴板");
}

async function copyMarkdownAsPlainText(mdText: string): Promise<void> {
  const text = mdText
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/---+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  await navigator.clipboard.writeText(text);
  message.success("已复制纯文本到剪贴板");
}

// ─── 推送条件检查 ───

function canPush(article: CreativeFinishedArticle): boolean {
  if (article.status !== "ready_for_publish") return false;
  if (parseJsonArray(article.titles).length === 0) return false;
  if (!article.coverImage) return false;
  if (parseArticleImages(article.imagesJson).length === 0) return false;
  if (!article.contentMarkdown) return false;
  return true;
}

function getMissingConditions(article: CreativeFinishedArticle): string[] {
  const missing: string[] = [];
  if (article.status !== "ready_for_publish") missing.push('状态不是"可推送"');
  if (parseJsonArray(article.titles).length === 0) missing.push("缺少标题");
  if (!article.coverImage) missing.push("缺少封面图");
  if (parseArticleImages(article.imagesJson).length === 0) missing.push("缺少正文配图");
  if (!article.contentMarkdown) missing.push("缺少 Markdown 内容");
  return missing;
}
</script>

<style>
.article-detail-modal .ant-modal-body {
  background: #ffffff;
}

.article-editor-wrapper {
  height: 480px;
  min-height: 260px;
}

.article-markdown-body {
  font-size: 14px;
  line-height: 1.75;
  color: #374151;
}
.article-markdown-body h1,
.article-markdown-body h2,
.article-markdown-body h3,
.article-markdown-body h4 {
  margin: 1em 0 0.5em;
  font-weight: 600;
  color: #111827;
}
.article-markdown-body h1 { font-size: 1.25em; }
.article-markdown-body h2 { font-size: 1.15em; }
.article-markdown-body h3 { font-size: 1.05em; }
.article-markdown-body p { margin: 0.5em 0; }
.article-markdown-body ul,
.article-markdown-body ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.article-markdown-body li { margin: 0.25em 0; }
.article-markdown-body blockquote {
  margin: 0.75em 0;
  padding: 0.5em 1em;
  border-left: 3px solid #d1d5db;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 0 4px 4px 0;
}
.article-markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 0.75em 0;
}
.article-markdown-body a {
  color: #2563eb;
  text-decoration: underline;
}
.article-markdown-body strong { font-weight: 600; }
.article-markdown-body code {
  background: #f3f4f6;
  padding: 0.15em 0.35em;
  border-radius: 3px;
  font-size: 0.9em;
}
.article-markdown-body hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 1em 0;
}
</style>
