import { afterEach, describe, expect, it, vi } from "vitest";

import { CreativeAutomationService } from "../../src/core/creative/creativeAutomationService.js";
import {
  findCreativeSourceItemById,
  insertCreativeSourceItem,
  updateCreativeSourceItemAccountFit,
} from "../../src/core/creative/creativeSourceItemRepository.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  while (handles.length) handles.pop()?.close();
});

describe("CreativeAutomationService", () => {
  it("新长素材先待评估，高适配后再投递自动写作", async () => {
    const handle = await createTestDatabase("hot-now-automation-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "automatic-high", collectorAgent: "test", title: "影响普通用户的更新", url: "https://example.com/high",
    });
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("pending");

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/evaluate-account-fit")) {
        updateCreativeSourceItemAccountFit(handle.db, item.id, {
          level: "high", reason: "有明确读者影响", details: {}, ruleVersion: "v3", updateWritingStatus: false,
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, task_id: "normal-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });

    expect(service.enqueueAutomaticEvaluation(item.id).accepted).toBe(true);
    await service.runNow();
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("queued");
    await service.runNow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("queued");
    expect(service.getStatus().automaticWriteDispatchedToday).toBe(1);
  });

  it("人工写作意图会在评估完成后续接，中适配不消耗自动额度", async () => {
    const handle = await createTestDatabase("hot-now-automation-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "manual-medium", collectorAgent: "test", title: "中适配素材", url: "https://example.com/medium",
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/api/evaluate-account-fit")) {
        updateCreativeSourceItemAccountFit(handle.db, item.id, {
          level: "medium", reason: "需要人工判断", details: {}, ruleVersion: "v3", updateWritingStatus: false,
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }));
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });

    expect(service.enqueueManualWrite(item.id, "保留立意").accepted).toBe(true);
    await service.runNow();
    await service.runNow();

    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("queued");
    expect(service.getStatus().automaticWriteDispatchedToday).toBe(0);
  });

  it("自动评估只扫描最近 72 小时，历史待评估素材保持不动", async () => {
    const handle = await createTestDatabase("hot-now-automation-");
    handles.push(handle);
    const old = insertCreativeSourceItem(handle.db, {
      externalId: "old-pending", collectorAgent: "test", title: "历史素材", url: "https://example.com/old",
    });
    handle.db.prepare("UPDATE creative_source_items SET created_at = datetime('now', '-73 hours') WHERE id = ?").run(old.id);
    const service = new CreativeAutomationService(handle.db, null, null);

    await service.runNow();
    const jobs = handle.db.prepare("SELECT COUNT(*) AS count FROM creative_automation_jobs WHERE source_item_id = ?").get(old.id) as { count: number };
    expect(jobs.count).toBe(0);
    expect(findCreativeSourceItemById(handle.db, old.id)?.writingStatus).toBe("pending");
  });
});
