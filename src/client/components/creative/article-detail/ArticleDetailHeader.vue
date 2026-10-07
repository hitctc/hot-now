<script setup lang="ts">
import { sourcePlatformLabel, sourceRankingLabel } from "../source-items/sourceItemPresentation.js";
import type { CreativeFinishedArticle } from "../../../services/creativeApi.js";
import { formatLocalTime, pipelineLabel } from "./articleDetailPresentation.js";
import { getDisplayTitle } from "../articleStatusShared.js";

defineProps<{ article: CreativeFinishedArticle }>();

const emit = defineEmits<{
  (event: "copy-id", id: number): void;
  (event: "open-source", sourceItemId: number): void;
}>();
</script>

<template>
  <span class="article-detail-header flex flex-wrap items-baseline gap-x-2">
    <span v-if="article.direction === 'short_content'" data-short-article-source class="article-detail-header__source mb-1 flex basis-full flex-wrap gap-x-2 gap-y-1 text-xs text-editorial-text-muted">
      <span>来源：{{ sourcePlatformLabel(article.sourceName) }}</span>
      <span :title="article.sourceRanking?.board">{{ sourceRankingLabel(article.sourceRanking, article.sourceCollectorAgent) }}</span>
    </span>
    <span
      class="article-detail-header__id cursor-pointer text-xs text-editorial-link-active hover:underline"
      @click="emit('copy-id', article.id)"
    >#{{ article.id }}</span>
    <span class="article-detail-header__title text-base font-semibold">{{ getDisplayTitle(article.titles, article.titleIndex) }}</span>
    <span v-if="article.direction !== 'short_content'" class="article-detail-header__pipeline text-xs text-editorial-text-muted">{{ pipelineLabel(article) }}</span>
    <span class="article-detail-header__time text-xs text-editorial-text-muted">{{ formatLocalTime(article.createdAt) }}</span>
    <a
      v-if="article.sourceItemId !== null"
      class="article-detail-header__related cursor-pointer text-xs text-editorial-link-active hover:underline"
      @click.prevent="emit('open-source', article.sourceItemId)"
    >素材 #{{ article.sourceItemId }}{{ article.sourceTitle ? ' · ' + article.sourceTitle : '' }}{{ article.direction !== 'short_content' && article.sourceName ? ' · ' + article.sourceName : '' }}</a>
  </span>
</template>
