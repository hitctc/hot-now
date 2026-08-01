<script setup lang="ts">
import type { CreativeFinishedArticle } from "../../../services/creativeApi.js";
import { formatLocalTime, getFirstTitle, pipelineLabel } from "./articleDetailPresentation.js";

defineProps<{ article: CreativeFinishedArticle }>();

const emit = defineEmits<{
  (event: "copy-id", id: number): void;
  (event: "open-source", sourceItemId: number): void;
}>();
</script>

<template>
  <span class="flex flex-wrap items-baseline gap-x-2">
    <span
      class="cursor-pointer text-xs text-editorial-link-active hover:underline"
      @click="emit('copy-id', article.id)"
    >#{{ article.id }}</span>
    <span class="text-base font-semibold">{{ getFirstTitle(article.titles) }}</span>
    <span class="text-xs text-editorial-text-muted">{{ pipelineLabel(article) }}</span>
    <span class="text-xs text-editorial-text-muted">{{ formatLocalTime(article.createdAt) }}</span>
    <a
      v-if="article.sourceItemId !== null"
      class="cursor-pointer text-xs text-editorial-link-active hover:underline"
      @click.prevent="emit('open-source', article.sourceItemId)"
    >素材 #{{ article.sourceItemId }}{{ (article as any).sourceTitle ? ' · ' + (article as any).sourceTitle : '' }}{{ (article as any).sourceName ? ' · ' + (article as any).sourceName : '' }}</a>
  </span>
</template>
