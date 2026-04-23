<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import ContentEmptyState from "../../components/content/ContentEmptyState.vue";
import ContentBackToTopButton from "../../components/content/ContentBackToTopButton.vue";
import ContentHeroCard from "../../components/content/ContentHeroCard.vue";
import ContentPaginationBar from "../../components/content/ContentPaginationBar.vue";
import ContentToolbarCard from "../../components/content/ContentToolbarCard.vue";
import ContentStandardCard from "../../components/content/ContentStandardCard.vue";
import { useContentPageScroll } from "../../components/content/useContentPageScroll";
import {
  editorialContentIntroSectionClass,
  editorialContentListSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  deriveInitialSelectedEntityIds,
  deriveInitialSelectedSourceKinds,
  readAiNewPage,
  readStoredContentSearchKeyword,
  readStoredContentSortMode,
  readStoredContentSourceKinds,
  readStoredTwitterAccountIds,
  readStoredTwitterKeywordIds,
  writeStoredContentSearchKeyword,
  writeStoredContentSortMode,
  writeStoredContentSourceKinds,
  writeStoredTwitterAccountIds,
  writeStoredTwitterKeywordIds,
  type ContentSortMode,
  type ContentPageModel
} from "../../services/contentApi";

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageModel = ref<ContentPageModel | null>(null);
const selectedSourceKinds = ref<string[] | null>(readStoredContentSourceKinds());
const selectedTwitterAccountIds = ref<number[] | null>(readStoredTwitterAccountIds());
const selectedTwitterKeywordIds = ref<number[] | null>(readStoredTwitterKeywordIds());
const sortMode = ref<ContentSortMode>(readStoredContentSortMode() ?? "published_at");
const appliedSearchKeyword = ref(readStoredContentSearchKeyword() ?? "");
const route = useRoute();
const router = useRouter();
const { showBackToTopButton, scrollPageToTop, handleBackToTopClick } = useContentPageScroll();

function readPageSourceKinds(): string[] | undefined {
  return selectedSourceKinds.value === null ? undefined : selectedSourceKinds.value;
}

function readPageTwitterAccountIds(): number[] | undefined {
  return selectedTwitterAccountIds.value === null ? undefined : selectedTwitterAccountIds.value;
}

function readPageTwitterKeywordIds(): number[] | undefined {
  return selectedTwitterKeywordIds.value === null ? undefined : selectedTwitterKeywordIds.value;
}

function readCurrentPage(): number {
  const rawValue = route.query.page;
  const rawString = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const parsed = Number(rawString);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  const normalized = Math.floor(parsed);
  return normalized >= 1 ? normalized : 1;
}

async function replacePageQuery(page: number): Promise<void> {
  await router.replace({
    query: {
      ...route.query,
      page: String(page)
    }
  });
}

function buildFallbackEmptyState() {
  const sourceKinds = selectedSourceKinds.value ?? [];

  return {
    title: sourceKinds.length > 0 ? "当前筛选下没有新的 AI 信号" : "当前还没有可展示的 AI 信号",
    description: sourceKinds.length > 0
      ? "调整来源筛选后再看看，或者稍后刷新，系统会继续收集新的 AI 新闻、模型和事件。"
      : "页面已经准备好了，只是当前还没有新的 AI 信号进入内容池。",
    tone: sourceKinds.length > 0 ? "filtered" : "default"
  } as const;
}

function buildErrorState(message: string) {
  return {
    title: "页面加载失败",
    description: message,
    tone: "degraded"
  } as const;
}

// 页面加载支持“静默刷新 + 指定搜索词”两种模式，保证交互更新时不会闪烁主骨架屏。
async function loadPage(options: { selectedKinds?: string[]; silent?: boolean; searchKeyword?: string } = {}): Promise<void> {
  if (options.silent) {
    isRefreshing.value = true;
  } else {
    isLoading.value = true;
    loadError.value = null;
  }

  try {
    const requestedPage = readCurrentPage();
    const nextModel = await readAiNewPage({
      selectedSourceKinds: options.selectedKinds ?? readPageSourceKinds(),
      selectedTwitterAccountIds: readPageTwitterAccountIds(),
      selectedTwitterKeywordIds: readPageTwitterKeywordIds(),
      sortMode: sortMode.value,
      page: requestedPage,
      searchKeyword: options.searchKeyword ?? appliedSearchKeyword.value
    });
    pageModel.value = nextModel;

    if (nextModel.pagination && nextModel.pagination.page !== requestedPage) {
      await replacePageQuery(nextModel.pagination.page);
    }

    if (selectedSourceKinds.value === null) {
      const nextKinds = nextModel.sourceFilter
        ? deriveInitialSelectedSourceKinds(nextModel.sourceFilter.options, selectedSourceKinds.value)
        : [];
      selectedSourceKinds.value = nextKinds;
      writeStoredContentSourceKinds(nextKinds);
    }

    if (selectedTwitterAccountIds.value === null && nextModel.twitterAccountFilter) {
      const nextIds = deriveInitialSelectedEntityIds(
        nextModel.twitterAccountFilter.options,
        selectedTwitterAccountIds.value
      );
      selectedTwitterAccountIds.value = nextIds;
      writeStoredTwitterAccountIds(nextIds);
    }

    if (selectedTwitterKeywordIds.value === null && nextModel.twitterKeywordFilter) {
      const nextIds = deriveInitialSelectedEntityIds(
        nextModel.twitterKeywordFilter.options,
        selectedTwitterKeywordIds.value
      );
      selectedTwitterKeywordIds.value = nextIds;
      writeStoredTwitterKeywordIds(nextIds);
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      loadError.value = "请先登录后再查看 AI 新讯。";
    } else {
      loadError.value = "AI 新讯加载失败，请稍后重试。";
    }
  } finally {
    if (options.silent) {
      isRefreshing.value = false;
    } else {
      isLoading.value = false;
    }
  }
}

async function handleSourceKindsChange(nextKinds: string[]): Promise<void> {
  const nextSourceKindSet = new Set(nextKinds);

  if (nextSourceKindSet.has("twitter_accounts") && selectedTwitterAccountIds.value === null && pageModel.value?.twitterAccountFilter) {
    const nextIds = deriveInitialSelectedEntityIds(pageModel.value.twitterAccountFilter.options, selectedTwitterAccountIds.value);
    selectedTwitterAccountIds.value = nextIds;
    writeStoredTwitterAccountIds(nextIds);
  }

  if (nextSourceKindSet.has("twitter_keyword_search") &&
    selectedTwitterKeywordIds.value === null &&
    pageModel.value?.twitterKeywordFilter) {
    const nextIds = deriveInitialSelectedEntityIds(pageModel.value.twitterKeywordFilter.options, selectedTwitterKeywordIds.value);
    selectedTwitterKeywordIds.value = nextIds;
    writeStoredTwitterKeywordIds(nextIds);
  }

  selectedSourceKinds.value = nextKinds;
  writeStoredContentSourceKinds(nextKinds);
  await replacePageQuery(1);
  scrollPageToTop("auto");
  await loadPage({ selectedKinds: nextKinds, silent: true });
}

async function handleTwitterAccountsChange(nextIds: number[]): Promise<void> {
  selectedTwitterAccountIds.value = nextIds;
  writeStoredTwitterAccountIds(nextIds);
  await replacePageQuery(1);
  scrollPageToTop("auto");
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

async function handleTwitterKeywordsChange(nextIds: number[]): Promise<void> {
  selectedTwitterKeywordIds.value = nextIds;
  writeStoredTwitterKeywordIds(nextIds);
  await replacePageQuery(1);
  scrollPageToTop("auto");
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

async function handleSortModeChange(nextSortMode: ContentSortMode): Promise<void> {
  sortMode.value = nextSortMode;
  writeStoredContentSortMode(nextSortMode);
  await replacePageQuery(1);
  scrollPageToTop("auto");
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

// 搜索提交采用“输入值/生效值”分离：输入在控件内编辑，只有提交后才刷新列表并持久化。
async function handleSearchSubmit(nextKeyword: string): Promise<void> {
  appliedSearchKeyword.value = nextKeyword;
  writeStoredContentSearchKeyword(nextKeyword);
  await replacePageQuery(1);
  scrollPageToTop("auto");
  await loadPage({
    selectedKinds: readPageSourceKinds(),
    searchKeyword: nextKeyword,
    silent: true
  });
}

// 清空操作和提交搜索保持同一条刷新路径，避免分页、筛选和关键词状态不一致。
async function handleSearchClear(): Promise<void> {
  appliedSearchKeyword.value = "";
  writeStoredContentSearchKeyword("");
  await replacePageQuery(1);
  scrollPageToTop("auto");
  await loadPage({
    selectedKinds: readPageSourceKinds(),
    searchKeyword: "",
    silent: true
  });
}

async function handlePaginationChange(nextPage: number): Promise<void> {
  await replacePageQuery(nextPage);
  // 翻页后先把视口拉回顶部，不让下一页继续停在上一页的滚动深度。
  scrollPageToTop("auto");
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

const listCards = computed(() => pageModel.value?.cards ?? []);
const featuredCard = computed(() => pageModel.value?.featuredCard ?? null);
const visibleResultCount = computed(() => pageModel.value?.pagination?.totalResults ?? listCards.value.length);
const sourceFilter = computed(() => pageModel.value?.sourceFilter ?? null);
// 接口偶发返回不完整读模型时，这里退回空数组，避免页面因为辅助摘要缺失而整块崩掉。
const strategySummary = computed(() => pageModel.value?.strategySummary?.items ?? []);
const pagination = computed(() => pageModel.value?.pagination ?? null);
const displayIndexOffset = computed(() => {
  const currentPagination = pagination.value;

  if (!currentPagination) {
    return 0;
  }

  const safePage = currentPagination.page >= 1 ? currentPagination.page : 1;
  const safePageSize = currentPagination.pageSize >= 1 ? currentPagination.pageSize : listCards.value.length;

  return (safePage - 1) * safePageSize;
});
const displayState = computed(() => {
  if (!pageModel.value && loadError.value) {
    return buildErrorState(loadError.value);
  }

  if (pageModel.value?.emptyState) {
    return pageModel.value.emptyState;
  }

  if (listCards.value.length > 0) {
    return null;
  }

  return buildFallbackEmptyState();
});
const hasLoadError = computed(() => loadError.value !== null);

onMounted(() => {
  void loadPage();
});
</script>

<template>
  <div :class="editorialContentPageClass" data-content-page="ai-new">
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
        :visible-result-count="visibleResultCount"
        :sort-mode="sortMode"
        :keyword="appliedSearchKeyword"
        :is-loading="isRefreshing"
        @change-source="handleSourceKindsChange"
        @change-twitter-accounts="handleTwitterAccountsChange"
        @change-twitter-keywords="handleTwitterKeywordsChange"
        @change-sort="handleSortModeChange"
        @search="handleSearchSubmit"
        @clear="handleSearchClear"
      />
    </div>

    <section
      :class="editorialContentIntroSectionClass"
      data-content-stage="ai-new"
    >
      <div
        class="pointer-events-none absolute right-[-56px] top-[-72px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(81,220,255,0.22),_transparent_72%)] blur-3xl"
        aria-hidden="true"
      />
      <div class="relative z-[1] flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
            AI New Stage
          </span>
          <span class="text-xs leading-6 text-editorial-text-muted">优先展示最新进入内容池的 AI 动态与信号。</span>
        </div>
        <div class="flex flex-col gap-2">
          <h3 class="m-0 text-[28px] font-semibold tracking-[-0.04em] text-editorial-text-main">
            AI 新讯的第一阅读层
          </h3>
          <p class="m-0 max-w-3xl text-sm leading-7 text-editorial-text-body">
            这里优先收拢最近 24 小时内值得先看的新模型、新产品和新动作，减少你在内容流里自己做第一轮筛选的成本。
          </p>
        </div>
        <div
          v-if="strategySummary.length > 0"
          class="flex flex-wrap items-center gap-2"
          data-content-strategy-summary="ai-new"
        >
          <span class="text-sm font-medium text-editorial-text-muted">当前 AI 新讯：</span>
          <a-tag v-for="item in strategySummary" :key="item">{{ item }}</a-tag>
        </div>
      </div>
    </section>

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 7 }" />

    <ContentEmptyState v-else-if="displayState" :state="displayState" data-content-empty-state />

    <template v-else-if="pageModel">
      <ContentHeroCard
        v-if="featuredCard"
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
        <ContentStandardCard
          v-for="(card, index) in listCards"
          :key="card.id"
          :card="card"
          :display-index="displayIndexOffset + index + 1"
        />
      </section>

      <ContentPaginationBar
        v-if="pagination"
        :page="pagination.page"
        :page-size="pagination.pageSize"
        :total-results="pagination.totalResults"
        :total-pages="pagination.totalPages"
        @change="handlePaginationChange"
      />
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
