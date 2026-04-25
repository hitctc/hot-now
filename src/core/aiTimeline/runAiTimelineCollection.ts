import type { SqliteDatabase } from "../db/openDatabase.js";
import { upsertAiTimelineEvents } from "./aiTimelineEventRepository.js";
import {
  collectAiTimelineEvents,
  type CollectAiTimelineEventsOptions
} from "./aiTimelineCollector.js";
import { recordAiTimelineSourceRun } from "./aiTimelineSourceHealthRepository.js";
import { officialAiTimelineSources } from "./officialAiTimelineSources.js";

export type RunAiTimelineCollectionResult =
  | {
      accepted: true;
      action: "collect-ai-timeline";
      sourceCount: number;
      fetchedItemCount: number;
      persistedEventCount: number;
      insertedEventCount: number;
      updatedEventCount: number;
      skippedItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason: "no-ai-timeline-sources";
    };

export type RunAiTimelineCollectionOptions = CollectAiTimelineEventsOptions;

// 手动时间线采集只写 ai_timeline_events，不写普通内容池，避免官方事件进入新闻评分链路。
export async function runAiTimelineCollection(
  db: SqliteDatabase,
  options: RunAiTimelineCollectionOptions = {}
): Promise<RunAiTimelineCollectionResult> {
  const sources = options.sources ?? officialAiTimelineSources;

  if (sources.length === 0) {
    return { accepted: false, reason: "no-ai-timeline-sources" };
  }

  const collectionResult = await collectAiTimelineEvents({
    ...options,
    sources
  });
  const upsertResult = upsertAiTimelineEvents(db, collectionResult.events);
  const recordSourceRuns = db.transaction(() => {
    for (const sourceRun of collectionResult.sourceRuns) {
      recordAiTimelineSourceRun(db, sourceRun);
    }
  });

  recordSourceRuns();

  return {
    accepted: true,
    action: "collect-ai-timeline",
    sourceCount: sources.length,
    fetchedItemCount: collectionResult.fetchedItemCount,
    persistedEventCount: collectionResult.events.length,
    insertedEventCount: upsertResult.insertedCount,
    updatedEventCount: upsertResult.updatedCount,
    skippedItemCount: collectionResult.skippedItemCount,
    failureCount: collectionResult.failures.length
  };
}
