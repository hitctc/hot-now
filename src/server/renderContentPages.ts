import type { ContentCardView, ContentViewKey } from "../core/content/listContentView.js";

type ContentPageView = {
  viewKey: ContentViewKey;
  cards: ContentCardView[];
};

const pageSubtitle: Record<ContentViewKey, string> = {
  hot: "按最近时间优先展示统一内容池中的热点条目。",
  articles: "优先展示摘要和正文更完整、适合深读的内容。",
  ai: "优先展示 AI 关键词命中更高，同时兼顾时效性。"
};

export function renderContentPage(view: ContentPageView): string {
  // The page body is generated as plain HTML so server routes can inject it into the shared shell layout.
  const cardsHtml = view.cards.length > 0
    ? view.cards.map((card) => renderContentCard(card)).join("")
    : `<section class="content-empty content-empty--signal"><h3>今天还没有可展示的内容</h3><p>可以先去控制台手动触发一次抓取。</p></section>`;

  return `
    <section class="content-intro content-intro--signal">
      <p class="content-kicker">内容菜单</p>
      <p class="content-description">${escapeHtml(pageSubtitle[view.viewKey])}</p>
    </section>
    <section class="content-stack content-stack--signal">
      ${cardsHtml}
    </section>
  `;
}

function renderContentCard(card: ContentCardView): string {
  // Each card carries its content id in data attributes so site.js can post interaction updates.
  const summaryText = card.summary?.trim() || "暂无摘要";
  const publishedText = formatPublishedAt(card.publishedAt);
  const favoritePressed = card.isFavorited ? "true" : "false";
  const likePressed = card.reaction === "like" ? "true" : "false";
  const dislikePressed = card.reaction === "dislike" ? "true" : "false";
  const contentScoreLabel = String(card.contentScore);
  const titleHtml = renderTitleLink(card.title, card.canonicalUrl);

  return `
    <article class="content-card content-card--signal" data-content-id="${card.id}">
      <div class="content-score-pill" aria-label="评分 ${escapeHtml(contentScoreLabel)}" title="评分 ${escapeHtml(contentScoreLabel)}">
        <span data-role="content-score">${escapeHtml(contentScoreLabel)}</span>
      </div>
      <header class="content-card-header content-card-header--signal">
        <p class="content-meta">
          <span>${escapeHtml(card.sourceName)}</span>
          <span>发布时间：${escapeHtml(publishedText)}</span>
        </p>
        <h3 class="content-title">
          ${titleHtml}
        </h3>
      </header>
      <div class="content-card-body">
        <div class="content-summary-shell">
          <p class="content-summary">${escapeHtml(summaryText)}</p>
        </div>
        ${renderScoreBadges(card.scoreBadges)}
        <div class="content-card-region content-card-region--actions">
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
        </div>
      </div>
    </article>
  `;
}

function renderScoreBadges(scoreBadges: string[]): string {
  // Score badges use a dedicated compact style so score explanations never compete with action buttons.
  if (scoreBadges.length === 0) {
    return "";
  }

  return `
    <div class="content-score-badges" aria-label="评分标签">
      ${scoreBadges.map((badge) => `<span class="content-score-badge">${escapeHtml(badge)}</span>`).join("")}
    </div>
  `;
}

function renderTitleLink(title: string, canonicalUrl: string): string {
  // Content links are whitelisted to http/https so untrusted schemes cannot be rendered as clickable href values.
  const safeUrl = toSafeHttpUrl(canonicalUrl);
  const escapedTitle = escapeHtml(title);

  if (!safeUrl) {
    return `<span class="content-title-link" title="${escapedTitle}">${escapedTitle}</span>`;
  }

  return `<a class="content-title-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" title="${escapedTitle}">${escapedTitle}</a>`;
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
