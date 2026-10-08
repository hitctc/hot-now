import { afterEach, describe, expect, it, vi } from "vitest";

import { findCreativeSourceItemById } from "../../src/core/creative/creativeSourceItemRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  while (handles.length) handles.pop()?.close();
});

describe("creative automation Hermes proxy", () => {
  it("新素材只写入 HotNow 展示库，不创建本地自动评估任务", async () => {
    const handle = await createTestDatabase("hot-now-hermes-proxy-source-");
    handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });

    const response = await app.inject({
      method: "POST",
      url: "/api/creative/source-items",
      headers: { "x-creative-token": "test-token" },
      payload: {
        externalId: "agent-created", collectorAgent: "external-agent", title: "新长素材", url: "https://example.com/new", writingStatus: "ready",
      },
    });

    expect(response.statusCode).toBe(201);
    const id = response.json().id as number;
    expect(findCreativeSourceItemById(handle.db, id)?.writingStatus).toBe("pending");
    expect(handle.db.prepare("SELECT COUNT(*) AS count FROM creative_automation_jobs WHERE source_item_id = ?").get(id)).toEqual({ count: 0 });
    await app.close();
  });

  it("状态和控制请求都代理到 Hermes，不读取或写入 HotNow 自动化表", async () => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "token");
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, mode: "paused" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, mode: "running", stages: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createServer({});

    const status = await app.inject({ method: "GET", url: "/api/creative/automation/status" });
    const control = await app.inject({
      method: "POST",
      url: "/api/creative/automation/control",
      payload: { mode: "paused" },
    });

    expect(status.statusCode).toBe(200);
    expect(control.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://hermes.test/api/automation/control");

    const dailyPlan = await app.inject({
      method: "POST",
      url: "/api/creative/automation/daily-plan/run",
      payload: {},
    });
    expect(dailyPlan.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe("https://hermes.test/api/automation/daily-plan/run");
    await app.close();
  });

  it("短写候选快照只代理 Hermes 提供的顺位和替换记录", async () => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "token");
    const payload = { success: true, batch_started_at: "2026-10-05T00:00:00+08:00", prepared: true, pending_item_id: null, candidates: [{ item_id: 7, position: 2 }], replaced: [], short_write_tasks: [{ source_external_id: "feed-7", task_kind: "short_content_auto", status: "writing", phase_name: "短内容写作" }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = createServer({});
    const response = await app.inject({ method: "GET", url: "/api/creative/short-write-schedule" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("https://hermes.test/api/short/write-schedule", expect.objectContaining({ method: "GET" }));
    await app.close();
  });

  it.each(["auto", "tuwen", "duanwen"] as const)("短内容手动写作原样代理 %s 形态", async (form) => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const handle = await createTestDatabase(`hot-now-short-write-${form}-`);
    handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });

    const created = await app.inject({
      method: "POST",
      url: "/api/creative/source-items",
      headers: { "x-creative-token": "test-token" },
      payload: {
        externalId: `short-${form}`,
        collectorAgent: "short-content-writer",
        title: `${form} 素材`,
        url: `https://example.com/${form}`,
        direction: "short_content",
      },
    });
    const sourceItemId = created.json().id as number;

    const response = await app.inject({
      method: "POST",
      url: `/api/creative/source-items/${sourceItemId}/write-short`,
      payload: { externalId: `short-${form}`, form },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, status: "writing" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      external_id: `short-${form}`,
      form,
      source_item_id: sourceItemId,
    });
    await app.close();
  });

  it("短内容素材页自定义写作只投递指定的手动素材到短内容队列", async () => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, task_id: "short-manual-1" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const handle = await createTestDatabase("hot-now-manual-short-write-");
    handles.push(handle);
    const app = createServer({ db: handle.db });

    const response = await app.inject({
      method: "POST",
      url: "/actions/creative/source-items/manual-write",
      payload: { direction: "short_content", title: "手动热点", content: "用户输入的短内容原文", contentType: "article", form: "tuwen", thesis: "保留核心观点" },
    });

    expect(response.statusCode).toBe(202);
    const sourceItemId = response.json().sourceItemId as number;
    const source = findCreativeSourceItemById(handle.db, sourceItemId);
    expect(source).toMatchObject({ direction: "short_content", title: "手动热点", fullContent: "用户输入的短内容原文" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://hermes.test/api/short/write");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      source_item_id: sourceItemId,
      external_id: source?.externalId,
      form: "tuwen",
      manual_source: { title: "手动热点", content: "用户输入的短内容原文", thesis: "保留核心观点" },
    });
    await app.close();
  });

  it("短内容自定义写作拒绝长文模式，不留下错误方向的素材", async () => {
    const handle = await createTestDatabase("hot-now-manual-short-invalid-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const response = await app.inject({
      method: "POST", url: "/actions/creative/source-items/manual-write",
      payload: { direction: "short_content", content: "手动热点", form: "C" },
    });
    expect(response.statusCode).toBe(400);
    expect(handle.db.prepare("SELECT COUNT(*) AS count FROM creative_source_items").get()).toEqual({ count: 0 });
    await app.close();
  });

  it("长文自定义写作仍走原有长文入口", async () => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, task_id: "manual-article-1" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const handle = await createTestDatabase("hot-now-manual-article-write-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const response = await app.inject({
      method: "POST", url: "/actions/creative/source-items/manual-write",
      payload: { title: "长文素材", content: "手动输入的文章原文", thesis: "保留长文立意" },
    });
    expect(response.statusCode).toBe(202);
    expect(findCreativeSourceItemById(handle.db, response.json().sourceItemId)?.direction).toBe("article");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://hermes.test/api/write-article");
    await app.close();
  });

  it("手动写作只把人工意图代理给 Hermes", async () => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, task_id: "manual-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = createServer({});

    const response = await app.inject({
      method: "POST",
      url: "/api/creative/source-items/16212/write-article",
      payload: { thesis: "保留用户指定立意" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ ok: true, taskId: "manual-1" });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({ sourceItemId: 16212, automatic: false, thesis: "保留用户指定立意" });
    await app.close();
  });
});
