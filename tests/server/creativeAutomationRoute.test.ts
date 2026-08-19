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
