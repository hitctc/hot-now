import type { ContentCard, ContentFeedbackEntry } from "../../services/contentApi";

export function cloneContentCard(card: ContentCard): ContentCard {
  return {
    ...card,
    feedbackEntry: card.feedbackEntry
      ? {
          ...card.feedbackEntry,
          positiveKeywords: [...card.feedbackEntry.positiveKeywords],
          negativeKeywords: [...card.feedbackEntry.negativeKeywords]
        }
      : undefined
  };
}

// 内容卡片的发布时间统一在这里格式化，避免 hero / 标准卡各写一套时间兜底。
export function formatPublishedAt(value: string | null): string {
  if (!value) {
    return "发布时间未知";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "发布时间未知";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// 卡片标题只允许安全的 http(s) 链接，其他协议直接退回纯文本。
export function readSafeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// 反馈池摘要需要让人一眼看到自由文本，所以这里保留原文并顺手拼上结构化字段。
export function formatFeedbackSummary(entry: ContentFeedbackEntry | undefined): string | null {
  if (!entry) {
    return null;
  }

  const segments: string[] = [];

  if (entry.freeText?.trim()) {
    segments.push(entry.freeText.trim());
  }

  if (entry.suggestedEffect?.trim()) {
    segments.push(`建议动作：${entry.suggestedEffect.trim()}`);
  }

  if (entry.strengthLevel?.trim()) {
    segments.push(`强度：${entry.strengthLevel.trim()}`);
  }

  if (entry.positiveKeywords.length > 0) {
    segments.push(`关键词加分：${entry.positiveKeywords.join(", ")}`);
  }

  if (entry.negativeKeywords.length > 0) {
    segments.push(`关键词减分：${entry.negativeKeywords.join(", ")}`);
  }

  return segments.length > 0 ? segments.join(" · ") : "已保存反馈池建议";
}
