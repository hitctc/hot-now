import type { AccountFitLevel, TrendBreakdown, SourceRanking } from "../../../services/creativeListApi.js";

/** 显示已有平台来源名，兼容旧英文平台名；没有来源时明确缺失，不猜平台。 */
export function sourcePlatformLabel(name: string | null | undefined): string {
  const platforms: Record<string, string> = { bilibili热搜: "B站", baidu热搜: "百度", thepaper热搜: "澎湃", weibo热搜: "微博" };
  return name ? platforms[name] ?? name : "来源未记录";
}

/** 显示首次榜单时间及位置；精选不是排名，旧热搜缺失和RSS非榜单明确区分。 */
export function sourceRankingLabel(snapshot: SourceRanking | null | undefined, collectorAgent?: string | null): string {
  if (!snapshot) return !collectorAgent || collectorAgent.startsWith("hotsearch-") ? "排名未记录" : "非榜单来源";
  const capturedAt = new Date(snapshot.capturedAt);
  const time = Number.isFinite(capturedAt.getTime()) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(capturedAt).replaceAll("/", "-") : "采集时间未记录";
  if (snapshot.kind === "selection") return `${snapshot.board} · ${time} · 非排名榜单`;
  return `${snapshot.board} · ${time} · 第${snapshot.rank}${snapshot.kind === "listing" ? "位" : "名"}`;
}

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

/** 将Hermes唯一写作队列状态转换为素材列表标签，不从素材状态反推队列状态。 */
export function shortWriteTaskStatusLabel(status: string): string {
  switch (status) {
    case "queued": return "排队中";
    case "writing": return "写作中";
    case "done": return "已写作";
    case "failed": return "技术失败";
    case "stopped": return "已停止";
    default: return "已投递";
  }
}

/** 返回状态文案；短素材传选题分可识别待同步，不据分数猜测准入，长素材不传分保持原语义。 */
export function writingStatusLabel(status: string, shortScore?: number | null): string {
  switch (status) {
    case "pending": return typeof shortScore === "number" && Number.isFinite(shortScore) ? "已评分·待同步" : "待评估";
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
