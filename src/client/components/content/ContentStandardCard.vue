<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import ContentActionBar from "./ContentActionBar.vue";
import ContentFeedbackPanel from "./ContentFeedbackPanel.vue";
import {
  cloneContentCard,
  editorialContentBadgeClass,
  editorialContentCardClass,
  editorialContentFeedbackSummaryClass,
  editorialContentMetaClass,
  editorialContentScoreBadgeClass,
  formatFeedbackSummary,
  formatPublishedAt,
  readSafeUrl
} from "./contentCardShared";
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
    :bordered="false"
    :class="[editorialContentCardClass, 'overflow-hidden']"
    :data-content-id="cardState.id"
    data-content-variant="standard"
  >
    <div class="flex flex-col gap-4">
      <div :class="editorialContentMetaClass">
        <span :class="editorialContentBadgeClass">{{ cardState.sourceName }}</span>
        <span>{{ publishedText }}</span>
        <span :class="editorialContentScoreBadgeClass">系统分 {{ cardState.contentScore }}</span>
      </div>

      <h3 class="text-xl font-semibold leading-tight text-editorial-text-main">
        <a
          v-if="safeUrl"
          :href="safeUrl"
          target="_blank"
          rel="noreferrer"
          class="text-current no-underline transition hover:text-editorial-accent hover:no-underline"
        >
          {{ cardState.title }}
        </a>
        <span v-else>{{ cardState.title }}</span>
      </h3>

      <p class="m-0 text-[15px] leading-7 text-editorial-text-body">
        {{ cardState.summary }}
      </p>

      <div class="flex flex-wrap gap-2">
        <span v-for="badge in cardState.scoreBadges" :key="badge" :class="editorialContentBadgeClass">
          {{ badge }}
        </span>
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

      <div v-if="feedbackSummary" :class="editorialContentFeedbackSummaryClass">
        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-editorial-text-muted">反馈池建议</span>
        <p class="m-0 text-sm leading-6 text-editorial-text-body">
          {{ feedbackSummary }}
        </p>
      </div>

      <ContentFeedbackPanel
        v-if="feedbackOpen"
        :model-value="cardState.feedbackEntry"
        :reaction-snapshot="cardState.reaction"
        :submitting="isBusy"
        @submit="handleFeedbackSubmit"
      />
    </div>
  </a-card>
</template>
