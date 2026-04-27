import { readAiTimelineFeedPageModel } from "../aiTimeline/aiTimelineFeedFile.js";
import type { AiTimelineEventRecord } from "../aiTimeline/aiTimelineTypes.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import { sendAiTimelineAlertEmail } from "../mail/sendAiTimelineAlertEmail.js";
import type { SendMail } from "../mail/sendEmailMessage.js";
import type { RuntimeConfig } from "../types/appConfig.js";
import {
  listSentAiTimelineAlertEventKeys,
  saveAiTimelineAlertRecord,
  type AiTimelineAlertChannelStatus
} from "./aiTimelineAlertRepository.js";
import { sendFeishuAiTimelineAlert } from "./sendFeishuAlert.js";

export type AiTimelineAlertCycleResult = {
  scannedEventCount: number;
  pendingEventCount: number;
  notifiedEventCount: number;
  failedEventCount: number;
};

export type AiTimelineAlertCycleDeps = {
  fetchImpl?: typeof fetch;
  sendMail?: SendMail;
};

// The alert cycle polls the feed, filters new S-level events, and records successful notifications for dedupe.
export async function runAiTimelineAlertCycle(
  config: RuntimeConfig,
  db: SqliteDatabase,
  deps: AiTimelineAlertCycleDeps = {}
): Promise<AiTimelineAlertCycleResult> {
  if (!config.aiTimelineAlerts.enabled) {
    return { scannedEventCount: 0, pendingEventCount: 0, notifiedEventCount: 0, failedEventCount: 0 };
  }

  const pageModel = await readAiTimelineFeedPageModel(config.aiTimelineFeed, {
    importanceLevels: ["S"],
    pageSize: 200
  });
  const sLevelEvents = pageModel.events.filter(isNotifiableSLevelEvent);
  const sentEventKeys = listSentAiTimelineAlertEventKeys(
    db,
    sLevelEvents.map((event) => event.eventKey)
  );
  const pendingEvents = sLevelEvents.filter((event) => !sentEventKeys.has(event.eventKey));
  let notifiedEventCount = 0;
  let failedEventCount = 0;

  for (const event of pendingEvents) {
    const result = await notifyAiTimelineEvent(config, event, deps);

    if (result.anyChannelSucceeded) {
      saveAiTimelineAlertRecord(db, {
        eventKey: event.eventKey,
        title: event.displayTitle,
        publishedAt: event.publishedAt,
        feishuStatus: result.feishuStatus,
        emailStatus: result.emailStatus,
        lastError: result.errors.length > 0 ? result.errors.join("; ") : null
      });
      notifiedEventCount += 1;
    } else {
      failedEventCount += 1;
    }
  }

  return {
    scannedEventCount: sLevelEvents.length,
    pendingEventCount: pendingEvents.length,
    notifiedEventCount,
    failedEventCount
  };
}

function isNotifiableSLevelEvent(event: AiTimelineEventRecord): event is AiTimelineEventRecord & { eventKey: string } {
  return (
    Boolean(event.eventKey) &&
    event.importanceLevel === "S" &&
    event.visibilityStatus !== "hidden" &&
    event.evidenceLinks.length > 0
  );
}

async function notifyAiTimelineEvent(
  config: RuntimeConfig,
  event: AiTimelineEventRecord,
  deps: AiTimelineAlertCycleDeps
) {
  const errors: string[] = [];
  const feishuStatus = await runChannel(
    config.aiTimelineAlerts.channels.feishu,
    async () => {
      await sendFeishuAiTimelineAlert(config, event, deps.fetchImpl ?? fetch);
    },
    errors,
    "feishu"
  );
  const emailStatus = await runChannel(
    config.aiTimelineAlerts.channels.email,
    async () => {
      await sendAiTimelineAlertEmail(config, event, deps.sendMail);
    },
    errors,
    "email"
  );

  return {
    feishuStatus,
    emailStatus,
    errors,
    anyChannelSucceeded: feishuStatus === "sent" || emailStatus === "sent"
  };
}

async function runChannel(
  enabled: boolean,
  send: () => Promise<void>,
  errors: string[],
  channelName: string
): Promise<AiTimelineAlertChannelStatus> {
  if (!enabled) {
    return "skipped";
  }

  try {
    await send();
    return "sent";
  } catch (error) {
    errors.push(`${channelName}: ${error instanceof Error ? error.message : String(error)}`);
    return "failed";
  }
}
