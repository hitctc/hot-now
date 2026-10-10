import { requestModelTask as requestJson } from "./modelTaskRequest.js";


// ─── 素材库写文章 ───

export type WriteArticleResult = {
  ok: boolean;
  status?: string;
  taskId?: string;
  reason?: string;
};

/** 调用 Hermes v2 write-article API（异步），只允许人工锁定核心立意。 */
export function writeSourceItemArticle(id: number, thesis?: string): Promise<WriteArticleResult> {
  const body: Record<string, unknown> = {};
  if (thesis) body.thesis = thesis;
  return requestJson<WriteArticleResult>(`/api/creative/source-items/${id}/write-article`, {
    method: "POST",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

export type AutomationMode = "running" | "paused" | "emergency_stopped";
export type AutomationStageKey =
  | "collection"
  | "base_scoring"
  | "account_fit"
  | "long_write"
  | "short_collection"
  | "short_write"
  | "images"
  | "daily_digest"
  | "reminders"
  | "notifications";

export type DailyPlanItemStatus =
  | "selected"
  | "dispatching"
  | "queued"
  | "writing"
  | "retry_waiting"
  | "succeeded"
  | "blocked"
  | "retry_exhausted"
  | "cancelled";

export type DailyPlanItem = {
  sourceItemId: number;
  title: string;
  status: DailyPlanItemStatus | string;
  occupiesSlot: boolean;
  executionAttempts: number;
  maxExecutionAttempts: number;
  selectionReason?: string;
  score?: number | null;
  trendScore?: number | null;
  accountFitLevel?: string;
  taskId?: string | null;
  failureKind?: string | null;
  failureStep?: number | null;
  failureStepName?: string | null;
  lastError?: string | null;
  attemptHistory: Array<Record<string, unknown>>;
  finishedArticleId?: number | null;
  selectedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string | null;
};

export type DailyPlanView = {
  plan_date?: string;
  scheduled_at?: string;
  window_start?: string;
  target_count?: number;
  model_snapshot?: string;
  status?: string;
  selected_count?: number;
  completed_count?: number;
  last_error?: string | null;
  cycle: {
    planDate: string;
    scheduledAt?: string | null;
    timezone: string;
    lastCandidateCheckAt?: string | null;
    lastExecutionAt?: string | null;
    lastTriggerKind?: string | null;
  };
  slots: {
    capacity: number;
    occupied: number;
    vacant: number;
    selected: number;
    dispatching: number;
    queued: number;
    writing: number;
    retry_waiting: number;
  };
  results: {
    succeeded: number;
    blocked: number;
    retryExhausted: number;
  };
  items: DailyPlanItem[];
  lastRun?: {
    planDate: string;
    triggeredAt?: string | null;
    triggerKind?: string | null;
    items: DailyPlanItem[];
  } | null;
};

export type CreativeAutomationStatus = {
  ok: boolean;
  mode: AutomationMode;
  modeLabel: string;
  manualAllowed: boolean;
  stages: Record<AutomationStageKey, { label: string; enabled: boolean; effective: boolean }>;
  config: {
    dailyLongWriteCount: number;
    dailyLongWriteTime: string;
    windowHours: number;
    baseScoreThreshold: number;
    trendScoreThreshold: number;
    shortWritePacingSupported?: boolean;
    shortWriteMode?: "batch" | "paced";
    shortWriteBatchSize: number;
    /** 每个短内容采集批次最多受理的自动写作篇数。 */
    shortWriteCycleCount?: number;
    shortCollectionInterval: number;
    shortWriteInterval: number;
    shortRssWriteInterval?: number;
    timezone: string;
  };
  dailyPlan: DailyPlanView;
  queue?: WriteQueueStatus | null;
};

/** 读取 Hermes 统一自动化状态；HotNow 不再读取本地自动化 SQLite 表。 */
export function fetchCreativeAutomationStatus(): Promise<CreativeAutomationStatus> {
  return requestJson<CreativeAutomationStatus>("/api/creative/automation/status");
}

/** 更新 Hermes 统一模式、阶段开关或计划参数。 */
export function updateCreativeAutomationControl(input: {
  mode?: AutomationMode;
  stage?: AutomationStageKey;
  enabled?: boolean;
  config?: Record<string, string | number>;
}): Promise<CreativeAutomationStatus> {
  return requestJson<CreativeAutomationStatus>("/api/creative/automation/control", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type DailyPlanRunResponse = {
  ok: boolean;
  status: string;
  submitted?: number;
  newSubmitted?: number;
  retrySubmitted?: number;
  snapshotCount?: number;
  plan?: DailyPlanView;
  errors?: string[];
  error?: string;
};

/** 立即执行当前周期自动写作快照；不触发采集、评分或其他自动阶段。 */
export function triggerCreativeDailyPlan(): Promise<DailyPlanRunResponse> {
  return requestJson<DailyPlanRunResponse>("/api/creative/automation/daily-plan/run", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** 兼容旧调用方，实际仍转成 Hermes 阶段控制，不创建 HotNow 本地任务。 */
export function updateCreativeAutomationEnabled(kind: "master" | "evaluate" | "write", enabled: boolean): Promise<CreativeAutomationStatus> {
  return requestJson<CreativeAutomationStatus>(`/api/creative/automation/${kind}/enabled`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

/** 按外部标识提交短写并返回队列编号；auto 为统一策略，显式旧规格仅兼容调用。 */
export function writeSourceItemShort(id: number, externalId: string, form: "tuwen" | "duanwen" | "auto"): Promise<WriteArticleResult> {
  return requestJson<WriteArticleResult>(`/api/creative/source-items/${id}/write-short`, {
    method: "POST",
    body: JSON.stringify({ externalId, form }),
  });
}

/** 按编号取消写作或生图；执行中等待安全检查点，不终止当前模型请求。 */
export function cancelWriteQueueTask(taskId: string): Promise<{ success: boolean; status?: string; error?: string }> {
  return requestJson("/api/creative/write-queue/cancel", { method: "POST", body: JSON.stringify({ taskId }) });
}

/** 读取失败或取消任务保留的生成结果，不重复调用模型。 */
export function readWriteQueueTaskResult(taskId: string): Promise<{ success: boolean; generated?: unknown; error?: string }> {
  return requestJson(`/api/creative/write-queue/result?taskId=${encodeURIComponent(taskId)}`);
}

/** 显式确认后重写原内容阻断任务；Hermes 决定资格并复用原请求收据，客户端不绕过调度。 */
export function forceRewriteQueueTask(taskId: string): Promise<{ success: boolean; task_id?: string; error?: string }> {
  return requestJson("/api/creative/write-queue/force-rewrite", { method: "POST", body: JSON.stringify({ taskId, confirmed: true }) });
}

// ─── 写作队列状态 ───

export type WriteQueueTask = {
  task_id: string;
  label: string;
  priority: "high" | "normal";
  source_item_id: number | null;
  source_external_id?: string;
  task_kind?: string;
  cancel_requested?: boolean;
  result_retained?: boolean;
  can_force_rewrite?: boolean;
  retained_result_id?: string;
  status: "writing" | "queued" | "done" | "stopped" | "failed";
  submitted_at: string;
  started_at: string | null;
  finished_at?: string | null;
  stop_step?: number;
  stop_step_name?: string;
  reason_text?: string;
  reason_category?: string;
  error?: string;
  phase?: "writing" | "images" | string;
  phase_order?: number;
  phase_name?: string;
  phase_status?: string;
  phase_detail?: Record<string, unknown>;
  finished_article_id?: number;
  retry_count?: number;
  next_retry_at?: string;
  image_index?: number;
  image_total?: number;
  /** 后端代理从本地素材表补充 */
  source_item_title?: string | null;
  source_item_source_name?: string | null;
};

export type WriteQueueDayCount = {
  day_key: string;
  article_count: number;
  source_count: number;
};

export type WriteQueueStats = {
  total_submitted: number;
  total_completed: number;
  total_failed: number;
  total_stopped?: number;
};

export type WriteQueueStatus = {
  current: WriteQueueTask | null;
  queue_length: number;
  queue: WriteQueueTask[];
  recent?: WriteQueueTask[];
  /** Hermes 持久化的终态历史，按完成时间倒序。 */
  history?: WriteQueueTask[];
  /** HotNow 数据库按北京时间统计的全量成品与采集素材数量。 */
  day_counts?: WriteQueueDayCount[];
  stats: WriteQueueStats;
  luna?: {
    status: "idle" | "running" | string;
    active: boolean;
    waiting_count?: number;
    waiters?: Array<{
      request_id: string;
      kind?: string;
      priority: "manual" | "model_operation" | "automatic_write" | string;
      task_id?: string;
      source_item_id?: number;
      label?: string;
      phase?: string;
      task_type?: string;
      requested_at?: string;
    }>;
    available?: boolean;
    paused?: boolean;
    remaining_seconds?: number;
    /** 冷却已到期，但需以实际任务结果确认模型是否恢复。 */
    probe?: boolean;
    reason?: string;
    kind?: string;
    task_id?: string;
    source_item_id?: number;
    article_id?: number;
    label?: string;
    task_type?: string;
    phase?: string;
    started_at?: string;
  };
  /** 本次队列运行首次开始执行的时间（Hermes 提供，暂未上线时为 undefined） */
  run_started_at?: string | null;
  /** Hermes 超时后由 HotNow 返回最近一次成功状态。 */
  status_delayed?: boolean;
  status_unavailable?: boolean;
  status_message?: string;
  status_cached_at?: string;
};

/** 查询 Hermes 写作队列状态 */
const WRITE_QUEUE_STATUS_CACHE_MS = 2_000;
let writeQueueStatusCache: { value: WriteQueueStatus; expiresAt: number } | null = null;
let writeQueueStatusRequest: Promise<WriteQueueStatus> | null = null;

/** 合并同一时刻的队列轮询，并用两秒短缓存吸收多个页面组件的重复请求。 */
export function fetchWriteQueueStatus(): Promise<WriteQueueStatus> {
  const now = Date.now();
  if (writeQueueStatusCache && writeQueueStatusCache.expiresAt > now) {
    return Promise.resolve(writeQueueStatusCache.value);
  }
  if (writeQueueStatusRequest) return writeQueueStatusRequest;

  writeQueueStatusRequest = requestJson<WriteQueueStatus>("/api/creative/write-queue/status")
    .then((value) => {
      writeQueueStatusCache = {
        value,
        expiresAt: Date.now() + WRITE_QUEUE_STATUS_CACHE_MS
      };
      return value;
    })
    .finally(() => {
      writeQueueStatusRequest = null;
    });

  return writeQueueStatusRequest;
}

// ─── 手动输入内容：按页面方向投递长文或短内容 ───

export type ManualWriteRequest = {
  title?: string;
  content: string;
  contentType: "viewpoint" | "article";
  /** 短内容页必须显式指定方向和形态；长文页省略时继续走原入口。 */
  direction?: "article" | "short_content";
  form?: "auto" | "tuwen" | "duanwen";
  thesis?: string;
};

export type ManualWriteResult = {
  ok: boolean;
  taskId?: string;
  sourceItemId?: number;
  reason?: string;
};

/** 将输入提交给对应方向的写作队列；返回创建的素材 ID，不在客户端生成成品。 */
export function submitManualWrite(req: ManualWriteRequest): Promise<ManualWriteResult> {
  return requestJson<ManualWriteResult>("/actions/creative/source-items/manual-write", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ─── 素材溯源 ───

export function traceSourceItem(id: number): Promise<{ ok: boolean; status?: string; reason?: string }> {
  return requestJson("/actions/creative/source-items/" + id + "/trace", {
    method: "POST",
    body: "{}",
  });
}
