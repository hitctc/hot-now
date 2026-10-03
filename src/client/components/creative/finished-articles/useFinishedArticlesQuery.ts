import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useSearchHistory } from "../../../composables/useSearchHistory.js";
import { createLatestAbortController, isAbortError } from "../../../utils/latestAbortController.js";
import { readCreativeFinishedArticles, type CreativeFinishedArticle, type FinishedArticleDayCount, type SourceDayCount } from "../../../services/creativeListApi.js";

/** 管理单个长/短成品列表的查询、分页与原浏览器偏好；两页各自持有状态，不共享业务工作流。 */
export function useFinishedArticlesQuery(direction: "article" | "short_content") {
  const filterKey = direction === "article" ? "creative-finished-filters" : "creative-short-finished-filters";
  const historyKey = direction === "article" ? "creative-finished-search-history" : "creative-short-finished-search-history";
  const saved = (() => {
    try { const raw = localStorage.getItem(filterKey); return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
  })();
  const isLoading = ref(false);
  const items = ref<CreativeFinishedArticle[]>([]);
  const total = ref(0);
  const dayCounts = ref<Record<string, FinishedArticleDayCount>>({});
  const sourceDayCounts = ref<Record<string, SourceDayCount>>({});
  const currentPage = ref(1);
  const pageSize = ref(30);
  const searchText = ref(saved.search || "");
  const statusFilter = ref<string | undefined>(saved.status || undefined);
  const publishableOnly = ref(saved.publishableOnly || false);
  const showDeleted = ref(saved.showDeleted || false);
  const { history: searchHistory, addToHistory, removeFromHistory } = useSearchHistory(historyKey);
  const searchDropdownRef = ref<HTMLElement | null>(null);
  const showSearchDropdown = ref(false);
  const requests = createLatestAbortController();

  /** 保存原筛选键和值；浏览器存储不可写时仍允许当前页操作。 */
  function saveFinishedFilters(): void {
    try { localStorage.setItem(filterKey, JSON.stringify({ search: searchText.value, status: statusFilter.value || "", publishableOnly: publishableOnly.value, showDeleted: showDeleted.value })); }
    catch { /* 保留原存储配额/禁用时的降级。 */ }
  }

  /** 读取当前完整筛选快照，仅最后一次请求能更新列表、日期带和加载状态。 */
  async function loadItems(): Promise<void> {
    const controller = requests.begin();
    isLoading.value = true;
    try {
      const result = await readCreativeFinishedArticles({ direction, page: currentPage.value, pageSize: pageSize.value, status: statusFilter.value || undefined, search: searchText.value || undefined, publishable: publishableOnly.value ? "1" : undefined, includeDeleted: showDeleted.value ? "1" : undefined, signal: controller.signal });
      if (!requests.isCurrent(controller)) return;
      items.value = result.items;
      total.value = result.total;
      dayCounts.value = Object.fromEntries((result.dayCounts ?? []).map(count => [count.dayKey, count]));
      sourceDayCounts.value = Object.fromEntries((result.sourceDayCounts ?? []).map(count => [count.dayKey, count]));
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      if (requests.isCurrent(controller)) { requests.finish(controller); isLoading.value = false; }
    }
  }

  /** 显式搜索回第一页，保留搜索历史和下拉收起语义，不额外防抖。 */
  function handleSearch(value: string): void {
    searchText.value = value;
    currentPage.value = 1;
    saveFinishedFilters();
    if (value.trim()) addToHistory(value.trim());
    showSearchDropdown.value = false;
    void loadItems();
  }

  /** 表格分页沿用原页码/页大小，并发读取由当前身份保护。 */
  function handleTableChange(pagination: { current?: number; pageSize?: number }): void {
    if (pagination.current) currentPage.value = pagination.current;
    if (pagination.pageSize) pageSize.value = pagination.pageSize;
    void loadItems();
  }

  /** 外部点击只关闭本列表搜索框，卸载时移除同一监听函数。 */
  function onDocClick(event: MouseEvent): void {
    if (searchDropdownRef.value && !searchDropdownRef.value.contains(event.target as Node)) showSearchDropdown.value = false;
  }

  onMounted(() => { document.addEventListener("click", onDocClick); void loadItems(); });
  onBeforeUnmount(() => { requests.cancel(); document.removeEventListener("click", onDocClick); });
  // 同一Vue更新批次里的筛选变化只读最终快照，不发出随后立刻取消的中间请求。
  watch([statusFilter, publishableOnly, showDeleted], () => { currentPage.value = 1; saveFinishedFilters(); void loadItems(); });

  return { isLoading, items, total, dayCounts, sourceDayCounts, currentPage, pageSize, searchText, statusFilter, publishableOnly, showDeleted, searchHistory, removeFromHistory, searchDropdownRef, showSearchDropdown, loadItems, handleSearch, handleTableChange };
}
