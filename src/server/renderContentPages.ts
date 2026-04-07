import type { ContentCardView, ContentViewKey } from "../core/content/listContentView.js";

type ContentFeedbackEntryView = {
  freeText: string | null;
  suggestedEffect: string | null;
  strengthLevel: string | null;
  positiveKeywords: string[];
  negativeKeywords: string[];
};

type ContentCardViewWithFeedback = ContentCardView & {
  feedbackEntry?: ContentFeedbackEntryView;
};

type ContentPageView = {
  viewKey: ContentViewKey;
  cards: ContentCardViewWithFeedback[];
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected?: boolean }[];
    selectedSourceKinds: string[];
  };
  emptyState?: {
    title: string;
    description: string;
    tone?: "default" | "degraded" | "filtered";
  };
};

type ContentCardVariant = "featured" | "compact";

const pageSubtitle: Record<ContentViewKey, string> = {
  hot: "这里会承接已经开始形成热度的 AI 相关热点内容。",
  articles: "优先展示摘要和正文更完整、适合深读的内容。",
  ai: "优先展示最新 AI 新闻、模型、事件与智能体信号。"
};

export function renderContentPage(view: ContentPageView): string {
  // The page body is generated as plain HTML so server routes can inject it into the shared shell layout.
  const cardsHtml = view.cards.length > 0
    ? view.cards.map((card, index) => renderContentCard(view.viewKey, card, index)).join("")
    : renderEmptyState(view.emptyState);

  return `
    <section class="content-intro content-intro--signal content-intro--${view.viewKey}">
      <p class="content-kicker">内容菜单</p>
      <p class="content-description">${escapeHtml(pageSubtitle[view.viewKey])}</p>
      ${renderContentSourceFilter(view.sourceFilter)}
    </section>
    <section class="content-grid content-grid--${view.viewKey}">
      ${cardsHtml}
    </section>
  `;
}

function renderEmptyState(emptyState?: ContentPageView["emptyState"]): string {
  // Content tabs reuse one empty-state renderer so normal no-data and degraded-storage copy stay visually consistent.
  const title = emptyState?.title ?? "今天还没有可展示的内容";
  const description = emptyState?.description ?? "可以先去控制台手动触发一次抓取。";
  const toneClass = emptyState?.tone === "degraded"
    ? " content-empty--degraded"
    : emptyState?.tone === "filtered"
      ? " content-empty--filtered"
      : "";

  return `<section class="content-empty content-empty--signal${toneClass}"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></section>`;
}

function renderContentSourceFilter(sourceFilter?: ContentPageView["sourceFilter"]) {
  if (!sourceFilter || sourceFilter.options.length === 0) {
    return "";
  }

  const selectedKinds = new Set(sourceFilter.selectedSourceKinds);

  return `
    <form class="content-source-filter" data-content-source-filter data-selected-source-kinds="${escapeHtml(sourceFilter.selectedSourceKinds.join(","))}">
      <span class="content-source-filter-label">来源筛选</span>
      <div class="content-source-filter-options">
        ${sourceFilter.options
          .map(
            (source) => `
              <label class="content-source-filter-option">
                <input type="checkbox" data-source-kind="${escapeHtml(source.kind)}" ${selectedKinds.has(source.kind) ? "checked" : ""} />
                <span>${escapeHtml(source.name)}</span>
              </label>
            `
          )
          .join("")}
      </div>
      <div class="content-source-filter-actions">
        <button type="button" class="secondary-mini-button" data-source-filter-action="all">全选</button>
        <button type="button" class="secondary-mini-button" data-source-filter-action="clear">全不选</button>
      </div>
    </form>
  `;
}

function renderContentCard(viewKey: ContentViewKey, card: ContentCardViewWithFeedback, index: number): string {
  // Each card carries its content id in data attributes so site.js can post interaction updates.
  const variant = getCardVariant(viewKey, index);
  const summaryText = card.summary?.trim() || "暂无摘要";
  const publishedText = formatPublishedAt(card.publishedAt);
  const contentScoreLabel = String(card.contentScore);
  const titleHtml = renderTitleLink(card.title, card.canonicalUrl);
  const feedbackEntry = card.feedbackEntry;

  return `
    <article class="content-card content-card--${variant}" data-card-variant="${variant}" data-content-id="${card.id}" data-source-kind="${escapeHtml(card.sourceKind || "")}">
      <div class="content-score-pill" aria-label="评分 ${escapeHtml(contentScoreLabel)}" title="评分 ${escapeHtml(contentScoreLabel)}">
        <span data-role="content-score">${escapeHtml(contentScoreLabel)}</span>
      </div>
      <header class="content-card-header content-card-header--${variant}">
        <p class="content-meta">
          <span>${escapeHtml(card.sourceName)}</span>
          <span>发布时间：${escapeHtml(publishedText)}</span>
        </p>
        <h3 class="content-title">
          ${titleHtml}
        </h3>
      </header>
      ${renderContentBody(card, summaryText, variant, feedbackEntry)}
    </article>
  `;
}

function getCardVariant(viewKey: ContentViewKey, index: number): ContentCardVariant {
  // AI 新讯和 AI 热点都保留首条主卡，后续 Vue 迁移时可以在同一语义上继续细化版式。
  return (viewKey === "hot" || viewKey === "ai") && index === 0 ? "featured" : "compact";
}

function renderContentBody(
  card: ContentCardView,
  summaryText: string,
  variant: ContentCardVariant,
  feedbackEntry?: ContentFeedbackEntryView
): string {
  // The body helper keeps both card variants on one action contract while allowing density changes in CSS.

  return `
    <div class="content-card-body content-card-body--${variant}">
      <div class="content-summary-shell">
        <p class="content-summary">${escapeHtml(summaryText)}</p>
      </div>
      ${renderScoreBadges(card.scoreBadges)}
      <div class="content-card-region content-card-region--actions">
        <div class="content-actions">
          <button
            type="button"
            class="action-chip"
            data-content-action="feedback-panel-toggle"
            aria-expanded="false"
          >
            补充反馈
          </button>
        </div>
        ${renderFeedbackPanel(feedbackEntry)}
      </div>
    </div>
  `;
}

function renderFeedbackPanel(feedbackEntry?: ContentFeedbackEntryView): string {
  const freeText = feedbackEntry?.freeText?.trim() || "";
  const suggestedEffect = feedbackEntry?.suggestedEffect ?? "";
  const strengthLevel = feedbackEntry?.strengthLevel ?? "";
  const positiveKeywords = (feedbackEntry?.positiveKeywords ?? []).join(", ");
  const negativeKeywords = (feedbackEntry?.negativeKeywords ?? []).join(", ");

  return `
    <div class="content-feedback-panel" data-role="feedback-panel" hidden>
      <form class="content-feedback-form" data-content-feedback-form>
        <label class="content-feedback-field">
          <span>反馈说明</span>
          <textarea name="freeText" rows="3" placeholder="这里可以补充为什么值得保留、降权或屏蔽，或给管理员留策略建议。">${escapeHtml(freeText)}</textarea>
        </label>
        <div class="content-feedback-grid">
          <label class="content-feedback-field">
            <span>建议动作</span>
            <select name="suggestedEffect">
              ${renderSelectOption("", "未设置", suggestedEffect)}
              ${renderSelectOption("boost", "加分", suggestedEffect)}
              ${renderSelectOption("penalize", "减分", suggestedEffect)}
              ${renderSelectOption("block", "屏蔽", suggestedEffect)}
              ${renderSelectOption("neutral", "无影响", suggestedEffect)}
            </select>
          </label>
          <label class="content-feedback-field">
            <span>强度</span>
            <select name="strengthLevel">
              ${renderSelectOption("", "未设置", strengthLevel)}
              ${renderSelectOption("low", "低", strengthLevel)}
              ${renderSelectOption("medium", "中", strengthLevel)}
              ${renderSelectOption("high", "高", strengthLevel)}
            </select>
          </label>
          <label class="content-feedback-field">
            <span>关键词加分</span>
            <input type="text" name="positiveKeywords" value="${escapeHtml(positiveKeywords)}" placeholder="agent, workflow" />
          </label>
          <label class="content-feedback-field">
            <span>关键词减分</span>
            <input type="text" name="negativeKeywords" value="${escapeHtml(negativeKeywords)}" placeholder="融资, 快讯" />
          </label>
        </div>
        <div class="content-feedback-actions">
          <button type="submit" class="primary-mini-button">保存反馈池建议</button>
        </div>
      </form>
    </div>
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

function renderSelectOption(value: string, label: string, selectedValue: string): string {
  const selected = value === selectedValue ? ' selected="selected"' : "";
  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
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
