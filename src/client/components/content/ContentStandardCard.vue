<script setup lang="ts">
import { message } from "ant-design-vue";
import { computed, reactive, ref, watch } from "vue";

import ContentActionBar from "./ContentActionBar.vue";
import ContentFeedbackPanel from "./ContentFeedbackPanel.vue";
import { useSummaryDisclosure } from "./useSummaryDisclosure";
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
  saveFeedbackPoolEntry,
  type ContentCard,
  type SaveFeedbackPoolEntryPayload
} from "../../services/contentApi";
import { HttpError } from "../../services/http";

const props = defineProps<{
  card: ContentCard;
  displayIndex?: number | null;
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
    void message.success("反馈池建议已保存");
  } catch (error) {
    // 未登录时内容页依旧可见，但写动作会被后端拦住，这里要回显成权限提示而不是假装服务异常。
    if (error instanceof HttpError && error.status === 401) {
      statusText.value = "请先登录后再保存反馈池建议。";
      void message.warning("请先登录后再保存反馈池建议。");
    } else {
      statusText.value = "反馈池建议保存失败，请稍后重试。";
      void message.error("反馈池建议保存失败，请稍后重试。");
    }
  } finally {
    isBusy.value = false;
  }
}

watch(() => props.card, syncCardState, { deep: true });

const safeUrl = computed(() => readSafeUrl(cardState.canonicalUrl));
const publishedText = computed(() => formatPublishedAt(cardState.publishedAt));
const feedbackSummary = computed(() => formatFeedbackSummary(cardState.feedbackEntry));
const {
  summaryElement,
  summaryExpanded,
  summaryOverflowed,
  summaryBodyClass,
  toggleSummaryExpanded
} = useSummaryDisclosure(() => cardState.summary, 5, 220);
</script>

<template>
  <article
    :class="[editorialContentCardClass, 'px-4 py-4 transition hover:bg-editorial-link-active']"
    :data-content-id="cardState.id"
    data-content-row
    data-content-variant="standard"
  >
    <div class="flex flex-col gap-4">
      <div :class="editorialContentMetaClass">
        <span>{{ cardState.sourceName }}</span>
        <span>{{ publishedText }}</span>
        <span :class="editorialContentScoreBadgeClass">系统分 {{ cardState.contentScore }}</span>
      </div>

      <div class="flex items-start gap-3">
        <span
          v-if="props.displayIndex !== undefined && props.displayIndex !== null"
          class="inline-flex min-w-[2rem] shrink-0 items-center justify-center rounded-editorial-pill border border-editorial-border bg-editorial-link px-2.5 py-1 text-[11px] font-semibold leading-5 text-editorial-text-muted"
          data-content-display-index
        >
          {{ props.displayIndex }}
        </span>

        <h3 class="m-0 min-w-0 flex-1 text-[17px] font-medium leading-7 text-editorial-text-main">
          <a
            v-if="safeUrl"
            :href="safeUrl"
            target="_blank"
            rel="noreferrer"
            class="text-current no-underline transition hover:underline"
          >
            {{ cardState.title }}
          </a>
          <span v-else>{{ cardState.title }}</span>
        </h3>
      </div>

      <div class="flex flex-col gap-2">
        <p
          ref="summaryElement"
          :class="['m-0 text-sm leading-6 text-editorial-text-body [overflow-wrap:anywhere]', ...summaryBodyClass]"
          :data-content-summary-expanded="summaryExpanded ? 'true' : 'false'"
          data-content-standard-summary
          data-content-summary-body
        >
          {{ cardState.summary }}
        </p>

        <button
          v-if="summaryOverflowed"
          type="button"
          class="inline-flex w-fit items-center rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 py-1.5 text-xs font-medium text-editorial-text-main transition hover:bg-editorial-link-active"
          :aria-expanded="summaryExpanded ? 'true' : 'false'"
          data-content-summary-toggle
          @click="toggleSummaryExpanded"
        >
          {{ summaryExpanded ? "收起" : "展开" }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <span v-for="badge in cardState.scoreBadges" :key="badge" :class="editorialContentBadgeClass">
          {{ badge }}
        </span>
      </div>

      <ContentActionBar
        :is-busy="isBusy"
        :feedback-open="feedbackOpen"
        :status-text="statusText"
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
        :submitting="isBusy"
        @submit="handleFeedbackSubmit"
      />
    </div>
  </article>
</template>
