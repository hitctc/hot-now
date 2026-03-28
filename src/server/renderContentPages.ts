import type { ContentCardView, ContentViewKey } from "../core/content/listContentView.js";
import type { RatingDimension } from "../core/ratings/ratingRepository.js";

type ContentPageView = {
  viewKey: ContentViewKey;
  cards: ContentCardView[];
  dimensions: RatingDimension[];
};

const pageSubtitle: Record<ContentViewKey, string> = {
  hot: "按最近时间优先展示统一内容池中的热点条目。",
  articles: "优先展示摘要和正文更完整、适合深读的内容。",
  ai: "优先展示 AI 关键词命中更高，同时兼顾时效性。"
};

export function renderContentPage(view: ContentPageView): string {
  // The page body is generated as plain HTML so server routes can inject it into the shared shell layout.
  const cardsHtml = view.cards.length > 0
    ? view.cards.map((card) => renderContentCard(card, view.dimensions)).join("")
    : `<section class="content-empty"><h3>今天还没有可展示的内容</h3><p>可以先去控制台手动触发一次抓取。</p></section>`;

  return `
    <section class="content-intro">
      <p class="content-kicker">内容菜单</p>
      <p class="content-description">${escapeHtml(pageSubtitle[view.viewKey])}</p>
    </section>
    <section class="content-stack">
      ${cardsHtml}
    </section>
  `;
}

function renderContentCard(card: ContentCardView, dimensions: RatingDimension[]): string {
  // Each card carries its content id in data attributes so site.js can post interaction updates.
  const ratingLabel = card.averageRating === null ? "未评分" : card.averageRating.toFixed(2);
  const summaryText = card.summary?.trim() || "暂无摘要";
  const publishedText = formatPublishedAt(card.publishedAt);
  const favoritePressed = card.isFavorited ? "true" : "false";
  const likePressed = card.reaction === "like" ? "true" : "false";
  const dislikePressed = card.reaction === "dislike" ? "true" : "false";
  const titleHtml = renderTitleLink(card.title, card.canonicalUrl);

  return `
    <article class="content-card" data-content-id="${card.id}">
      <header class="content-card-header">
        <p class="content-meta">
          <span>${escapeHtml(card.sourceName)}</span>
          <span>发布时间：${escapeHtml(publishedText)}</span>
          <span>均分：<strong data-role="average-rating">${escapeHtml(ratingLabel)}</strong></span>
        </p>
        <h3 class="content-title">
          ${titleHtml}
        </h3>
      </header>
      <p class="content-summary">${escapeHtml(summaryText)}</p>
      <div class="content-actions">
        <button
          type="button"
          class="action-chip"
          data-content-action="favorite"
          data-favorited="${favoritePressed}"
          aria-pressed="${favoritePressed}"
        >
          ${card.isFavorited ? "已收藏" : "收藏"}
        </button>
        <button
          type="button"
          class="action-chip"
          data-content-action="reaction"
          data-reaction="like"
          aria-pressed="${likePressed}"
        >
          点赞
        </button>
        <button
          type="button"
          class="action-chip"
          data-content-action="reaction"
          data-reaction="dislike"
          aria-pressed="${dislikePressed}"
        >
          点踩
        </button>
      </div>
      <form class="rating-form" data-content-action="ratings">
        <div class="rating-grid">
          ${dimensions.map((dimension) => renderRatingField(dimension)).join("")}
        </div>
        <button type="submit" class="primary-mini-button">保存评分</button>
      </form>
      <p class="action-status" data-role="action-status" aria-live="polite"></p>
    </article>
  `;
}

function renderRatingField(dimension: RatingDimension) {
  // The rating form uses simple select boxes so page actions stay framework-free.
  return `
    <label class="rating-field">
      <span>${escapeHtml(dimension.name)}</span>
      <select name="${escapeHtml(dimension.key)}">
        <option value="">未选择</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
      </select>
    </label>
  `;
}

function renderTitleLink(title: string, canonicalUrl: string): string {
  // Content links are whitelisted to http/https so untrusted schemes cannot be rendered as clickable href values.
  const safeUrl = toSafeHttpUrl(canonicalUrl);

  if (!safeUrl) {
    return `<span>${escapeHtml(title)}</span>`;
  }

  return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`;
}

function toSafeHttpUrl(rawValue: string): string | null {
  try {
    const parsed = new URL(rawValue);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function formatPublishedAt(rawValue: string | null) {
  // Timestamps are normalized to a compact ISO-like format, with graceful fallback for legacy values.
  if (!rawValue) {
    return "未知";
  }

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    return rawValue;
  }

  return parsed.toISOString().slice(0, 16).replace("T", " ");
}

function escapeHtml(value: string): string {
  // Content cards render persisted external text, so all dynamic fields are escaped by default.
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
