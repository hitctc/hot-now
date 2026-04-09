import type { ContentCard, ContentFeedbackEntry } from "../../services/contentApi";

// 这些常量把内容页常用的卡片、标签和按钮样式集中起来，避免每个组件重复拼一长串 Tailwind class。
export const editorialContentPanelClass =
  "rounded-editorial-lg border border-editorial-border bg-editorial-panel";

export const editorialContentCardClass = `${editorialContentPanelClass} shadow-editorial-card`;

export const editorialContentFloatingPanelClass =
  "rounded-editorial-md border border-editorial-border bg-editorial-panel";

export const editorialContentInsetPanelClass =
  "rounded-editorial-md border border-editorial-border bg-editorial-panel";

export const editorialContentSubpanelClass =
  "rounded-editorial-md border border-editorial-border bg-editorial-panel";

export const editorialContentMetaClass =
  "flex flex-wrap items-center gap-2 text-[11px] font-medium text-editorial-text-muted";

export const editorialContentBadgeClass =
  "inline-flex items-center rounded-editorial-pill bg-editorial-link px-2.5 py-1 text-[11px] font-medium leading-5 text-editorial-text-body";

export const editorialContentScoreBadgeClass =
  "inline-flex items-center rounded-editorial-pill bg-editorial-link-active px-2.5 py-1 text-[11px] font-medium leading-5 text-editorial-text-main";

export const editorialContentFeedbackSummaryClass =
  "flex flex-col gap-2 rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-3";

export const editorialContentControlButtonClass =
  "!inline-flex !select-none !items-center !rounded-editorial-sm !border !px-3 !py-1.5 !text-xs !font-medium !leading-5 !transition";

export const editorialContentControlButtonIdleClass =
  "!border-editorial-border !bg-editorial-panel !text-editorial-text-body hover:!border-editorial-border hover:!bg-editorial-link-active hover:!text-editorial-text-main";

export const editorialContentControlButtonDangerClass =
  "!border-editorial-border !bg-transparent !text-editorial-text-body hover:!border-editorial-border hover:!bg-editorial-link-active hover:!text-editorial-text-main";

export const editorialContentControlButtonActiveClass =
  "!border-editorial-border !bg-editorial-link-active !text-editorial-text-main hover:!border-editorial-border hover:!bg-editorial-link-active hover:!text-editorial-text-main";

export const editorialContentPageClass = "flex w-full flex-col gap-6";

export const editorialContentIntroSectionClass =
  "flex flex-col gap-3";

export const editorialContentFeaturedSectionClass = "grid gap-6";

export const editorialContentListSectionClass = "flex flex-col gap-1";

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

  return segments.length > 0 ? segments.join(" · ") : "已保存到反馈池";
}
