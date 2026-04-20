<script setup lang="ts">
import { message } from "ant-design-vue";
import { computed, reactive, ref, watch } from "vue";

import ContentActionBar from "./ContentActionBar.vue";
import ContentFeedbackModal from "./ContentFeedbackModal.vue";
import { useSummaryDisclosure } from "./useSummaryDisclosure";
import {
  cloneContentCard,
  editorialContentBadgeClass,
  editorialContentCardClass,
  editorialContentInsetPanelClass,
  editorialContentMetaClass,
  editorialContentScoreBadgeClass,
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
    feedbackOpen.value = false;
    statusText.value = "反馈词已保存到反馈池";
    void message.success("反馈词已保存到反馈池");
  } catch (error) {
    // 内容页允许公开浏览，401 更可能是用户未登录而不是后端异常，需要给出明确提示。
    if (error instanceof HttpError && error.status === 401) {
      statusText.value = "请先登录后再保存反馈词。";
      void message.warning("请先登录后再保存反馈词。");
    } else {
      statusText.value = "反馈词保存失败，请稍后重试。";
      void message.error("反馈词保存失败，请稍后重试。");
    }
  } finally {
    isBusy.value = false;
  }
}

watch(() => props.card, syncCardState, { deep: true });

const safeUrl = computed(() => readSafeUrl(cardState.canonicalUrl));
const publishedText = computed(() => formatPublishedAt(cardState.publishedAt));
const {
  summaryElement,
  summaryExpanded,
  summaryOverflowed,
  summaryBodyClass,
  toggleSummaryExpanded
} = useSummaryDisclosure(() => cardState.summary, 6, 280);
</script>

<template>
  <article
    :class="[
      editorialContentCardClass,
      'editorial-spotlight-card relative overflow-hidden rounded-editorial-xl border border-editorial-border-strong px-6 py-6'
    ]"
    :data-content-id="cardState.id"
    data-content-hero
    data-content-variant="hero"
  >
    <div
      class="pointer-events-none absolute left-[-44px] top-[-70px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(122,162,255,0.34),_transparent_72%)] blur-3xl"
      aria-hidden="true"
    />
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_288px] lg:gap-8">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2" data-content-hero-stage>
          <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
            Featured Lens
          </span>
          <span class="text-xs leading-6 text-editorial-text-muted">把当前最值得先看的 AI 内容放在第一视觉层。</span>
        </div>
        <div :class="editorialContentMetaClass">
          <span>{{ cardState.sourceName }}</span>
          <span>{{ publishedText }}</span>
          <span :class="editorialContentScoreBadgeClass">系统分 {{ cardState.contentScore }}</span>
        </div>

        <div class="flex flex-col gap-3">
          <h2
            class="text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] text-editorial-text-main md:text-[2.15rem]"
            data-content-hero-title
          >
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
          </h2>

          <div class="flex flex-col gap-2">
            <p
              ref="summaryElement"
              :class="['m-0 text-sm leading-7 text-editorial-text-body [overflow-wrap:anywhere]', ...summaryBodyClass]"
              :data-content-summary-expanded="summaryExpanded ? 'true' : 'false'"
              data-content-hero-summary
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
        </div>

        <div class="flex flex-wrap gap-2">
          <span v-for="badge in cardState.scoreBadges" :key="badge" :class="editorialContentBadgeClass">
            {{ badge }}
          </span>
        </div>
      </div>

      <div
        :class="[editorialContentInsetPanelClass, 'flex h-full flex-col gap-4 px-4 py-4']"
        data-content-hero-sidecar
      >
        <ContentActionBar
          :is-busy="isBusy"
          :feedback-open="feedbackOpen"
          :status-text="statusText"
          @toggle-feedback="feedbackOpen = !feedbackOpen"
        />

        <ContentFeedbackModal
          :open="feedbackOpen"
          :model-value="cardState.feedbackEntry"
          :submitting="isBusy"
          @close="feedbackOpen = false"
          @submit="handleFeedbackSubmit"
        />
      </div>
    </div>
  </article>
</template>
