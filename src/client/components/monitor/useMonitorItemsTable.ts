import { ref, onMounted } from "vue";
import { fetchMonitorItems, type MonitorItem } from "../../services/monitorApi.js";



/** 管理监控素材的分页与筛选读取；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useMonitorItemsTable() {


  const items = ref<MonitorItem[]>([]);
  const loading = ref(false);
  const statusFilter = ref("all");
  const currentPage = ref(1);
  const pageSize = 50;

  const statusOptions = [
    { label: "全部", value: "all" },
    { label: "待评分", value: "pending_score" },
    { label: "待趋势评分", value: "pending_trend" },
    { label: "待写作", value: "pending_write" },
    { label: "已写作", value: "written" },
    { label: "已推送", value: "drafted" },
  ];

  const agentLabels: Record<string, string> = {
    "rss-feed": "RSS",
    aihot: "AIHot",
    twitter: "Twitter",
    hackernews: "HN",
    bilibili: "B站",
    "wechat-rss": "WX",
    weibo: "微博",
  };
  /** 按当前筛选和分页读取记录，并更新表格及加载状态。 */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      const res = await fetchMonitorItems({
        status: statusFilter.value,
        limit: pageSize,
        offset: (currentPage.value - 1) * pageSize,
      });
      items.value = res.items;
    } catch { /* 静默 */ }
    finally { loading.value = false; }
  }
  /** 根据表格传入的分页选择读取当前筛选结果，不改默认页大小。 */
  function handleTableChange(pagination: { current?: number }): void {
    if (pagination.current) currentPage.value = pagination.current;
    load();
  }

  onMounted(() => load());

  return {
    items,
    loading,
    statusFilter,
    currentPage,
    pageSize,
    statusOptions,
    agentLabels,
    load,
    handleTableChange,
  };
}
