import type { AiTimelineEventRecord } from "../aiTimeline/aiTimelineTypes.js";
import type { RuntimeConfig } from "../types/appConfig.js";

type FetchLike = typeof fetch;

// Feishu custom bots accept a single webhook POST, so the sender keeps no local session state.
export async function sendFeishuAiTimelineAlert(
  config: RuntimeConfig,
  event: AiTimelineEventRecord,
  fetchImpl: FetchLike = fetch
) {
  const webhookUrl = config.aiTimelineAlerts.feishuWebhookUrl?.trim();

  if (!webhookUrl) {
    throw new Error("FEISHU_ALERT_WEBHOOK_URL is not configured");
  }

  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msg_type: "text",
      content: {
        text: buildFeishuAlertText(config, event)
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Feishu alert failed with HTTP ${response.status}`);
  }

  const body = await readJsonBody(response);

  if (body && !isSuccessfulFeishuBody(body)) {
    throw new Error(`Feishu alert rejected: ${JSON.stringify(body)}`);
  }
}

// The text body is deliberately plain because Feishu text messages are the most stable webhook format.
function buildFeishuAlertText(config: RuntimeConfig, event: AiTimelineEventRecord) {
  const timelineUrl = new URL("/ai-timeline", config.publicBaseUrl).toString();
  const officialSource = event.evidenceLinks[0];

  return [
    "AI S级事件提醒",
    event.displayTitle,
    `公司：${event.companyName}`,
    `发布时间：${event.publishedAt}`,
    `重要性：${event.importanceSummaryZh || event.displaySummaryZh || "暂无说明"}`,
    officialSource ? `官方来源：${officialSource.title} ${officialSource.officialUrl}` : null,
    `查看时间线：${timelineUrl}`
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

async function readJsonBody(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isSuccessfulFeishuBody(body: Record<string, unknown>) {
  const code = body.code ?? body.Code ?? body.StatusCode ?? body.statusCode;

  if (typeof code === "number") {
    return code === 0;
  }

  return true;
}
