<script setup lang="ts">
import ContentActionBar from "./ContentActionBar.vue";
import ContentFeedbackModal from "./ContentFeedbackModal.vue";
import { useContentHeroCard, type ContentHeroCardProps } from "./useContentHeroCard.js";
const props = defineProps<ContentHeroCardProps>();
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
} = useContentHeroCard(props);

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
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-8">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2" data-content-hero-stage>
          <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
            Featured Lens
          </span>
          <span class="text-xs leading-6 text-editorial-text-muted">把当前最值得先看的 AI 内容放在第一视觉层。</span>
        </div>
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

      <div class="flex h-auto flex-col items-start gap-2 pt-1 lg:min-w-[148px] lg:items-end" data-content-hero-sidecar>
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
