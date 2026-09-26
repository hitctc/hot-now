import { afterEach, describe, expect, it, vi } from "vitest";
import { findCreativeFinishedArticleById } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length) handles.pop()?.close();
  vi.restoreAllMocks();
  delete process.env.HERMES_API_BASE_URL;
  delete process.env.HERMES_API_TOKEN;
});

describe("生成新导语代理", () => {
  it("仅在 HotNow 保存一次，并返回更新后的文章版本供详情继续同步正文", async () => {
    const handle = await createTestDatabase("hot-now-regen-intro-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const created = await app.inject({
      method: "POST", url: "/actions/creative/finished-articles/manual",
      payload: { title: "测试文章", direction: "article" },
    });
    const id = created.json().id as number;
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true, intro: "这项新服务已经开放，本文梳理它对用户的实际影响和适用边界。",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await app.inject({ method: "POST", url: `/api/creative/finished-articles/${id}/regen-intro` });
    const article = findCreativeFinishedArticleById(handle.db, id);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, intros: ["这项新服务已经开放，本文梳理它对用户的实际影响和适用边界。"], updatedAt: article?.updatedAt });
    expect(article?.intros).toHaveLength(1);
    await app.close();
  });

  it("模型生成期间有其他写入时基于最新导语合并，不覆盖并发更新", async () => {
    const handle = await createTestDatabase("hot-now-regen-intro-race-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const created = await app.inject({
      method: "POST", url: "/actions/creative/finished-articles/manual",
      payload: { title: "并发文章", direction: "article" },
    });
    const id = created.json().id as number;
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      handle.db.prepare("UPDATE creative_finished_articles SET intros = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(["并发保存的导语"]), "2030-01-01T00:00:00.000Z", id);
      return new Response(JSON.stringify({ success: true, intro: "这项新服务已经开放，本文梳理它对用户的实际影响和适用边界。" }), { status: 200 });
    });

    const response = await app.inject({ method: "POST", url: `/api/creative/finished-articles/${id}/regen-intro` });
    expect(response.statusCode).toBe(200);
    expect(findCreativeFinishedArticleById(handle.db, id)?.intros).toEqual([
      "这项新服务已经开放，本文梳理它对用户的实际影响和适用边界。", "并发保存的导语",
    ]);
    await app.close();
  });

  it("拒绝模型只返回一个字，不能作为成功导语落库", async () => {
    const handle = await createTestDatabase("hot-now-regen-intro-short-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const created = await app.inject({
      method: "POST", url: "/actions/creative/finished-articles/manual",
      payload: { title: "测试文章", direction: "article" },
    });
    const id = created.json().id as number;
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, intro: "新" }), { status: 200 }));

    const response = await app.inject({ method: "POST", url: `/api/creative/finished-articles/${id}/regen-intro` });
    expect(response.statusCode).toBe(502);
    expect(findCreativeFinishedArticleById(handle.db, id)?.intros ?? []).toHaveLength(0);
    await app.close();
  });
});
