import { afterEach, describe, expect, it } from "vitest";

import { insertCreativeFinishedArticle } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { insertCreativeSourceItem } from "../../src/core/creative/creativeSourceItemRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
});

describe("creative list summary routes", () => {
  it("keeps full responses compatible unless the UI requests summary mode", async () => {
    const handle = await createTestDatabase("hot-now-creative-list-summary-");
    handles.push(handle);
    const source = insertCreativeSourceItem(handle.db, {
      externalId: "summary-route-source",
      collectorAgent: "test",
      title: "列表摘要测试",
      url: "https://example.com/summary-route-source",
      fullContent: "素材完整正文".repeat(100)
    });
    insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "成品完整正文".repeat(100),
      evidencePack: { source: "detail-only" }
    });
    const app = createServer({ db: handle.db });

    const sourceSummary = await app.inject({
      method: "GET",
      url: "/api/creative/source-items?view=summary&pageSize=30"
    });
    const sourceFull = await app.inject({
      method: "GET",
      url: "/api/creative/source-items?pageSize=30"
    });
    const articleSummary = await app.inject({
      method: "GET",
      url: "/api/creative/finished-articles?view=summary&pageSize=30"
    });
    const articleFull = await app.inject({
      method: "GET",
      url: "/api/creative/finished-articles?pageSize=30"
    });

    expect(sourceSummary.json().items[0].fullContent).toBeNull();
    expect(sourceFull.json().items[0].fullContent).toContain("素材完整正文");
    expect(articleSummary.json().items[0].evidencePack).toBeNull();
    expect(articleFull.json().items[0].evidencePack).toEqual({ source: "detail-only" });

    await app.close();
  });
});
