import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../../src/server/createServer.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
});

describe("creative daily digest routes", () => {
  it("creates and replaces a digest for the same date through the Agent token API", async () => {
    const handle = await createTestDatabase("hot-now-daily-digest-route-");
    handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const payload = {
      date: "2026-08-01",
      title: "AI 日报",
      contentMarkdown: "第一版正文",
      totalItems: 2,
      categories: ["模型"],
      collectorAgent: "hermes",
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/creative/daily-digests",
      headers: { "x-creative-token": "test-token" },
      payload,
    });
    expect(created.statusCode).toBe(201);

    const replaced = await app.inject({
      method: "POST",
      url: "/api/creative/daily-digests",
      headers: { "x-creative-token": "test-token" },
      payload: { ...payload, title: "AI 日报（更新）", contentMarkdown: "第二版正文" },
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json()).toMatchObject({
      id: created.json().id,
      title: "AI 日报（更新）",
      contentMarkdown: "第二版正文",
      status: "generated",
    });
    await app.close();
  });

  it("updates a digest status through the Agent token API", async () => {
    const handle = await createTestDatabase("hot-now-daily-digest-status-route-");
    handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const created = await app.inject({
      method: "POST",
      url: "/api/creative/daily-digests",
      headers: { "x-creative-token": "test-token" },
      payload: {
        date: "2026-08-02",
        title: "状态测试",
        contentMarkdown: "正文",
        totalItems: 1,
        categories: [],
        collectorAgent: "hermes",
      },
    });

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/creative/daily-digests/${created.json().id}`,
      headers: { "x-creative-token": "test-token" },
      payload: { status: "published" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id: created.json().id, status: "published" });
    await app.close();
  });
});
