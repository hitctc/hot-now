<!-- 文章详情弹窗：展示标题/立意/摘要 + 正文编辑器（左编辑右预览），底部悬浮工具栏 -->
<template>
  <a-modal
    :open="open"
    :closable="true"
    :mask-closable="true"
    :destroy-on-close="true"
    width="90%"
    centered
    wrap-class-name="article-detail-modal"
    :body-style="{ padding: '24px', overflowY: 'auto' }"
    @cancel="handleClose"
  >
    <template #title>
      <span v-if="article" class="text-base font-semibold">
        {{ getFirstTitle(article.titles) }}
      </span>
    </template>

    <template #footer>
      <div v-if="article" class="flex items-center justify-between">
        <a-button
          danger
          :loading="regenArticleLoading"
          :disabled="regenArticleLoading"
          @click="handleRegenArticle"
        >
          <template v-if="regenArticleLoading">正在重写（预计 2~3 分钟）...</template>
          <template v-else>整篇重写</template>
        </a-button>
        <div class="flex items-center gap-2">
          <a-tooltip :mouse-enter-delay="0.5" title="将当前正文按选定主题渲染后复制到剪贴板，可粘贴到公众号编辑器">
            <a-button :loading="wechatCopying" @click="copyAsWechatFormat">复制公众号格式</a-button>
          </a-tooltip>
          <a-tooltip :mouse-enter-delay="0.5" title="保存正文内容到数据库">
            <a-button type="primary" :loading="saving" @click="handleSave">保存正文</a-button>
          </a-tooltip>
          <a-tooltip v-if="canPush(article)" :mouse-enter-delay="0.5" title="自动保存正文后推送到微信公众号草稿箱">
            <a-button type="primary" :loading="saving" @click="saveAndPush">推送到草稿箱</a-button>
          </a-tooltip>
          <a-tooltip v-else :mouse-enter-delay="0.3">
            <template #title>{{ getMissingConditions(article).join('；') }}</template>
            <a-button type="primary" disabled>推送到草稿箱</a-button>
          </a-tooltip>
        </div>
      </div>
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

        <!-- 备选标题 -->
        <section v-if="displayTitles.length > 0 || regenTitleLoading">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">备选标题</h3>
            <div class="flex items-center gap-3">
              <a-button
                type="link"
                size="small"
                class="!p-0 !text-[11px]"
                :loading="regenTitleLoading"
                :disabled="regenTitleLoading"
                @click="handleRegenTitle"
              >{{ regenTitleLoading ? '生成中...' : '重新生成标题' }}</a-button>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(displayTitles.join('\n'))">复制全部</a-button>
            </div>
          </div>
          <ul class="m-0 list-none space-y-1 pl-0">
            <li
              v-for="(t, idx) in displayTitles"
              :key="idx"
              class="group/title relative flex items-start gap-3 rounded-editorial-sm border px-3 py-2 transition-colors"
              :class="idx === activeTitleIndex
                ? 'border-editorial-accent ring-2 ring-editorial-ring'
                : 'border-editorial-border hover:border-editorial-link-active/40'"
            >
              <span class="flex-shrink-0 text-[11px] font-bold tabular-nums text-editorial-text-muted">{{ idx + 1 }}</span>
              <span class="flex-1 text-sm leading-6 text-editorial-text-main">{{ t }}</span>
              <!-- 选中标记 -->
              <span
                v-if="idx === activeTitleIndex"
                class="flex-shrink-0 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >✓ 发布标题</span>
              <span v-if="idx === 0 && idx !== activeTitleIndex" class="flex-shrink-0 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</span>
              <button
                v-if="idx !== activeTitleIndex"
                class="flex-shrink-0 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/title:opacity-100 hover:!bg-black/70"
                @click.stop="selectTitle(idx)"
              >设为发布标题</button>
              <a-button type="link" size="small" class="!p-0 !text-[11px] opacity-0 group-hover/title:opacity-100" @click="copyText(t)">复制</a-button>
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

        <!-- 导语（可选择切换） -->
        <section v-if="displayIntros.length > 0 || regenIntroLoading">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">导语</h3>
            <div class="flex items-center gap-3">
              <a-button
                type="link"
                size="small"
                class="!p-0 !text-[11px]"
                :loading="regenIntroLoading"
                :disabled="regenIntroLoading"
                @click="handleRegenIntro"
              >{{ regenIntroLoading ? '生成中...' : '重新生成导语' }}</a-button>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(displayIntros[activeIntroIndex] ?? '')">复制</a-button>
            </div>
          </div>
          <ul class="m-0 list-none space-y-1 pl-0">
            <li
              v-for="(text, idx) in displayIntros"
              :key="idx"
              class="group/intro relative flex items-start gap-3 rounded-editorial-sm border px-3 py-2 transition-colors"
              :class="idx === activeIntroIndex
                ? 'border-editorial-accent ring-2 ring-editorial-ring'
                : 'border-editorial-border hover:border-editorial-link-active/40'"
            >
              <span class="flex-shrink-0 text-[11px] font-bold tabular-nums text-editorial-text-muted">{{ idx + 1 }}</span>
              <span class="flex-1 text-sm leading-6 text-editorial-text-main">{{ text }}</span>
              <span
                v-if="idx === activeIntroIndex"
                class="flex-shrink-0 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >✓ 发布</span>
              <span v-if="idx === 0 && idx !== activeIntroIndex" class="flex-shrink-0 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</span>
              <button
                v-if="idx !== activeIntroIndex"
                class="flex-shrink-0 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/intro:opacity-100 hover:!bg-black/70"
                @click.stop="selectIntro(idx)"
              >设为发布</button>
            </li>
          </ul>
        </section>

        <!-- 百字摘要 -->
        <section v-if="localSummary100 || article.summary100">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">百字摘要</h3>
            <div class="flex items-center gap-3">
              <a-button
                type="link"
                size="small"
                class="!p-0 !text-[11px]"
                :loading="regenSummaryLoading"
                :disabled="regenSummaryLoading"
                @click="handleRegenSummary"
              >{{ regenSummaryLoading ? '生成中...' : '重新生成摘要' }}</a-button>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(localSummary100 || article.summary100!)">复制</a-button>
            </div>
          </div>
          <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ localSummary100 || article.summary100 }}</p>
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

        <!-- 封面图 -->
        <section v-if="article.coverImage && article.coverImage.length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">封面图</h3>
            <a-button
              type="link"
              size="small"
              class="!p-0 !text-[11px]"
              :loading="regenerating"
              :disabled="regenerating"
              @click="handleRegenCover"
            >{{ regenerating ? '生成中...' : '重新生成封面图' }}</a-button>
          </div>
          <a-image-preview-group>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div
                v-for="(url, idx) in displayCoverImages"
                :key="idx"
                class="group/cover relative overflow-hidden rounded-editorial-md border transition-all"
                :class="idx === activeCoverIndex
                  ? 'border-editorial-accent ring-2 ring-editorial-ring'
                  : 'border-editorial-border opacity-60 hover:opacity-100 hover:border-editorial-link-active/40'"
              >
                <a-image
                  :src="url"
                  :alt="`封面图 ${idx + 1}`"
                  class="block w-full object-cover"
                  loading="lazy"
                />
                <!-- 选中标记：对勾 + "发布封面" -->
                <div
                  v-if="idx === activeCoverIndex"
                  class="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                >
                  <span class="inline-block h-3 w-3 leading-none text-center">✓</span> 发布封面
                </div>
                <div v-if="idx === 0 && idx !== activeCoverIndex" class="absolute left-1 top-1 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</div>
                <button
                  v-if="idx !== activeCoverIndex"
                  class="absolute inset-x-1 bottom-1 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/cover:opacity-100 hover:!bg-black/70"
                  @click.stop="selectCoverImage(idx)"
                >设为发布封面</button>
              </div>
            </div>
          </a-image-preview-group>
        </section>

        <!-- 图片列表（只读，在封面图下方） -->
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

        <!-- 正文：左右分屏编辑器 + 主题切换 -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文</h3>
              <span v-if="lastSavedAt" class="text-[11px] text-editorial-text-muted">{{ lastSavedAt }}</span>
            </div>
            <div class="flex items-center gap-2">
              <div v-if="article.contentMarkdown" class="flex gap-1">
                <a-button
                  v-for="opt in previewThemeOptions"
                  :key="opt.key"
                  :type="activePreviewTheme === opt.key ? 'primary' : 'default'"
                  size="small"
                  class="!text-[11px] !px-2 !py-0.5"
                  @click="switchPreviewTheme(opt.key)"
                >{{ opt.label }}</a-button>
              </div>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(editContent)">复制原文</a-button>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyMarkdownAsPlainText(editContent)">复制纯文本</a-button>
            </div>
          </div>
          <div class="article-editor-wrapper">
            <ArticleMarkdownEditor
              v-model="editContent"
              :preview-html="activePreviewHtml"
              :preview-label="activePreviewLabel"
            />
          </div>
        </section>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { message, Modal } from "ant-design-vue";

import ArticleMarkdownEditor from "./ArticleMarkdownEditor.vue";
import {
  editFinishedArticle,
  regenCover,
  regenTitle,
  regenIntro,
  regenSummary,
  regenArticle,
  parseArticleImages,
  extractImageUrl,
  type CreativeFinishedArticle,
  type WechatThemeId,
} from "../../services/creativeApi.js";
import { renderWechatThemePreview } from "../../services/wechatRenderer.js";

const props = defineProps<{
  open: boolean;
  article: CreativeFinishedArticle | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
  openSourceItem: [sourceItemId: number];
  openPush: [article: CreativeFinishedArticle, themeId: WechatThemeId];
}>();

// ─── 正文编辑 ───

const editContent = ref("");
const saving = ref(false);
const lastSavedAt = ref("");
// 记住打开时的原始内容，用于判断是否真正发生变化
let lastSavedContent = "";

// ─── 标题选择 & 重新生成 ───

const regenTitleLoading = ref(false);
const activeTitleIndex = ref(0);
const localTitles = ref<string[]>([]);

const displayTitles = computed(() => {
  return localTitles.value.length > 0 ? localTitles.value : parseJsonArray(props.article?.titles ?? null);
});

async function handleRegenTitle(): Promise<void> {
  if (!props.article || regenTitleLoading.value) return;
  regenTitleLoading.value = true;
  try {
    const result = await regenTitle(props.article.id);
    if (result.ok && result.titles) {
      localTitles.value = result.titles;
      activeTitleIndex.value = 0;
      props.article.titles = JSON.stringify(result.titles);
      props.article.titleIndex = 0;
      message.success("标题已重新生成");
    } else {
      message.error(result.reason ?? "标题生成失败");
    }
  } catch {
    message.error("标题生成请求失败");
  } finally {
    regenTitleLoading.value = false;
  }
}

// 选择发布标题：替换 markdown 中的 H1，保存 titleIndex + contentMarkdown
async function selectTitle(idx: number): Promise<void> {
  if (!props.article || idx === activeTitleIndex.value) return;

  const titles = displayTitles.value;
  const oldTitle = titles[activeTitleIndex.value];
  const newTitle = titles[idx];

  // 替换 markdown 中的 H1 标题行
  let content = editContent.value;
  if (oldTitle && content.includes(oldTitle)) {
    content = content.replaceAll(oldTitle, newTitle);
  } else if (/^# .+/m.test(content)) {
    content = content.replace(/^# .+/m, `# ${newTitle}`);
  }

  activeTitleIndex.value = idx;
  editContent.value = content;

  try {
    await editFinishedArticle(props.article.id, {
      titleIndex: idx,
      contentMarkdown: content,
    });
    props.article.titleIndex = idx;
    props.article.contentMarkdown = content;
    lastSavedContent = content;

    if (activePreviewTheme.value !== "live" && content) {
      const themeId = themeIdMap[activePreviewTheme.value];
      const html = renderWechatThemePreview(content, themeId);
      props.article.wechatHtml = html;
      editFinishedArticle(props.article.id, { wechatHtml: html }).catch(() => {});
    }

    emit("saved");
  } catch { /* 静默失败，本地状态已更新 */ }
}

// ─── 导语选择 & 重新生成 ───

const regenIntroLoading = ref(false);
const activeIntroIndex = ref(0);
const localIntros = ref<string[]>([]);

const displayIntros = computed(() => {
  return localIntros.value.length > 0 ? localIntros.value : (props.article?.intro ?? []);
});

async function handleRegenIntro(): Promise<void> {
  if (!props.article || regenIntroLoading.value) return;
  regenIntroLoading.value = true;
  try {
    const result = await regenIntro(props.article.id);
    if (result.ok && result.intro) {
      localIntros.value = result.intro;
      activeIntroIndex.value = 0;
      props.article.intro = result.intro;
      props.article.introIndex = 0;
      message.success("导语已重新生成");
    } else {
      message.error(result.reason ?? "导语生成失败");
    }
  } catch {
    message.error("导语生成请求失败");
  } finally {
    regenIntroLoading.value = false;
  }
}

async function selectIntro(idx: number): Promise<void> {
  if (!props.article || idx === activeIntroIndex.value) return;
  activeIntroIndex.value = idx;

  try {
    await editFinishedArticle(props.article.id, { introIndex: idx });
    props.article.introIndex = idx;
    emit("saved");
  } catch { /* 静默失败 */ }
}

// ─── 百字摘要重新生成 ───

const regenSummaryLoading = ref(false);
const localSummary100 = ref("");

async function handleRegenSummary(): Promise<void> {
  if (!props.article || regenSummaryLoading.value) return;
  regenSummaryLoading.value = true;
  try {
    const result = await regenSummary(props.article.id);
    if (result.ok && result.summary100) {
      localSummary100.value = result.summary100;
      props.article.summary100 = result.summary100;
      message.success("摘要已重新生成");
    } else {
      message.error(result.reason ?? "摘要生成失败");
    }
  } catch {
    message.error("摘要生成请求失败");
  } finally {
    regenSummaryLoading.value = false;
  }
}

// ─── 整篇重写 ───

const regenArticleLoading = ref(false);
const REGEN_ARTICLE_KEY = "hot-now-regen-article";

function getRegenArticleStatus(): { articleId: number; startedAt: number } | null {
  try {
    const raw = localStorage.getItem(REGEN_ARTICLE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function handleRegenArticle(): Promise<void> {
  if (!props.article || regenArticleLoading.value) return;

  // 二次确认
  const confirmed = await new Promise<boolean>((resolve) => {
    Modal.confirm({
      title: "确认整篇重写？",
      content: "将基于同一素材重新生成一篇完整文章，耗时约 2~3 分钟。新文章生成后请在列表中查看。",
      okText: "确认重写",
      cancelText: "取消",
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;

  regenArticleLoading.value = true;
  // 记录重写状态到 localStorage，关闭弹窗后重开可恢复提示
  localStorage.setItem(REGEN_ARTICLE_KEY, JSON.stringify({
    articleId: props.article.id,
    startedAt: Date.now(),
  }));

  try {
    const result = await regenArticle(props.article.id);
    if (result.ok) {
      localStorage.removeItem(REGEN_ARTICLE_KEY);
      message.success(`新文章已生成${result.title ? `：${result.title}` : ""}，请关闭弹窗刷新列表查看`);
      emit("saved");
    } else {
      localStorage.removeItem(REGEN_ARTICLE_KEY);
      message.error(result.reason ?? "整篇重写失败");
    }
  } catch {
    // 不清除 localStorage，可能仍在生成中
    message.error("整篇重写请求失败，新文章可能仍在生成中，请稍后刷新列表查看");
  } finally {
    regenArticleLoading.value = false;
  }
}

// 打开弹窗时检查是否有未完成的重写
function checkRegenArticleStatus(): void {
  const status = getRegenArticleStatus();
  if (!status || !props.article) return;
  if (status.articleId === props.article.id) {
    const elapsed = Date.now() - status.startedAt;
    if (elapsed < 5 * 60 * 1000) {
      // 5 分钟内认为仍在生成
      message.info("该文章正在整篇重写中，请稍后刷新列表查看新文章");
    } else {
      // 超过 5 分钟，清除状态
      localStorage.removeItem(REGEN_ARTICLE_KEY);
      message.info("整篇重写已完成或超时，请刷新列表查看");
    }
  }
}

// ─── 封面图选择 & 重新生成 ───

const activeCoverIndex = ref(0);
const regenerating = ref(false);
// 本地缓存最新的 coverImage 数组，regen 后不依赖父组件刷新
const localCoverImages = ref<string[]>([]);

const displayCoverImages = computed(() => {
  const src = localCoverImages.value.length > 0 ? localCoverImages.value : (props.article?.coverImage ?? []);
  return src.slice(0, 10);
});

async function handleRegenCover(): Promise<void> {
  if (!props.article || regenerating.value) return;
  regenerating.value = true;
  try {
    const result = await regenCover(props.article.id);
    if (result.ok && result.coverImage) {
      localCoverImages.value = result.coverImage;
      activeCoverIndex.value = 0;
      // 同步到 article 对象，确保推送时读到最新数据
      props.article.coverImage = result.coverImage;
      props.article.coverImageIndex = 0;
      message.success("封面图已重新生成");
    } else {
      message.error(result.reason ?? "封面图生成失败");
    }
  } catch {
    message.error("封面图生成请求失败");
  } finally {
    regenerating.value = false;
  }
}

async function selectCoverImage(idx: number): Promise<void> {
  if (!props.article || idx === activeCoverIndex.value) return;

  const imgs = displayCoverImages.value;
  const oldUrl = imgs[activeCoverIndex.value];
  const newUrl = imgs[idx];

  // 在 markdown 中替换封面图 URL
  let content = editContent.value;
  if (oldUrl && content.includes(oldUrl)) {
    content = content.replaceAll(oldUrl, newUrl);
  } else if (newUrl) {
    content = `![封面图](${newUrl})\n\n${content}`;
  }

  activeCoverIndex.value = idx;
  editContent.value = content;

  try {
    await editFinishedArticle(props.article.id, {
      coverImageIndex: idx,
      contentMarkdown: content,
    });
    props.article.coverImageIndex = idx;
    props.article.contentMarkdown = content;
    lastSavedContent = content;

    // 重新渲染并保存预览 HTML，确保推送时使用新封面
    if (activePreviewTheme.value !== "live" && content) {
      const themeId = themeIdMap[activePreviewTheme.value];
      const html = renderWechatThemePreview(content, themeId);
      props.article.wechatHtml = html;
      editFinishedArticle(props.article.id, { wechatHtml: html }).catch(() => {});
    }

    emit("saved");
  } catch { /* 静默失败，本地状态已更新 */ }
}

// 10 秒防抖自动保存正文
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

watch(editContent, (val) => {
  if (!props.open || val === lastSavedContent) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    if (val !== lastSavedContent && props.article) {
      doSaveContent(val);
    }
  }, 10_000);
});

watch(() => props.open, (val) => {
  if (val && props.article) {
    const md = props.article.contentMarkdown || "";
    editContent.value = md;
    lastSavedContent = md;
    // 重置本地缓存状态
    localCoverImages.value = [];
    localTitles.value = [];
    localIntros.value = [];
    localSummary100.value = "";
    activeCoverIndex.value = props.article.coverImageIndex ?? 0;
    activeTitleIndex.value = props.article.titleIndex ?? 0;
    activeIntroIndex.value = props.article.introIndex ?? 0;
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    checkRegenArticleStatus();
    // 恢复文章保存的主题偏好，无记录时默认包豪斯
    const saved = props.article.wechatThemeId;
    const previewKey = saved ? reverseThemeIdMap[saved] : undefined;
    activePreviewTheme.value = previewKey ?? "bauhaus";
  }
});

async function doSaveContent(content: string): Promise<void> {
  if (!props.article) return;
  saving.value = true;
  try {
    await editFinishedArticle(props.article.id, { contentMarkdown: content });
    lastSavedContent = content;
    lastSavedAt.value = `保存成功(${new Date().toLocaleTimeString("zh-CN", { hour12: false })})`;
    emit("saved");
  } catch {
    message.error("自动保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleSave(): Promise<void> {
  if (!props.article) return;
  saving.value = true;
  try {
    await editFinishedArticle(props.article.id, {
      contentMarkdown: editContent.value,
    });
    lastSavedContent = editContent.value;
    lastSavedAt.value = `保存成功(${new Date().toLocaleTimeString("zh-CN", { hour12: false })})`;
    emit("saved");
  } catch {
    message.error("保存失败");
  } finally {
    saving.value = false;
  }
}

// 推送前先保存正文，确保 DB 中是最新内容
async function saveAndPush(): Promise<void> {
  if (!props.article) return;
  // 取消自动保存定时器，手动触发一次保存
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
  if (editContent.value !== lastSavedContent) {
    await doSaveContent(editContent.value);
  }
  emit("openPush", props.article, currentWechatThemeId.value);
}

function handleClose(): void {
  emit("update:open", false);
}

// ─── 预览主题切换 ───

type PreviewThemeKey = "live" | "bauhaus" | "sunsetFilm" | "receipt";

const previewThemeOptions: { key: PreviewThemeKey; label: string }[] = [
  { key: "bauhaus", label: "包豪斯" },
  { key: "sunsetFilm", label: "落日胶片" },
  { key: "receipt", label: "购物小票" },
  { key: "live", label: "实时预览" },
];

const activePreviewTheme = ref<PreviewThemeKey>("live");

const themeIdMap: Record<Exclude<PreviewThemeKey, "live">, WechatThemeId> = {
  bauhaus: "bauhaus",
  sunsetFilm: "sunset-film",
  receipt: "receipt",
};

const reverseThemeIdMap: Record<string, Exclude<PreviewThemeKey, "live">> = {
  bauhaus: "bauhaus",
  "sunset-film": "sunsetFilm",
  receipt: "receipt",
};

// 切换预览主题：客户端即时渲染
function switchPreviewTheme(key: PreviewThemeKey): void {
  activePreviewTheme.value = key;
  if (key === "live" || !editContent.value) return;

  const themeId = themeIdMap[key];
  const html = renderWechatThemePreview(editContent.value, themeId);

  // 首次选中该主题时保存偏好和渲染结果
  if (props.article && (props.article.wechatThemeId !== themeId || props.article.wechatHtml !== html)) {
    props.article.wechatThemeId = themeId;
    props.article.wechatHtml = html;
    editFinishedArticle(props.article.id, { wechatThemeId: themeId, wechatHtml: html }).catch(() => {});
  }
}

// 根据当前选中的预览主题返回 HTML，编辑时即时重新渲染
const activePreviewHtml = computed(() => {
  if (activePreviewTheme.value === "live") return "";
  const themeId = themeIdMap[activePreviewTheme.value];
  if (!editContent.value) return "";
  return renderWechatThemePreview(editContent.value, themeId);
});

const activePreviewLabel = computed(() => {
  const opt = previewThemeOptions.find(o => o.key === activePreviewTheme.value);
  return opt?.label ?? "预览";
});

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

// 当前主题对应的 WechatThemeId（用于复制公众号格式和推送）
const currentWechatThemeId = computed<WechatThemeId>(() => {
  if (activePreviewTheme.value !== "live") {
    return themeIdMap[activePreviewTheme.value as Exclude<PreviewThemeKey, "live">];
  }
  // 实时预览模式下回退到文章保存的主题
  return (props.article?.wechatThemeId as WechatThemeId) ?? "bauhaus";
});

// ─── 微信公众号格式复制 ───

const wechatCopying = ref(false);

async function copyAsWechatFormat(): Promise<void> {
  if (!editContent.value) {
    message.warning("文章无正文内容");
    return;
  }
  if (!props.article) return;
  wechatCopying.value = true;
  try {
    const html = renderWechatThemePreview(editContent.value, currentWechatThemeId.value);
    const htmlBlob = new Blob([html], { type: "text/html" });
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
  if (article.status !== "ready_for_publish" && article.status !== "wechat_draft") return false;
  if (parseJsonArray(article.titles).length === 0) return false;
  if (article.coverImage.length === 0) return false;
  if (parseArticleImages(article.imagesJson).length === 0) return false;
  if (!article.contentMarkdown) return false;
  return true;
}

function getMissingConditions(article: CreativeFinishedArticle): string[] {
  const missing: string[] = [];
  if (article.status !== "ready_for_publish" && article.status !== "wechat_draft") missing.push("状态不允许推送");
  if (parseJsonArray(article.titles).length === 0) missing.push("缺少标题");
  if (article.coverImage.length === 0) missing.push("缺少封面图");
  if (parseArticleImages(article.imagesJson).length === 0) missing.push("缺少正文配图");
  if (!article.contentMarkdown) missing.push("缺少 Markdown 内容");
  return missing;
}
</script>

<style>
/* 弹窗打开时禁止蒙层滚动 */
.article-detail-modal {
  overflow: hidden !important;
}
/* modal content 固定 90vh，body 内部滚动 */
.article-detail-modal .ant-modal-content {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.article-detail-modal .ant-modal-header {
  flex-shrink: 0;
}
.article-detail-modal .ant-modal-body {
  background: #ffffff;
  flex: 1;
  overflow-y: auto;
}
.article-detail-modal .ant-modal-footer {
  flex-shrink: 0;
  border-top: 1px solid #f0f0f0;
  padding: 12px 24px;
}

.article-editor-wrapper {
  height: calc(100vh - 280px);
  min-height: 400px;
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
  color: #caa9fa;
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
