import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server/createServer.js";
import { createTestDatabase } from "../helpers/testDatabase.js";

const marker = "人工强制重写 · 待人工审核";

describe("强制新稿交付", () => {
  it.each(["article", "short_content"])("%s 保留原稿并新建风险稿，交付重放不插入或覆盖", async (direction) => {
    const handle = await createTestDatabase("hot-now-force-delivery-");
    const app = createServer({ db: handle.db, creativeApiToken: "test-only" });
    const headers = { "x-creative-token": "test-only" };
    try {
      const source = await app.inject({ method: "POST", url: "/api/creative/source-items", headers,
        payload: { externalId: "source-original", collectorAgent: "test-force-agent", title: "原素材", url: "https://example.com/source", direction } });
      expect(source.statusCode).toBe(201);
      const body = { sourceExternalId: "source-original", collectorAgent: "test-force-agent", direction, contentMarkdown: "保留原稿", status: "generated" };
      const original = await app.inject({ method: "POST", url: "/api/creative/finished-articles", headers, payload: body });
      expect(original.statusCode).toBe(201);
      const forcedBody = { ...body, contentMarkdown: "人工强制新稿", status: direction === "article" ? "needs_review" : "draft", allowDuplicate: true,
        needsManualReview: true, manualReviewReason: marker, manualReviewReasons: ["原任务 blocked-one：证据不足", "本次质检未通过"] };
      const forced = await app.inject({ method: "POST", url: "/api/creative/finished-articles", headers, payload: forcedBody });
      expect(forced.statusCode).toBe(201);
      expect(forced.json().id).not.toBe(original.json().id);
      const replay = await app.inject({ method: "POST", url: "/api/creative/finished-articles", headers,
        payload: { ...forcedBody, contentMarkdown: "不得覆盖原新稿" } });
      expect(replay.statusCode).toBe(201);
      expect(replay.json()).toMatchObject({ id: forced.json().id, created: false });
      const list = await app.inject({ method: "GET", url: `/api/creative/finished-articles?direction=${direction}&view=summary`, headers });
      expect(list.json().items).toHaveLength(2);
      const newArticle = list.json().items.find((item: { id: number }) => item.id === forced.json().id);
      expect(newArticle.status).toBe("needs_review");
      expect(newArticle.manualReviewReason).toBe(marker);
      expect(newArticle.manualReviewReasons).toEqual(["原任务 blocked-one：证据不足", "本次质检未通过"]);
      expect(newArticle.contentMarkdown).toBe("人工强制新稿");
      const oldArticle = list.json().items.find((item: { id: number }) => item.id === original.json().id);
      expect(oldArticle.contentMarkdown).toBe("保留原稿");
    } finally { await app.close(); handle.close(); }
  });
});
