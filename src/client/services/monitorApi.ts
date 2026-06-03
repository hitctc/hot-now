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
