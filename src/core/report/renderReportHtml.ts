import type { DailyReport } from "./buildDailyReport.js";

// This renders the report payload as a standalone HTML document without touching the filesystem or network.
export function renderReportHtml(report: DailyReport) {
  const topicHtml = report.topics.length > 0 ? report.topics.map(renderTopicSection).join("\n") : renderEmptyState();
  const sourceLinksHtml = renderSourceLinks(report.meta.issueUrls);
  const sourceKindsText = report.meta.sourceKinds.length > 0 ? report.meta.sourceKinds.map(escapeHtml).join(" / ") : "未记录";

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>HotNow ${escapeHtml(report.meta.date)}</title>
    <style>
      :root {
        color-scheme: light;
        --page-bg: #f6f1e8;
        --panel-bg: #fffdf8;
        --ink: #1f2328;
        --muted: #5f6b76;
        --border: #d9d2c4;
        --accent: #2f6f5e;
      }

      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(47, 111, 94, 0.08), transparent 28%),
          radial-gradient(circle at top right, rgba(47, 111, 94, 0.05), transparent 24%),
          var(--page-bg);
      }

      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 40px 24px 56px;
      }

      header {
        padding: 24px 28px;
        background: var(--panel-bg);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: 0 18px 42px rgba(31, 35, 40, 0.08);
      }

      h1, h2, h3, p {
        margin-top: 0;
      }

      h1 {
        margin-bottom: 12px;
        font-size: clamp(2rem, 4vw, 3.2rem);
        line-height: 1.05;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 20px;
      }

      .meta-card {
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(47, 111, 94, 0.06);
        border: 1px solid rgba(47, 111, 94, 0.12);
      }

      .section {
        margin-top: 24px;
        padding: 22px 24px;
        background: var(--panel-bg);
        border: 1px solid var(--border);
        border-radius: 24px;
      }

      .topic {
        padding-top: 18px;
        margin-top: 18px;
        border-top: 1px solid var(--border);
      }

      .topic:first-of-type {
        margin-top: 0;
        border-top: 0;
        padding-top: 0;
      }

      .topic h2 {
        font-size: 1.5rem;
        margin-bottom: 10px;
      }

      .topic p {
        color: var(--muted);
      }

      .topic strong {
        color: var(--ink);
      }

      ul {
        margin: 12px 0 0;
        padding-left: 1.2rem;
      }

      li + li {
        margin-top: 8px;
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      .empty {
        color: var(--muted);
        font-style: italic;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>HotNow 多源热点汇总 ${escapeHtml(report.meta.date)}</h1>
        <p>数据源：${sourceKindsText}</p>
        <p>来源入口：${sourceLinksHtml}</p>
        <div class="meta-grid">
          <div class="meta-card">生成时间：${escapeHtml(report.meta.generatedAt)}</div>
          <div class="meta-card">数据源数：${report.meta.sourceKinds.length}</div>
          <div class="meta-card">邮件状态：${escapeHtml(report.meta.mailStatus)}</div>
          <div class="meta-card">降级报告：${report.meta.degraded ? "是" : "否"}</div>
          <div class="meta-card">失败源数：${report.meta.sourceFailureCount}</div>
          <div class="meta-card">主题数量：${report.meta.topicCount}</div>
        </div>
      </header>

      <section class="section">
        ${topicHtml}
      </section>
    </main>
  </body>
</html>`;
}

// Each topic section stays self-contained so the report HTML can be rendered without extra templates.
function renderTopicSection(topic: DailyReport["topics"][number]) {
  const itemsHtml = topic.relatedItems
    .map(
      (item) => `
            <li>
              [#${item.sourceRank}] ${renderLink(item.sourceUrl, item.sourceTitle)}${item.articleOk ? "" : " <span>(降级抓取)</span>"}
            </li>`
    )
    .join("");

  return `
        <article class="topic">
          <h2>#${topic.rank} ${escapeHtml(topic.title)}</h2>
          <p><strong>分类：</strong>${escapeHtml(topic.category)}</p>
          <p><strong>摘要：</strong>${escapeHtml(topic.summary)}</p>
          <p><strong>为什么值得看：</strong>${escapeHtml(topic.whyItMatters)}</p>
          <p><strong>关键词：</strong>${topic.keywords.length > 0 ? topic.keywords.map(escapeHtml).join(" / ") : "无"}</p>
          <p><strong>关联条目：</strong>${topic.relatedCount}</p>
          <ul>
            ${itemsHtml}
          </ul>
        </article>`;
}

// When no topics are produced, the page should still explain that the pipeline ran successfully.
function renderEmptyState() {
  return `
        <p class="empty">今天还没有聚合出热点主题。</p>`;
}

// Links are rendered through a tiny helper so the report output stays safe and readable.
function renderLink(href: string, text: string) {
  const safeHref = escapeHtml(href);
  const safeText = escapeHtml(text);

  if (!href) {
    return safeText;
  }

  return `<a href="${safeHref}" target="_blank" rel="noreferrer noopener">${safeText}</a>`;
}

function renderSourceLinks(urls: string[]) {
  if (urls.length === 0) {
    return "暂无链接";
  }

  return urls.map((url) => renderLink(url, url)).join(" / ");
}

// The report is plain HTML, so all dynamic content needs a small escape helper.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
