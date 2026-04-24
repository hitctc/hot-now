import { HttpError } from "../../../services/http";
import {
  type SettingsContentFilterRule,
  type SettingsContentFilterToggles,
  type SettingsContentFilterWeights,
  type SettingsFeedbackPoolItem,
  type SettingsProviderSettingsSummary
} from "../../../services/settingsApi";

export type AlertTone = "success" | "info" | "warning" | "error";
export type PageNotice = { tone: AlertTone; message: string };
export type FilterRuleKey = "ai" | "hot";
export type FilterWeightKey = keyof SettingsContentFilterWeights;
export type FilterToggleKey = keyof SettingsContentFilterToggles;

export const providerKindOptions = [
  { label: "DeepSeek", value: "deepseek" },
  { label: "MiniMax", value: "minimax" },
  { label: "Kimi", value: "kimi" }
] as const;

export const aiSignalExamples = ["AI", "LLM", "GPT", "Agent", "Model", "OpenAI", "Claude", "DeepSeek", "大模型", "智能体"];
export const heatSignalExamples = ["发布", "上线", "更新", "快讯", "周报", "热点", "洞察", "launch", "release", "update", "analysis"];

const weightDisplayScale = 100;

export function createFilterToggleDraft(): SettingsContentFilterToggles {
  return {
    enableTimeWindow: false,
    enableSourceViewBonus: true,
    enableAiKeywordWeight: true,
    enableHeatKeywordWeight: true,
    enableFreshnessWeight: true,
    enableScoreRanking: true
  };
}

export function createFilterWeightDraft(): SettingsContentFilterWeights {
  return {
    freshnessWeight: 0,
    sourceWeight: 0,
    completenessWeight: 0,
    aiWeight: 0,
    heatWeight: 0
  };
}

export function readFilterOverviewItems(rule: SettingsContentFilterRule): string[] {
  return rule.ruleKey === "ai"
    ? [
        `只看最近 24 小时 ${formatToggleText(rule.toggles.enableTimeWindow)}`,
        `AI 新讯重点来源优先 ${formatToggleText(rule.toggles.enableSourceViewBonus)}`,
        `AI 内容优先 ${formatToggleText(rule.toggles.enableAiKeywordWeight)}`,
        `热点词优先 ${formatToggleText(rule.toggles.enableHeatKeywordWeight)}`,
        `按综合分排序 ${formatToggleText(rule.toggles.enableScoreRanking)}`
      ]
    : [
        `AI 热点重点来源优先 ${formatToggleText(rule.toggles.enableSourceViewBonus)}`,
        `AI 内容优先 ${formatToggleText(rule.toggles.enableAiKeywordWeight)}`,
        `热点词优先 ${formatToggleText(rule.toggles.enableHeatKeywordWeight)}`,
        `新内容优先 ${formatToggleText(rule.toggles.enableFreshnessWeight)}`,
        `按综合分排序 ${formatToggleText(rule.toggles.enableScoreRanking)}`
      ];
}

export function readFilterWeightItems(rule: SettingsContentFilterRule): string[] {
  return [
    `新内容影响 ${formatWeightPoints(rule.weights.freshnessWeight)} 分`,
    `重点来源影响 ${formatWeightPoints(rule.weights.sourceWeight)} 分`,
    `内容完整度影响 ${formatWeightPoints(rule.weights.completenessWeight)} 分`,
    `AI 内容影响 ${formatWeightPoints(rule.weights.aiWeight)} 分`,
    `热点词影响 ${formatWeightPoints(rule.weights.heatWeight)} 分`
  ];
}

export function readEditableWeightItems(weights: SettingsContentFilterWeights) {
  return [
    {
      key: "freshnessWeight",
      label: "新内容影响",
      description: "发布时间越近，这一项加分越明显。",
      value: weights.freshnessWeight
    },
    {
      key: "sourceWeight",
      label: "重点来源影响",
      description: "越偏向这个页面的重点来源，这一项影响越大。",
      value: weights.sourceWeight
    },
    {
      key: "completenessWeight",
      label: "内容完整度影响",
      description: "标题、摘要、正文越完整，这一项影响越大。",
      value: weights.completenessWeight
    },
    {
      key: "aiWeight",
      label: "AI 内容影响",
      description: "越像 AI 内容，这一项影响越大。",
      value: weights.aiWeight
    },
    {
      key: "heatWeight",
      label: "热点词影响",
      description: "越命中热点词，这一项影响越大。",
      value: weights.heatWeight
    }
  ] as const;
}

export function readWeightTotal(weights: SettingsContentFilterWeights): number {
  return weights.freshnessWeight + weights.sourceWeight + weights.completenessWeight + weights.aiWeight + weights.heatWeight;
}

export function formatWeightRatio(weights: SettingsContentFilterWeights, value: number): string {
  const total = readWeightTotal(weights);

  if (total <= 0) {
    return "0%";
  }

  return `${((value / total) * 100).toFixed(0)}%`;
}

export function normalizeWeightInput(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Number(value.toFixed(2));
}

export function convertStoredWeightToPoints(value: number): number {
  return Math.round(value * weightDisplayScale);
}

export function convertPointsToStoredWeight(value: number): number {
  return normalizeWeightInput(value / weightDisplayScale);
}

export function formatWeightPoints(value: number): string {
  return convertStoredWeightToPoints(value).toString();
}

export function formatWeightTotal(weights: SettingsContentFilterWeights): string {
  return convertStoredWeightToPoints(readWeightTotal(weights)).toString();
}

export function formatToggleText(enabled: boolean): string {
  return enabled ? "开" : "关";
}

export function formatProviderLabel(providerKind: string | null | undefined): string {
  if (providerKind === "deepseek") {
    return "DeepSeek";
  }

  if (providerKind === "minimax") {
    return "MiniMax";
  }

  if (providerKind === "kimi") {
    return "Kimi";
  }

  return providerKind?.trim() ? providerKind : "未设置";
}

export function readProviderStatusLabel(settings: SettingsProviderSettingsSummary | null): string {
  if (!settings) {
    return "未配置";
  }

  return settings.isEnabled ? "已配置并启用" : "已保存未启用";
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "暂无记录";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "暂无记录";
  }

  return parsedDate.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function buildFeedbackCopyText(entry: SettingsFeedbackPoolItem): string {
  const lines = [
    `标题：${entry.contentTitle}`,
    `来源：${entry.sourceName}`,
    `链接：${entry.canonicalUrl}`,
    `反馈词：${entry.freeText?.trim() || "未填写"}`
  ];
  const effectLine = entry.suggestedEffect?.trim() ? `建议效果：${entry.suggestedEffect.trim()}` : null;
  const strengthLine = entry.strengthLevel?.trim() ? `强度：${entry.strengthLevel.trim()}` : null;
  const positiveLine = formatFeedbackKeywords("正向关键词", entry.positiveKeywords);
  const negativeLine = formatFeedbackKeywords("负向关键词", entry.negativeKeywords);

  return [effectLine, strengthLine, positiveLine, negativeLine]
    .reduce((allLines, line) => (line ? [...allLines, line] : allLines), lines)
    .join("\n");
}

export function resolveActionErrorMessage(
  error: unknown,
  fallbackMessage: string,
  reasonMessages: Record<string, string> = {}
): string {
  if (error instanceof HttpError) {
    const responseBody = typeof error.body === "object" && error.body !== null ? (error.body as Record<string, unknown>) : null;
    const reason = responseBody?.reason;

    if (typeof reason === "string" && reasonMessages[reason]) {
      return reasonMessages[reason];
    }

    if (typeof responseBody?.message === "string" && responseBody.message.trim()) {
      return responseBody.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

function formatFeedbackKeywords(label: string, keywords: string[]): string | null {
  return keywords.length > 0 ? `${label}：${keywords.join("、")}` : null;
}
