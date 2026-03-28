import { createRequire } from "node:module";
import type { DailyReport } from "../report/buildDailyReport.js";
import type { RuntimeConfig } from "../types/appConfig.js";

type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

type SendMail = (message: EmailMessage) => Promise<unknown>;

const require = createRequire(import.meta.url);
const { createTransport } = require("nodemailer") as {
  createTransport: (options: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  }) => { sendMail(message: EmailMessage): Promise<unknown> };
};

// This sends one daily digest email and keeps the transport injectable so tests never need real SMTP.
export async function sendDailyEmail(config: RuntimeConfig, report: DailyReport, sendMail?: SendMail) {
  const message = buildEmailMessage(config, report);

  if (sendMail) {
    await sendMail(message);
    return;
  }

  const transport = createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });

  await transport.sendMail(message);
}

// The email body is kept deterministic so the daily report stays easy to scan in both mail and HTML views.
function buildEmailMessage(config: RuntimeConfig, report: DailyReport): EmailMessage {
  return {
    from: config.smtp.user,
    to: config.smtp.to,
    subject: `HotNow 多源热点汇总 ${report.meta.date}`,
    html: renderEmailHtml(config, report)
  };
}

// The email content mirrors the report summary without depending on the HTML report page.
function renderEmailHtml(config: RuntimeConfig, report: DailyReport) {
  const reportUrl = new URL(`/reports/${report.meta.date}`, config.smtp.baseUrl).toString();
  const sourceKindsText = report.meta.sourceKinds.length > 0 ? report.meta.sourceKinds.map(escapeHtml).join(" / ") : "未记录";
  const failureNotice =
    report.meta.sourceFailureCount > 0
      ? `<p>本次有 ${report.meta.sourceFailureCount} 个来源抓取失败：${escapeHtml(report.meta.failedSourceKinds.join(" / ") || "未记录")}</p>`
      : "";
  const topicHtml = report.topics
    .map(
      (topic) => `
        <li>
          <strong>#${topic.rank} ${escapeHtml(topic.title)}</strong>
          <div>${escapeHtml(topic.summary)}</div>
          <div>${escapeHtml(topic.whyItMatters)}</div>
        </li>`
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <body>
    <h1>HotNow 多源热点汇总 ${escapeHtml(report.meta.date)}</h1>
    <p>数据源：${sourceKindsText}</p>
    <p>网页报告：<a href="${escapeHtml(reportUrl)}">${escapeHtml(reportUrl)}</a></p>
    ${failureNotice}
    <ul>
      ${topicHtml}
    </ul>
  </body>
</html>`;
}

// Email HTML needs a tiny escape helper because the subject and summaries come from external sources.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
