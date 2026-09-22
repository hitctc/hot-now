import type { TrendBreakdown } from "../../services/creativeApi.js";
import { getStatusLabel } from "../../components/creative/articleStatusShared.js";

export type TrendBreakdownBar = {
  label: string;
  value: number;
  color: string;
  width: string;
};

const BREAKDOWN_LABELS: Record<keyof TrendBreakdown, string> = {
  topicPower: "话题",
  emotionResonance: "情绪",
  infoGap: "信息差",
  socialCurrency: "社交",
  timingWindow: "时效",
  audienceBreadth: "受众"
};

const BREAKDOWN_COLORS: Record<keyof TrendBreakdown, string> = {
  topicPower: "#3b82f6",
  emotionResonance: "#ef4444",
  infoGap: "#f59e0b",
  socialCurrency: "#10b981",
  timingWindow: "#8b5cf6",
  audienceBreadth: "#6366f1"
};

const BREAKDOWN_DIMENSION_ORDER: Array<keyof TrendBreakdown> = [
  "topicPower", "infoGap", "emotionResonance", "socialCurrency", "timingWindow", "audienceBreadth"
];

const SHORT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  ready: { label: "可发布", color: "green" },
  needs_rewrite: { label: "待重写", color: "orange" },
  published: { label: "已发布", color: "blue" }
};

export const SHORT_FINISHED_STATUS_OPTIONS = [
  { label: "全部状态", value: "" },
  { label: "排队中", value: "queued" },
  { label: "写作中", value: "writing" },
  { label: "已生成", value: "generated" },
  { label: "手动草稿", value: "manual_draft" },
  { label: "待审核", value: "needs_review" },
  { label: "可推送", value: "ready_for_publish" },
  { label: "已推送草稿", value: "wechat_draft" },
  { label: "审核不通过", value: "review_rejected" },
  { label: "异常", value: "anomaly" },
  { label: "已中止", value: "stopped" },
  { label: "已失败", value: "failed" },
  { label: "已删除", value: "soft_deleted" }
];

export const SHORT_FINISHED_COLUMNS = [
  { title: "ID / 序号", dataIndex: "id", key: "idSeq", width: 72, fixed: "left" as const, className: "table-day-anchor-cell" },
  { title: "标题", key: "title", width: 300 },
  { title: "配图提示词", key: "coverImage", width: 120 },
  { title: "状态", key: "status", width: 100 },
  { title: "来源", key: "sourceName", width: 115 },
  { title: "爆文", key: "trend", width: 120, ellipsis: true },
  { title: "相似度", key: "similarity", width: 56, ellipsis: true },
  { title: "形态", key: "form", width: 72 },
  { title: "耗时/时间", key: "timeInfo", width: 130, ellipsis: true },
  { title: "操作", key: "actions", width: 86, fixed: "right" as const }
];

/** 把趋势维度整理为按分数降序的悬浮说明。 */
export function formatTrendBreakdown(breakdown: TrendBreakdown): string {
  return (Object.entries(breakdown) as [keyof TrendBreakdown, number][])
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => `${BREAKDOWN_LABELS[key]}${value}`)
    .join(" | ");
}

/** 按固定维度顺序生成趋势分段，保证不同文章的颜色位置可横向比较。 */
export function getTrendBreakdownBars(breakdown: TrendBreakdown): TrendBreakdownBar[] {
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  if (total === 0) return [];
  return BREAKDOWN_DIMENSION_ORDER
    .filter((key) => (breakdown[key] ?? 0) > 0)
    .map((key) => {
      const value = breakdown[key];
      return {
        label: `${BREAKDOWN_LABELS[key]}${value}`,
        value,
        color: BREAKDOWN_COLORS[key],
        width: `${Math.round((value / total) * 100)}%`
      };
    });
}

/** 将 SQLite 无时区 UTC 时间和标准时间统一显示为北京时间。 */
export function formatShortFinishedLocalTime(value: string): string {
  const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(fixed);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** 从阶段轨迹首个开始时间和最后完成时间计算总写作耗时。 */
export function calculateWritingDuration(
  stepTrace: Array<{ startedAt?: string; finishedAt?: string }> | null
): number | null {
  if (!stepTrace || stepTrace.length === 0) return null;
  const withStarted = stepTrace.filter((step) => step.startedAt);
  const withFinished = stepTrace.filter((step) => step.finishedAt);
  if (withStarted.length === 0 || withFinished.length === 0) return null;
  const firstStart = new Date(withStarted[0].startedAt!).getTime();
  const lastFinish = new Date(withFinished[withFinished.length - 1].finishedAt!).getTime();
  if (Number.isNaN(firstStart) || Number.isNaN(lastFinish)) return null;
  return lastFinish - firstStart;
}

/** 将毫秒耗时压缩成表格可读的毫秒、秒、分钟或小时文本。 */
export function formatWritingDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m${String(remainSeconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h${String(remainMinutes).padStart(2, "0")}m`;
}

/** 优先返回短内容管线状态文案，其余状态复用成品文章共享映射。 */
export function getShortFinishedStatusInfo(status: string): { label: string; color: string } {
  return SHORT_STATUS_LABELS[status] ?? getStatusLabel(status);
}
