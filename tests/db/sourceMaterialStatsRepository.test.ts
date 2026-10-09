import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertCreativeSourceItem } from "../../src/core/creative/creativeSourceItemWriteRepository.js";
import { readDailySourceMaterialCounts } from "../../src/core/creative/sourceMaterialStatsRepository.js";
import type { TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createTestDatabase, insertTestContentItem } from "../helpers/testDatabase.js";

describe("sourceMaterialStatsRepository", () => {
  let handle: TestDatabaseHandle;

  beforeEach(async () => {
    handle = await createTestDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it("groups Juya fetched time and AI HOT collector time by Beijing date", () => {
    insertTestContentItem(handle.db, { fetchedAt: "2026-10-06T16:00:00.000Z", canonicalUrl: "https://example.com/juya-7" });
    insertTestContentItem(handle.db, { fetchedAt: "2026-10-07T16:10:00.000Z", canonicalUrl: "https://example.com/juya-8" });
    insertTestContentItem(handle.db, { fetchedAt: "2026-10-08T16:30:00.000Z", canonicalUrl: "https://example.com/juya-9" });
    insertTestContentItem(handle.db, { fetchedAt: "2026-10-09T16:10:00.000Z", canonicalUrl: "https://example.com/juya-outside" });
    insertTestContentItem(handle.db, {
      sourceKind: "openai",
      fetchedAt: "2026-10-07T16:10:00.000Z",
      canonicalUrl: "https://example.com/not-juya"
    });

    /** 插入指定采集时间与采集器的测试素材，用于验证来源隔离和北京时间分桶。 */
    const insertAiHot = (externalId: string, collectorAgent: string, collectorTimestamp: string) => insertCreativeSourceItem(
      handle.db,
      {
        externalId,
        collectorAgent,
        title: externalId,
        url: `https://example.com/${externalId}`,
        collectorTimestamp
      }
    );
    insertAiHot("aihot-7a", "aihot-collector", "2026-10-06T16:00:00.000Z");
    insertAiHot("aihot-7b", "aihot-collector", "2026-10-07T15:59:00.000Z");
    insertAiHot("aihot-9", "aihot-collector", "2026-10-08T16:00:00.000Z");
    insertAiHot("other-agent", "other-collector", "2026-10-07T16:00:00.000Z");

    expect(readDailySourceMaterialCounts(handle.db, "2026-10-07", "2026-10-09")).toEqual([
      { date: "2026-10-07", juyaRssCount: 1, aiHotCount: 2 },
      { date: "2026-10-08", juyaRssCount: 1, aiHotCount: 0 },
      { date: "2026-10-09", juyaRssCount: 1, aiHotCount: 1 }
    ]);
  });
});
