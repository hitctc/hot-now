<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import AiTimelineEventCard from "../../components/content/AiTimelineEventCard.vue";
import AiTimelineFilters from "../../components/content/AiTimelineFilters.vue";
import ContentPaginationBar from "../../components/content/ContentPaginationBar.vue";
import EditorialEmptyState from "../../components/content/EditorialEmptyState.vue";
import {
  editorialContentIntroSectionClass,
  editorialContentListSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { readAiTimelinePage, type AiTimelinePageModel } from "../../services/aiTimelineApi";

type LoadState = "idle" | "loading" | "loaded" | "error";

const pageModel = ref<AiTimelinePageModel | null>(null);
const loadState = ref<LoadState>("idle");
const loadError = ref<string | null>(null);
const selectedEventType = ref("");
const selectedCompany = ref("");
const searchKeyword = ref("");
const currentPage = ref(1);

const events = computed(() => pageModel.value?.events ?? []);
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

// 页面只读取时间线专用 API，不混用内容流的来源筛选、评分排序或反馈池状态。
async function loadTimelinePage(): Promise<void> {
  loadState.value = "loading";
  loadError.value = null;

  try {
    const nextModel = await readAiTimelinePage({
      eventType: selectedEventType.value || undefined,
      company: selectedCompany.value || undefined,
      searchKeyword: searchKeyword.value,
      page: currentPage.value
    });

    pageModel.value = nextModel;
    currentPage.value = nextModel.page;
    loadState.value = "loaded";
  } catch (error) {
    loadState.value = "error";
    loadError.value = error instanceof Error ? error.message : "AI 时间线加载失败";
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

function handlePageChange(page: number): void {
  currentPage.value = page;
  void loadTimelinePage();
}

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
            这里只收一手官方来源，按发布时间倒序追踪模型发布、开发生态、产品应用、行业动态和官方前瞻。
            媒体解读、传闻和没有官方链接的内容不会进入这条时间线。
          </p>
        </div>
        <div class="flex flex-wrap gap-2 text-xs text-editorial-text-muted">
          <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">官方白名单来源</span>
          <span class="rounded-editorial-pill bg-editorial-link px-2.5 py-1">手动采集</span>
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

    <template v-else-if="loadState === 'loading' && !pageModel">
      <a-skeleton v-for="item in 4" :key="item" :active="true" :paragraph="{ rows: 3 }" />
    </template>

    <template v-else-if="events.length === 0">
      <EditorialEmptyState
        :title="hasActiveFilter ? '当前筛选下没有官方事件' : '当前还没有官方时间线事件'"
        :description="hasActiveFilter ? '清空筛选后再看看，或稍后手动采集官方源。' : '页面已经准备好，等待手动采集官方白名单来源后展示。'"
        status="info"
        data-ai-timeline-empty
      />
    </template>

    <template v-else>
      <section :class="editorialContentListSectionClass" data-ai-timeline-list>
        <AiTimelineEventCard
          v-for="(event, index) in events"
          :key="event.id"
          :event="event"
          :display-index="(pagination.page - 1) * pagination.pageSize + index + 1"
        />
      </section>

      <ContentPaginationBar
        :page="pagination.page"
        :page-size="pagination.pageSize"
        :total-results="pagination.totalResults"
        :total-pages="pagination.totalPages"
        @change="handlePageChange"
      />
    </template>
  </div>
</template>
