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
  it.each(["pending", "ready", "writing", "done", "excluded", "skipped"])("syncs scoring only while a short source is pending: %s", async (status) => {
    const handle = await createTestDatabase("short-score-sync-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, { externalId: "sync-" + status, collectorAgent: "short-test", title: "短素材", url: "https://example.com/short", direction: "short_content", writingStatus: status as "pending" | "ready" | "writing" | "done" | "excluded" | "skipped" });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const response = await app.inject({ method: "POST", url: `/actions/creative/source-items/${item.id}/writing-status`, headers: { "x-creative-token": "test-token" }, payload: { writingStatus: "skipped", onlyIfPending: true } });
    expect(response.statusCode).toBe(200);
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe(status === "pending" ? "skipped" : status);
    if (status !== "pending") expect(response.json()).toMatchObject({ ok: true, unchanged: true });
    await app.close();
  });
  it.each([false, "yes"])("rejects invalid guard scope/input without changing long source: %s", async (invalidFlag) => {
    const handle = await createTestDatabase("score-guard-invalid-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, { externalId: "long-guard", collectorAgent: "test", title: "长素材", url: "https://example.com/long" });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const response = await app.inject({ method: "POST", url: `/actions/creative/source-items/${item.id}/writing-status`, headers: { "x-creative-token": "test-token" }, payload: { writingStatus: "ready", onlyIfPending: invalidFlag === false ? true : invalidFlag } });
    expect(response.statusCode).toBe(400);
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("pending");
    await app.close();
  });

  it.each(["pending", "ready", "writing", "done", "excluded", "skipped"])("worker terminal sync protects processed short source: %s", async (status) => {
    const handle = await createTestDatabase("short-terminal-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, { externalId: "terminal-" + status, collectorAgent: "short-test", title: "短素材", url: "https://example.com/terminal", direction: "short_content", writingStatus: status as "pending" | "ready" | "writing" | "done" | "excluded" | "skipped" });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const response = await app.inject({ method: "POST", url: `/actions/creative/source-items/${item.id}/writing-status`, headers: { "x-creative-token": "test-token" }, payload: { writingStatus: "skipped", onlyIfWritable: true, stopStep: 2, stopStepName: "短内容质检", stopReason: "计划不能写成事实" } });
    expect(response.statusCode).toBe(200);
    expect(findCreativeSourceItemById(handle.db, item.id)).toMatchObject(["pending", "ready", "writing"].includes(status) ? { writingStatus: "skipped", writingStopReason: "计划不能写成事实" } : { writingStatus: status, writingStopReason: null });
    await app.close();
  });

  it("syncs authoritative short selection score with evaluation outcome", async () => {
    const handle = await createTestDatabase("short-selection-score-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, { externalId: "selection", collectorAgent: "short-test", title: "短素材", url: "https://example.com/selection", direction: "short_content", writingStatus: "pending", score: 99 });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const response = await app.inject({ method: "POST", url: `/actions/creative/source-items/${item.id}/writing-status`, headers: { "x-creative-token": "test-token" }, payload: { writingStatus: "skipped", onlyIfPending: true, selectionScore: 62, stopStep: 1, stopStepName: "短内容选题", stopReason: "选题分62＜75；缺少关键事实" } });
    expect(response.statusCode).toBe(200);
    expect(findCreativeSourceItemById(handle.db, item.id)).toMatchObject({ score: 62, writingStopReason: "选题分62＜75；缺少关键事实" });
    await app.close();
  });

  it.each([-1, 101, 62.5, "62", null])("rejects invalid selection score %s without changing source", async (selectionScore) => {
    const handle = await createTestDatabase("invalid-selection-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, { externalId: "invalid-selection", collectorAgent: "short-test", title: "短素材", url: "https://example.com/invalid", direction: "short_content", writingStatus: "pending", score: 88 });
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const response = await app.inject({ method: "POST", url: `/actions/creative/source-items/${item.id}/writing-status`, headers: { "x-creative-token": "test-token" }, payload: { writingStatus: "ready", onlyIfPending: true, selectionScore } });
    expect(response.statusCode).toBe(400);
    expect(findCreativeSourceItemById(handle.db, item.id)).toMatchObject({ score: 88, writingStatus: "pending" });
    await app.close();
  });

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
