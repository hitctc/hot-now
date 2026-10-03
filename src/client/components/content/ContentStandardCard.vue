<script setup lang="ts">
import ContentActionBar from "./ContentActionBar.vue";
import ContentFeedbackModal from "./ContentFeedbackModal.vue";
import { useContentStandardCard, type ContentStandardCardProps } from "./useContentStandardCard.js";
const props = defineProps<ContentStandardCardProps>();
const {
  cardState,
  feedbackOpen,
  isBusy,
  statusText,
  handleFeedbackSubmit,
  safeUrl,
  publishedText,
  summaryExpanded,
  summaryOverflowed,
  summaryBodyClass,
  toggleSummaryExpanded,
  editorialContentBadgeClass,
  editorialContentCardClass,
  editorialContentMetaClass,
  editorialContentScoreBadgeClass,
  summaryElement,
} = useContentStandardCard(props);

</script>

<template>
  <article
    :class="[
      editorialContentCardClass,
      'group overflow-hidden rounded-editorial-lg border border-editorial-border px-5 py-5 transition hover:-translate-y-0.5 hover:border-editorial-border-strong hover:bg-editorial-link-active/60 hover:shadow-editorial-floating'
    ]"
    :data-content-id="cardState.id"
    data-content-row
    data-content-variant="standard"
  >
    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start" data-content-row-shell>
      <div class="flex flex-col gap-4">
      <div :class="editorialContentMetaClass">
        <span>{{ cardState.sourceName }}</span>
        <span
          v-if="cardState.sourceDetail"
          class="normal-case tracking-normal text-editorial-text-body"
          data-content-source-detail
        >
          {{ cardState.sourceDetail.label }}：{{ cardState.sourceDetail.value }}
        </span>
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

      </div>

      <div class="flex h-auto flex-col items-start gap-2 pt-1 lg:min-w-[132px] lg:items-end" data-content-row-sidecar>
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
