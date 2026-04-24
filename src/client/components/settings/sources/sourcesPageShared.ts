import type {
  SettingsBilibiliQuery,
  SettingsHackerNewsQuery,
  SettingsSourceItem,
  SettingsSourcesResponse,
  SettingsTwitterAccount,
  SettingsTwitterSearchKeyword,
  SettingsWechatRssSource
} from "../../../services/settingsApi";

export type SourceModalMode = "create" | "update";
export type TwitterAccountModalMode = "create" | "update";
export type TwitterKeywordModalMode = "create" | "update";
export type HackerNewsQueryModalMode = "create" | "update";
export type BilibiliQueryModalMode = "create" | "update";

export type SourceFormState = {
  kind: string;
  rssUrl: string;
};

export type TwitterAccountFormState = {
  id: number | null;
  username: string;
  displayName: string;
  category: string;
  priority: number;
  includeReplies: boolean;
  notes: string;
};

export type TwitterKeywordFormState = {
  id: number | null;
  keyword: string;
  category: string;
  priority: number;
  isCollectEnabled: boolean;
  isVisible: boolean;
  notes: string;
};

export type HackerNewsQueryFormState = {
  id: number | null;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string;
};

export type BilibiliQueryFormState = {
  id: number | null;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string;
};

export type WechatRssFormState = {
  rssUrls: string;
};

export type SourcesActionPendingGetter = (actionKey: string) => boolean;
export type SourceViewStats = NonNullable<SettingsSourceItem["viewStats"]>["ai"];
export type SourcesOperations = SettingsSourcesResponse["operations"];
export type SourcesCapability = SettingsSourcesResponse["capability"];

export type SourceEventMap = {
  source: SettingsSourceItem;
  twitterAccount: SettingsTwitterAccount;
  twitterKeyword: SettingsTwitterSearchKeyword;
  hackerNewsQuery: SettingsHackerNewsQuery;
  bilibiliQuery: SettingsBilibiliQuery;
  wechatRssSource: SettingsWechatRssSource;
};

export const inventoryColumns = [
  { title: "来源", key: "name", align: "center" as const },
  { title: "类型", key: "sourceType", align: "center" as const },
  { title: "启用", key: "enabled", align: "center" as const },
  { title: "选中时全量", key: "displayMode", align: "center" as const },
  { title: "总条数", key: "totalCount", align: "center" as const },
  { title: "今天发布", key: "publishedTodayCount", align: "center" as const },
  { title: "今天抓取", key: "collectedTodayCount", align: "center" as const },
  { title: "最近抓取时间", key: "lastCollectedAt", align: "center" as const },
  { title: "最近抓取状态", key: "lastCollectionStatus", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];

export const twitterAccountColumns = [
  { title: "账号", key: "account", align: "center" as const },
  { title: "分类", key: "category", align: "center" as const },
  { title: "优先级", key: "priority", align: "center" as const },
  { title: "启用", key: "enabled", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastError", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];

export const twitterKeywordColumns = [
  { title: "关键词", key: "keyword", align: "center" as const },
  { title: "分类", key: "category", align: "center" as const },
  { title: "优先级", key: "priority", align: "center" as const },
  { title: "采集启用", key: "collectEnabled", align: "center" as const },
  { title: "展示启用", key: "visible", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastResult", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];

export const hackerNewsQueryColumns = [
  { title: "查询词", key: "query", align: "center" as const },
  { title: "优先级", key: "priority", align: "center" as const },
  { title: "采集启用", key: "enabled", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastResult", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];

export const bilibiliQueryColumns = [
  { title: "查询词", key: "query", align: "center" as const },
  { title: "优先级", key: "priority", align: "center" as const },
  { title: "采集启用", key: "enabled", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastResult", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];

export const wechatRssSourceColumns = [
  { title: "RSS 链接", key: "rssUrl", align: "center" as const },
  { title: "最近成功", key: "lastSuccessAt", align: "center" as const },
  { title: "最近结果", key: "lastResult", align: "center" as const },
  { title: "操作", key: "actions", align: "center" as const }
];

export const twitterAccountCategoryOptions = [
  { label: "官方厂商", value: "official_vendor" },
  { label: "产品账号", value: "product" },
  { label: "关键人物", value: "person" },
  { label: "媒体", value: "media" },
  { label: "其他", value: "other" }
];

export const twitterKeywordCategoryOptions = [
  { label: "官方厂商", value: "official_vendor" },
  { label: "产品", value: "product" },
  { label: "关键人物", value: "person" },
  { label: "主题", value: "topic" },
  { label: "媒体", value: "media" },
  { label: "其他", value: "other" }
];

// 系统页统一格式化时间，空值统一回落成“暂无记录”。
export function formatDateTime(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "暂无记录";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

// 下一次采集展示成“绝对时间 + 剩余分钟”，让工作台同时保留节奏和实时感。
export function formatNextCollectionText(value: string | null | undefined, now: number): string {
  if (!value?.trim()) {
    return "未启用定时采集";
  }

  const nextDate = new Date(value);

  if (Number.isNaN(nextDate.getTime())) {
    return "暂时无法计算";
  }

  const diffMinutes = Math.floor((nextDate.getTime() - now) / 60_000);
  const timeLabel = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(nextDate);

  if (diffMinutes <= 0) {
    return `${timeLabel}（即将执行）`;
  }

  return `${timeLabel}（还有 ${diffMinutes} 分钟）`;
}

export function formatViewStats(stats: SourceViewStats | undefined): string {
  if (!stats) {
    return "0 / 0";
  }

  return `${stats.candidateCount} / ${stats.visibleCount}`;
}

export function formatViewShare(stats: SourceViewStats | undefined): string {
  if (!stats) {
    return "0.0%";
  }

  return `${(stats.visibleShare * 100).toFixed(1)}%`;
}

// 最近抓取状态保留原始枚举给后端和数据库，页面统一翻译成中文给用户看。
export function formatCollectionStatus(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "未知";
  }

  if (normalized === "completed") {
    return "已完成";
  }

  if (normalized === "running") {
    return "进行中";
  }

  if (normalized === "failed") {
    return "已失败";
  }

  if (normalized === "pending") {
    return "等待中";
  }

  return value ?? "未知";
}

export function formatTwitterCategoryLabel(value: string): string {
  if (value === "official_vendor") {
    return "官方厂商";
  }

  if (value === "product") {
    return "产品";
  }

  if (value === "person") {
    return "关键人物";
  }

  if (value === "topic") {
    return "主题";
  }

  if (value === "media") {
    return "媒体";
  }

  return "其他";
}
