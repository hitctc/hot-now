import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length) handles.pop()?.close();
  vi.restoreAllMocks();
  delete process.env.HERMES_API_BASE_URL;
  delete process.env.HERMES_API_TOKEN;
});

describe("人工文案任务代理", () => {
  for (const operation of ["title", "keywords", "comments", "extensions", "summary", "cover-prompts", "image-prompts"] as const) {
    it(`${operation} 提交立即返回编号，状态查询不重复投递`, async () => {
      const handle = await createTestDatabase("hot-now-manual-text-");
      handles.push(handle);
      const app = createServer({ db: handle.db });
      try {
        const created = await app.inject({ method: "POST", url: "/actions/creative/finished-articles/manual", payload: { title: "测试文章", direction: "article" } });
        const id = created.json().id as number;
        process.env.HERMES_API_BASE_URL = "http://hermes.test";
        process.env.HERMES_API_TOKEN = "test-token";
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ success: true, taskId: "task-original", status: "queued" }), { status: 202 }))
          .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, taskId: "task-original", status: "done" })));
        const path = `/api/creative/finished-articles/${id}/manual-text/${operation}`;
        const submitted = await app.inject({ method: "POST", url: path });
        expect(submitted.statusCode).toBe(202);
        expect(submitted.json()).toMatchObject({ ok: true, taskId: "task-original" });
        expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ articleId: id, operation, expectedUpdatedAt: created.json().updatedAt, input: {} });
        const completed = await app.inject({ method: "GET", url: `${path}/status?taskId=task-original` });
        expect(completed.json()).toMatchObject({ ok: true, status: "done", article: { id } });
        expect(fetch.mock.calls[1][1]?.method).toBe("GET");
        const invalid = await app.inject({ method: "GET", url: `${path}/status` });
        expect(invalid.statusCode).toBe(400);
        expect(fetch).toHaveBeenCalledTimes(2);
      } finally { await app.close(); }
    });
  }
});
