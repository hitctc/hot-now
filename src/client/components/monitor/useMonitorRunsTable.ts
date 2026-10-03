import { ref, onMounted } from "vue";
import { fetchRunsWithSteps, type PipelineRun } from "../../services/monitorApi.js";



/** 管理运行记录、展开明细与分页；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useMonitorRunsTable() {


  const runs = ref<PipelineRun[]>([]);
  const total = ref(0);
  const hasMore = ref(false);
  const loading = ref(false);
  const selectedDate = ref<string>("");
  const offset = ref(0);
  const PAGE_SIZE = 20;

  // 展开的运行 ID 集合
  const expandedRunIds = ref<Set<number>>(new Set());
  /** 按当前筛选和分页读取记录，并更新表格及加载状态。 */
  async function load(append = false): Promise<void> {
    loading.value = true;
    try {
      const params: { limit: number; offset: number; date?: string } = {
        limit: PAGE_SIZE,
        offset: append ? offset.value : 0,
      };
      if (selectedDate.value) params.date = selectedDate.value;
      const res = await fetchRunsWithSteps(params);
      if (append) {
        runs.value = [...runs.value, ...res.runs];
      } else {
        runs.value = res.runs;
        offset.value = 0;
      }
      total.value = res.total;
      hasMore.value = res.has_more;
      offset.value += res.runs.length;
    } catch { /* 静默 */ }
    finally { loading.value = false; }
  }
  /** 切换运行记录的展开项并按原流程展示明细。 */
  function toggleRun(id: number): void {
    const next = new Set(expandedRunIds.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedRunIds.value = next;
  }
  /** 读取下一页运行记录并合并到当前列表，保留原分页边界。 */
  function loadMore(): void {
    load(true);
  }
  /** 按用户选择日期重置分页并刷新运行记录。 */
  function onDateChange(): void {
    load();
  }

  // 步骤耗时
  function stepDuration(started: string, finished: string | null): string {
    if (!finished) return "-";
    const ms = new Date(finished + "Z").getTime() - new Date(started + "Z").getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
  }
  /** 计算并格式化运行耗时，不改原始时间或任务终态。 */
  function runDuration(run: PipelineRun): string {
    return stepDuration(run.started_at, run.finished_at);
  }

  // 解析 detail JSON
  function parseDetail(raw: string): string {
    try {
      const obj = JSON.parse(raw);
      return JSON.stringify(obj, null, 2);
    } catch {
      return raw;
    }
  }

  // 从 detail JSON 提取步骤处理条数
  // 各步骤的计数字段不同：采集→created, RSS采集→created, 去重→total_new, 评分→scored, 写作→submitted, 标记可推送→marked
  // 回退逻辑：如果有 items 数组，取 items.length
  function getStepCount(detailRaw: string): number | null {
    if (!detailRaw) return null;
    try {
      const obj = JSON.parse(detailRaw);
      if (typeof obj !== "object" || Array.isArray(obj)) return null;
      // 有 items 数组时优先用 items.length
      if (Array.isArray(obj.items)) return obj.items.length;
      // 按常见字段名取值
      const countKeys = ["created", "scored", "submitted", "marked", "total_new"];
      for (const key of countKeys) {
        if (typeof obj[key] === "number") return obj[key];
      }
      return null;
    } catch {
      return null;
    }
  }

  const statusColorMap: Record<string, string> = {
    done: "green",
    error: "red",
    running: "blue",
    skipped: "default",
  };

  onMounted(() => load());

  return {
    runs,
    total,
    hasMore,
    loading,
    selectedDate,
    expandedRunIds,
    load,
    toggleRun,
    loadMore,
    onDateChange,
    stepDuration,
    runDuration,
    parseDetail,
    getStepCount,
    statusColorMap,
  };
}
