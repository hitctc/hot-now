import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server/createServer.js";
import { createTestDatabase } from "../helpers/testDatabase.js";

describe("短内容领域交付", () => {
  it("保存并在成品摘要列表返回领域追踪，不增加旧稿分类", async () => {
    const handle = await createTestDatabase("hot-now-short-domain-");
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const headers = { "x-creative-token": "test-token" };
    try {
      const source = await app.inject({ method: "POST", url: "/api/creative/source-items", headers,
        payload: { externalId: "short-rss-test", collectorAgent: "short-rss-juya-ai-daily", title: "AI 工具上线",
          url: "https://example.com/short-domain", direction: "short_content" } });
      expect(source.statusCode).toBe(201);
      const meta = { editorialFocus: "tech-ai-v1", contentDomain: "ai" };
      const finished = await app.inject({ method: "POST", url: "/api/creative/finished-articles", headers,
        payload: { sourceExternalId: "short-rss-test", collectorAgent: "short-content-writer", direction: "short_content",
          contentMarkdown: "已核实的正文", status: "ready", stepTrace: [{ step: 1, stepName: "短内容写作", status: "success", meta }] } });
      expect(finished.statusCode).toBe(201);
      const list = await app.inject({ method: "GET", url: "/api/creative/finished-articles?direction=short_content&view=summary", headers });
      expect(list.statusCode).toBe(200);
      expect(list.json().items[0].status).toBe("ready_for_publish");
      expect(list.json().items[0].stepTrace[0].meta).toEqual(meta);
      const duplicate = await app.inject({ method: "POST", url: "/api/creative/finished-articles", headers,
        payload: { sourceExternalId: "short-rss-test", collectorAgent: "short-content-writer", direction: "short_content", contentMarkdown: "不能重写原稿" } });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().reason).toBe("article-already-exists");
    } finally {
      await app.close();
      handle.close();
    }
  });
});
