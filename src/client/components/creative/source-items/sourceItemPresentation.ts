import type { AccountFitLevel, TrendBreakdown } from "../../../services/creativeListApi.js";

/** 评分明细的固定展示顺序，保证不同列表的颜色和位置一致。 */
export const breakdownDimensionOrder: Array<keyof TrendBreakdown> = [
  "topicPower",
  "infoGap",
  "emotionResonance",
  "socialCurrency",
  "timingWindow",
  "audienceBreadth",
];

export const breakdownLabels: Record<keyof TrendBreakdown, string> = {
  topicPower: "话题",
  emotionResonance: "情绪",
  infoGap: "信息差",
  socialCurrency: "社交",
  timingWindow: "时效",
  audienceBreadth: "受众",
};

const breakdownColors: Record<keyof TrendBreakdown, string> = {
  topicPower: "#3b82f6",
  emotionResonance: "#ef4444",
  infoGap: "#f59e0b",
  socialCurrency: "#10b981",
  timingWindow: "#8b5cf6",
  audienceBreadth: "#6366f1",
};

export type BreakdownBar = {
  label: string;
  value: number;
  color: string;
  width: string;
};

/** 把评分明细转换为柱状图所需的数据，避免模板承担计算逻辑。 */
export function getBreakdownBars(breakdown: TrendBreakdown): BreakdownBar[] {
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  if (total === 0) return [];
  return breakdownDimensionOrder
    .filter((key) => (breakdown[key] ?? 0) > 0)
    .map((key) => {
      const value = breakdown[key];
      return {
        label: `${breakdownLabels[key]}${value}`,
        value,
        color: breakdownColors[key],
        width: `${Math.round((value / total) * 100)}%`,
      };
    });
}

/** 评分明细用于 tooltip 的紧凑文案。 */
export function formatBreakdown(breakdown: TrendBreakdown): string {
  return (Object.entries(breakdown) as [keyof TrendBreakdown, number][]) 
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => `${breakdownLabels[key]}${value}`)
    .join(" | ");
}

/** 统一把数据库 UTC 时间转换为中文本地时间。 */
export function formatPublishedAt(value: string | null): string {
  if (!value) return "-";
  const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(fixed);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function writingStatusColor(status: string): string {
  switch (status) {
    case "ready": return "blue";
    case "queued": return "cyan";
    case "excluded": return "default";
    case "writing": return "orange";
    case "done": return "green";
    case "skipped": return "default";
    case "failed": return "red";
    default: return "blue";
  }
}

export function writingStatusLabel(status: string): string {
  switch (status) {
    case "pending": return "待评估";
    case "ready": return "待写作";
    case "queued": return "排队中";
    case "excluded": return "不写作";
    case "writing": return "写作中";
    case "done": return "已写作";
    case "skipped": return "跳过不写";
    case "failed": return "技术失败";
    default: return status;
  }
}

export function accountFitLabel(level: AccountFitLevel | null): string {
  if (level === "high") return "高适配";
  if (level === "medium") return "中适配";
  if (level === "low") return "低适配";
  if (level === "insufficient") return "信息不足";
  if (level === "error") return "评估失败";
  return "未评估";
}

export function accountFitColor(level: AccountFitLevel | null): string {
  if (level === "high") return "green";
  if (level === "medium") return "gold";
  if (level === "low") return "default";
  if (level === "insufficient") return "blue";
  if (level === "error") return "red";
  return "default";
}
