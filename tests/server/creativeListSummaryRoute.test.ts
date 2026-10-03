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
    expect(articleSummary.json().dayCounts[0].pushCount).toBe(0);
    expect(articleFull.json().dayCounts[0].pushCount).toBe(0);

    await app.close();
  });

  it("preserves list/detail association shape and full-population counts", async () => {
    const handle = await createTestDatabase("hot-now-creative-read-model-");
    handles.push(handle);
    const source = insertCreativeSourceItem(handle.db, { externalId: "read-model", collectorAgent: "fixture", title: "关联素材", url: "https://example.invalid/source", sourceName: "fixture-source", trendScore: 91 });
    const first = insertCreativeFinishedArticle(handle.db, { sourceItemId: source.id, contentMarkdown: "合成正文", direction: "article" });
    insertCreativeFinishedArticle(handle.db, { sourceItemId: source.id, contentMarkdown: "第二篇合成正文", direction: "article" });
    handle.db.prepare("UPDATE creative_source_items SET linked_article_id = ? WHERE id = ?").run(first.id, source.id);
    const app = createServer({ db: handle.db });
    const list = await app.inject({ method: "GET", url: "/api/creative/finished-articles?view=summary&pageSize=1&direction=article" });
    expect(list.json().total).toBe(2);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0]).toMatchObject({ sourceTitle: "关联素材", sourceName: "fixture-source", trendScore: 91 });
    expect(list.json().dayCounts[0].articleCount).toBe(2);
    const detail = await app.inject({ method: "GET", url: `/api/creative/finished-articles/${first.id}` });
    expect(detail.json()).toMatchObject({ sourceTitle: "关联素材", trendScore: 91 });
    expect(detail.json()).not.toHaveProperty("sourceName");
    const sources = await app.inject({ method: "GET", url: "/api/creative/source-items?view=summary" });
    expect(sources.json().items[0]).toMatchObject({ linkedArticleCreatedAt: first.createdAt, linkedArticlePublished: false });
    const names = await app.inject({ method: "GET", url: "/api/creative/source-names" });
    expect(names.json()).toEqual(["fixture-source"]);
    const missing = await app.inject({ method: "GET", url: "/api/creative/finished-articles/999999" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ ok: false, reason: "not-found" });
    await app.close();
  });

  it("keeps empty associations absent in detail and preserves malformed association JSON errors", async () => {
    const handle = await createTestDatabase("hot-now-creative-read-history-");
    handles.push(handle);
    const manual = insertCreativeFinishedArticle(handle.db, { sourceItemId: null, contentMarkdown: "独立合成稿", direction: "article" });
    const source = insertCreativeSourceItem(handle.db, { externalId: "bad-json", collectorAgent: "fixture", title: "历史合成素材", url: "https://example.invalid/history" });
    const article = insertCreativeFinishedArticle(handle.db, { sourceItemId: source.id, contentMarkdown: "关联合成稿", direction: "article" });
    handle.db.prepare("UPDATE creative_source_items SET trend_breakdown = ? WHERE id = ?").run("broken-json", source.id);
    const app = createServer({ db: handle.db });
    const independent = await app.inject({ method: "GET", url: `/api/creative/finished-articles/${manual.id}` });
    expect(independent.statusCode).toBe(200);
    for (const field of ["trendScore", "trendBreakdown", "publishedAt", "sourceTitle", "sourceName"]) expect(independent.json()).not.toHaveProperty(field);
    const list = await app.inject({ method: "GET", url: "/api/creative/finished-articles?view=summary" });
    const detail = await app.inject({ method: "GET", url: `/api/creative/finished-articles/${article.id}` });
    expect(list.statusCode).toBe(500);
    expect(detail.statusCode).toBe(500);
    await app.close();
  });

  it("preserves token and session boundaries after route extraction", async () => {
    const handle = await createTestDatabase("hot-now-creative-list-auth-");
    handles.push(handle);
    const source = insertCreativeSourceItem(handle.db, {
      externalId: "route-auth-source",
      collectorAgent: "test",
      title: "路由鉴权测试",
      url: "https://example.com/route-auth-source"
    });
    const app = createServer({
      db: handle.db,
      creativeApiToken: "test-token",
      auth: {
        requireLogin: true,
        sessionSecret: "test-session-secret"
      }
    });

    const tokenHeaders = { "x-creative-token": "test-token" };
    const listResponse = await app.inject({
      method: "GET",
      url: "/api/creative/source-items?view=summary",
      headers: tokenHeaders
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/creative/source-items/${source.id}`,
      headers: tokenHeaders
    });
    const sourceNamesResponse = await app.inject({
      method: "GET",
      url: "/api/creative/source-names",
      headers: tokenHeaders
    });

    expect(listResponse.statusCode).toBe(200);
    expect(detailResponse.statusCode).toBe(200);
    expect(sourceNamesResponse.statusCode).toBe(401);

    await app.close();
  });
});
