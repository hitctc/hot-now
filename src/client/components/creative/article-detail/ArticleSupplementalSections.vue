<script setup lang="ts">
import { ref } from "vue";
import type { CreativeFinishedArticle } from "../../../services/creativeApi.js";
import { formatCommentPair, parseJsonArray } from "./articleDetailPresentation.js";

defineProps<{
  article: CreativeFinishedArticle;
  readonly?: boolean;
  isManualArticle: boolean;
  sourceCoverUrl: string | null;
  generatingComments: boolean;
  generatingAuthorExtensions: boolean;
}>();

const emit = defineEmits<{
  (event: "copy", value: string): void;
  (event: "generate-comments"): void;
  (event: "generate-author-extensions"): void;
}>();

/** 原图预览状态只属于展示区，关闭抽屉时会随组件销毁。 */
const sourceCoverPreviewOpen = ref(false);
</script>

<template>
  <section v-if="!isManualArticle && parseJsonArray(article.hooks).length > 0">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">开头钩子</h3>
      <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', parseJsonArray(article.hooks).join('\n'))">复制全部</a-button>
    </div>
    <ul class="m-0 list-none space-y-1 pl-0">
      <li
        v-for="(hook, index) in parseJsonArray(article.hooks)"
        :key="index"
        class="group flex items-start gap-3 rounded-editorial-sm bg-editorial-panel/40 px-3 py-2"
      >
        <span class="flex-1 text-sm leading-6 text-editorial-text-body">{{ hook }}</span>
        <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px] opacity-0 group-hover:opacity-100" @click="emit('copy', hook)">复制</a-button>
      </li>
    </ul>
  </section>

  <section v-if="!isManualArticle && parseJsonArray(article.quotes).length > 0">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">可摘句</h3>
      <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', parseJsonArray(article.quotes).join('\n'))">复制全部</a-button>
    </div>
    <ul class="m-0 list-inside list-disc pl-1">
      <li v-for="(quote, index) in parseJsonArray(article.quotes)" :key="index" class="text-sm leading-6 text-editorial-text-body">{{ quote }}</li>
    </ul>
  </section>

  <!-- 素材原图保留外链展示，不转存到本地。 -->
  <section v-if="!isManualArticle && sourceCoverUrl">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">素材原图</h3>
      <a :href="sourceCoverUrl" target="_blank" rel="noopener noreferrer" class="text-[11px] text-editorial-link-active hover:underline">在新标签打开原图</a>
    </div>
    <img :src="sourceCoverUrl" referrerpolicy="no-referrer" alt="素材原图" loading="lazy" class="block w-1/5 cursor-pointer rounded-editorial-md border border-editorial-border object-cover transition-opacity hover:opacity-80" @click="sourceCoverPreviewOpen = true" />
    <p class="m-0 mt-1 text-[11px] text-editorial-text-muted/70">素材原文封面图（外链，点击图片预览，右键另存后上传到成品）</p>
    <a-modal v-model:open="sourceCoverPreviewOpen" :footer="null" :width="760" :body-style="{ padding: '24px' }" destroy-on-close>
      <img :src="sourceCoverUrl" referrerpolicy="no-referrer" alt="素材原图预览" class="mx-auto block max-h-[72vh] max-w-full object-contain" />
    </a-modal>
  </section>

  <section v-if="!isManualArticle && (!readonly || article.comments?.length)">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">读者评论 + 作者回复</h3>
      <div class="flex items-center gap-2">
        <a-button v-if="article.comments?.length" type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', article.comments.map(formatCommentPair).join('\n\n'))">复制全部</a-button>
        <a-button v-if="!readonly" type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" :loading="generatingComments" :disabled="generatingComments" @click="emit('generate-comments')">{{ generatingComments ? '生成中...' : (article.comments?.length ? '重新生成评论' : '生成评论') }}</a-button>
      </div>
    </div>
    <div v-if="article.comments?.length" class="flex flex-col gap-1.5">
      <div v-for="(comment, index) in article.comments" :key="index" class="rounded border border-editorial-border bg-editorial-bg-page px-2 py-1.5">
        <div class="flex items-start gap-1.5">
          <span class="shrink-0 text-[10px] font-medium text-editorial-text-muted">读者</span>
          <span class="flex-1 text-[12px] leading-relaxed text-editorial-text-body">{{ comment.reader }}</span>
          <button class="shrink-0 px-2 py-1 text-[11px] text-editorial-link-active hover:underline" @click="emit('copy', comment.reader)">复制</button>
        </div>
        <div class="mt-1 flex items-start gap-1.5">
          <span class="shrink-0 text-[10px] font-medium text-editorial-text-muted">作者</span>
          <span class="flex-1 text-[12px] leading-relaxed text-editorial-text-body">{{ comment.author_reply }}</span>
          <button class="shrink-0 px-2 py-1 text-[11px] text-editorial-link-active hover:underline" @click="emit('copy', comment.author_reply)">复制</button>
        </div>
      </div>
    </div>
    <p v-else class="m-0 text-[12px] leading-relaxed text-editorial-text-muted">暂无评论，点击右上「生成评论」按需补生成。</p>
  </section>

  <section v-if="!isManualArticle && (!readonly || article.authorExtensions?.length)">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">作者拓展</h3>
      <div class="flex items-center gap-2">
        <a-button v-if="article.authorExtensions?.length" type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', article.authorExtensions.join('\n\n'))">复制全部</a-button>
        <a-button v-if="!readonly" type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" :loading="generatingAuthorExtensions" :disabled="generatingAuthorExtensions" @click="emit('generate-author-extensions')">{{ generatingAuthorExtensions ? '生成中...' : (article.authorExtensions?.length ? '重新生成拓展' : '生成拓展') }}</a-button>
      </div>
    </div>
    <div v-if="article.authorExtensions?.length" class="flex flex-col gap-1.5">
      <div v-for="(extension, index) in article.authorExtensions" :key="index" class="flex items-start gap-1.5 rounded border border-editorial-border bg-editorial-bg-page px-2 py-1.5">
        <span class="flex-1 text-[12px] leading-relaxed text-editorial-text-body">{{ extension }}</span>
        <button class="shrink-0 px-2 py-1 text-[11px] text-editorial-link-active hover:underline" @click="emit('copy', extension)">复制</button>
      </div>
    </div>
    <p v-else class="m-0 text-[12px] leading-relaxed text-editorial-text-muted">暂无作者拓展，点击右上「生成拓展」按需补生成。</p>
  </section>
</template>
