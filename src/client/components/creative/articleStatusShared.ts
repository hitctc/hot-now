/**
 * 文章状态统一管理：状态标签、转换规则、推送条件检查。
 * 前后端共用同一套规则，列表页和详情页都从这里取。
 */

import { parseArticleImages, type CreativeFinishedArticle } from "../../services/creativeApi.js";

// ─── 状态标签 ───

export type ArticleStatus =
  | "queued"
  | "writing"
  | "generated"
  | "manual_draft"
  | "needs_review"
  | "ready_for_publish"
  | "wechat_draft"
  | "review_rejected"
  | "soft_deleted"
  | "anomaly"
  | "stopped"
  | "failed";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  queued:            { label: "排队中",     color: "blue" },
  writing:           { label: "写作中",     color: "processing" },
  generated:         { label: "已生成",     color: "blue" },
  manual_draft:      { label: "手动草稿",   color: "purple" },
  needs_review:      { label: "待审核",     color: "orange" },
  ready_for_publish: { label: "可推送",     color: "green" },
  wechat_draft:      { label: "已推送草稿", color: "#87cf84" },
  review_rejected:   { label: "审核不通过", color: "#999" },
  soft_deleted:      { label: "已删除",     color: "#999" },
  anomaly:           { label: "异常",       color: "red" },
  stopped:           { label: "已中止",     color: "default" },
  failed:            { label: "已失败",     color: "red" },
};

export function getStatusLabel(status: string): { label: string; color: string } {
  return STATUS_LABELS[status] ?? { label: status, color: "default" };
}

// ─── 推送条件检查（转换 #1 和 #6 共用） ───

function parseJsonArray(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * 读取展示用标题：优先取用户选中的发布标题（titleIndex），
 * 越界或为空时回退备选标题第一项，再为空显示“无标题”。
 */
export function getDisplayTitle(titles: string | string[] | null, titleIndex: number | null | undefined): string {
  const parsed = parseJsonArray(titles);
  const idx = typeof titleIndex === "number" && titleIndex >= 0 ? titleIndex : 0;
  return parsed[idx] ?? parsed[0] ?? "无标题";
}

/**
 * 检查文章是否满足标记推送的前置条件。
 * 管线稿保持原有 50 字门槛；手动稿只要求中栏存在非标题正文。
 */
export function checkPublishConditions(article: CreativeFinishedArticle): { qualified: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!article.coverImage || article.coverImage.length === 0) missing.push("缺少封面图");
  const titles = parseJsonArray(article.titles);
  if (titles.length === 0 || !titles[0]) missing.push("缺少标题");
  if (article.originType === "manual") {
    const bodyWithoutTitle = (article.humanMarkdown ?? "")
      .replace(/^!\[封面图[^\]]*\]\([^)]+\)\s*$/gm, "")
      .replace(/^\s*#\s+.+(?:\r?\n|$)/m, "")
      .replace(/^\s*\[IMAGE\d+\]\s*$/gm, "")
      .trim();
    if (!bodyWithoutTitle) missing.push("缺少正文");
  } else if (!article.contentMarkdown || article.contentMarkdown.length <= 50) {
    missing.push("缺少正文");
  }
  return { qualified: missing.length === 0, missing };
}

// ─── 可用操作 ───

export type ArticleAction =
  | { type: "mark_publishable"; label: "标记可推送" }
  | { type: "mark_publishable_disabled"; label: "不可推送"; missing: string[] }
  | { type: "cancel_publishable"; label: "取消推送标记" }
  | { type: "review"; label: "审核" };

/**
 * 根据当前状态和文章数据，返回可用操作列表。
 * 列表页和详情页的按钮都从这里取。
 */
export function getAvailableActions(article: CreativeFinishedArticle): ArticleAction[] {
  if (article.originType === "manual") return [];
  const status = article.status;
  const actions: ArticleAction[] = [];

  if (status === "queued" || status === "generated" || status === "anomaly") {
    const { qualified, missing } = checkPublishConditions(article);
    if (qualified) {
      actions.push({ type: "mark_publishable", label: "标记可推送" });
    } else {
      actions.push({ type: "mark_publishable_disabled", label: "不可推送", missing });
    }
  } else if (status === "ready_for_publish") {
    actions.push({ type: "cancel_publishable", label: "取消推送标记" });
  } else if (status === "needs_review") {
    actions.push({ type: "review", label: "审核" });
  }

  return actions;
}

/** 手动稿无需“标记可推送”，满足条件后可直接推送或再次推送。 */
export function canDirectlyPush(article: CreativeFinishedArticle): boolean {
  const statuses = article.originType === "manual"
    ? ["manual_draft", "wechat_draft"]
    : ["ready_for_publish", "wechat_draft"];
  return statuses.includes(article.status) && checkPublishConditions(article).qualified;
}
