type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};

type RenderConfig = {
  collectionSchedule?: { enabled?: boolean; intervalMinutes?: number };
  mailSchedule?: { enabled?: boolean; dailyTime?: string; timezone?: string };
  manualActions?: { collectEnabled?: boolean; sendLatestEmailEnabled?: boolean };
  report?: { topN?: number; dataDir?: string; allowDegraded?: boolean };
  schedule?: { enabled?: boolean; dailyTime?: string; timezone?: string };
  manualRun?: { enabled?: boolean };
  smtp?: { to?: string };
};

// Legacy pages now share the same theme assets as the unified shell, but keep their original layout and copy.
export function renderNoticePage(title: string, message: string) {
  return renderLegacyDocument({
    pageKind: "notice",
    title,
    eyebrow: "Legacy Notice",
    subtitle: "共享主题下的轻量提示页。",
    bodyHtml: `
      <section class="legacy-section">
        <h2 class="legacy-section-title">说明</h2>
        <p class="legacy-callout">${escapeHtml(message)}</p>
      </section>
    `
  });
}

// The control page only needs a compact snapshot of the active schedule and SMTP target.
export function renderControlPage(config: RenderConfig = {}, running: boolean) {
  const collectionInterval = formatCollectionInterval(config);
  const mailTime = config.mailSchedule?.dailyTime ?? config.schedule?.dailyTime ?? "未配置";
  const recipient = config.smtp?.to ?? "未配置";
  const dataDir = config.report?.dataDir ?? "未配置";
  const canTriggerManualCollect = config.manualActions?.collectEnabled ?? config.manualRun?.enabled ?? false;
  const canTriggerManualSendLatestEmail = config.manualActions?.sendLatestEmailEnabled ?? false;

  return renderLegacyDocument({
    pageKind: "control",
    title: "HotNow 控制台",
    eyebrow: "Operations",
    subtitle: "查看当前任务状态并执行手动操作。",
    bodyHtml: `
      <section class="legacy-section">
        <h2 class="legacy-section-title">运行摘要</h2>
        <dl class="legacy-meta-list">
          <div>
            <dt>采集周期</dt>
            <dd>${escapeHtml(collectionInterval)}</dd>
          </div>
          <div>
            <dt>发信时间</dt>
            <dd>${escapeHtml(String(mailTime))}</dd>
          </div>
          <div>
            <dt>报告目录</dt>
            <dd>${escapeHtml(String(dataDir))}</dd>
          </div>
          <div>
            <dt>收件邮箱</dt>
            <dd>${escapeHtml(String(recipient))}</dd>
          </div>
          <div>
            <dt>任务状态</dt>
            <dd>${running ? "执行中" : "空闲"}</dd>
          </div>
        </dl>
      </section>
      <section class="legacy-section">
        <h2 class="legacy-section-title">手动操作</h2>
        <div class="legacy-actions">
          <form method="post" action="/actions/collect">
            <button type="submit"${canTriggerManualCollect && !running ? "" : " disabled"}>手动执行采集</button>
          </form>
          <form method="post" action="/actions/send-latest-email">
            <button type="submit"${canTriggerManualSendLatestEmail && !running ? "" : " disabled"}>手动发送最新报告</button>
          </form>
        </div>
      </section>
    `
  });
}

// History stays a simple index so users can jump directly into a single day report.
export function renderHistoryPage(entries: ReportSummary[]) {
  const items = entries.length > 0
    ? entries
        .map(
          (entry) => `
        <li>
          <a href="/reports/${escapeHtml(entry.date)}">${escapeHtml(entry.date)}</a>
          | 主题数：${entry.topicCount}
          | 邮件：${escapeHtml(entry.mailStatus)}
          | 降级：${entry.degraded ? "是" : "否"}
        </li>`
        )
        .join("")
    : `<li>暂无历史报告</li>`;

  return renderLegacyDocument({
    pageKind: "history",
    title: "HotNow 历史报告",
    eyebrow: "Archive",
    subtitle: "查看已生成报告并快速跳转到对应日期。",
    bodyHtml: `
      <section class="legacy-section">
        <h2 class="legacy-section-title">报告列表</h2>
        <ul class="legacy-list">${items}</ul>
      </section>
    `
  });
}

type LegacyPageKind = "notice" | "control" | "history";

type LegacyDocumentConfig = {
  pageKind: LegacyPageKind;
  title: string;
  eyebrow: string;
  subtitle: string;
  bodyHtml: string;
};

// A tiny wrapper keeps the old pages on the shared theme resources without turning them into the unified shell.
function renderLegacyDocument(config: LegacyDocumentConfig) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(config.title)}</title>
    <link rel="icon" type="image/png" href="/brand/hotnow-favicon.png" />
    <link rel="stylesheet" href="/assets/site.css" />
    <script src="/assets/site.js" defer></script>
  </head>
  <body class="legacy-page legacy-page--${config.pageKind}">
    <main class="legacy-shell legacy-shell--${config.pageKind}">
      <header class="legacy-header legacy-header--${config.pageKind}">
        <div class="legacy-brand-lock">
          <img src="/brand/hotnow-logo-mark.png" alt="HotNow logo" class="legacy-brand-lock__logo" />
          <span class="legacy-brand-lock__text">HotNow</span>
        </div>
        <p class="legacy-eyebrow">${escapeHtml(config.eyebrow)}</p>
        <h1>${escapeHtml(config.title)}</h1>
        <p class="legacy-subtitle">${escapeHtml(config.subtitle)}</p>
      </header>
      <section class="legacy-card legacy-card--${config.pageKind}">
        ${config.bodyHtml}
      </section>
    </main>
  </body>
</html>`;
}

function formatCollectionInterval(config: RenderConfig) {
  // Legacy control keeps reading both old and new config names so page copy can shift without breaking partial migrations.
  const intervalMinutes = config.collectionSchedule?.intervalMinutes;

  if (typeof intervalMinutes === "number" && Number.isFinite(intervalMinutes) && intervalMinutes > 0) {
    return `每 ${intervalMinutes} 分钟`;
  }

  return "未配置";
}

// HTML escapes are centralized so the route layer can render raw report content safely.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── 404 页面 ──

export function renderNotFoundPage(requestPath: string) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>页面不存在 - 热讯平台HotNow</title>
    <link rel="icon" type="image/png" href="/brand/hotnow-favicon.png" />
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #f8f9fa;
        color: #1a1a2e;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        -webkit-font-smoothing: antialiased;
      }
      [data-theme="dark"] body, body.dark { background: #0f0f1a; color: #e0e0e0; }
      .not-found {
        text-align: center;
        padding: 3rem 2rem;
        max-width: 520px;
        width: 100%;
      }
      .not-found__code {
        font-size: 120px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: -4px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 1rem;
        user-select: none;
      }
      .not-found__title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 0.75rem;
      }
      .not-found__detail {
        font-size: 14px;
        line-height: 1.7;
        color: #6b7280;
        margin-bottom: 0.75rem;
      }
      .not-found__path {
        display: inline-block;
        font-family: "SF Mono", SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 13px;
        background: rgba(102, 126, 234, 0.08);
        border: 1px solid rgba(102, 126, 234, 0.15);
        border-radius: 6px;
        padding: 6px 14px;
        margin-bottom: 2rem;
        color: #764ba2;
        word-break: break-all;
      }
      .not-found__actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        flex-wrap: wrap;
      }
      .not-found__btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
        transition: all 0.15s ease;
        cursor: pointer;
        border: none;
      }
      .not-found__btn--primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
      }
      .not-found__btn--primary:hover { opacity: 0.9; transform: translateY(-1px); }
      .not-found__btn--secondary {
        background: #fff;
        color: #374151;
        border: 1px solid #e5e7eb;
      }
      .not-found__btn--secondary:hover { background: #f3f4f6; }
      .not-found__brand {
        margin-top: 3rem;
        font-size: 12px;
        color: #9ca3af;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .not-found__brand img { width: 18px; height: 18px; border-radius: 4px; }
      @media (prefers-color-scheme: dark) {
        body { background: #0f0f1a; color: #e0e0e0; }
        .not-found__title { color: #f3f4f6; }
        .not-found__detail { color: #9ca3af; }
        .not-found__path {
          background: rgba(102, 126, 234, 0.12);
          border-color: rgba(102, 126, 234, 0.25);
          color: #a78bfa;
        }
        .not-found__btn--secondary { background: #1f2937; color: #e5e7eb; border-color: #374151; }
        .not-found__btn--secondary:hover { background: #374151; }
        .not-found__brand { color: #6b7280; }
      }
    </style>
  </head>
  <body>
    <div class="not-found">
      <div class="not-found__code">404</div>
      <h1 class="not-found__title">页面不存在</h1>
      <p class="not-found__detail">你访问的页面可能已被移动、删除，或者地址输入有误。</p>
      <p class="not-found__path">${escapeHtml(requestPath)}</p>
      <div class="not-found__actions">
        <a href="/" class="not-found__btn not-found__btn--primary">返回首页</a>
        <button onclick="history.back()" class="not-found__btn not-found__btn--secondary">返回上页</button>
      </div>
      <div class="not-found__brand">
        <img src="/brand/hotnow-logo-mark.png" alt="" />
        热讯平台HotNow
      </div>
    </div>
  </body>
</html>`;
}
