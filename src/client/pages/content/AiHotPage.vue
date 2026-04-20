<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import ContentEmptyState from "../../components/content/ContentEmptyState.vue";
import ContentBackToTopButton from "../../components/content/ContentBackToTopButton.vue";
import ContentPaginationBar from "../../components/content/ContentPaginationBar.vue";
import ContentToolbarCard from "../../components/content/ContentToolbarCard.vue";
import ContentStandardCard from "../../components/content/ContentStandardCard.vue";
import { useContentPageScroll } from "../../components/content/useContentPageScroll";
import {
  editorialContentListSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  deriveInitialSelectedSourceKinds,
  readAiHotPage,
  readStoredContentSearchKeyword,
  readStoredContentSortMode,
  readStoredContentSourceKinds,
  writeStoredContentSearchKeyword,
  writeStoredContentSortMode,
  writeStoredContentSourceKinds,
  type ContentSortMode,
  type ContentPageModel
} from "../../services/contentApi";

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageModel = ref<ContentPageModel | null>(null);
const selectedSourceKinds = ref<string[] | null>(readStoredContentSourceKinds());
const sortMode = ref<ContentSortMode>(readStoredContentSortMode() ?? "published_at");
const appliedSearchKeyword = ref(readStoredContentSearchKeyword() ?? "");
const route = useRoute();
const router = useRouter();
const { showBackToTopButton, scrollPageToTop, handleBackToTopClick } = useContentPageScroll();

function readPageSourceKinds(): string[] | undefined {
  return selectedSourceKinds.value === null ? undefined : selectedSourceKinds.value;
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
    title: sourceKinds.length > 0 ? "当前筛选下没有热点内容" : "当前还没有可展示的热点内容",
    description: sourceKinds.length > 0
      ? "调整来源筛选后再看看，或者稍后刷新，系统会继续聚合已经形成热度的 AI 内容。"
      : "页面已经准备好了，只是当前还没有热点内容进入内容池。",
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

// 页面加载支持“静默刷新 + 指定搜索词”，确保排序/筛选/搜索都走统一刷新逻辑。
async function loadPage(options: { selectedKinds?: string[]; silent?: boolean; searchKeyword?: string } = {}): Promise<void> {
  if (options.silent) {
    isRefreshing.value = true;
  } else {
    isLoading.value = true;
    loadError.value = null;
  }

  try {
    const requestedPage = readCurrentPage();
    const nextModel = await readAiHotPage({
      selectedSourceKinds: options.selectedKinds ?? readPageSourceKinds(),
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
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      loadError.value = "请先登录后再查看 AI 热点。";
    } else {
      loadError.value = "AI 热点加载失败，请稍后重试。";
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
  selectedSourceKinds.value = nextKinds;
  writeStoredContentSourceKinds(nextKinds);
  await replacePageQuery(1);
  scrollPageToTop("auto");
  await loadPage({ selectedKinds: nextKinds, silent: true });
}

async function handleSortModeChange(nextSortMode: ContentSortMode): Promise<void> {
  sortMode.value = nextSortMode;
  writeStoredContentSortMode(nextSortMode);
  await replacePageQuery(1);
  scrollPageToTop("auto");
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

// 只有点击“搜索”才会生效关键词，避免输入中的草稿实时触发请求。
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

// 清空关键词后同样回到第一页，保证分页与结果集语义一致。
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
  // 翻页后先回到顶部，避免用户继续停在上一页底部附近阅读新结果。
  scrollPageToTop("auto");
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

const sourceFilter = computed(() => pageModel.value?.sourceFilter ?? null);
const listCards = computed(() => pageModel.value?.cards ?? []);
// 接口偶发返回不完整读模型时，这里退回空数组，避免页面因为辅助摘要缺失而整块崩掉。
const strategySummary = computed(() => pageModel.value?.strategySummary?.items ?? []);
const visibleResultCount = computed(() => pageModel.value?.pagination?.totalResults ?? listCards.value.length);
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
  <div :class="editorialContentPageClass" data-content-page="ai-hot">
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
        :visible-result-count="visibleResultCount"
        :sort-mode="sortMode"
        :keyword="appliedSearchKeyword"
        :is-loading="isRefreshing"
        @change-source="handleSourceKindsChange"
        @change-sort="handleSortModeChange"
        @search="handleSearchSubmit"
        @clear="handleSearchClear"
      />
    </div>

    <section
      v-if="strategySummary.length > 0"
      class="flex flex-wrap items-center gap-2"
      data-content-strategy-summary="ai-hot"
    >
      <span class="text-sm font-medium text-editorial-text-muted">当前 AI 热点：</span>
      <a-tag v-for="item in strategySummary" :key="item">{{ item }}</a-tag>
    </section>

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 6 }" />

    <ContentEmptyState v-else-if="displayState" :state="displayState" data-content-empty-state />

    <template v-else-if="pageModel">
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
