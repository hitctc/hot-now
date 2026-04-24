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
	  readStoredWechatRssSourceIds,
	  writeStoredContentSearchKeyword,
	  writeStoredContentSortMode,
	  writeStoredContentSourceKinds,
	  writeStoredTwitterAccountIds,
	  writeStoredTwitterKeywordIds,
	  writeStoredWechatRssSourceIds,
  type ContentPageModel,
  type ContentCard,
  type ContentSortMode
} from "../../services/contentApi";
import { useContentPageScroll } from "./useContentPageScroll";
import { useInfiniteLoadTrigger } from "./useInfiniteLoadTrigger";
import type { ContentFeedPageConfig, ContentFeedPageReader } from "./contentFeedPageShared";

export function useContentFeedPageController(options: {
  config: ContentFeedPageConfig;
  readPage: ContentFeedPageReader;
}) {
  const isLoading = ref(true);
  const isRefreshing = ref(false);
  const isLoadingNextPage = ref(false);
  const loadError = ref<string | null>(null);
  const pageModel = ref<ContentPageModel | null>(null);
  const accumulatedCards = ref<ContentCard[]>([]);
  const currentLoadedPage = ref(0);
	  const selectedSourceKinds = ref<string[] | null>(readStoredContentSourceKinds());
	  const selectedTwitterAccountIds = ref<number[] | null>(readStoredTwitterAccountIds());
	  const selectedTwitterKeywordIds = ref<number[] | null>(readStoredTwitterKeywordIds());
	  const selectedWechatRssSourceIds = ref<number[] | null>(readStoredWechatRssSourceIds());
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

	  function readPageWechatRssSourceIds(): number[] | undefined {
	    return selectedWechatRssSourceIds.value === null ? undefined : selectedWechatRssSourceIds.value;
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

  function appendUniqueCards(currentCards: ContentCard[], nextCards: ContentCard[]): ContentCard[] {
    const seenIds = new Set(currentCards.map((card) => card.id));
    const uniqueNextCards = nextCards.filter((card) => {
      if (seenIds.has(card.id)) {
        return false;
      }

      seenIds.add(card.id);
      return true;
    });

    return [...currentCards, ...uniqueNextCards];
  }

  // 页面加载支持静默刷新、触底追加和指定搜索词，排序、筛选与搜索统一走这条路径。
  async function loadPage(payload: {
    selectedKinds?: string[];
    silent?: boolean;
    searchKeyword?: string;
    page?: number;
    append?: boolean;
  } = {}): Promise<void> {
    const isAppendLoad = payload.append === true;

    if (isAppendLoad) {
      isLoadingNextPage.value = true;
    } else if (payload.silent) {
      isRefreshing.value = true;
    } else {
      isLoading.value = true;
      loadError.value = null;
    }

    try {
      const requestedPage = payload.page ?? 1;
      const nextModel = await options.readPage({
	        selectedSourceKinds: payload.selectedKinds ?? readPageSourceKinds(),
	        selectedTwitterAccountIds: readPageTwitterAccountIds(),
	        selectedTwitterKeywordIds: readPageTwitterKeywordIds(),
	        selectedWechatRssSourceIds: readPageWechatRssSourceIds(),
	        sortMode: sortMode.value,
        page: requestedPage,
        searchKeyword: payload.searchKeyword ?? appliedSearchKeyword.value
      });
      pageModel.value = nextModel;
      currentLoadedPage.value = nextModel.pagination?.page ?? requestedPage;
      accumulatedCards.value = isAppendLoad
        ? appendUniqueCards(accumulatedCards.value, nextModel.cards)
        : nextModel.cards;

      if (!isAppendLoad && nextModel.pagination && readCurrentPage() !== nextModel.pagination.page) {
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

	      if (selectedWechatRssSourceIds.value === null && nextModel.wechatRssFilter) {
	        const nextIds = deriveInitialSelectedEntityIds(
	          nextModel.wechatRssFilter.options,
	          selectedWechatRssSourceIds.value
	        );
	        selectedWechatRssSourceIds.value = nextIds;
	        writeStoredWechatRssSourceIds(nextIds);
	      }
    } catch (error) {
      loadError.value = error instanceof HttpError && error.status === 401
        ? options.config.authErrorMessage
        : options.config.loadErrorMessage;
    } finally {
      if (isAppendLoad) {
        isLoadingNextPage.value = false;
      } else if (payload.silent) {
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

	    if (nextSourceKindSet.has("wechat_rss") &&
	      selectedWechatRssSourceIds.value === null &&
	      pageModel.value?.wechatRssFilter) {
	      const nextIds = deriveInitialSelectedEntityIds(
	        pageModel.value.wechatRssFilter.options,
	        selectedWechatRssSourceIds.value
	      );
	      selectedWechatRssSourceIds.value = nextIds;
	      writeStoredWechatRssSourceIds(nextIds);
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

	  async function handleWechatRssChange(nextIds: number[]): Promise<void> {
	    selectedWechatRssSourceIds.value = nextIds;
	    writeStoredWechatRssSourceIds(nextIds);
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

  async function loadNextPage(): Promise<void> {
    if (isLoading.value || isRefreshing.value || isLoadingNextPage.value || !hasMoreResults.value) {
      return;
    }

    await loadPage({
      selectedKinds: readPageSourceKinds(),
      searchKeyword: appliedSearchKeyword.value,
      page: currentLoadedPage.value + 1,
      append: true
    });
  }

  const { setInfiniteLoadTrigger } = useInfiniteLoadTrigger(loadNextPage);

  const sourceFilter = computed(() => pageModel.value?.sourceFilter ?? null);
  const listCards = computed(() => accumulatedCards.value);
  const featuredCard = computed(() => pageModel.value?.featuredCard ?? null);
  const strategySummary = computed(() => pageModel.value?.strategySummary?.items ?? []);
  const visibleResultCount = computed(() => pageModel.value?.pagination?.totalResults ?? listCards.value.length);
  const pagination = computed(() => pageModel.value?.pagination ?? null);
  const displayIndexOffset = computed(() => 0);
  const loadedResultCount = computed(() => listCards.value.length);
  const totalResultCount = computed(() => pagination.value?.totalResults ?? loadedResultCount.value);
  const hasMoreResults = computed(() => {
    const currentPagination = pagination.value;

    if (!currentPagination) {
      return false;
    }

    return currentLoadedPage.value < currentPagination.totalPages &&
      loadedResultCount.value < currentPagination.totalResults;
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
  };
}
