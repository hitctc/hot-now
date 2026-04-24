import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { HttpError } from "../../services/http";
import {
  deriveInitialSelectedEntityIds,
  deriveInitialSelectedSourceKinds,
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
  type ContentPageModel,
  type ContentSortMode
} from "../../services/contentApi";
import { useContentPageScroll } from "./useContentPageScroll";
import type { ContentFeedPageConfig, ContentFeedPageReader } from "./contentFeedPageShared";

export function useContentFeedPageController(options: {
  config: ContentFeedPageConfig;
  readPage: ContentFeedPageReader;
}) {
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
      title: sourceKinds.length > 0 ? options.config.emptyFilteredTitle : options.config.emptyDefaultTitle,
      description: sourceKinds.length > 0 ? options.config.emptyFilteredDescription : options.config.emptyDefaultDescription,
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

  // 页面加载支持静默刷新和指定搜索词，排序、筛选、分页与搜索统一走这条路径。
  async function loadPage(payload: { selectedKinds?: string[]; silent?: boolean; searchKeyword?: string } = {}): Promise<void> {
    if (payload.silent) {
      isRefreshing.value = true;
    } else {
      isLoading.value = true;
      loadError.value = null;
    }

    try {
      const requestedPage = readCurrentPage();
      const nextModel = await options.readPage({
        selectedSourceKinds: payload.selectedKinds ?? readPageSourceKinds(),
        selectedTwitterAccountIds: readPageTwitterAccountIds(),
        selectedTwitterKeywordIds: readPageTwitterKeywordIds(),
        sortMode: sortMode.value,
        page: requestedPage,
        searchKeyword: payload.searchKeyword ?? appliedSearchKeyword.value
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
      loadError.value = error instanceof HttpError && error.status === 401
        ? options.config.authErrorMessage
        : options.config.loadErrorMessage;
    } finally {
      if (payload.silent) {
        isRefreshing.value = false;
      } else {
        isLoading.value = false;
      }
    }
  }

  async function handleSourceKindsChange(nextKinds: string[]): Promise<void> {
    const nextSourceKindSet = new Set(nextKinds);

    if (nextSourceKindSet.has("twitter_accounts") && selectedTwitterAccountIds.value === null && pageModel.value?.twitterAccountFilter) {
      const nextIds = deriveInitialSelectedEntityIds(
        pageModel.value.twitterAccountFilter.options,
        selectedTwitterAccountIds.value
      );
      selectedTwitterAccountIds.value = nextIds;
      writeStoredTwitterAccountIds(nextIds);
    }

    if (nextSourceKindSet.has("twitter_keyword_search") &&
      selectedTwitterKeywordIds.value === null &&
      pageModel.value?.twitterKeywordFilter) {
      const nextIds = deriveInitialSelectedEntityIds(
        pageModel.value.twitterKeywordFilter.options,
        selectedTwitterKeywordIds.value
      );
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

  // 搜索提交采用“输入值 / 生效值”分离：只有提交后才刷新列表并持久化。
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

  const sourceFilter = computed(() => pageModel.value?.sourceFilter ?? null);
  const listCards = computed(() => pageModel.value?.cards ?? []);
  const featuredCard = computed(() => pageModel.value?.featuredCard ?? null);
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

  return {
    appliedSearchKeyword,
    displayIndexOffset,
    displayState,
    featuredCard,
    handleBackToTopClick,
    handlePaginationChange,
    handleSearchClear,
    handleSearchSubmit,
    handleSortModeChange,
    handleSourceKindsChange,
    handleTwitterAccountsChange,
    handleTwitterKeywordsChange,
    hasLoadError,
    isLoading,
    isRefreshing,
    listCards,
    loadError,
    pageModel,
    pagination,
    selectedSourceKinds,
    selectedTwitterAccountIds,
    selectedTwitterKeywordIds,
    showBackToTopButton,
    sortMode,
    sourceFilter,
    strategySummary,
    visibleResultCount
  };
}
