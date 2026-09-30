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
  it("Hermes 排队后立即返回任务 ID，不等待模型生成", async () => {
    const handle = await createTestDatabase("hot-now-regen-intro-queued-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const created = await app.inject({ method: "POST", url: "/actions/creative/finished-articles/manual", payload: { title: "排队文章", direction: "article" } });
    const id = created.json().id as number;
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, taskId: "intro-42", status: "queued" }), { status: 202 }));

    const response = await app.inject({ method: "POST", url: `/api/creative/finished-articles/${id}/regen-intro` });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ ok: true, taskId: "intro-42", status: "queued" });
    expect(findCreativeFinishedArticleById(handle.db, id)?.intros ?? []).toHaveLength(0);
    await app.close();
  });

  it("带鉴权的任务回调只保存一次导语，状态查询返回已保存的结果", async () => {
    const handle = await createTestDatabase("hot-now-regen-intro-complete-");
    handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const created = await app.inject({ method: "POST", url: "/actions/creative/finished-articles/manual", payload: { title: "异步导语", direction: "article" } });
    const id = created.json().id as number;
    const path = `/actions/creative/finished-articles/${id}/regen-intro/complete`;
    const payload = { taskId: "intro-42", expectedUpdatedAt: findCreativeFinishedArticleById(handle.db, id)?.updatedAt, intro: "一项新服务已开始改变用户的选择，本文核对它的实际影响与使用边界。" };
    const rejected = await app.inject({ method: "POST", url: path, payload });
    expect(rejected.statusCode).toBe(401);
    const invalid = await app.inject({ method: "POST", url: path, headers: { "x-creative-token": "test-token" }, payload: { intro: "新" } });
    expect(invalid.statusCode).toBe(400);
    handle.db.prepare("UPDATE creative_finished_articles SET intros = ? WHERE id = ?").run(JSON.stringify(["并发保存的导语"]), id);
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({ method: "POST", url: path, headers: { "x-creative-token": "test-token" }, payload });
      expect(response.statusCode).toBe(200);
    }
    expect(findCreativeFinishedArticleById(handle.db, id)?.intros).toEqual([payload.intro, "并发保存的导语"]);
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, taskId: "intro-42", status: "done" }), { status: 200 }));
    const status = await app.inject({ method: "GET", url: `/api/creative/finished-articles/${id}/regen-intro/status?taskId=intro-42` });
    expect(status.json()).toMatchObject({ ok: true, status: "done", intros: [payload.intro, "并发保存的导语"] });
    await app.close();
  });
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

  it("旧同步响应也校验原版本，生成期间变更后停止回写而不合并",  async () => {
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
    expect(response.statusCode).toBe(409);
    expect(findCreativeFinishedArticleById(handle.db, id)?.intros).toEqual(["并发保存的导语"]);
    await app.close();
  });

  it("真实 HTTP 回调在人工编辑后拒绝旧版本，缺失版本也不写入", async () => {
    const handle = await createTestDatabase("hot-now-intro-http-conflict-");
    handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    try {
      const created = await app.inject({ method: "POST", url: "/actions/creative/finished-articles/manual", payload: { title: "隔离验收文章", direction: "article" } });
      const id = created.json().id as number;
      const oldVersion = findCreativeFinishedArticleById(handle.db, id)!.updatedAt;
      const origin = await app.listen({ host: "127.0.0.1", port: 0 });
      const edited = await fetch(`${origin}/api/creative/finished-articles/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ humanMarkdown: "用户刚刚保存的正文", expectedUpdatedAt: oldVersion }) });
      expect(edited.status).toBe(200);
      const intro = "这是隔离验收的导语，仅用于验证旧版本结果不会覆盖人工编辑。";
      const callback = `${origin}/actions/creative/finished-articles/${id}/regen-intro/complete`;
      const stale = await fetch(callback, { method: "POST", headers: { "x-creative-token": "test-token", "Content-Type": "application/json" },
        body: JSON.stringify({ intro, expectedUpdatedAt: oldVersion }) });
      expect(stale.status).toBe(409);
      const missing = await fetch(callback, { method: "POST", headers: { "x-creative-token": "test-token", "Content-Type": "application/json" }, body: JSON.stringify({ intro }) });
      expect(missing.status).toBe(400);
      const article = findCreativeFinishedArticleById(handle.db, id)!;
      expect(article.humanMarkdown).toBe("用户刚刚保存的正文");
      expect(article.intros ?? []).toHaveLength(0);
      expect(handle.db.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally { await app.close(); }
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
