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
    bodyHtml: `
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
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
    bodyHtml: `
      <h1>HotNow 控制台</h1>
      <p>采集周期：${escapeHtml(collectionInterval)}</p>
      <p>发信时间：${escapeHtml(String(mailTime))}</p>
      <p>报告目录：${escapeHtml(String(dataDir))}</p>
      <p>收件邮箱：${escapeHtml(String(recipient))}</p>
      <p>任务状态：${running ? "执行中" : "空闲"}</p>
      <form method="post" action="/actions/collect">
        <button type="submit"${canTriggerManualCollect && !running ? "" : " disabled"}>手动执行采集</button>
      </form>
      <form method="post" action="/actions/send-latest-email">
        <button type="submit"${canTriggerManualSendLatestEmail && !running ? "" : " disabled"}>手动发送最新报告</button>
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
