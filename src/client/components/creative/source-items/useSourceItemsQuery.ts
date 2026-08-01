import { onBeforeUnmount, onMounted, ref, watch, nextTick, type Ref } from "vue";
import { message } from "ant-design-vue";

import {
  readCreativeSourceItems,
  readCreativeSourceItem,
  type AccountFitLevel,
  type CreativeSourceItem,
} from "../../../services/creativeApi.js";
import {
  createLatestAbortController,
  isAbortError,
} from "../../../utils/latestAbortController.js";

type SourceDirection = "article" | "short_content";

type SavedSourceFilters = {
  writingStatus?: string;
  accountFitLevel?: string;
  sourceName?: string;
  search?: string;
  minTrendScore?: number | null;
};

export type SourceItemsQueryOptions = {
  direction: SourceDirection;
  storageKey: string;
  includeAccountFit?: boolean;
  writingIds: Ref<Set<number>>;
  setWritingIds: (ids: Set<number>) => void;
  startWritingPoll: (item: CreativeSourceItem) => void;
  onDetailLoadError?: (error: unknown) => void;
};

function readSavedFilters(storageKey: string): SavedSourceFilters {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as SavedSourceFilters : {};
  } catch {
    return {};
  }
}

/** 复用两条素材列表的查询、分页、展开详情和请求取消逻辑。 */
export function useSourceItemsQuery(options: SourceItemsQueryOptions) {
  const saved = readSavedFilters(options.storageKey);
  const isLoading = ref(false);
  const items = ref<CreativeSourceItem[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(30);
  const writingStatusFilter = ref<string | undefined>(saved.writingStatus || undefined);
  const accountFitFilter = ref<string | undefined>(
    options.includeAccountFit ? saved.accountFitLevel || undefined : undefined,
  );
  const sourceNameFilter = ref(saved.sourceName || "");
  const writableOnly = ref(false);
  const searchText = ref(saved.search || "");
  const minTrendScore = ref<number | null>(
    options.includeAccountFit && !("accountFitLevel" in saved) && saved.minTrendScore === 60
      ? null
      : ("minTrendScore" in saved ? saved.minTrendScore ?? null : null),
  );

  const expandedRowKeys = ref<number[]>([]);
  const loadedDetailIds = new Set<number>();
  const sourceDetailRequests = new Map<number, Promise<void>>();
  const listRequests = createLatestAbortController();

  /** 将当前筛选条件持久化，保持两条素材列表各自独立的筛选记忆。 */
  function saveSourceFilters(): void {
    try {
      const data: SavedSourceFilters = {
        writingStatus: writingStatusFilter.value || "",
        sourceName: sourceNameFilter.value || "",
        search: searchText.value,
        minTrendScore: minTrendScore.value,
      };
      if (options.includeAccountFit) data.accountFitLevel = accountFitFilter.value || "";
      localStorage.setItem(options.storageKey, JSON.stringify(data));
    } catch {
      // localStorage 配额不足时不影响当前页面筛选。
    }
  }

  /** 加载摘要列表，并取消仍在等待的旧分页/筛选请求。 */
  async function loadItems(): Promise<void> {
    const controller = listRequests.begin();
    isLoading.value = true;
    try {
      const response = await readCreativeSourceItems({
        direction: options.direction,
        page: currentPage.value,
        pageSize: pageSize.value,
        writingStatus: writingStatusFilter.value || undefined,
        accountFitLevel: options.includeAccountFit
          ? accountFitFilter.value as AccountFitLevel | "unassessed" | undefined
          : undefined,
        sourceName: sourceNameFilter.value.trim() || undefined,
        writable: writableOnly.value || undefined,
        search: searchText.value || undefined,
        minTrendScore: minTrendScore.value ?? undefined,
        signal: controller.signal,
      });
      if (!listRequests.isCurrent(controller)) return;
      items.value = response.items;
      loadedDetailIds.clear();
      for (const id of expandedRowKeys.value) {
        void loadSourceItemDetail(id).catch(() => collapseExpandedRow(id));
      }
      total.value = response.total;

      const writingItems = response.items.filter(
        (item) => item.writingStatus === "writing" && !options.writingIds.value.has(item.id),
      );
      if (writingItems.length > 0) {
        options.setWritingIds(new Set([
          ...options.writingIds.value,
          ...writingItems.map((item) => item.id),
        ]));
        for (const item of writingItems) options.startWritingPoll(item);
      }
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      if (listRequests.isCurrent(controller)) {
        listRequests.finish(controller);
        isLoading.value = false;
      }
    }
  }

  /** 把单条完整详情合并回当前页，避免展开区长期维护第二份状态。 */
  function loadSourceItemDetail(id: number): Promise<void> {
    const existingRequest = sourceDetailRequests.get(id);
    if (existingRequest) return existingRequest;

    const request = readCreativeSourceItem(id)
      .then((detail) => {
        const itemIndex = items.value.findIndex((item) => item.id === id);
        if (itemIndex >= 0) items.value[itemIndex] = detail;
        loadedDetailIds.add(id);
      })
      .finally(() => {
        if (sourceDetailRequests.get(id) === request) sourceDetailRequests.delete(id);
      });
    sourceDetailRequests.set(id, request);
    return request;
  }

  /** 详情加载失败时撤销空展开行，让用户可以再次点击重试。 */
  function collapseExpandedRow(id: number): void {
    const index = expandedRowKeys.value.indexOf(id);
    if (index >= 0) expandedRowKeys.value.splice(index, 1);
  }

  /** 首次展开时读取正文和调试字段，并补偿展开造成的滚动位移。 */
  async function toggleExpand(id: number): Promise<void> {
    const rowEl = document.querySelector(`tr.ant-table-row[data-row-key="${id}"]`) as HTMLElement | null;
    const anchorTop = rowEl?.getBoundingClientRect().top ?? null;
    const index = expandedRowKeys.value.indexOf(id);
    if (index >= 0) {
      expandedRowKeys.value.splice(index, 1);
    } else {
      expandedRowKeys.value.push(id);
      if (!loadedDetailIds.has(id)) {
        try {
          await loadSourceItemDetail(id);
        } catch (error) {
          collapseExpandedRow(id);
          options.onDetailLoadError?.(error);
          message.error("加载素材详情失败");
        }
      }
    }
    if (anchorTop != null && rowEl) {
      nextTick(() => {
        const delta = rowEl.getBoundingClientRect().top - anchorTop;
        if (delta !== 0) window.scrollBy(0, delta);
      });
    }
  }

  /** 应用爆文分筛选；输入过程不发请求，只在确认时刷新。 */
  function applyTrendScoreFilter(): void {
    currentPage.value = 1;
    saveSourceFilters();
    void loadItems();
  }

  /** 应用标题搜索并记录搜索历史。 */
  function handleSearch(value: string, addToHistory?: (term: string) => void): void {
    searchText.value = value;
    currentPage.value = 1;
    saveSourceFilters();
    if (value.trim()) addToHistory?.(value.trim());
    void loadItems();
  }

  /** 处理分页器事件，保持每页 30 条的默认值并立即刷新。 */
  function handleTableChange(pagination: { current?: number; pageSize?: number }): void {
    if (pagination.current) currentPage.value = pagination.current;
    if (pagination.pageSize) pageSize.value = pagination.pageSize;
    void loadItems();
  }

  /** 来源筛选只在回车、点击搜索或清空时应用。 */
  function applySourceNameFilter(): void {
    currentPage.value = 1;
    saveSourceFilters();
    void loadItems();
  }

  watch(writingStatusFilter, () => {
    currentPage.value = 1;
    saveSourceFilters();
    void loadItems();
  });
  watch(accountFitFilter, () => {
    if (!options.includeAccountFit) return;
    currentPage.value = 1;
    saveSourceFilters();
    void loadItems();
  });
  watch(writableOnly, () => {
    currentPage.value = 1;
    void loadItems();
  });

  onMounted(() => void loadItems());
  onBeforeUnmount(() => listRequests.cancel());

  return {
    isLoading,
    items,
    total,
    currentPage,
    pageSize,
    writingStatusFilter,
    accountFitFilter,
    sourceNameFilter,
    writableOnly,
    searchText,
    minTrendScore,
    expandedRowKeys,
    loadItems,
    saveSourceFilters,
    applyTrendScoreFilter,
    applySourceNameFilter,
    handleSearch,
    handleTableChange,
    toggleExpand,
    loadSourceItemDetail,
    collapseExpandedRow,
  };
}
