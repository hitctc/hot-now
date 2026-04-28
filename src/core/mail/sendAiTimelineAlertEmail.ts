import type { AiTimelineEventRecord } from "../aiTimeline/aiTimelineTypes.js";
import { formatAiTimelineDateTime } from "../aiTimeline/formatAiTimelineDateTime.js";
import type { RuntimeConfig } from "../types/appConfig.js";
import { sendEmailMessage, type SendMail } from "./sendEmailMessage.js";

// S-level alert email is intentionally short; the full context stays on the AI timeline page.
export async function sendAiTimelineAlertEmail(
  config: RuntimeConfig,
  event: AiTimelineEventRecord,
  sendMail?: SendMail
) {
  await sendEmailMessage(
    config,
    {
      from: config.smtp.user,
      to: config.smtp.to,
      subject: `AI S级事件提醒：${event.displayTitle}`,
      html: renderAiTimelineAlertEmailHtml(config, event)
    },
    sendMail
  );
}

// The email body mirrors the Feishu alert fields and keeps external feed text escaped.
function renderAiTimelineAlertEmailHtml(config: RuntimeConfig, event: AiTimelineEventRecord) {
  const timelineUrl = new URL("/ai-timeline", config.publicBaseUrl).toString();
  const officialLinks = event.evidenceLinks
    .slice(0, 3)
    .map((source) => `<li><a href="${escapeHtml(source.officialUrl)}">${escapeHtml(source.title)}</a></li>`)
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <body>
    <h1>AI S级事件提醒</h1>
    <h2>${escapeHtml(event.displayTitle)}</h2>
    <p>公司：${escapeHtml(event.companyName)}</p>
    <p>发布时间：${escapeHtml(formatAiTimelineDateTime(event.publishedAt))}</p>
    <p>重要性说明：${escapeHtml(event.importanceSummaryZh || event.displaySummaryZh || "暂无说明")}</p>
    <p>AI 时间线：<a href="${escapeHtml(timelineUrl)}">${escapeHtml(timelineUrl)}</a></p>
    <h3>官方来源</h3>
    <ul>${officialLinks}</ul>
  </body>
</html>`;
}

// Alert emails escape feed-controlled fields before embedding them into HTML.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
