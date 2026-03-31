<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import ContentActionBar from "./ContentActionBar.vue";
import ContentFeedbackPanel from "./ContentFeedbackPanel.vue";
import { cloneContentCard, formatFeedbackSummary, formatPublishedAt, readSafeUrl } from "./contentCardShared";
import {
  saveFavorite,
  saveFeedbackPoolEntry,
  saveReaction,
  type ContentCard,
  type SaveFeedbackPoolEntryPayload
} from "../../services/contentApi";

const props = defineProps<{
  card: ContentCard;
  statusText?: string | null;
}>();

const cardState = reactive<ContentCard>(cloneContentCard(props.card));
const feedbackOpen = ref(false);
const isBusy = ref(false);
const statusText = ref<string | null>(props.statusText ?? null);

function syncCardState(nextCard: ContentCard): void {
  Object.assign(cardState, cloneContentCard(nextCard));
  statusText.value = props.statusText ?? null;
  feedbackOpen.value = false;
}

watch(
  () => props.statusText,
  (nextStatusText) => {
    if (nextStatusText !== undefined) {
      statusText.value = nextStatusText;
    }
  },
  { immediate: true }
);

async function handleFavorite(): Promise<void> {
  isBusy.value = true;

  try {
    const response = await saveFavorite(cardState.id, !cardState.isFavorited);
    cardState.isFavorited = response.isFavorited;
    statusText.value = response.isFavorited ? "已加入收藏" : "已取消收藏";
  } catch {
    statusText.value = "收藏失败，请稍后重试。";
  } finally {
    isBusy.value = false;
  }
}

async function handleReaction(nextReaction: "like" | "dislike"): Promise<void> {
  isBusy.value = true;

  try {
    const response = await saveReaction(cardState.id, nextReaction);
    cardState.reaction = response.reaction;
    feedbackOpen.value = true;
    statusText.value = nextReaction === "like" ? "已记录点赞，可以继续补充原因" : "已记录点踩，可以继续补充原因";
  } catch {
    statusText.value = "反馈操作失败，请稍后重试。";
  } finally {
    isBusy.value = false;
  }
}

async function handleFeedbackSubmit(payload: SaveFeedbackPoolEntryPayload): Promise<void> {
  isBusy.value = true;

  try {
    await saveFeedbackPoolEntry(cardState.id, payload);
    cardState.feedbackEntry = {
      freeText: payload.freeText || null,
      suggestedEffect: payload.suggestedEffect || null,
      strengthLevel: payload.strengthLevel || null,
      positiveKeywords: payload.positiveKeywords,
      negativeKeywords: payload.negativeKeywords
    };
    statusText.value = "反馈池建议已保存";
  } catch {
    statusText.value = "反馈池建议保存失败，请稍后重试。";
  } finally {
    isBusy.value = false;
  }
}

watch(() => props.card, syncCardState, { deep: true });

const safeUrl = computed(() => readSafeUrl(cardState.canonicalUrl));
const publishedText = computed(() => formatPublishedAt(cardState.publishedAt));
const feedbackSummary = computed(() => formatFeedbackSummary(cardState.feedbackEntry));
</script>

<template>
  <a-card
    class="content-card content-card--hero"
    :bordered="false"
    :data-content-id="cardState.id"
    data-content-variant="hero"
  >
    <a-space direction="vertical" size="middle" class="content-card__stack">
      <div class="content-card__meta">
        <a-tag color="blue">{{ cardState.sourceName }}</a-tag>
        <a-typography-text type="secondary">{{ publishedText }}</a-typography-text>
      </div>

      <a-typography-title :level="2" class="content-card__title">
        <a v-if="safeUrl" :href="safeUrl" target="_blank" rel="noreferrer">{{ cardState.title }}</a>
        <span v-else>{{ cardState.title }}</span>
      </a-typography-title>

      <a-typography-paragraph class="content-card__summary">
        {{ cardState.summary }}
      </a-typography-paragraph>

      <div class="content-card__badges">
        <a-tag color="processing">系统分 {{ cardState.contentScore }}</a-tag>
        <a-tag v-for="badge in cardState.scoreBadges" :key="badge">{{ badge }}</a-tag>
      </div>

      <ContentActionBar
        :is-favorited="cardState.isFavorited"
        :reaction="cardState.reaction"
        :is-busy="isBusy"
        :feedback-open="feedbackOpen"
        :status-text="statusText"
        @favorite="handleFavorite"
        @reaction="handleReaction"
        @toggle-feedback="feedbackOpen = !feedbackOpen"
      />

      <div v-if="feedbackSummary" class="content-card__feedback-summary">
        <a-typography-text type="secondary">反馈池建议</a-typography-text>
        <a-typography-paragraph class="content-card__feedback-summary-text">
          {{ feedbackSummary }}
        </a-typography-paragraph>
      </div>

      <ContentFeedbackPanel
        v-if="feedbackOpen"
        :model-value="cardState.feedbackEntry"
        :reaction-snapshot="cardState.reaction"
        :submitting="isBusy"
        @submit="handleFeedbackSubmit"
      />
    </a-space>
  </a-card>
</template>

<style scoped>
.content-card {
  border-radius: 22px;
  border: 1px solid var(--editorial-border);
  background: var(--editorial-bg-panel);
  box-shadow: var(--editorial-shadow-card);
}

.content-card__stack {
  width: 100%;
}

.content-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.content-card__title {
  margin: 0;
}

.content-card__title :deep(a) {
  color: inherit;
}

.content-card__summary {
  margin: 0;
  font-size: 16px;
}

.content-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.content-card__feedback-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: var(--editorial-radius-lg);
  background: var(--editorial-bg-control);
  border: 1px solid var(--editorial-border);
}

.content-card__feedback-summary-text {
  margin: 0;
  color: var(--editorial-text-body);
}
</style>
