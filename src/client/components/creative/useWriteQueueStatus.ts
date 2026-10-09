import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { fetchWriteQueueStatus, readShortWriteSchedule, readCreativeFinishedArticle, type ShortWriteSchedule, type WriteQueueStatus as WriteQueueStatusType, type WriteQueueTask, type CreativeFinishedArticle } from "../../services/creativeApi.js";
import { createLatestRequestGuard } from "../../utils/latestRequestGuard.js";
import { toShanghaiDayKey } from "./tableDayGroups.js";
import { describeLunaStatus, describeQueuedTask, describeCurrentTask } from "./writeQueueStatusPresentation.js";
import { message } from "ant-design-vue";
import { cancelWriteQueueTask, readWriteQueueTaskResult, forceRewriteQueueTask } from "../../services/creativeApi.js";



/** 管理全局队列观察、展开状态与关联详情读取；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useWriteQueueStatus() {


  const forceRewriteTarget = ref<WriteQueueTask | null>(null);
  const forceRewriting = ref(false);

  /** 展示原阻断与放行范围；只有 Hermes 明确允许的内容阻断任务可进入确认。 */
  function requestForceRewrite(task: WriteQueueTask): void {
    if (task.can_force_rewrite) forceRewriteTarget.value = task;
  }

  /** 确认后提交原编号的新人工任务；重复请求由 Hermes 收据去重，保留原记录和成品。 */
  async function confirmForceRewrite(): Promise<void> {
    if (!forceRewriteTarget.value || forceRewriting.value) return;
    forceRewriting.value = true;
    try {
      const result = await forceRewriteQueueTask(forceRewriteTarget.value.task_id);
      if (!result.success) throw new Error(result.error || "提交失败");
      message.success("强制重写已进入人工队列，新稿将保留待人工审核标记");
      forceRewriteTarget.value = null;
      await refresh();
    } catch (error) { message.error(error instanceof Error ? error.message : "提交结果未知，请查询原编号后重试"); }
    finally { forceRewriting.value = false; }
  }

  const cancellingTaskId = ref<string | null>(null);
  const retainedResultOpen = ref(false);
  const retainedResultText = ref("");

  /** 仅取消选中编号；执行中只提示已申请，不宣称当前模型已终止。 */
  async function cancelTask(task: WriteQueueTask): Promise<void> {
    if (cancellingTaskId.value) return;
    cancellingTaskId.value = task.task_id;
    try {
      const result = await cancelWriteQueueTask(task.task_id);
      if (!result.success) throw new Error(result.error);
      message.info(result.status === "cancelling" ? "已申请取消，等待当前模型返回并保存结果" : "任务已取消");
      await refresh();
    } catch { message.error("取消状态暂不可查，请查询原任务"); }
    finally { cancellingTaskId.value = null; }
  }

  /** 只读展示保留结果，使用文本而非 HTML，不能从此入口重新运行模型。 */
  async function viewRetainedResult(task: WriteQueueTask): Promise<void> {
    try {
      const result = await readWriteQueueTaskResult(task.task_id);
      if (!result.success) throw new Error(result.error);
      retainedResultText.value = JSON.stringify(result.generated, null, 2);
      retainedResultOpen.value = true;
    } catch { message.error("保留结果暂不可读，未重新调用模型"); }
  }

  const QUEUE_EXPANDED_KEY = "hot-now-write-queue-expanded";

  /** 读取上次的界面偏好；存储不可用或没有记录时默认折叠，不影响队列数据加载。 */
  function readExpandedPreference(): boolean {
    try {
      return localStorage.getItem(QUEUE_EXPANDED_KEY) === "1";
    } catch {
      return false;
    }
  }

  const data = ref<WriteQueueStatusType | null>(null);
  const shortWriteSchedule = ref<ShortWriteSchedule | null>(null);
  const shortWriteScheduleDelayed = ref(false);
  const statusReceivedAt = ref(Date.now());
  const loading = ref(false);
  const expanded = ref(readExpandedPreference());
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let refreshRequest: Promise<void> | null = null;

  // 实时耗时计时驱动（每秒刷新）
  const elapsedNow = ref(Date.now());
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;

  /** 将 ISO 时间戳格式化为已耗时 "X分X秒" */
  function formatElapsed(iso: string | null | undefined): string {
    if (!iso) return "-";
    const started = new Date(iso).getTime();
    const diff = elapsedNow.value - started;
    if (diff < 0) return "0秒";
    const totalSec = Math.floor(diff / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min > 0) return `${min}分${sec}秒`;
    return `${sec}秒`;
  }

  // 素材详情弹窗
  const modalVisible = ref(false);
  const modalSourceItemId = ref<number | null>(null);

  const hasActiveWork = computed(() => {
    if (!data.value) return false;
    return data.value.current !== null || data.value.queue_length > 0;
  });

  /** 当前 Hermes 实际队列已显示的素材不再重复列入自动候选，顺位仍采用原候选快照。 */
  const pendingShortWriteCandidates = computed(() => {
    const candidates = shortWriteSchedule.value?.candidates ?? [];
    const activeTasks = [data.value?.current, ...(data.value?.queue ?? [])]
      .filter((task): task is WriteQueueTask => task !== null && task !== undefined);
    const activeExternalIds = new Set(activeTasks
      .map((task) => task.source_external_id)
      .filter((id): id is string => Boolean(id)));
    return candidates.filter((candidate) =>
      !(candidate.source_external_id && activeExternalIds.has(candidate.source_external_id)));
  });

  /** 把候选与已受理且仍活动的自动短写按 Hermes 批次归组；人工任务仍留在实际队列。 */
  const shortWritePeriodGroups = computed(() => {
    type PeriodTask = { task: WriteQueueTask; queuePosition?: number };
    type PeriodGroup = {
      batchStartedAt: string;
      collectionIntervalMinutes: number;
      periodEndsAt?: string | null;
      isCurrent: boolean;
      candidates: typeof pendingShortWriteCandidates.value;
      tasks: PeriodTask[];
    };
    const schedule = shortWriteSchedule.value;
    if (!schedule) return [];
    const groups = new Map<string, PeriodGroup>();
    /** 同一批次只创建一个分组；只有当前批次附带尚未入队候选。 */
    const ensureGroup = (batchStartedAt: string, interval: number, isCurrent: boolean, periodEndsAt?: string | null): PeriodGroup => {
      const existing = groups.get(batchStartedAt);
      if (existing) return existing;
      const group: PeriodGroup = {
        batchStartedAt,
        collectionIntervalMinutes: interval,
        periodEndsAt,
        isCurrent,
        candidates: isCurrent ? pendingShortWriteCandidates.value : [],
        tasks: [],
      };
      groups.set(batchStartedAt, group);
      return group;
    };

    if (schedule.batch_started_at) {
      ensureGroup(
        schedule.batch_started_at,
        schedule.batch_collection_interval_minutes ?? 60,
        true,
        schedule.batch_period_ends_at,
      );
    }
    const taskBatches = new Map<string, NonNullable<ShortWriteSchedule["short_write_tasks"]>[number]>();
    for (const task of schedule.short_write_tasks ?? []) {
      if (task.task_id && task.batch_started_at) taskBatches.set(task.task_id, task);
    }
    const activeTasks = [data.value?.current, ...(data.value?.queue ?? [])]
      .filter((task): task is WriteQueueTask => task !== null && task !== undefined);
    for (const task of activeTasks) {
      if (task.task_kind !== "short_content_auto" || (task.status !== "queued" && task.status !== "writing")) continue;
      const batch = taskBatches.get(task.task_id);
      if (!batch?.batch_started_at) continue;
      const group = ensureGroup(
        batch.batch_started_at,
        batch.collection_interval_minutes ?? schedule.batch_collection_interval_minutes ?? 60,
        batch.batch_started_at === schedule.batch_started_at,
        batch.batch_started_at === schedule.batch_started_at ? schedule.batch_period_ends_at : null,
      );
      group.tasks.push({ task, queuePosition: batch.queue_position });
    }
    return [...groups.values()].sort((left, right) => right.batchStartedAt.localeCompare(left.batchStartedAt));
  });

  /** 已按周期显示的自动短写从普通当前任务/队列列表移除，避免重复出现。 */
  const groupedShortWriteTaskIds = computed(() => new Set(shortWritePeriodGroups.value.flatMap((group) => group.tasks.map(({ task }) => task.task_id))));
  const visibleCurrentTask = computed(() => {
    const task = data.value?.current ?? null;
    return task && !groupedShortWriteTaskIds.value.has(task.task_id) ? task : null;
  });
  const visibleQueueTasks = computed(() => (data.value?.queue ?? []).filter((task) => !groupedShortWriteTaskIds.value.has(task.task_id)));

  /** 合并队列与当前短写批次刷新；短写接口失败时保留上次快照并明确标记延迟。 */
  function refresh(): Promise<void> {
    if (refreshRequest) return refreshRequest;
    loading.value = true;
    const queueRequest = fetchWriteQueueStatus()
      .then((status) => {
        data.value = status;
        const cachedAt = status.status_cached_at ? Date.parse(status.status_cached_at) : NaN;
        statusReceivedAt.value = Number.isFinite(cachedAt) ? cachedAt : Date.now();
      })
      .catch(() => {
        // 服务端无法提供降级状态时保留当前显示，避免浮标闪烁。
      });
    const scheduleRequest = readShortWriteSchedule()
      .then((schedule) => {
        shortWriteSchedule.value = schedule;
        shortWriteScheduleDelayed.value = false;
      })
      .catch(() => {
        shortWriteScheduleDelayed.value = true;
      });
    refreshRequest = Promise.all([queueRequest, scheduleRequest])
      .then(() => undefined)
      .finally(() => {
        loading.value = false;
        refreshRequest = null;
      });
    return refreshRequest;
  }

  /** 把采集批次的起止时间按北京时间显示为范围，不将其解释成实际开写承诺。 */
  function formatShortBatchPeriod(value: string | null | undefined, intervalMinutes: number, endValue?: string | null): string {
    if (!value) return "";
    const start = Date.parse(value);
    if (!Number.isFinite(start)) return value;
    const end = endValue ? Date.parse(endValue) : start + intervalMinutes * 60_000;
    if (!Number.isFinite(end)) return value;
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${formatter.format(start)}–${formatter.format(end)}`;
  }

  /** 仅在页面可见时执行定时刷新。 */
  function refreshWhenVisible(): void {
    if (!document.hidden) void refresh();
  }

  /** 从后台切回页面时立即刷新一次状态。 */
  function handleVisibilityChange(): void {
    if (!document.hidden) void refresh();
  }

  /** 切换浮层并保存展开状态；浏览器拒绝写入时仍允许本次操作。 */
  function toggleExpand(): void {
    expanded.value = !expanded.value;
    try {
      localStorage.setItem(QUEUE_EXPANDED_KEY, expanded.value ? "1" : "0");
    } catch {
      // 无法持久化时只维持当前页面的展开状态。
    }
  }

  /** 用平台素材编号打开现有只读详情，不提交写作请求。 */
  function openSourceItem(id: number): void {
    modalSourceItemId.value = id;
    modalVisible.value = true;
  }

  // 成品详情抽屉
  const articleDetailOpen = ref(false);
  const articleDetail = ref<CreativeFinishedArticle | null>(null);
  const articleDetailLoading = ref(false);
  const articleDetailRequestGuard = createLatestRequestGuard();

  /** 点击立即打开加载弹窗，读取完整成品；关闭后的迟到响应不恢复弹窗。 */
  async function openArticleDetail(id: number): Promise<void> {
    if (articleDetailLoading.value) return;
    const requestId = articleDetailRequestGuard.begin();
    articleDetail.value = null;
    articleDetailOpen.value = true;
    articleDetailLoading.value = true;
    try {
      const article = await readCreativeFinishedArticle(id);
      if (articleDetailRequestGuard.isCurrent(requestId)) articleDetail.value = article;
    } catch {
      if (articleDetailRequestGuard.isCurrent(requestId)) {
        articleDetailOpen.value = false;
        message.error("加载文章详情失败");
      }
    } finally {
      if (articleDetailRequestGuard.isCurrent(requestId)) articleDetailLoading.value = false;
    }
  }

  /** 关闭详情并使旧读取失效，允许用户立即打开另一篇文章。 */
  function closeArticleDetail(): void {
    articleDetailRequestGuard.invalidate();
    articleDetailOpen.value = false;
    articleDetailLoading.value = false;
    articleDetail.value = null;
  }

  /** 读取任务用于北京时间自然日分组的终态时间。 */
  function historyTime(task: WriteQueueTask): string {
    return task.finished_at || task.started_at || task.submitted_at;
  }

  const historyGroups = computed(() => {
    const tasks = data.value?.history?.length ? data.value.history : (data.value?.recent ?? []);
    const groups = new Map<string, WriteQueueTask[]>();
    for (const task of tasks) {
      const key = toShanghaiDayKey(historyTime(task)) ?? "unknown";
      const items = groups.get(key) ?? [];
      items.push(task);
      groups.set(key, items);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([date, items]) => ({ date, items }));
  });

  /** 日期后显示数据库当天全量成品和采集素材数；旧接口缺字段时才回退队列记录。 */
  function formatHistoryDate(date: string, tasks: WriteQueueTask[]): string {
    if (date === "unknown") return "日期未知";
    const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" })
      .format(new Date(`${date}T00:00:00+08:00`));
    const dayCount = data.value?.day_counts?.find((count) => count.day_key === date);
    const articleCount = dayCount?.article_count
      ?? new Set(tasks.map((task) => task.finished_article_id).filter((id): id is number => id != null)).size;
    const sourceCount = dayCount?.source_count
      ?? new Set(tasks.map((task) => task.source_item_id).filter((id): id is number => id != null)).size;
    return `${date}（${weekday}） · 文章 ${articleCount} · 素材 ${sourceCount}`;
  }
  /** 将任务终态映射为现役展示文案，不推断未知任务成功。 */
  function statusLabel(status: WriteQueueTask["status"]): string {
    return status === "done" ? "成功" : status === "stopped" ? "已阻断" : "失败";
  }

  onMounted(() => {
    void refresh();
    pollTimer = setInterval(refreshWhenVisible, 15_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    elapsedTimer = setInterval(() => { elapsedNow.value = Date.now(); }, 1000);
  });
  onBeforeUnmount(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (elapsedTimer) clearInterval(elapsedTimer);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  return {
    forceRewriteTarget,
    forceRewriting,
    requestForceRewrite,
    confirmForceRewrite,
    cancellingTaskId,
    retainedResultOpen,
    retainedResultText,
    cancelTask,
    viewRetainedResult,
    data,
    shortWriteSchedule,
    shortWriteScheduleDelayed,
    pendingShortWriteCandidates,
    shortWritePeriodGroups,
    visibleCurrentTask,
    visibleQueueTasks,
    formatShortBatchPeriod,
    statusReceivedAt,
    loading,
    expanded,
    elapsedNow,
    formatElapsed,
    modalVisible,
    modalSourceItemId,
    hasActiveWork,
    refresh,
    toggleExpand,
    openSourceItem,
    articleDetailOpen,
    articleDetail,
    articleDetailLoading,
    openArticleDetail,
    closeArticleDetail,
    historyGroups,
    formatHistoryDate,
    statusLabel,
    describeLunaStatus,
    describeQueuedTask,
    describeCurrentTask,
  };
}
