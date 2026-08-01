import { afterEach, describe, expect, it } from "vitest";

import {
  findCreativeSourceItemById,
  insertCreativeSourceItem
} from "../../src/core/creative/creativeSourceItemRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.close();
  }
});

describe("POST /actions/creative/source-items/:id/writing-status", () => {
  it("persists complete stop details from the creative API", async () => {
    const handle = await createTestDatabase("hot-now-writing-status-route-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "route-stop-1",
      collectorAgent: "route-test",
      title: "测试素材",
      url: "https://example.com/route-stop-1"
    });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });

    const response = await app.inject({
      method: "POST",
      url: `/actions/creative/source-items/${item.id}/writing-status`,
      headers: { "x-creative-token": "test-token" },
      payload: {
        writingStatus: "skipped",
        stopStep: 2,
        stopStepName: "普通人相关性判断",
        stopReason: "与普通人没有现实关联"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(findCreativeSourceItemById(handle.db, item.id)).toMatchObject({
      writingStatus: "skipped",
      writingStopStep: 2,
      writingStopStepName: "普通人相关性判断",
      writingStopReason: "与普通人没有现实关联"
    });
    await app.close();
  });

  it("rejects incomplete stop details", async () => {
    const handle = await createTestDatabase("hot-now-writing-status-route-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "route-stop-2",
      collectorAgent: "route-test",
      title: "测试素材",
      url: "https://example.com/route-stop-2"
    });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });

    const response = await app.inject({
      method: "POST",
      url: `/actions/creative/source-items/${item.id}/writing-status`,
      headers: { "x-creative-token": "test-token" },
      payload: {
        writingStatus: "skipped",
        stopStep: 2,
        stopReason: "与普通人没有现实关联"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-stop-details" });
    await app.close();
  });
});

describe("PUT /actions/creative/source-items/:id/account-fit", () => {
  it("persists account fit without changing writing status in shadow mode", async () => {
    const handle = await createTestDatabase("hot-now-account-fit-route-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "route-fit-1",
      collectorAgent: "route-test",
      title: "豆包开始收费",
      url: "https://example.com/route-fit-1"
    });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });

    const response = await app.inject({
      method: "PUT",
      url: `/actions/creative/source-items/${item.id}/account-fit`,
      headers: { "x-creative-token": "test-token" },
      payload: {
        level: "high",
        reason: "直接影响轻度用户的订阅选择",
        details: {
          targetReader: "偶尔使用豆包的普通职场人",
          readerScenario: "正在判断是否订阅",
          ordinaryImpact: "新增订阅成本",
          articleValue: "判断是否值得付费"
        },
        ruleVersion: "v1",
        updateWritingStatus: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(findCreativeSourceItemById(handle.db, item.id)).toMatchObject({
      writingStatus: "pending",
      accountFitLevel: "high",
      accountFitRuleVersion: "v1"
    });
    await app.close();
  });

  it("rejects unsupported account fit levels", async () => {
    const handle = await createTestDatabase("hot-now-account-fit-route-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "route-fit-2",
      collectorAgent: "route-test",
      title: "测试素材",
      url: "https://example.com/route-fit-2"
    });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });

    const response = await app.inject({
      method: "PUT",
      url: `/actions/creative/source-items/${item.id}/account-fit`,
      headers: { "x-creative-token": "test-token" },
      payload: {
        level: "unknown",
        reason: "invalid",
        details: {},
        ruleVersion: "v1"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-account-fit-payload" });
    await app.close();
  });
});
