type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};

type RenderConfig = {
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
    bodyHtml: `
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    `
  });
}

// The control page only needs a compact snapshot of the active schedule and SMTP target.
export function renderControlPage(config: RenderConfig = {}, running: boolean) {
  const dailyTime = config.schedule?.dailyTime ?? "未配置";
  const topN = config.report?.topN ?? "未配置";
  const recipient = config.smtp?.to ?? "未配置";
  const dataDir = config.report?.dataDir ?? "未配置";

  return renderLegacyDocument({
    pageKind: "control",
    title: "HotNow 控制台",
    bodyHtml: `
      <h1>HotNow 控制台</h1>
      <p>每日执行时间：${escapeHtml(String(dailyTime))}</p>
      <p>Top N：${escapeHtml(String(topN))}</p>
      <p>报告目录：${escapeHtml(String(dataDir))}</p>
      <p>收件邮箱：${escapeHtml(String(recipient))}</p>
      <p>任务状态：${running ? "执行中" : "空闲"}</p>
      <form method="post" action="/actions/run">
        <button type="submit"${running ? " disabled" : ""}>立即生成一次</button>
      </form>
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
    bodyHtml: `
      <h1>历史报告</h1>
      <ul>${items}</ul>
    `
  });
}

type LegacyPageKind = "notice" | "control" | "history";

type LegacyDocumentConfig = {
  pageKind: LegacyPageKind;
  title: string;
  bodyHtml: string;
};

// A tiny wrapper keeps the old pages on the shared theme resources without turning them into the unified shell.
function renderLegacyDocument(config: LegacyDocumentConfig) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(config.title)}</title>
    <link rel="stylesheet" href="/assets/site.css" />
    <script src="/assets/site.js" defer></script>
  </head>
  <body class="legacy-page legacy-page--${config.pageKind}">
    <main class="legacy-shell legacy-shell--${config.pageKind}">
      <section class="legacy-card legacy-card--${config.pageKind}">
        ${config.bodyHtml}
      </section>
    </main>
  </body>
</html>`;
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
