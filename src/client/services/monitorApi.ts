import { requestJson } from "./http.js";

// ─── 监控统计 ───

export type MonitorLastRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "done" | "error" | "running";
  steps_summary: string;
  error: string | null;
};

export type MonitorStats = {
  today_collected: number;
  today_scored: number;
  today_written: number;
  today_drafted: number;
  today_cover_ok: number;
  today_cover_fail: number;
  pending_score: number;
  pending_trend: number;
  pending_write: number;
  last_run: MonitorLastRun | null;
  switches: Record<string, string>;
  // Hermes 调度器下次触发时刻（精确倒计时用，暂未上线时为 null）
  next_pipeline_at?: string | null;
  next_codex_generate_at?: string | null;
  next_codex_consume_at?: string | null;
};

export function fetchMonitorStats(): Promise<MonitorStats> {
  return requestJson<MonitorStats>("/api/monitor/stats");
}

// ─── 平台待处理统计 ───

export type PlatformStats = {
  pending_score: number;
  pending_trend: number;
  pending_write: number;
  total: number;
  total_articles: number;
};

export function fetchPlatformStats(): Promise<PlatformStats> {
  return requestJson<PlatformStats>("/api/monitor/platform-stats");
}

// ─── 流水线运行记录 ───

export type StepLog = {
  id: number;
  run_id: number;
  step_name: string;
  step_order: number;
  started_at: string;
  finished_at: string | null;
  status: "done" | "error" | "running" | "skipped";
  detail: string;
  item_tag: string;
};

export type PipelineRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "done" | "error" | "running";
  steps_summary: string;
  error: string | null;
  steps?: StepLog[];
};

export type RunsWithStepsResponse = {
  runs: PipelineRun[];
  total: number;
  has_more: boolean;
};

export function fetchRunsWithSteps(params?: {
  limit?: number;
  offset?: number;
  date?: string;
}): Promise<RunsWithStepsResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.date) query.set("date", params.date);
  const qs = query.toString();
  return requestJson<RunsWithStepsResponse>(`/api/monitor/runs-with-steps${qs ? `?${qs}` : ""}`);
}

export function fetchRunDetail(id: number): Promise<{ id: number; steps: StepLog[] }> {
  return requestJson(`/api/monitor/runs/${id}`);
}

// ─── 素材列表 ───

export type MonitorItem = {
  id: number;
  source_item_id: number;
  external_id: string;
  title: string;
  source_name: string;
  url: string;
  collector_agent: string;
  score: number | null;
  trend_score: number | null;
  dedup_status: string;
  writing_status: string;
  draft_status: string;
  collected_at: string;
  scored_at: string | null;
  trend_scored_at: string | null;
  written_at: string | null;
  drafted_at: string | null;
  created_at: string;
};

export type ItemsResponse = {
  items: MonitorItem[];
};

export function fetchMonitorItems(params?: {
  status?: string;
  agent?: string;
  limit?: number;
  offset?: number;
}): Promise<ItemsResponse> {
  const query = new URLSearchParams();
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.agent) query.set("agent", params.agent);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return requestJson<ItemsResponse>(`/api/monitor/items${qs ? `?${qs}` : ""}`);
}

// ─── 开关配置 ───

export type SwitchValue = { key: string; value: string };

export function fetchSwitch(key: string): Promise<SwitchValue> {
  return requestJson<SwitchValue>(`/api/monitor/switch/${encodeURIComponent(key)}`);
}

export function updateSwitch(key: string, value: string): Promise<{ ok: boolean; key: string; value: string }> {
  return requestJson<{ ok: boolean; key: string; value: string }>(`/api/monitor/switch/${encodeURIComponent(key)}`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}

// ─── 定时任务立即触发 ───

export type TriggerResponse = {
  ok: boolean;
  message: string;
  pid?: number;
  triggered_at?: string;
};

// 间隔参数 key → trigger 接口路径
const triggerPaths: Record<string, string> = {
  interval_pipeline: "/api/monitor/trigger/pipeline",
  interval_codex_generate: "/api/monitor/trigger/codex-generate",
  interval_codex_consume: "/api/monitor/trigger/codex-consume",
};

/** 触发间隔参数对应的立即执行，非间隔参数 key 返回 null */
export function getTriggerPath(key: string): string | null {
  return triggerPaths[key] ?? null;
}

export function triggerTask(path: string): Promise<TriggerResponse> {
  return requestJson<TriggerResponse>(path, { method: "POST", body: "{}" });
}

// ─── Codex 生图可观测性 ──

export type CodexTask = {
  task_id: string;
  article_id: number;
  article_title: string | null;
  image_index: number;
  image_type: string;
  prompt_summary: string | null;
  model: string | null;
  status: "queued" | "running" | "completed" | "failed";
  queue_position: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  result_url: string | null;
  error: string | null;
};

export type CodexTasksResponse = {
  tasks: CodexTask[];
  total: number;
  has_more: boolean;
};

export function fetchCodexTasks(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  article_id?: number;
}): Promise<CodexTasksResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.status) query.set("status", params.status);
  if (params?.article_id) query.set("article_id", String(params.article_id));
  const qs = query.toString();
  return requestJson<CodexTasksResponse>(`/api/codex/tasks${qs ? `?${qs}` : ""}`);
}

export type CodexConsumptionItem = {
  task_id: string;
  article_id: number;
  article_title: string | null;
  image_index: number;
  image_type: string;
  result_url: string;
  consumed: boolean;
  consumed_at: string | null;
  consume_status: "success" | "failed" | "pending" | "failed_generate" | null;
  consume_error: string | null;
  next_consume_at: string | null;
};

export type CodexConsumptionResponse = {
  items: CodexConsumptionItem[];
  pending_count: number;
  total: number;
  has_more: boolean;
  next_schedule_at: string | null;
  schedule_interval_seconds: number | null;
};

export function fetchCodexConsumption(params?: {
  limit?: number;
  offset?: number;
  consumed?: boolean;
}): Promise<CodexConsumptionResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.consumed != null) query.set("consumed", String(params.consumed));
  const qs = query.toString();
  return requestJson<CodexConsumptionResponse>(`/api/codex/consumption${qs ? `?${qs}` : ""}`);
}
