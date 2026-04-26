<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import AiTimelineEventCard from "../../components/content/AiTimelineEventCard.vue";
import AiTimelineFilters from "../../components/content/AiTimelineFilters.vue";
import ContentBackToTopButton from "../../components/content/ContentBackToTopButton.vue";
import EditorialEmptyState from "../../components/content/EditorialEmptyState.vue";
import {
  editorialContentIntroSectionClass,
  editorialContentListSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { useInfiniteLoadTrigger, VISIBLE_INFINITE_LOAD_DELAY_MS } from "../../components/content/useInfiniteLoadTrigger";
import { useContentPageScroll } from "../../components/content/useContentPageScroll";
import { readAiTimelinePage, type AiTimelineEventRecord, type AiTimelinePageModel } from "../../services/aiTimelineApi";

type LoadState = "idle" | "loading" | "loaded" | "error";

const pageModel = ref<AiTimelinePageModel | null>(null);
const timelineEvents = ref<AiTimelineEventRecord[]>([]);
const loadState = ref<LoadState>("idle");
const loadError = ref<string | null>(null);
const isLoadingNextPage = ref(false);
const selectedEventType = ref("");
const selectedCompany = ref("");
const searchKeyword = ref("");
const currentPage = ref(1);
const { showBackToTopButton, handleBackToTopClick } = useContentPageScroll();

const events = computed(() => timelineEvents.value);
const filters = computed(() => pageModel.value?.filters ?? { eventTypes: [], companies: [] });
const pagination = computed(() => ({
  page: pageModel.value?.page ?? 1,
  pageSize: pageModel.value?.pageSize ?? 50,
  totalResults: pageModel.value?.totalResults ?? 0,
  totalPages: pageModel.value?.totalPages ?? 0
}));
const isLoading = computed(() => loadState.value === "loading");
const hasActiveFilter = computed(
  () => Boolean(selectedEventType.value || selectedCompany.value || searchKeyword.value.trim())
);
const loadedEventCount = computed(() => events.value.length);
const totalEventCount = computed(() => pagination.value.totalResults);
const hasMoreEvents = computed(() => (
  currentPage.value < pagination.value.totalPages && loadedEventCount.value < pagination.value.totalResults
));

function appendUniqueEvents(currentEvents: AiTimelineEventRecord[], nextEvents: AiTimelineEventRecord[]): AiTimelineEventRecord[] {
  const seenIds = new Set(currentEvents.map((event) => event.id));
  const uniqueNextEvents = nextEvents.filter((event) => {
    if (seenIds.has(event.id)) {
      return false;
    }

    seenIds.add(event.id);
    return true;
  });

  return [...currentEvents, ...uniqueNextEvents];
}

// 页面只读取时间线专用 API，不混用内容流的来源筛选、评分排序或反馈池状态。
async function loadTimelinePage(options: { page?: number; append?: boolean } = {}): Promise<void> {
  const isAppendLoad = options.append === true;

  if (isAppendLoad) {
    isLoadingNextPage.value = true;
  } else {
    loadState.value = "loading";
    loadError.value = null;
  }

  try {
    const nextModel = await readAiTimelinePage({
      eventType: selectedEventType.value || undefined,
      company: selectedCompany.value || undefined,
      searchKeyword: searchKeyword.value,
      page: options.page ?? 1
    });

    pageModel.value = nextModel;
    currentPage.value = nextModel.page;
    timelineEvents.value = isAppendLoad
      ? appendUniqueEvents(timelineEvents.value, nextModel.events)
      : nextModel.events;
    loadState.value = "loaded";
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "AI 时间线加载失败";

    if (!isAppendLoad) {
      loadState.value = "error";
    }
  } finally {
    if (isAppendLoad) {
      isLoadingNextPage.value = false;
    }
  }
}

function reloadFromFirstPage(): void {
  currentPage.value = 1;
  void loadTimelinePage();
}

function handleEventTypeChange(value: string): void {
  selectedEventType.value = value;
  reloadFromFirstPage();
}

function handleCompanyChange(value: string): void {
  selectedCompany.value = value;
  reloadFromFirstPage();
}

function handleSearch(value: string): void {
  searchKeyword.value = value.trim();
  reloadFromFirstPage();
}

function handleClear(): void {
  selectedEventType.value = "";
  selectedCompany.value = "";
  searchKeyword.value = "";
  reloadFromFirstPage();
}

async function loadNextTimelinePage(): Promise<void> {
  if (isLoading.value || isLoadingNextPage.value || !hasMoreEvents.value) {
    return;
  }

  await loadTimelinePage({
    page: currentPage.value + 1,
    append: true
  });
}

const { isInfiniteLoadTriggerPending, setInfiniteLoadTrigger } = useInfiniteLoadTrigger(loadNextTimelinePage, {
  canTrigger: () => !isLoading.value && !isLoadingNextPage.value && hasMoreEvents.value,
  delayMs: VISIBLE_INFINITE_LOAD_DELAY_MS
});
const isNextTimelinePageVisible = computed(() => isInfiniteLoadTriggerPending.value || isLoadingNextPage.value);

onMounted(() => {
  void loadTimelinePage();
});
</script>

<template>
  <div :class="editorialContentPageClass" data-ai-timeline-page>
    <section :class="editorialContentIntroSectionClass" data-ai-timeline-intro>
      <div class="relative z-[1] flex flex-col gap-3">
        <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-editorial-text-muted">
          Official AI Release Timeline
        </p>
        <div class="flex flex-col gap-2">
          <h2 class="m-0 text-2xl font-semibold tracking-[-0.03em] text-editorial-text-main">
            AI 官方发布时间线
          </h2>
          <p class="m-0 max-w-3xl text-sm leading-6 text-editorial-text-body">
            这里直接读取外部 AI 官方发布时间线 Markdown feed，只解析其中的 `json ai-timeline-feed` 数据块，并按发布时间倒序展示最近 7 天内达到 S 级或 A 级的重要官方事件。
            事件筛选、官方证据和中文重要性说明都来自 feed，应用内不再维护官方源采集规则。
          </p>
        </div>
        <div class="flex flex-wrap gap-2 text-xs text-editorial-text-muted">
          <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">外部 Markdown feed</span>
          <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">默认最近 7 天</span>
          <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">只展示 S / A 级</span>
          <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">每条保留官方链接</span>
        </div>
      </div>
    </section>

    <AiTimelineFilters
      :event-types="filters.eventTypes"
      :companies="filters.companies"
      :selected-event-type="selectedEventType"
      :selected-company="selectedCompany"
      :search-keyword="searchKeyword"
      :loading="isLoading"
      @change-event-type="handleEventTypeChange"
      @change-company="handleCompanyChange"
      @search="handleSearch"
      @clear="handleClear"
    />

    <a-alert
      v-if="loadState === 'error'"
      class="editorial-inline-alert editorial-inline-alert--warning"
      type="warning"
      show-icon
      :message="loadError ?? 'AI 时间线加载失败，请稍后重试。'"
      data-ai-timeline-error
    />

    <a-alert
      v-else-if="loadError && pageModel"
      class="editorial-inline-alert editorial-inline-alert--warning"
      type="warning"
      show-icon
      :message="loadError"
      data-ai-timeline-load-more-error
    />

    <template v-else-if="loadState === 'loading' && !pageModel">
      <a-skeleton v-for="item in 4" :key="item" :active="true" :paragraph="{ rows: 3 }" />
    </template>

    <template v-else-if="events.length === 0">
      <EditorialEmptyState
        :title="hasActiveFilter ? '当前筛选下没有官方事件' : '当前还没有官方时间线事件'"
        :description="hasActiveFilter ? '清空筛选后再看看，或等待下一次 feed 自动化刷新。' : '页面已经准备好，等待外部 Markdown feed 自动化刷新后展示。'"
        status="info"
        data-ai-timeline-empty
      />
    </template>

    <template v-else>
      <section :class="[editorialContentListSectionClass, 'gap-0']" data-ai-timeline-list>
        <div
          class="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-editorial-border/70 pb-3 text-sm text-editorial-text-body"
          data-ai-timeline-result-summary
        >
          <span class="font-semibold text-editorial-text-main">主时间线共 {{ totalEventCount }} 条重要事件</span>
          <span class="text-xs text-editorial-text-muted">已加载 {{ loadedEventCount }} 条</span>
        </div>

        <AiTimelineEventCard
          v-for="(event, index) in events"
          :key="event.id"
          :event="event"
          :display-index="index + 1"
        />
      </section>

      <div
        v-if="pagination.totalResults > 0"
        :ref="setInfiniteLoadTrigger"
        class="flex min-h-12 items-center justify-center rounded-editorial-card border border-dashed border-editorial-border bg-editorial-panel/55 px-4 py-3 text-sm text-editorial-text-muted"
        data-ai-timeline-infinite-load-status
      >
        <a-spin v-if="isNextTimelinePageVisible" />
        <span v-else-if="hasMoreEvents">继续向下滚动加载更多</span>
        <span v-else>已加载全部 {{ totalEventCount }} 条</span>
      </div>
    </template>

    <ContentBackToTopButton
      :visible="showBackToTopButton"
      @click="handleBackToTopClick"
    />
  </div>
</template>
