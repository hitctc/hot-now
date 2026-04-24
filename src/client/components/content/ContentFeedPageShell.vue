<script setup lang="ts">
import ContentBackToTopButton from "./ContentBackToTopButton.vue";
import ContentEmptyState from "./ContentEmptyState.vue";
import ContentHeroCard from "./ContentHeroCard.vue";
import ContentStandardCard from "./ContentStandardCard.vue";
import ContentToolbarCard from "./ContentToolbarCard.vue";
import {
  editorialContentIntroSectionClass,
  editorialContentListSectionClass,
  editorialContentPageClass
} from "./contentCardShared";
import { useContentFeedPageController } from "./useContentFeedPageController";
import type { ContentFeedPageConfig, ContentFeedPageReader } from "./contentFeedPageShared";

const props = defineProps<{
  config: ContentFeedPageConfig;
  readPage: ContentFeedPageReader;
}>();

const {
  appliedSearchKeyword,
  displayIndexOffset,
  displayState,
  featuredCard,
  handleBackToTopClick,
  handleSearchClear,
  handleSearchSubmit,
	  handleSortModeChange,
	  handleSourceKindsChange,
	  handleTwitterAccountsChange,
	  handleTwitterKeywordsChange,
  handleWechatRssChange,
  hasLoadError,
  hasMoreResults,
  isLoading,
  isLoadingNextPage,
  isRefreshing,
  listCards,
  loadedResultCount,
  loadError,
  pageModel,
  pagination,
	  selectedSourceKinds,
	  selectedTwitterAccountIds,
	  selectedTwitterKeywordIds,
	  selectedWechatRssSourceIds,
  showBackToTopButton,
  sortMode,
  sourceFilter,
  setInfiniteLoadTrigger,
  strategySummary,
  totalResultCount,
  visibleResultCount
} = useContentFeedPageController({
  config: props.config,
  readPage: props.readPage
});

function readStageAccentClass(): string {
  return props.config.stageAccent === "cyan"
    ? "pointer-events-none absolute right-[-56px] top-[-72px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(81,220,255,0.22),_transparent_72%)] blur-3xl"
    : "pointer-events-none absolute right-[-56px] top-[-72px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(122,162,255,0.24),_transparent_72%)] blur-3xl";
}
</script>

<template>
  <div :class="editorialContentPageClass" :data-content-page="config.pageKey">
    <a-alert
      v-if="hasLoadError && pageModel"
      class="editorial-inline-alert editorial-inline-alert--warning"
      type="warning"
      show-icon
      :message="loadError"
      banner
    />

    <div
      v-if="sourceFilter"
      class="sticky top-0 z-20 -mx-4 w-[calc(100%+2rem)] max-[900px]:top-[61px] min-[901px]:-mx-6 min-[901px]:w-[calc(100%+3rem)]"
      data-content-sticky-toolbar
    >
      <ContentToolbarCard
        :options="sourceFilter.options"
        :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
        :twitter-account-filter="pageModel?.twitterAccountFilter
          ? {
              ...pageModel.twitterAccountFilter,
              selectedAccountIds: selectedTwitterAccountIds ?? pageModel.twitterAccountFilter.selectedAccountIds
            }
          : undefined"
	        :twitter-keyword-filter="pageModel?.twitterKeywordFilter
	          ? {
	              ...pageModel.twitterKeywordFilter,
	              selectedKeywordIds: selectedTwitterKeywordIds ?? pageModel.twitterKeywordFilter.selectedKeywordIds
	            }
	          : undefined"
	        :wechat-rss-filter="pageModel?.wechatRssFilter
	          ? {
	              ...pageModel.wechatRssFilter,
	              selectedSourceIds: selectedWechatRssSourceIds ?? pageModel.wechatRssFilter.selectedSourceIds
	            }
	          : undefined"
        :visible-result-count="visibleResultCount"
        :sort-mode="sortMode"
        :keyword="appliedSearchKeyword"
        :is-loading="isRefreshing"
        @change-source="handleSourceKindsChange"
	        @change-twitter-accounts="handleTwitterAccountsChange"
	        @change-twitter-keywords="handleTwitterKeywordsChange"
	        @change-wechat-rss="handleWechatRssChange"
        @change-sort="handleSortModeChange"
        @search="handleSearchSubmit"
        @clear="handleSearchClear"
      />
    </div>

    <section
      :class="editorialContentIntroSectionClass"
      :data-content-stage="config.pageKey"
    >
      <div :class="readStageAccentClass()" aria-hidden="true" />
      <div class="relative z-[1] flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
            {{ config.stageBadge }}
          </span>
          <span class="text-xs leading-6 text-editorial-text-muted">{{ config.stageKicker }}</span>
        </div>
        <div class="flex flex-col gap-2">
          <h3 class="m-0 text-[28px] font-semibold tracking-[-0.04em] text-editorial-text-main">
            {{ config.stageTitle }}
          </h3>
          <p class="m-0 max-w-3xl text-sm leading-7 text-editorial-text-body">
            {{ config.stageDescription }}
          </p>
        </div>
        <div
          v-if="strategySummary.length > 0"
          class="flex flex-wrap items-center gap-2"
          :data-content-strategy-summary="config.pageKey"
        >
          <span class="text-sm font-medium text-editorial-text-muted">{{ config.stageStrategyLabel }}</span>
          <a-tag v-for="item in strategySummary" :key="item">{{ item }}</a-tag>
        </div>
      </div>
    </section>

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: config.skeletonRows }" />

    <ContentEmptyState v-else-if="displayState" :state="displayState" data-content-empty-state />

    <template v-else-if="pageModel">
      <ContentHeroCard
        v-if="config.showFeaturedCard && featuredCard"
        :card="featuredCard"
        data-content-section="featured"
      />

      <section
        v-if="listCards.length > 0"
        :class="editorialContentListSectionClass"
        data-content-section="list"
        data-content-list
        data-list-style="database"
      >
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-editorial-border/70 pb-3 text-sm text-editorial-text-body"
          data-content-result-summary
        >
          <span class="font-semibold text-editorial-text-main">共 {{ totalResultCount }} 条</span>
          <span class="text-xs text-editorial-text-muted">已加载 {{ loadedResultCount }} 条</span>
        </div>

        <ContentStandardCard
          v-for="(card, index) in listCards"
          :key="card.id"
          :card="card"
          :display-index="displayIndexOffset + index + 1"
        />
      </section>

      <div
        v-if="pagination && pagination.totalResults > 0"
        :ref="setInfiniteLoadTrigger"
        class="flex min-h-12 items-center justify-center rounded-editorial-card border border-dashed border-editorial-border bg-editorial-panel/55 px-4 py-3 text-sm text-editorial-text-muted"
        data-content-infinite-load-status
      >
        <a-spin v-if="isLoadingNextPage" />
        <span v-else-if="hasMoreResults">继续向下滚动加载更多</span>
        <span v-else>已加载全部 {{ totalResultCount }} 条</span>
      </div>
    </template>

    <div
      v-if="isRefreshing"
      class="flex w-full justify-center"
      data-content-refresh-indicator
    >
      <a-spin />
    </div>

    <ContentBackToTopButton
      :visible="showBackToTopButton"
      @click="handleBackToTopClick"
    />
  </div>
</template>
