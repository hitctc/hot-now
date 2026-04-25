import { afterEach, describe, expect, it } from "vitest";
import { officialAiTimelineSources } from "../../src/core/aiTimeline/officialAiTimelineSources.js";
import {
  listAiTimelineSourceHealth,
  readAiTimelineHealthOverview,
  recordAiTimelineSourceRun
} from "../../src/core/aiTimeline/aiTimelineSourceHealthRepository.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("aiTimelineSourceHealthRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns the latest run for each official source", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-source-health-");
    handles.push(handle);
    const source = officialAiTimelineSources[0];

    recordAiTimelineSourceRun(handle.db, {
      sourceId: source.id,
      companyKey: source.companyKey,
      companyName: source.companyName,
      sourceLabel: source.sourceLabel,
      sourceKind: source.sourceKind,
      status: "failed",
      startedAt: "2026-04-25T08:00:00.000Z",
      finishedAt: "2026-04-25T08:00:01.000Z",
      errorMessage: "HTTP 403"
    });
    recordAiTimelineSourceRun(handle.db, {
      sourceId: source.id,
      companyKey: source.companyKey,
      companyName: source.companyName,
      sourceLabel: source.sourceLabel,
      sourceKind: source.sourceKind,
      status: "success",
      startedAt: "2026-04-25T09:00:00.000Z",
      finishedAt: "2026-04-25T09:00:02.000Z",
      fetchedItemCount: 12,
      candidateEventCount: 5,
      importantEventCount: 2,
      latestOfficialPublishedAt: "2026-04-25T07:30:00.000Z"
    });

    const health = listAiTimelineSourceHealth(handle.db, [source]);

    expect(health).toEqual([
      expect.objectContaining({
        sourceId: source.id,
        companyKey: source.companyKey,
        companyName: source.companyName,
        sourceLabel: source.sourceLabel,
        sourceKind: source.sourceKind,
        latestStatus: "success",
        latestStartedAt: "2026-04-25T09:00:00.000Z",
        latestFinishedAt: "2026-04-25T09:00:02.000Z",
        fetchedItemCount: 12,
        candidateEventCount: 5,
        importantEventCount: 2,
        latestOfficialPublishedAt: "2026-04-25T07:30:00.000Z",
        errorMessage: null
      })
    ]);
  });

  it("summarizes failed and stale source runs", async () => {
    const handle = await createTestDatabase("hot-now-ai-timeline-source-overview-");
    handles.push(handle);
    const [firstSource, secondSource, thirdSource] = officialAiTimelineSources;

    recordAiTimelineSourceRun(handle.db, {
      sourceId: firstSource.id,
      companyKey: firstSource.companyKey,
      companyName: firstSource.companyName,
      sourceLabel: firstSource.sourceLabel,
      sourceKind: firstSource.sourceKind,
      status: "failed",
      startedAt: "2026-04-25T08:00:00.000Z",
      finishedAt: "2026-04-25T08:00:01.000Z",
      errorMessage: "HTTP 403"
    });
    recordAiTimelineSourceRun(handle.db, {
      sourceId: secondSource.id,
      companyKey: secondSource.companyKey,
      companyName: secondSource.companyName,
      sourceLabel: secondSource.sourceLabel,
      sourceKind: secondSource.sourceKind,
      status: "stale",
      startedAt: "2026-04-25T08:10:00.000Z",
      finishedAt: "2026-04-25T08:10:01.000Z",
      latestOfficialPublishedAt: "2026-03-01T00:00:00.000Z"
    });
    recordAiTimelineSourceRun(handle.db, {
      sourceId: thirdSource.id,
      companyKey: thirdSource.companyKey,
      companyName: thirdSource.companyName,
      sourceLabel: thirdSource.sourceLabel,
      sourceKind: thirdSource.sourceKind,
      status: "success",
      startedAt: "2026-04-25T08:20:00.000Z",
      finishedAt: "2026-04-25T08:20:01.000Z"
    });

    expect(readAiTimelineHealthOverview(handle.db)).toMatchObject({
      latestCollectStartedAt: "2026-04-25T08:20:00.000Z",
      failedSourceCount: 1,
      staleSourceCount: 1
    });
  });
});
