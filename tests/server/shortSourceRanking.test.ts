import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/createServer.js";
import { insertCreativeFinishedArticle } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { parseSourceRanking } from "../../src/core/creative/sourceRanking.js";

const handles: TestDatabaseHandle[] = [];
const snapshot = { board: "百度热搜榜", rank: 3, capturedAt: "2026-10-06T12:30:00+0800", kind: "ranking" };
afterEach(() => { while (handles.length) handles.pop()?.close(); });

describe("短素材首次榜单快照", () => {
  it("原接口入库，轻列表与详情及关联短成品一致，重复回推不刷新排名", async () => {
    const handle = await createTestDatabase("short-source-ranking-"); handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    try {
      const payload = { externalId: "rank-fixture", collectorAgent: "hotsearch-baidu", title: "合成热点", url: "https://example.com/rank", sourceName: "百度热搜榜", direction: "short_content", sourceRanking: snapshot, fullContent: "正文不进入轻列表" };
      const response = await app.inject({ method: "POST", url: "/api/creative/source-items", headers: { "x-creative-token": "test-token" }, payload });
      expect(response.statusCode).toBe(201); const id = response.json().id;
      await app.inject({ method: "POST", url: "/api/creative/source-items", headers: { "x-creative-token": "test-token" }, payload: { ...payload, sourceRanking: { ...snapshot, rank: 1 } } });
      for (const path of [`/api/creative/source-items/${id}`, "/api/creative/source-items?direction=short_content&view=summary"]) {
        const r = await app.inject({ url: path, headers: { "x-creative-token": "test-token" } });
        expect(r.statusCode).toBe(200); const item = r.json().items?.[0] ?? r.json();
        expect(item.sourceRanking).toEqual(snapshot);
        if (r.json().items) { expect(item.rawPayloadJson).toBe(""); expect(item.fullContent).toBeNull(); }
      }
      const article = insertCreativeFinishedArticle(handle.db, { sourceItemId: id, direction: "short_content", titles: ["合成短稿"], contentMarkdown: "正文" });
      const detail = await app.inject({ url: `/api/creative/finished-articles/${article.id}`, headers: { "x-creative-token": "test-token" } });
      expect(detail.json()).toMatchObject({ sourceName: "百度热搜榜", sourceRanking: snapshot, sourceCollectorAgent: "hotsearch-baidu" });
      const articles = await app.inject({ url: "/api/creative/finished-articles?direction=short_content&view=summary", headers: { "x-creative-token": "test-token" } });
      expect(articles.json().items[0]).toMatchObject({ sourceRanking: snapshot, sourceName: "百度热搜榜" });
    } finally { await app.close(); }
  });
  it.each([0, -1, 1.5, "3", null])("拒绝无效名次%s，不写入素材", async (rank) => {
    const handle = await createTestDatabase("invalid-ranking-"); handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    try {
      const r = await app.inject({ method: "POST", url: "/api/creative/source-items", headers: { "x-creative-token": "test-token" }, payload: { externalId: "bad", collectorAgent: "hotsearch-baidu", title: "合成", url: "https://example.com", direction: "short_content", sourceRanking: { ...snapshot, rank } } });
      expect(r.statusCode).toBe(400);
      expect(handle.db.prepare("SELECT COUNT(*) AS n FROM creative_source_items").get()).toMatchObject({ n: 0 });
    } finally { await app.close(); }
  });
  it("拒绝给长素材写入榜位，不改变长素材合同", async () => {
    const handle = await createTestDatabase("long-ranking-guard-"); handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    try {
      const r = await app.inject({ method: "POST", url: "/api/creative/source-items", headers: { "x-creative-token": "test-token" }, payload: { externalId: "long", collectorAgent: "long", title: "长素材", url: "https://example.com", direction: "article", sourceRanking: snapshot } });
      expect(r.statusCode).toBe(400);
    } finally { await app.close(); }
  });
  it("不把精选或损坏时间当热搜排名", () => {
    expect(parseSourceRanking({ ...snapshot, kind: "selection", rank: null })).toMatchObject({ rank: null });
    expect(parseSourceRanking({ ...snapshot, capturedAt: "2026-10-06" })).toBeNull();
    expect(parseSourceRanking({ ...snapshot, kind: "selection", rank: 3 })).toBeNull();
  });
});
